"""
Conversation manager — the core AI orchestrator.
Routes user messages through the appropriate service pipeline based on intent.
"""
import logging
from sqlalchemy.orm import Session

from services import chat_service
from services.query_interpreter import interpret_query, InterpretedQuery
from services.retrieval_engine import search_products_by_name, resolve_product_names, search_products_by_filters, get_all_categories
from services.comparison_service import compare_products, get_product_feature_summary
from services.ranking_engine import rank_products
from services.explanation_service import (
    generate_comparison_explanation,
    generate_recommendation_explanation,
    generate_spec_answer,
    generate_follow_up_response,
)

logger = logging.getLogger(__name__)


def handle_message(db: Session, session_id: str, user_message: str) -> dict:
    """
    Main entry point: process a user message and return a structured response.
    
    Flow:
    1. Load session context
    2. Interpret query (LLM)
    3. Route to appropriate handler
    4. Store messages + update context
    5. Return structured response
    """
    # Store user message
    chat_service.add_message(db, session_id, "user", user_message)

    # Load context
    ctx = chat_service.get_context(db, session_id)
    context_dict = _context_to_dict(ctx) if ctx else {}

    # Interpret query
    interpreted = interpret_query(user_message, context_dict)
    logger.info(f"Interpreted: mode={interpreted.mode}, intent={interpreted.intent}, products={interpreted.product_names}")

    # --- Context-aware intent locking ---
    # If the session is in compare_specific mode and already has selected products,
    # any follow-up (including ones that LOOK like recommend/general) must remain
    # scoped to those products. This prevents the LLM from querying the full catalog.
    session = chat_service.get_session(db, session_id)
    is_compare_session = session and session.mode == "compare_specific"
    has_selected_products = bool(context_dict.get("selected_products"))

    if is_compare_session and has_selected_products:
        # Only allow a new comparison if the user explicitly names 2+ products
        if interpreted.intent == "compare" and len(interpreted.product_names) >= 2:
            result = _handle_comparison(db, session_id, interpreted, user_message)
        else:
            # Everything else (recommend, general, spec_question, etc.) stays
            # scoped to the already-selected products
            result = _handle_spec_question(db, session_id, interpreted, user_message, context_dict)
    elif _is_purchase_advice_session(session) and has_selected_products:
        # In purchase_advice mode with recommendations already shown
        if _is_compare_top_request(user_message, interpreted):
            # User wants to compare the recommended products side-by-side
            result = _handle_compare_recommendations(db, session_id, user_message, context_dict)
        elif interpreted.intent == "compare" and len(interpreted.product_names) >= 2:
            result = _handle_comparison(db, session_id, interpreted, user_message)
        elif interpreted.intent in ("spec_question", "follow_up") or interpreted.follow_up_type:
            result = _handle_spec_question(db, session_id, interpreted, user_message, context_dict)
        elif interpreted.intent == "recommend":
            result = _handle_recommendation(db, session_id, interpreted, user_message, context_dict)
        else:
            # General follow-up stays scoped to recommended products
            result = _handle_spec_question(db, session_id, interpreted, user_message, context_dict)
    elif _is_purchase_advice_session(session) and not has_selected_products:
        # Still gathering requirements, stay in recommendation flow unless explicitly comparing
        if interpreted.intent == "compare" and len(interpreted.product_names) >= 2:
            result = _handle_comparison(db, session_id, interpreted, user_message)
        else:
            result = _handle_recommendation(db, session_id, interpreted, user_message, context_dict)
    elif interpreted.intent == "compare" and interpreted.product_names:
        result = _handle_comparison(db, session_id, interpreted, user_message)
    elif interpreted.intent == "recommend":
        result = _handle_recommendation(db, session_id, interpreted, user_message, context_dict)
    elif interpreted.intent == "category_browse":
        result = _handle_category_browse(db, session_id, interpreted, user_message)
    elif interpreted.intent == "spec_question" and context_dict.get("selected_products"):
        result = _handle_spec_question(db, session_id, interpreted, user_message, context_dict)
    elif interpreted.intent == "greeting":
        result = _handle_greeting(db, session_id)
    else:
        result = _handle_general(db, session_id, user_message, context_dict)

    # Extract metadata to save so frontend can reconstruct tables/UI
    meta = {}
    if "comparison_table" in result:
        meta["comparison_table"] = result["comparison_table"]
    if "recommendations" in result:
        meta["recommendations"] = result["recommendations"]
    if "product_ids" in result:
        meta["product_ids"] = result["product_ids"]

    # Store assistant response
    chat_service.add_message(db, session_id, "assistant", result["content"], metadata=meta)

    # Update context
    chat_service.update_context(db, session_id, last_query=user_message)

    return result


