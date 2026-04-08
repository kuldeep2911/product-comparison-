"""
Explanation service — generates natural language explanations using Groq LLM.
"""
import logging
from openai import OpenAI
from typing import Any
from config.settings import settings

logger = logging.getLogger(__name__)

client = OpenAI(
    api_key=settings.GROQ_API_KEY,
    base_url="https://api.groq.com/openai/v1",
)


def generate_comparison_explanation(products: list[dict[str, Any]], user_query: str) -> str:
    """Generate a natural language summary of a comparison."""
    if not products:
        return "No products to compare."

    product_lines = []
    for p in products[:5]:
        product_lines.append(f"- {p.get('brand', '')} {p.get('name', '')}")

    prompt = f"""User asked: "{user_query}"

Products being compared:
{chr(10).join(product_lines)}

Write a brief, helpful 2-3 sentence introduction to this comparison. 
Mention what the products have in common and what makes each unique.
Be conversational and helpful."""

    return _call_llm(prompt)


def generate_recommendation_explanation(products: list[dict[str, Any]], user_query: str) -> str:
    """Generate an explanation for why products were recommended."""
    if not products:
        return "No products matched your criteria. Try adjusting your filters."

    product_lines = []
    for p in products[:5]:
        product_lines.append(f"- {p.get('brand', '')} {p.get('name', '')} (Score: {p.get('score', 0):.2f})")

    prompt = f"""User query: "{user_query}"

Recommended products (ranked by score):
{chr(10).join(product_lines)}

Explain why these products are recommended in 2-3 sentences. 
Mention the top product and why it scored highest.
Be concise, engaging, and conversational."""

    return _call_llm(prompt)


def generate_spec_answer(user_question: str, products: list[dict[str, Any]], feature_data: dict[str, Any]) -> str:
    """Answer a specific spec question about products in the current comparison."""
    product_info = []
    for p in products:
        pid = p.get("id")
        features = feature_data.get(pid, {})
        feature_str = ", ".join([f"{k}: {v}" for k, v in features.items()])
        product_info.append(f"- {p.get('brand', '')} {p.get('name', '')}: {feature_str}")

    prompt = f"""User question: "{user_question}"

Products and their relevant specs:
{chr(10).join(product_info)}

Answer the user's question about these products based on the specs provided.
Be specific, mention numbers, and give a clear recommendation.
Keep the answer to 2-4 sentences."""

    return _call_llm(prompt)


def generate_follow_up_response(user_message: str, context_summary: str) -> str:
    """Generate a general conversational follow-up response."""
    prompt = f"""User message: "{user_message}"

Context: {context_summary}

Respond helpfully to the user's message. If they're asking about electronics,
provide useful advice. If you need more information, ask a clarifying question.
Keep it conversational and under 3 sentences."""

    return _call_llm(prompt)


def _call_llm(prompt: str) -> str:
    """Make an LLM call with error handling."""
    try:
        response = client.chat.completions.create(
            model=settings.LLM_MODEL,
            messages=[
                {"role": "system", "content": "You are a knowledgeable and friendly electronics comparison assistant called Assistme. Be concise and helpful."},
                {"role": "user", "content": prompt},
            ],
            temperature=0.7,
            max_tokens=300,
        )
        return response.choices[0].message.content.strip()
    except Exception as e:
        logger.error(f"LLM call failed: {e}")
        return "I can help you with that! Let me look at the details."
