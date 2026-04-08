"""
Comparison and product search API routes.
"""
import logging
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from config.database import get_db
from services.comparison_service import compare_products, get_product_specs
from services.retrieval_engine import search_products_text, get_all_categories

logger = logging.getLogger(__name__)
router = APIRouter()


@router.post("/compare/products")
def compare(product_ids: list[int], db: Session = Depends(get_db)):
    """Compare specific products by their IDs."""
    if len(product_ids) < 2:
        raise HTTPException(status_code=400, detail="At least 2 product IDs required")
    if len(product_ids) > 5:
        raise HTTPException(status_code=400, detail="Maximum 5 products for comparison")

    result = compare_products(db, product_ids)
    if not result:
        raise HTTPException(status_code=404, detail="No products found for those IDs")

    return result


@router.get("/products/search")
def search_products(q: str = Query(..., min_length=1), db: Session = Depends(get_db)):
    """Search products by name."""
    results = search_products_text(db, q)
    return {"query": q, "results": results}


@router.get("/products/{product_id}/specs")
def product_specs(product_id: int, db: Session = Depends(get_db)):
    """Get full specs for a product."""
    result = get_product_specs(db, product_id)
    if not result:
        raise HTTPException(status_code=404, detail="Product not found")
    return result


@router.get("/categories")
def list_categories(db: Session = Depends(get_db)):
    """Get all product categories."""
    return get_all_categories(db)