def _handle_comparison(db: Session, session_id: str, interpreted: InterpretedQuery, user_message: str) -> dict:
    """Handle product comparison requests."""
    # Search for products by name and detect ambiguity
    resolved, ambiguities = resolve_product_names(db, interpreted.product_names)

    if ambiguities:
        prompt = "There are multiple models for some of the products you mentioned. Which ones did you mean?\n"
        for name, opts in ambiguities.items():
            prompt += f"\nFor **'{name}'**:\n"
            for o in opts[:5]:
                prompt += f"• {o['brand']} {o['name']}\n"
        prompt += "\nPlease reply with the exact names you'd like to compare."
        return {
            "content": prompt,
            "mode": "compare_specific",
        }

    if len(resolved) < 2:
        return {
            "content": f"I could only find {len(resolved)} product(s) matching your request. Please provide at least 2 product names to compare. Try being more specific with the product names.",
            "mode": "compare_specific",
        }

    # Take best match per named product (up to 5)
    product_ids = [p["id"] for p in resolved[:5]]

    # Build comparison table
    comparison = compare_products(db, product_ids)
    if not comparison:
        return {
            "content": "I couldn't build a comparison for those products. Please try different product names.",
            "mode": "compare_specific",
        }

    # Update context
    chat_service.update_context(db, session_id, selected_products=product_ids)
    chat_service.update_session_mode(db, session_id, "compare_specific")

    # Generate explanation
    explanation = generate_comparison_explanation(comparison["products"], user_message)

    return {
        "content": explanation,
        "mode": "compare_specific",
        "comparison_table": comparison,
        "product_ids": product_ids,
    }


