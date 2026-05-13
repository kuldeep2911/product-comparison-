"""
Comparison service — multi-product comparison using existing DB structure.
"""
import logging
from sqlalchemy import text
from sqlalchemy.orm import Session

logger = logging.getLogger(__name__)


def compare_products(db: Session, product_ids: list[int]) -> dict | None:
    """
    Compare multiple products side by side.
    Returns structured comparison data matching frontend expectations.
    """
    if not product_ids:
        return None

    placeholders = ", ".join([f":p{i}" for i in range(len(product_ids))])
    params = {f"p{i}": pid for i, pid in enumerate(product_ids)}

    # Get product info
    prod_query = text(f"""
        SELECT p.id, p.name, b.name AS brand_name, c.name AS category_name
        FROM products p
        JOIN brands b ON b.id = p.brand_id
        JOIN categories c ON c.id = p.category_id
        WHERE p.id IN ({placeholders})
    """)
    prod_rows = db.execute(prod_query, params).fetchall()

    products = []
    for row in prod_rows:
        products.append({
            "id": row.id,
            "name": row.name,
            "brand": row.brand_name,
            "category": row.category_name,
        })

    # Get all spec values
    spec_query = text(f"""
        SELECT 
            ss.name AS section_name,
            ss.display_order AS section_order,
            sf.name AS field_name,
            sf.display_name,
            sf.display_order AS field_order,
            psv.product_id,
            psv.value
        FROM product_spec_values psv
        JOIN spec_fields sf ON sf.id = psv.field_id
        JOIN spec_sections ss ON ss.id = sf.section_id
        WHERE psv.product_id IN ({placeholders})
        ORDER BY ss.display_order, sf.display_order
    """)
    spec_rows = db.execute(spec_query, params).fetchall()

    # Build comparison structure
    sections = {}
    for row in spec_rows:
        if row.section_name not in sections:
            sections[row.section_name] = {
                "name": row.section_name,
                "order": row.section_order,
                "fields": {},
            }

        sec = sections[row.section_name]
        if row.field_name not in sec["fields"]:
            sec["fields"][row.field_name] = {
                "name": row.field_name,
                "display_name": row.display_name or row.field_name,
                "order": row.field_order,
                "values": {},
            }

        sec["fields"][row.field_name]["values"][row.product_id] = row.value

    # Convert to sorted lists
    sorted_sections = sorted(sections.values(), key=lambda s: s["order"])
    result_sections = []
    for sec in sorted_sections:
        sorted_fields = sorted(sec["fields"].values(), key=lambda f: f["order"])
        result_sections.append({
            "name": sec["name"],
            "fields": [{
                "name": f["name"],
                "display_name": f["display_name"],
                "values": f["values"],
            } for f in sorted_fields],
        })

    return {
        "products": products,
        "sections": result_sections,
    }


def get_product_specs(db: Session, product_id: int) -> dict | None:
    """Get full specs for a single product."""
    query = text("""
        SELECT 
            p.id AS product_id, p.name AS product_name,
            b.name AS brand_name, c.name AS category_name,
            ss.name AS section_name, ss.display_order AS section_order,
            sf.name AS field_name, sf.display_name,
            sf.display_order AS field_order, psv.value
        FROM product_spec_values psv
        JOIN products p ON p.id = psv.product_id
        JOIN brands b ON b.id = p.brand_id
        JOIN categories c ON c.id = p.category_id
        JOIN spec_fields sf ON sf.id = psv.field_id
        JOIN spec_sections ss ON ss.id = sf.section_id
        WHERE p.id = :product_id
        ORDER BY ss.display_order, sf.display_order
    """)

    rows = db.execute(query, {"product_id": product_id}).fetchall()
    if not rows:
        return None

    first = rows[0]
    result = {
        "product": {
            "id": first.product_id,
            "name": first.product_name,
            "brand": first.brand_name,
            "category": first.category_name,
        },
        "sections": [],
    }

    current_section: dict | None = None
    for row in rows:
        if current_section is None or current_section["name"] != row.section_name:
            current_section = {"name": row.section_name, "fields": []}
            result["sections"].append(current_section)

        assert current_section is not None
        current_section["fields"].append({
            "name": row.field_name,
            "display_name": row.display_name or row.field_name,
            "value": row.value,
        })

    return result


def get_product_feature_summary(db: Session, product_ids: list[int], feature_keys: list[str] | None = None) -> dict:
    """
    Get numeric features for products — used for spec comparisons in follow-ups.
    Returns {product_id: {feature_key: value}}.
    """
    placeholders = ", ".join([f":p{i}" for i in range(len(product_ids))])
    params: dict[str, int | str] = {f"p{i}": pid for i, pid in enumerate(product_ids)}

    sql = f"""
        SELECT pf.product_id, pf.feature_key, pf.feature_value_numeric, pf.feature_value_text
        FROM product_features pf
        WHERE pf.product_id IN ({placeholders})
    """
    if feature_keys:
        key_placeholders = ", ".join([f":k{i}" for i in range(len(feature_keys))])
        sql += f" AND pf.feature_key IN ({key_placeholders})"
        for i, k in enumerate(feature_keys):
            params[f"k{i}"] = k

    rows = db.execute(text(sql), params).fetchall()

    result = {}
    for row in rows:
        if row.product_id not in result:
            result[row.product_id] = {}
        result[row.product_id][row.feature_key] = row.feature_value_numeric or row.feature_value_text

    return result
