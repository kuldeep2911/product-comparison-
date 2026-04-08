"""
Ranking engine — scores and ranks products by use-case weighted features.
"""
import logging
from sqlalchemy import text
from sqlalchemy.orm import Session

logger = logging.getLogger(__name__)


def rank_products(db: Session, product_ids: list[int], use_case: str | None = None) -> list[dict]:
    """
    Rank products by a use-case profile using weighted scoring.
    Returns sorted list of products with scores.
    """
    if not product_ids:
        return []

    if not use_case:
        return _get_products_info(db, product_ids)

    # Get weights for this use case
    weight_rows = db.execute(
        text("SELECT feature_key, weight FROM use_case_weights WHERE use_case = :use_case"),
        {"use_case": use_case},
    ).fetchall()
    weights = {row.feature_key: row.weight for row in weight_rows}

    if not weights:
        logger.warning(f"No weights found for use case: {use_case}")
        return _get_products_info(db, product_ids)

    placeholders = ", ".join([f":p{i}" for i in range(len(product_ids))])
    params = {f"p{i}": pid for i, pid in enumerate(product_ids)}

    # Get numeric features
    feat_query = text(f"""
        SELECT pf.product_id, p.name, b.name AS brand_name,
               pf.feature_key, pf.feature_value_numeric
        FROM product_features pf
        JOIN products p ON p.id = pf.product_id
        JOIN brands b ON b.id = p.brand_id
        WHERE pf.product_id IN ({placeholders})
          AND pf.feature_value_numeric IS NOT NULL
    """)
    feat_rows = db.execute(feat_query, params).fetchall()

    product_features = {}
    product_info = {}
    for row in feat_rows:
        if row.product_id not in product_features:
            product_features[row.product_id] = {}
            product_info[row.product_id] = {"name": row.name, "brand": row.brand_name}
        product_features[row.product_id][row.feature_key] = row.feature_value_numeric

    # find min/max for normalization
    all_values: dict = {}
    for pid, feats in product_features.items():
        for key, val in feats.items():
            if key not in all_values:
                all_values[key] = []
            all_values[key].append(val)

    min_max = {}
    for key, vals in all_values.items():
        min_max[key] = (min(vals), max(vals))

    # Calculate scores
    results = []
    for pid in product_ids:
        if pid not in product_features:
            continue

        feats = product_features[pid]
        score = 0.0
        details = {}

        for feature_key, weight in weights.items():
            if feature_key in feats:
                val = feats[feature_key]
                mn, mx = min_max.get(feature_key, (0, 1))

                if mx > mn:
                    if feature_key == "weight":
                        normalized = float(1.0 - (val - mn) / (mx - mn))
                    else:
                        normalized = float((val - mn) / (mx - mn))
                else:
                    normalized = 0.5

                weighted = float(normalized * weight)
                score += weighted
                details[feature_key] = {
                    "value": val,
                    "normalized": round(normalized, 3),
                    "weight": weight,
                    "weighted_score": round(weighted, 3),
                }

        results.append({
            "id": pid,
            "name": product_info.get(pid, {}).get("name", "Unknown"),
            "brand": product_info.get(pid, {}).get("brand", "Unknown"),
            "score": round(float(score), 4),
            "details": details,
        })

    results.sort(key=lambda x: x["score"], reverse=True)
    return results


def _get_products_info(db: Session, product_ids: list[int]) -> list[dict]:
    """Get basic product info without ranking."""
    if not product_ids:
        return []

    placeholders = ", ".join([f":p{i}" for i in range(len(product_ids))])
    params = {f"p{i}": pid for i, pid in enumerate(product_ids)}

    query = text(f"""
        SELECT p.id, p.name, b.name AS brand
        FROM products p
        JOIN brands b ON b.id = p.brand_id
        WHERE p.id IN ({placeholders})
    """)
    rows = db.execute(query, params).fetchall()
    return [{"id": r.id, "name": r.name, "brand": r.brand, "score": 0, "details": {}} for r in rows]
