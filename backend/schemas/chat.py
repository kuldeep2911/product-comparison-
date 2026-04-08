"""
Pydantic schemas for chat API requests and responses.
"""
from pydantic import BaseModel, Field
from typing import Optional
from datetime import datetime


class SessionStartRequest(BaseModel):
    mode: str = Field(default="compare_specific", description="Chat mode: compare_specific, purchase_advice, category_compare")
    user_id: Optional[str] = None


class SessionStartResponse(BaseModel):
    session_id: str
    mode: str


class ChatMessageRequest(BaseModel):
    session_id: str
    message: str


class ComparisonField(BaseModel):
    name: str
    display_name: str
    values: dict[int, str | None]


class ComparisonSection(BaseModel):
    name: str
    fields: list[ComparisonField]


class ComparisonProduct(BaseModel):
    id: int
    name: str
    brand: str
    category: str | None = None


class ComparisonTable(BaseModel):
    products: list[ComparisonProduct]
    sections: list[ComparisonSection]


class RecommendedProduct(BaseModel):
    id: int
    name: str
    brand: str
    score: float = 0.0
    details: dict | None = None


class ChatMessageResponse(BaseModel):
    session_id: str
    role: str = "assistant"
    content: str
    mode: str | None = None
    comparison_table: ComparisonTable | None = None
    recommendations: list[RecommendedProduct] | None = None
    product_ids: list[int] | None = None


class ChatHistoryMessage(BaseModel):
    id: int
    role: str
    content: str
    metadata: dict | None = None
    created_at: datetime | None = None


class ChatHistoryResponse(BaseModel):
    session_id: str
    mode: str
    messages: list[ChatHistoryMessage]
