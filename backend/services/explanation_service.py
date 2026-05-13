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


def generate_next_clarifying_question(user_message: str, history_text: str, known_info: str, turn: int) -> str:
    """Generate the next single clarifying question based on history."""
    # Determine which topic to ask about based on turn number
    topic_guide = {
        0: "Ask about their BUDGET — how much they are willing to spend. Keep it casual, e.g. 'What's your budget range?'",
        1: "Ask about their PRIMARY USAGE — what they will use the device for most (e.g. taking photos, playing games, watching videos, work/productivity, social media). Use simple everyday language.",
        2: "Ask about their BRAND or OS PREFERENCE — do they prefer any specific brand like Samsung, Apple, Xiaomi, or any operating system like Android or iOS? Or are they open to all?"
    }

    topic = topic_guide.get(turn, topic_guide[2])

    prompt = f"""You are a friendly shopping assistant helping someone find the perfect product.

Recent Conversation:
{history_text}

What we already know: {known_info if known_info else 'Nothing yet'}

TASK: Ask exactly ONE simple question to the user.
Topic for this question: {topic}

CRITICAL RULES:
- Use SIMPLE, everyday language that anyone can understand
- NEVER use technical terms like: DSLR, mirrorless, OIS, aperture, refresh rate, chipset, SoC, IP rating, AMOLED, LTPO, telephoto, ultrawide, megapixel count, etc.
- Instead of asking "what type of camera", ask "what will you mainly use the phone for"
- Keep the question SHORT (1 sentence max)
- Do NOT provide any recommendations yet
- If the information for this topic is already known from the conversation, reply with exactly: READY

Return ONLY the question text, nothing else."""
    return _call_llm(prompt)


def generate_spec_answer(user_question: str, products: list[dict[str, Any]], feature_data: dict[str, Any]) -> str:
    """Answer a specific spec question about products in the current comparison."""
    product_info = []
    for p in products:
        pid: int | str = p.get("id", 0)
        features: dict[str, Any] = feature_data.get(str(pid), {})
        if features:
            # Format each spec on its own line for clarity
            spec_lines = "\n    ".join([
                f"{k}: {v}" for k, v in features.items()
                if v is not None and k not in ("brand", "name")
            ])
            product_info.append(
                f"▸ {p.get('brand', '')} {p.get('name', '')}:\n    {spec_lines}"
            )
        else:
            product_info.append(f"▸ {p.get('brand', '')} {p.get('name', '')} (no detailed specs available)")

    products_block = "\n\n".join(product_info) if product_info else "No product data available."

    prompt = f"""User question: "{user_question}"

You are comparing ONLY these products (do not mention any other phones):

{products_block}

Based on the specs above, answer the user's question directly and confidently.
- If asking for an overall recommendation, pick one product and explain why using specific numbers from the specs.
- If asking about a specific feature (camera, battery, etc.), compare the relevant numbers and state which is better.
- Be specific, cite actual numbers, and give a clear recommendation.
- Keep the answer to 3-5 sentences.
- Do NOT say you lack information — the specs are provided above."""

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
        content = response.choices[0].message.content
        if content is None:
            raise ValueError("LLM returned empty content")
        return content.strip()
    except Exception as e:
        logger.error(f"LLM call failed: {e}")
        return "I'm sorry, I am currently experiencing high traffic or a temporary connection issue. Please try your request again in a few moments."