def _handle_recommendation(db: Session, session_id: str, interpreted: InterpretedQuery, user_message: str, context: dict) -> dict:
    """Handle purchase advice / recommendation requests."""
    
    # Fall back to context values if LLM didn't extract them this turn
    search_category = interpreted.category if interpreted.category is not None else context.get("selected_category")
    search_budget = interpreted.budget if interpreted.budget is not None else context.get("budget")
    search_use_case = interpreted.use_case if interpreted.use_case is not None else context.get("use_case")

    # ── Auto-detect category from conversation history if still missing ──
    if not search_category:
        recent_messages = chat_service.get_recent_messages(db, session_id, limit=10)
        all_text = " ".join([msg.content.lower() for msg in recent_messages]) + " " + user_message.lower()
        if any(kw in all_text for kw in ["phone", "mobile", "smartphone", "iphone", "galaxy", "pixel", "android", "ios"]):
            search_category = "mobile"
        elif any(kw in all_text for kw in ["tablet", "ipad", "tab"]):
            search_category = "tablet"
        elif any(kw in all_text for kw in ["watch", "smartwatch", "wearable"]):
            search_category = "watch"

    # ── Auto-detect use_case from conversation history if still missing ──
    if not search_use_case:
        recent_messages = chat_service.get_recent_messages(db, session_id, limit=10)
        all_text = " ".join([msg.content.lower() for msg in recent_messages]) + " " + user_message.lower()
        uc_keywords = {
            "camera": ["camera", "photo", "photography", "picture", "selfie"],
            "gaming": ["gaming", "game", "pubg", "genshin", "fortnite"],
            "battery_life": ["battery", "long lasting", "endurance"],
            "multimedia": ["movie", "streaming", "video", "netflix", "youtube"],
            "compact": ["small", "lightweight", "compact", "pocket", "mini"],
            "balanced": ["all-rounder", "balanced", "everyday", "daily use"],
            "productivity": ["work", "productivity", "office", "multitask"],
            "value_for_money": ["value for money", "affordable", "cheap"],
        }
        for uc, keywords in uc_keywords.items():
            if any(kw in all_text for kw in keywords):
                search_use_case = uc
                break

    # Merge current context filters with any newly interpreted ones
    final_filters = dict(context.get("filters") or {})
    if interpreted.filters:
        final_filters.update(interpreted.filters)

    if interpreted.brand:
        final_filters["brand"] = interpreted.brand
    if interpreted.os:
        final_filters["os"] = interpreted.os

    search_brand = final_filters.get("brand")
    search_os = final_filters.get("os")

    clarifying_turns = final_filters.get("clarifying_turns", 0)

    # Skip turns if information is already known
    while clarifying_turns < 3:
        if clarifying_turns == 0 and search_budget is not None:
            clarifying_turns += 1
            continue
        if clarifying_turns == 1 and search_use_case is not None:
            clarifying_turns += 1
            continue
        break

    if clarifying_turns < 3:
        # Determine known constraints to guide LLM
        known_info = []
        if search_budget: known_info.append(f"Budget: {search_budget}")
        if search_use_case: known_info.append(f"Use Case: {search_use_case}")
        if search_category: known_info.append(f"Category: {search_category}")
        if search_brand: known_info.append(f"Brand: {search_brand}")
        if search_os: known_info.append(f"OS: {search_os}")
        for k, v in final_filters.items():
            if k not in ("clarifying_turns", "brand", "os"):
                known_info.append(f"{k}: {v}")
                
        from services.explanation_service import generate_next_clarifying_question
        
        # Get recent history
        recent_messages = chat_service.get_recent_messages(db, session_id, limit=6)
        history_text = "\n".join([f"{msg.role.capitalize()}: {msg.content}" for msg in recent_messages])
        
        question = generate_next_clarifying_question(user_message, history_text, ", ".join(known_info), clarifying_turns)
        
        if question.strip() == "READY":
            # Force search logic
            final_filters["clarifying_turns"] = 3
        else:
            # Increment turn counter
            final_filters["clarifying_turns"] = clarifying_turns + 1
            
            # update context
            chat_service.update_context(
                db, session_id,
                budget=search_budget,
                category=search_category,
                use_case=search_use_case,
                filters=final_filters,
            )
            chat_service.update_session_mode(db, session_id, "purchase_advice")
            
            return {
                "content": question,
                "mode": "purchase_advice",
            }

    # Search by filters — strip internal keys that aren't real product features
    search_filters = {k: v for k, v in final_filters.items() if k not in ("clarifying_turns", "brand", "os")}
    product_ids = search_products_by_filters(
        db,
        category=search_category,
        brand=search_brand,
        os=search_os,
        filters=search_filters if search_filters else None,
        budget=search_budget,
        limit=1500,
    )

    if not product_ids:
        return {
            "content": "I couldn't find products matching those exact criteria. Try broadening your search — for example, increase the budget or remove some filters.",
            "mode": "purchase_advice",
        }

    # Rank ALL matching products so we get global top 20
    ranked = rank_products(db, product_ids, search_use_case)
    top_results = ranked[:20]

    # Update context
    top_ids = [p["id"] for p in top_results]
    chat_service.update_context(
        db, session_id,
        selected_products=top_ids,
        selected_category=search_category,
        budget=search_budget,
        use_case=search_use_case,
        filters=final_filters,
    )
    chat_service.update_session_mode(db, session_id, "purchase_advice")

    # Generate explanation
    explanation = generate_recommendation_explanation(top_results, user_message)

    recommendations = [{
        "id": p["id"],
        "name": p["name"],
        "brand": p["brand"],
        "score": p["score"],
        "details": p.get("details"),
    } for p in top_results]

    return {
        "content": explanation,
        "mode": "purchase_advice",
        "recommendations": recommendations,
        "product_ids": top_ids,
    }


