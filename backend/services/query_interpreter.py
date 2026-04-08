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
  "budget": integer or null,
  "use_case": "gaming" | "camera" | "battery" | "multimedia" | "compact" | null,
  "filters": {{"feature_key": ">value"}},
  "follow_up_type": "spec_question" | "refine_filter" | "replace_product" | "general" | null,
  "spec_question_field": "battery" | "camera" | "display" | "processor" | "ram" | "storage" | null
}}

Rules:
- If user mentions 2+ product names, set mode="compare_specific", intent="compare"
- If user asks "best X phone" or mentions budget/use-case, set mode="purchase_advice", intent="recommend"
- If user mentions a product category to browse, set mode="category_compare", intent="category_browse"
- If there is prior context and the user asks about specs (e.g. "which has better battery?"), set mode="follow_up", intent="spec_question"
- If user wants to refine results, set follow_up_type="refine_filter"
- Extract product names exactly as user typed them
- Only return raw JSON, no markdown formatting.

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
        content = response.choices[0].message.content.strip()

        # Strip markdown fences if present
        if content.startswith("```json"):
            content = content[7:]
        if content.startswith("```"):
            content = content[3:]
        if content.endswith("```"):
            content = content[:-3]

        data = json.loads(content.strip())
        return InterpretedQuery(**data)

    except Exception as e:
        logger.error(f"Error interpreting query: {e}")
        return InterpretedQuery.model_validate({"mode": "follow_up", "intent": "unknown"})
