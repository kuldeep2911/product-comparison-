"""
Retrieval engine — search products by name, filters, or category.
Wraps existing ETL query_builder and product_service.
"""
import logging
from sqlalchemy import text
from sqlalchemy.orm import Session

logger = logging.getLogger(__name__)


def search_products_by_name(db: Session, names: list[str]) -> list[dict]:
    """
    Fuzzy-match product names from the database.
    Returns list of {"id", "name", "brand", "category"} dicts.
    """
    if not names:
        return []

    results = []
    for name in names:
        query = text("""
            SELECT p.id, p.name, b.name AS brand, c.name AS category
            FROM products p
            JOIN brands b ON b.id = p.brand_id
            JOIN categories c ON c.id = p.category_id
            WHERE LOWER(p.name) LIKE :q
            ORDER BY 
                CASE WHEN LOWER(p.name) = :exact THEN 0
                     WHEN LOWER(p.name) LIKE :starts THEN 1
                     ELSE 2
                END,
                p.name
            LIMIT 1
        """)
        clean = name.strip().lower()
        rows = db.execute(query, {
            "q": f"%{clean}%",
            "exact": clean,
            "starts": f"{clean}%",
        }).fetchall()

        for row in rows:
            results.append({
                "id": row.id,
                "name": row.name,
                "brand": row.brand,
                "category": row.category,
            })

    # Deduplicate by ID
    seen = set()
    unique = []
    for r in results:
        if r["id"] not in seen:
            seen.add(r["id"])
            unique.append(r)
    return unique

def resolve_product_names(db: Session, names: list[str]) -> tuple[list[dict], dict[str, list[dict]]]:
    """
    Resolve product names. 
    Returns:
       resolved: list of uniquely matched product dicts.
       ambiguities: dict mapping the ambiguous query name to a list of matching product dicts.
    """
    resolved = []
    ambiguities = {}

    for name in names:
        query = text("""
            SELECT p.id, p.name, b.name AS brand, c.name AS category
            FROM products p
            JOIN brands b ON b.id = p.brand_id
            JOIN categories c ON c.id = p.category_id
            WHERE LOWER(p.name) LIKE :q OR LOWER(b.name || ' ' || p.name) LIKE :q
            ORDER BY 
                CASE WHEN LOWER(p.name) = :exact OR LOWER(b.name || ' ' || p.name) = :exact THEN 0
                     WHEN LOWER(p.name) LIKE :starts OR LOWER(b.name || ' ' || p.name) LIKE :starts THEN 1
                     ELSE 2
                END,
                p.name
            LIMIT 5
        """)
        clean = name.strip().lower()
        rows = db.execute(query, {
            "q": f"%{clean}%",
            "exact": clean,
            "starts": f"{clean}%",
        }).fetchall()
        
        results = [{"id": row.id, "name": row.name, "brand": row.brand, "category": row.category} for row in rows]
        
        if not results:
            continue
            
        first_name = results[0]["name"].lower()
        first_brand_name = (results[0]["brand"] + " " + results[0]["name"]).lower()
        
        if len(results) == 1 or first_name == clean or first_brand_name == clean:
            resolved.append(results[0])
        else:
            ambiguities[name] = results
            
    # Deduplicate resolved
    seen = set()
    dedup_resolved = []
    for r in resolved:
        if r["id"] not in seen:
            seen.add(r["id"])
            dedup_resolved.append(r)
            
    return dedup_resolved, ambiguities



def search_products_by_filters(db: Session, category: str | None = None,
                                filters: dict[str, str] | None = None,
                                budget: int | None = None,
                                limit: int = 50) -> list[int]:
    """
    Search products using structured filters.
    Returns list of product IDs.
    """
    base_sql = "SELECT DISTINCT p.id FROM products p"
    joins = []
    where_clauses = []
    params = {}

    if category:
        joins.append("JOIN categories c ON p.category_id = c.id")
        where_clauses.append("(c.slug = :category OR LOWER(c.name) = :category_name)")
        params["category"] = category.strip().lower()
        params["category_name"] = category.strip().lower()

    # Feature filters
    filter_idx = 0
    for feature_key, condition in (filters or {}).items():
        filter_idx += 1
        alias = f"f{filter_idx}"
        joins.append(f"JOIN product_numeric_specs {alias} ON p.id = {alias}.product_id")
        where_clauses.append(f"{alias}.spec_key = :key_{alias}")
        params[f"key_{alias}"] = feature_key

        op, val = _parse_condition(condition)
        if op and val is not None:
            where_clauses.append(f"{alias}.numeric_value {op} :val_{alias}")
            params[f"val_{alias}"] = val

    sql = base_sql
    if joins:
        sql += " " + " ".join(joins)
    if where_clauses:
        sql += " WHERE " + " AND ".join(where_clauses)
    sql += f" LIMIT {limit}"

    try:
        result = db.execute(text(sql), params).fetchall()
        return [row[0] for row in result]
    except Exception as e:
        logger.error(f"Error in filter search: {e}")
        return []


def get_products_by_category(db: Session, category_slug: str, limit: int = 50) -> list[dict]:
    """Get products in a category."""
    query = text("""
        SELECT p.id, p.name, p.slug, b.name AS brand, c.name AS category, p.release_date
        FROM products p
        JOIN brands b ON b.id = p.brand_id
        JOIN categories c ON c.id = p.category_id
        WHERE c.slug = :slug OR LOWER(c.name) = :name
        ORDER BY p.name
        LIMIT :limit
    """)
    rows = db.execute(query, {"slug": category_slug.lower(), "name": category_slug.lower(), "limit": limit}).fetchall()
    return [dict(row._mapping) for row in rows]


def get_all_categories(db: Session) -> list[dict]:
    """Get all available categories."""
    query = text("SELECT id, name, slug FROM categories ORDER BY name")
    rows = db.execute(query).fetchall()
    return [dict(row._mapping) for row in rows]


def search_products_text(db: Session, query_str: str, limit: int = 20) -> list[dict]:
    """General text search for products."""
    query = text("""
        SELECT p.id, p.name, p.slug, b.name AS brand, c.name AS category
        FROM products p
        JOIN brands b ON b.id = p.brand_id
        JOIN categories c ON c.id = p.category_id
        WHERE LOWER(p.name) LIKE :q OR LOWER(b.name) LIKE :q
        ORDER BY p.name
        LIMIT :limit
    """)
    rows = db.execute(query, {"q": f"%{query_str.lower()}%", "limit": limit}).fetchall()
    return [dict(row._mapping) for row in rows]


def _parse_condition(condition: str) -> tuple:
    """Extract operator and value from condition string like '>=120'."""
    condition = condition.strip()
    operators = [">=", "<=", "!=", ">", "<", "="]

    for op in operators:
        if condition.startswith(op):
            val_str = condition[len(op):].strip()
            try:
                return op, float(val_str)
            except ValueError:
                return None, None

    try:
        return "=", float(condition)
    except ValueError:
        return None, None