def _handle_category_browse(db: Session, session_id: str, interpreted: InterpretedQuery, user_message: str) -> dict:
    """Handle category browsing requests."""
    if not interpreted.category:
        # List available categories
        categories = get_all_categories(db)
        cat_names = [c["name"] for c in categories]
        return {
            "content": f"I have products in these categories: {', '.join(cat_names)}. Which category would you like to explore?",
            "mode": "category_compare",
        }

    # Search within category
    search_brand = interpreted.brand or context.get("filters", {}).get("brand")
    search_os = interpreted.os or context.get("filters", {}).get("os")
    
    product_ids = search_products_by_filters(
        db,
        category=interpreted.category,
        brand=search_brand,
        os=search_os,
        filters=interpreted.filters,
        budget=interpreted.budget,
        limit=1500,
    )

    if not product_ids:
        return {
            "content": f"I couldn't find products in the '{interpreted.category}' category with those filters. Try adjusting your criteria.",
            "mode": "category_compare",
        }

    ranked = rank_products(db, product_ids, interpreted.use_case)
    top_results = ranked[:20]
    top_ids = [p["id"] for p in top_results]

    final_filters = context.get("filters") or {}
    if search_brand: final_filters["brand"] = search_brand
    if search_os: final_filters["os"] = search_os

    chat_service.update_context(
        db, session_id,
        selected_products=top_ids,
        selected_category=interpreted.category,
        budget=interpreted.budget,
        use_case=interpreted.use_case,
        filters=final_filters,
    )
    chat_service.update_session_mode(db, session_id, "category_compare")

    explanation = generate_recommendation_explanation(top_results, user_message)

    recommendations = [{
        "id": p["id"],
        "name": p["name"],
        "brand": p["brand"],
        "score": p["score"],
        "details": p.get("details"),
    } for p in top_results]

    return {
        "content": explanation,
        "mode": "category_compare",
        "recommendations": recommendations,
        "product_ids": top_ids,
    }


def _handle_spec_question(db: Session, session_id: str, interpreted: InterpretedQuery, 
                           user_message: str, context: dict) -> dict:
    """Handle follow-up spec questions about products in context."""
    product_ids = context.get("selected_products", [])
    if not product_ids:
        return {
            "content": "I don't have any products selected. Please start by comparing some products or asking for recommendations.",
            "mode": context.get("mode", "compare_specific"),
        }

    from services.comparison_service import get_product_specs

    # Determine which features to look up based on the question
    feature_keys = _extract_feature_keys(user_message)

    # Get feature data - if no specific keys, fetch all available features
    feature_data = get_product_feature_summary(db, product_ids, feature_keys if feature_keys else None)

    # Fetch full product info for each selected product
    products = []
    for pid in product_ids[:5]:
        spec = get_product_specs(db, pid)
        if spec:
            products.append(spec["product"])

    # If feature_data is sparse (open-ended question), build richer context from product specs
    if not feature_keys or not any(feature_data.values()):
        enriched_feature_data: dict = {}
        for pid in product_ids[:5]:
            spec = get_product_specs(db, pid)
            if spec:
                # Flatten sections[].fields[].{name, value} into a flat dict
                flat: dict = {
                    "brand": spec["product"].get("brand", ""),
                    "name": spec["product"].get("name", ""),
                }
                for section in spec.get("sections", []):
                    for field in section.get("fields", []):
                        if field.get("value") is not None:
                            flat[field["name"]] = field["value"]
                enriched_feature_data[pid] = flat
        feature_data = enriched_feature_data

    # Generate answer
    answer = generate_spec_answer(user_message, products, feature_data)

    return {
        "content": answer,
        "mode": context.get("mode", "compare_specific"),
        "product_ids": product_ids,
    }


def _handle_greeting(db: Session, session_id: str) -> dict:
    """Handle greeting/hello messages."""
    return {
        "content": "Hi! I'm Assistme, your electronics comparison assistant. I can help you:\n\n• **Compare products** — just name 2 or more products\n• **Get purchase advice** — tell me what you're looking for (e.g., 'best gaming phone under 50000')\n• **Browse categories** — explore products by category\n\nWhat would you like to do?",
        "mode": "compare_specific",
    }


