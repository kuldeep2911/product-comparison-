"""
Query interpreter — detects user intent and extracts structured parameters.
Uses Groq LLM to parse natural language into actionable JSON.
"""
import json
import logging
from openai import OpenAI
from pydantic import BaseModel, Field
from typing import Optional
from config.settings import settings

logger = logging.getLogger(__name__)

client = OpenAI(
    api_key=settings.GROQ_API_KEY,
    base_url="https://api.groq.com/openai/v1",
)


class InterpretedQuery(BaseModel):
    """Structured output from the query interpreter."""
    mode: str = Field(default="compare_specific", description="compare_specific, purchase_advice, category_compare, follow_up")
    intent: str = Field(default="unknown", description="compare, recommend, category_browse, spec_question, follow_up, greeting")
    product_names: list[str] = Field(default_factory=list, description="Product names mentioned")
    category: Optional[str] = None
    brand: Optional[str] = None
    os: Optional[str] = None
    budget: Optional[int] = None
    use_case: Optional[str] = None
    filters: dict[str, str] = Field(default_factory=dict)
    follow_up_type: Optional[str] = Field(None, description="spec_question, refine_filter, replace_product, general")
    spec_question_field: Optional[str] = Field(None, description="Which spec field the user is asking about")


def interpret_query(user_message: str, context: dict | None = None) -> InterpretedQuery:
    """
    Interpret a user message in the context of conversation history.
    Returns structured intent + parameters.
    """
    context_str = ""
    if context:
        if context.get("selected_products"):
            context_str += f"\nCurrently comparing product IDs: {context['selected_products']}"
        if context.get("selected_category"):
            context_str += f"\nCurrent category: {context['selected_category']}"
        if context.get("use_case"):
            context_str += f"\nCurrent use case: {context['use_case']}"
        if context.get("budget"):
            context_str += f"\nCurrent budget: {context['budget']}"
        if context.get("brand"):
            context_str += f"\nCurrent brand: {context['brand']}"
        if context.get("os"):
            context_str += f"\nCurrent OS: {context['os']}"

    prompt = f"""You are an electronics assistant query parser.
Analyze the user message and extract structured information.

User Message: "{user_message}"
{f"Conversation Context: {context_str}" if context_str else "No prior context."}

Return a JSON object with these fields:
{{
  "mode": "compare_specific" | "purchase_advice" | "category_compare" | "follow_up",
  "intent": "compare" | "recommend" | "category_browse" | "spec_question" | "follow_up" | "greeting",
  "product_names": ["product name 1", "product name 2"],
  "category": "mobile" | "tablet" | "watch" | null,
  "brand": "apple" | "samsung" | "xiaomi" | "google" | "oneplus" | null,
  "os": "android" | "ios" | null,
  "budget": integer or null (Extract the exact number the user mentions, e.g. 50000),
  "use_case": "gaming" | "camera" | "battery_life" | "multimedia" | "compact" | "balanced" | "productivity" | "value_for_money" | null,
  "filters": {{"feature_key": ">value"}},
  "follow_up_type": "spec_question" | "refine_filter" | "replace_product" | "general" | null,
  "spec_question_field": "battery" | "camera" | "display" | "processor" | "ram" | "storage" | null
}}

Rules:
- If user mentions 2+ product names, set mode="compare_specific", intent="compare"
- If user asks "best X phone", mentions budget/use-case, or is answering a question about their phone usage (e.g. "web browsing", "watching videos"), set mode="purchase_advice", intent="recommend".
- If user asks to list/browse a broad product catalog without looking for recommendations (e.g. "show me all tablets"), set mode="category_compare", intent="category_browse". Do NOT use this for "web browsing" use-cases.
- If there is prior context and the user asks about specs (e.g. "which has better battery?"), set mode="follow_up", intent="spec_question"
- If user wants to refine results, set follow_up_type="refine_filter"
- If the user explicitly asks for a brand (e.g. "samsung", "apple"), set the "brand" field to lower case.
- If the user explicitly asks for an OS (e.g. "android", "ios"), set the "os" field to lower case.
- If the user says they have no preference (e.g. "no", "any", "none" for brand or OS), DO NOT add it to filters or brand/os. Only add actual constraints.
- Extract product names exactly as user typed them
- Only return raw JSON, no markdown formatting.

Category detection hints:
- Words like "phone", "mobile", "smartphone", "iphone", "galaxy", "pixel" → category = "mobile"
- Words like "tablet", "ipad" → category = "tablet"
- Words like "watch", "smartwatch" → category = "watch"

Use case detection hints:
- "camera", "photography", "photos", "pictures" → use_case = "camera"
- "gaming", "games", "pubg", "genshin" → use_case = "gaming"
- "battery", "long lasting", "battery life" → use_case = "battery_life"
- "video", "movies", "streaming", "multimedia" → use_case = "multimedia"
- "small", "lightweight", "compact", "pocket" → use_case = "compact"
- "all-rounder", "balanced", "everyday", "daily use" → use_case = "balanced"
- "work", "productivity", "office", "multitask" → use_case = "productivity"
- "budget", "value", "affordable", "cheap" → use_case = "value_for_money"

Available features for filters:
battery_capacity, display_size, refresh_rate, ram, storage, camera_mp, charging_watts, weight
"""

    try:
        response = client.chat.completions.create(
            model=settings.LLM_MODEL,
            messages=[
                {"role": "system", "content": "You are a helpful assistant that outputs only raw JSON."},
                {"role": "user", "content": prompt},
            ],
            temperature=0,
            max_tokens=512,
        )
        content = response.choices[0].message.content
        if content is None:
            raise ValueError("LLM returned empty content")
        content = content.strip()

        # Strip markdown fences if present
        if content.startswith("```json"):
            content = content[7:]
        if content.startswith("```"):
            content = content[3:]
        if content.endswith("```"):
            content = content[:-3]

        data = json.loads(content.strip())
        result = InterpretedQuery(**data)

    except Exception as e:
        logger.error(f"Error interpreting query: {e}")
        result = InterpretedQuery.model_validate({"mode": "follow_up", "intent": "unknown"})

    # ── Post-processing: keyword-based auto-detection as safety net ──
    msg_lower = user_message.lower()

    # Auto-detect category if LLM missed it
    if not result.category:
        category_keywords = {
            "mobile": ["phone", "mobile", "smartphone", "iphone", "galaxy", "pixel", "android", "ios"],
            "tablet": ["tablet", "ipad", "tab"],
            "watch": ["watch", "smartwatch", "wearable"],
        }
        for cat, keywords in category_keywords.items():
            if any(kw in msg_lower for kw in keywords):
                result.category = cat
                break

    import re
    if result.budget is None:
        match = re.search(r'(?:budget|under|below|max)[^\d]*(\d{2,7})', msg_lower)
        if match:
            result.budget = int(match.group(1))

    if not result.brand:
        brands = ["samsung", "apple", "xiaomi", "google", "oneplus", "oppo", "vivo", "realme", "motorola"]
        for b in brands:
            if b in msg_lower:
                result.brand = b
                break

    if not result.os:
        if "android" in msg_lower:
            result.os = "android"
        elif "ios" in msg_lower or "iphone" in msg_lower or "apple" in msg_lower:
            result.os = "ios"

    # Auto-detect use_case if LLM missed it
    if not result.use_case:
        use_case_keywords = {
            "camera": ["camera", "photo", "photography", "picture", "selfie", "video recording"],
            "gaming": ["gaming", "game", "pubg", "genshin", "fortnite", "fps"],
            "battery_life": ["battery", "long lasting", "endurance", "battery life"],
            "multimedia": ["movie", "streaming", "video", "netflix", "youtube", "multimedia"],
            "compact": ["small", "lightweight", "compact", "pocket", "mini"],
            "balanced": ["all-rounder", "balanced", "everyday", "daily", "general"],
            "productivity": ["work", "productivity", "office", "multitask", "business"],
            "value_for_money": ["budget", "value", "affordable", "cheap", "under"],
        }
        for uc, keywords in use_case_keywords.items():
            if any(kw in msg_lower for kw in keywords):
                result.use_case = uc
                break

    return result
