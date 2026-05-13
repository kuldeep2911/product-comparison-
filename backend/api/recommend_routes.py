"""
Recommendation API routes.
"""
import logging
from pydantic import BaseModel, Field
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from config.database import get_db
from services.retrieval_engine import search_products_by_filters, get_products_by_category
from services.ranking_engine import rank_products

logger = logging.getLogger(__name__)
router = APIRouter()


class RecommendRequest(BaseModel):
    category: Optional[str] = None
    budget: Optional[int] = None
    use_case: Optional[str] = None
    filters: dict[str, str] = Field(default_factory=dict)


class CategorySearchRequest(BaseModel):
    category: str
    budget: Optional[int] = None
    use_case: Optional[str] = None
    filters: dict[str, str] = Field(default_factory=dict)


@router.post("/recommend")
def recommend(request: RecommendRequest, db: Session = Depends(get_db)):
    """Get product recommendations based on filters and use case."""
    product_ids = search_products_by_filters(
        db,
        category=request.category,
        filters=request.filters,
        budget=request.budget,
    )

    if not product_ids:
        return {
            "results": [],
            "message": "No products found matching those criteria. Try broadening your search.",
        }

    ranked = rank_products(db, product_ids, request.use_case)
    return {
        "results": ranked[:20],
        "total_candidates": len(product_ids),
    }


@router.post("/category/search")
def category_search(request: CategorySearchRequest, db: Session = Depends(get_db)):
    """Search products within a specific category."""
    products: list[dict] = get_products_by_category(db, request.category)

    if not products:
        return {
            "category": request.category,
            "results": [],
            "message": f"No products found in category '{request.category}'.",
        }

    # If use_case provided, rank them
    product_ids = [p["id"] for p in products]
    if request.use_case:
        ranked = rank_products(db, product_ids, request.use_case)
        return {
            "category": request.category,
            "results": ranked[:20],
            "total": len(products),
        }

    return {
        "category": request.category,
        "results": products[:20],
        "total": len(products),
    }