def _handle_general(db: Session, session_id: str, user_message: str, context: dict) -> dict:
    """Handle general/unclassified messages."""
    context_summary = ""
    if context.get("selected_products"):
        context_summary += f"User has {len(context['selected_products'])} products selected. "
    if context.get("selected_category"):
        context_summary += f"Category: {context['selected_category']}. "
    if context.get("use_case"):
        context_summary += f"Use case: {context['use_case']}. "

    response = generate_follow_up_response(user_message, context_summary or "No prior context.")

    return {
        "content": response,
        "mode": context.get("mode", "compare_specific"),
    }


def _context_to_dict(ctx) -> dict:
    """Convert ChatContext ORM object to a dict."""
    return {
        "selected_products": ctx.selected_products or [],
        "selected_category": ctx.selected_category,
        "filters": ctx.filters or {},
        "budget": ctx.budget,
        "brand": (ctx.filters or {}).get("brand"),
        "os": (ctx.filters or {}).get("os"),
        "use_case": ctx.use_case,
        "last_query": ctx.last_query,
    }


def _extract_feature_keys(question: str) -> list[str]:
    """Extract likely feature keys from a user question."""
    question_lower = question.lower()
    
    feature_map = {
        "battery": ["battery_capacity", "charging_watts"],
        "camera": ["camera_mp", "has_ois", "has_telephoto", "has_ultrawide", "aperture"],
        "display": ["display_size", "refresh_rate"],
        "screen": ["display_size", "refresh_rate"],
        "ram": ["ram"],
        "memory": ["ram", "storage"],
        "storage": ["storage"],
        "processor": ["cpu_generation", "gpu_score"],
        "performance": ["cpu_generation", "gpu_score"],
        "gaming": ["gpu_score", "cpu_generation", "refresh_rate", "ram"],
        "weight": ["weight"],
        "charging": ["charging_watts"],
        "refresh": ["refresh_rate"],
    }

    keys = []
    for keyword, features in feature_map.items():
        if keyword in question_lower:
            keys.extend(features)

    return list(set(keys))


def _is_purchase_advice_session(session) -> bool:
    """Check if the session is in purchase_advice mode."""
    return session and getattr(session, 'mode', None) == "purchase_advice"


def _is_compare_top_request(user_message: str, interpreted: InterpretedQuery) -> bool:
    """Detect if the user wants to compare their recommended products."""
    msg_lower = user_message.lower()
    compare_keywords = [
        "compare top", "compare the top", "compare recommended",
        "compare top picks", "compare picks", "compare them",
        "compare these", "compare all", "side by side",
        "compare the recommended", "compare products",
    ]
    if any(kw in msg_lower for kw in compare_keywords):
        return True
    # Also catch via intent if LLM detects compare but no specific product names
    if interpreted.intent == "compare" and not interpreted.product_names:
        return True
    return False


def _handle_compare_recommendations(db: Session, session_id: str, user_message: str, context: dict) -> dict:
    """
    Compare the top recommended products using a real comparison table.
    Takes the top 5 product IDs from context and builds a side-by-side table.
    """
    product_ids = context.get("selected_products", [])
    if not product_ids:
        return {
            "content": "I don't have any recommended products to compare. Please ask for recommendations first.",
            "mode": "purchase_advice",
        }

    # Take top 5 for the comparison table (full table gets too wide otherwise)
    compare_ids = product_ids[:5]

    # Build comparison table using the same service as Scenario 1
    comparison = compare_products(db, compare_ids)
    if not comparison:
        return {
            "content": "I couldn't build a comparison table for those products. Please try again.",
            "mode": "purchase_advice",
        }

    # Update context to track that we're now comparing these
    chat_service.update_context(db, session_id, selected_products=product_ids)

    # Generate explanation
    explanation = generate_comparison_explanation(comparison["products"], user_message)

    return {
        "content": explanation,
        "mode": "purchase_advice",
        "comparison_table": comparison,
        "product_ids": compare_ids,
    }
