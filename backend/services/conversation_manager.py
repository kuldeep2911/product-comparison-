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

    # Route to handler
    if interpreted.intent == "compare" and interpreted.product_names:
        result = _handle_comparison(db, session_id, interpreted, user_message)
    elif interpreted.intent == "recommend":
        result = _handle_recommendation(db, session_id, interpreted, user_message)
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


def _handle_recommendation(db: Session, session_id: str, interpreted: InterpretedQuery, user_message: str) -> dict:
    """Handle purchase advice / recommendation requests."""
    # Search by filters
    product_ids = search_products_by_filters(
        db,
        category=interpreted.category,
        filters=interpreted.filters,
        budget=interpreted.budget,
        limit=50,
    )

    if not product_ids:
        return {
            "content": "I couldn't find products matching those exact criteria. Try broadening your search — for example, increase the budget or remove some filters.",
            "mode": "purchase_advice",
        }

    # Rank products
    ranked = rank_products(db, product_ids[:50], interpreted.use_case)
    top_results = ranked[:10]

    # Update context
    top_ids = [p["id"] for p in top_results]
    chat_service.update_context(
        db, session_id,
        selected_products=top_ids,
        selected_category=interpreted.category,
        budget=interpreted.budget,
        use_case=interpreted.use_case,
        filters=interpreted.filters,
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
    product_ids = search_products_by_filters(
        db,
        category=interpreted.category,
        filters=interpreted.filters,
        budget=interpreted.budget,
        limit=30,
    )

    if not product_ids:
        return {
            "content": f"I couldn't find products in the '{interpreted.category}' category with those filters. Try adjusting your criteria.",
            "mode": "category_compare",
        }

    ranked = rank_products(db, product_ids, interpreted.use_case)
    top_results = ranked[:10]
    top_ids = [p["id"] for p in top_results]

    chat_service.update_context(
        db, session_id,
        selected_products=top_ids,
        selected_category=interpreted.category,
        budget=interpreted.budget,
        use_case=interpreted.use_case,
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

    # Determine which features to look up based on the question
    feature_keys = _extract_feature_keys(user_message)

    # Get feature data for the products
    feature_data = get_product_feature_summary(db, product_ids, feature_keys if feature_keys else None)

    # Get basic product info
    products_info = search_products_by_name(db, [])  # We need info by ID
    # Fetch product info directly
    from services.comparison_service import get_product_specs
    products = []
    for pid in product_ids[:5]:
        spec = get_product_specs(db, pid)
        if spec:
            products.append(spec["product"])

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
        "use_case": ctx.use_case,
        "last_query": ctx.last_query,
    }


def _extract_feature_keys(question: str) -> list[str]:
    """Extract likely feature keys from a user question."""
    question_lower = question.lower()
    
    feature_map = {
        "battery": ["battery_capacity", "charging_watts"],
        "camera": ["camera_mp"],
        "display": ["display_size", "refresh_rate"],
        "screen": ["display_size", "refresh_rate"],
        "ram": ["ram"],
        "memory": ["ram", "storage"],
        "storage": ["storage"],
        "processor": ["cpu_score", "gpu_score"],
        "performance": ["cpu_score", "gpu_score"],
        "gaming": ["gpu_score", "cpu_score", "refresh_rate", "ram"],
        "weight": ["weight"],
        "charging": ["charging_watts"],
        "refresh": ["refresh_rate"],
    }

    keys = []
    for keyword, features in feature_map.items():
        if keyword in question_lower:
            keys.extend(features)

    return list(set(keys))
