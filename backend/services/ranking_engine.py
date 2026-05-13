"""
Ranking engine — scores and ranks products by use-case weighted features.
Upgraded with:
  - Global min/max normalization (so catalog-wide recommendations are accurate)
  - Dedicated camera scoring (OIS, telephoto, ultrawide, LiDAR, aperture)
  - Base-score fallback when no use_case is provided
  - Built-in use-case profiles as fallback when DB has no weights
  - Brand diversity enforcement (max 3 from any single brand)
"""
import logging
from sqlalchemy import text
from sqlalchemy.orm import Session

logger = logging.getLogger(__name__)

# Module-level cache shared across requests in the same process
_global_min_max_cache: dict | None = None

LOWER_IS_BETTER_FEATURES = {"price", "weight", "thickness"}

# ── Built-in use-case profiles (used as fallback if DB doesn't have weights) ──
BUILTIN_USE_CASE_PROFILES = {
    "gaming": {
        "refresh_rate": 0.25,
        "ram": 0.25,
        "display_size": 0.15,
        "battery_capacity": 0.15,
        "charging_watts": 0.10,
        "cpu_generation": 0.10,
    },
    "camera": {
        "camera_mp": 0.10,
        "has_ois": 0.25,
        "selfie_camera_mp": 0.10,
        "display_size": 0.10,
        "refresh_rate": 0.05,
        "battery_capacity": 0.05,
        "charging_watts": 0.05,
        "storage": 0.05,
        "cpu_generation": 0.15,
        "weight": 0.10,
    },
    "battery_life": {
        "battery_capacity": 0.45,
        "charging_watts": 0.25,
        "display_size": 0.10,
        "refresh_rate": 0.10,
        "weight": 0.10,
    },
    "multimedia": {
        "display_size": 0.35,
        "refresh_rate": 0.25,
        "storage": 0.15,
        "battery_capacity": 0.10,
        "ram": 0.10,
        "charging_watts": 0.05,
    },
    "compact": {
        "weight": 0.40,
        "display_size": 0.25,
        "battery_capacity": 0.15,
        "camera_mp": 0.10,
        "storage": 0.10,
    },
    "balanced": {
        "battery_capacity": 0.15,
        "display_size": 0.10,
        "refresh_rate": 0.10,
        "ram": 0.15,
        "storage": 0.10,
        "camera_mp": 0.10,
        "cpu_generation": 0.10,
        "charging_watts": 0.10,
        "weight": 0.10,
    },
    "productivity": {
        "ram": 0.25,
        "storage": 0.20,
        "display_size": 0.15,
        "battery_capacity": 0.15,
        "cpu_generation": 0.15,
        "refresh_rate": 0.10,
    },
    "value_for_money": {
        "battery_capacity": 0.20,
        "ram": 0.20,
        "storage": 0.15,
        "camera_mp": 0.15,
        "display_size": 0.10,
        "charging_watts": 0.10,
        "refresh_rate": 0.10,
    },
}

# ── Use-case aliases: map variant names to canonical profile keys ──
USE_CASE_ALIASES = {
    "battery": "battery_life",
    "photo": "camera",
    "photography": "camera",
    "video": "multimedia",
    "movies": "multimedia",
    "streaming": "multimedia",
    "game": "gaming",
    "work": "productivity",
    "office": "productivity",
    "everyday": "balanced",
    "daily": "balanced",
    "all-rounder": "balanced",
    "general": "balanced",
    "affordable": "value_for_money",
    "budget": "value_for_money",
    "cheap": "value_for_money",
    "small": "compact",
    "lightweight": "compact",
    "pocket": "compact",
}


def _resolve_use_case(use_case: str | None) -> str | None:
    """Normalize use_case to a canonical profile key."""
    if not use_case:
        return None
    uc = use_case.strip().lower()
    return USE_CASE_ALIASES.get(uc, uc)


def _clamp(value: float, low: float = 0.0, high: float = 1.0) -> float:
    return max(low, min(high, value))


def _saturating_score(value: float | None, target: float, floor: float = 0.0) -> float:
    if value is None or target <= 0:
        return floor
    return _clamp(float(value) / target, floor, 1.0)


def _range_score(value: float | None, best: float, worst: float) -> float:
    if value is None or best == worst:
        return 0.0
    val = float(value)
    if best < worst:
        return _clamp(1.0 - (val - best) / (worst - best))
    return _clamp((val - worst) / (best - worst))


def _infer_cpu_generation(features: dict, brand: str = "", name: str = "") -> float:
    existing = features.get("cpu_generation")
    if existing:
        return float(existing)

    brand_l = brand.lower()
    name_l = name.lower()

    if brand_l == "apple" and "iphone" in name_l:
        if "17" in name_l:
            return 5.5 if "pro" in name_l else 5.1
        if "16" in name_l:
            return 5.0 if "pro" in name_l else 4.6
        if "15" in name_l:
            return 4.7 if "pro" in name_l else 4.2
        if "14" in name_l:
            return 4.0 if "pro" in name_l else 3.6
        if "13" in name_l:
            return 3.4
        return 3.0

    if brand_l == "samsung":
        if "s25" in name_l:
            return 5.0
        if "s24" in name_l or "z fold6" in name_l or "z flip6" in name_l:
            return 4.5
        if "s23" in name_l:
            return 4.0

    if "ultra" in name_l or "pro max" in name_l:
        return 4.4
    if "pro" in name_l or "plus" in name_l:
        return 3.8
    return 0.0


def _camera_processing_score(brand: str = "", name: str = "", cpu_generation: float = 0.0) -> float:
    brand_l = brand.lower()
    name_l = name.lower()
    cpu_score = _clamp(cpu_generation / 5.0)
    brand_score = 0.0

    if brand_l == "apple" and "iphone" in name_l:
        brand_score = 1.0 if "pro" in name_l else 0.92
    elif brand_l == "google" and "pixel" in name_l:
        brand_score = 1.0 if "pro" in name_l else 0.94
    elif brand_l == "samsung":
        if "ultra" in name_l:
            brand_score = 0.98
        elif any(token in name_l for token in ("galaxy s", "z fold", "z flip")):
            brand_score = 0.9
    elif "ultra" in name_l or "pro max" in name_l:
        brand_score = 0.9
    elif "pro" in name_l:
        brand_score = 0.82

    return max(cpu_score, brand_score)


def _model_tier_score(brand: str = "", name: str = "") -> float:
    name_l = name.lower()
    brand_l = brand.lower()
    if "ultra" in name_l or "pro max" in name_l:
        return 1.0
    if "pro" in name_l or "fold" in name_l:
        return 0.9
    if brand_l == "apple" and "iphone" in name_l:
        return 0.85
    if "plus" in name_l:
        return 0.75
    return 0.55


def _software_support_score(brand: str = "", name: str = "") -> float:
    brand_l = brand.lower()
    name_l = name.lower()
    if brand_l == "apple" and "iphone" in name_l:
        return 1.0
    if brand_l == "google" and "pixel" in name_l:
        return 0.96
    if brand_l == "samsung":
        if any(token in name_l for token in ("galaxy s", "z fold", "z flip")):
            return 0.94
        return 0.82
    if brand_l in {"xiaomi", "oppo", "oneplus", "vivo"}:
        return 0.74 if any(token in name_l for token in ("ultra", "pro", "find", "reno", "poco f")) else 0.66
    return 0.62


def _enforce_brand_diversity(results: list[dict], max_per_brand: int = 6, total: int = 20) -> list[dict]:
    """
    Pick top products ensuring no more than max_per_brand from any single brand.
    This guarantees diverse recommendations across Samsung, Apple, Xiaomi, Oppo, etc.
    """
    brand_counts: dict[str, int] = {}
    diverse: list[dict] = []

    for product in results:
        brand = product.get("brand", "Unknown")
        if brand_counts.get(brand, 0) < max_per_brand:
            diverse.append(product)
            brand_counts[brand] = brand_counts.get(brand, 0) + 1
        if len(diverse) >= total:
            break

    return diverse


def _get_global_min_max(db: Session) -> dict:
    """
    Cache full-DB min/max per feature_key so recommendation scoring is
    consistent across the entire product catalog (not just the compared set).
    """
    global _global_min_max_cache
    if _global_min_max_cache is not None:
        return _global_min_max_cache

    try:
        rows = db.execute(text("""
            SELECT feature_key,
                   MIN(feature_value_numeric) AS mn,
                   MAX(feature_value_numeric) AS mx
            FROM product_features
            WHERE feature_value_numeric IS NOT NULL
            GROUP BY feature_key
        """)).fetchall()

        min_max = {row.feature_key: (row.mn, row.mx) for row in rows}
        _global_min_max_cache = min_max
        return min_max
    except Exception as e:
        logger.error(f"Error fetching global min/max: {e}")
        return {}


def calculate_camera_score(features: dict, brand: str = "", name: str = "") -> tuple[float, dict]:
    """
    Expert camera score based on camera hardware plus computational imaging.
    Megapixels saturate at 48 MP so 108/200 MP sensors do not automatically
    beat phones like iPhone/Pixel/Galaxy flagships with better processing.
    """
    score = 0.0
    details = {}

    mp = features.get("camera_mp", 0)
    mp_score = 0.14 * _saturating_score(mp, 48.0)
    score += mp_score
    if mp:
        details["camera_mp"] = {"weighted_score": round(mp_score, 3), "display_value": f"{int(mp)} MP"}

    if features.get("has_ois", 0) > 0:
        score += 0.18
        details["has_ois"] = {"weighted_score": 0.18, "display_value": "OIS"}

    if features.get("has_telephoto", 0) > 0:
        score += 0.14
        details["has_telephoto"] = {"weighted_score": 0.14, "display_value": "Telephoto"}

    if features.get("has_ultrawide", 0) > 0:
        score += 0.08
        details["has_ultrawide"] = {"weighted_score": 0.08, "display_value": "Ultrawide"}

    aperture = features.get("aperture")
    aperture_score = 0.10 * _range_score(aperture, best=1.4, worst=2.8)
    score += aperture_score
    if aperture:
        details["aperture"] = {"weighted_score": round(aperture_score, 3), "display_value": f"f/{aperture}"}

    selfie_mp = features.get("selfie_camera_mp", 0)
    selfie_score = 0.06 * _saturating_score(selfie_mp, 12.0)
    score += selfie_score
    if selfie_mp:
        details["selfie_camera_mp"] = {"weighted_score": round(selfie_score, 3), "display_value": f"{int(selfie_mp)} MP"}

    cpu_gen = _infer_cpu_generation(features, brand, name)
    processing_score = 0.22 * _camera_processing_score(brand, name, cpu_gen)
    score += processing_score
    if processing_score > 0:
        details["image_processing"] = {
            "weighted_score": round(processing_score, 3),
            "display_value": "Flagship ISP" if processing_score >= 0.19 else "Good ISP",
        }

    tier_score = 0.08 * _model_tier_score(brand, name)
    score += tier_score
    details["camera_tier"] = {
        "weighted_score": round(tier_score, 3),
        "display_value": "Flagship" if tier_score >= 0.07 else "Mainstream",
    }

    return _clamp(score), details


def calculate_base_scores_batch(db: Session, product_ids: list[int]) -> dict:
    """
    Calculate a generic overall quality score for a batch of products
    using global min/max normalization — used when no use_case is specified.
    Returns {product_id: score}.
    """
    if not product_ids:
        return {}

    min_max = _get_global_min_max(db)
    if not min_max:
        return {pid: 0.0 for pid in product_ids}

    placeholders = ", ".join([f":p{i}" for i in range(len(product_ids))])
    params = {f"p{i}": pid for i, pid in enumerate(product_ids)}

    try:
        rows = db.execute(text(f"""
            SELECT pf.product_id, pf.feature_key, pf.feature_value_numeric
            FROM product_features pf
            WHERE pf.product_id IN ({placeholders})
              AND pf.feature_value_numeric IS NOT NULL
        """), params).fetchall()

        prod_values: dict = {}
        for row in rows:
            pid = row.product_id
            if pid not in prod_values:
                prod_values[pid] = {}
            prod_values[pid][row.feature_key] = row.feature_value_numeric

        scores: dict = {}
        for pid in product_ids:
            values = prod_values.get(pid, {})
            total = 0.0
            count = 0
            for key, val in values.items():
                if key in min_max:
                    mn, mx = min_max[key]
                    if mx > mn:
                        normalized = (
                            1.0 - (val - mn) / (mx - mn)
                            if key in LOWER_IS_BETTER_FEATURES
                            else (val - mn) / (mx - mn)
                        )
                        total += normalized
                        count += 1
            scores[pid] = total / count if count > 0 else 0.0

        # Ensure every requested product has an entry
        for pid in product_ids:
            scores.setdefault(pid, 0.0)

        return scores

    except Exception as e:
        logger.error(f"Error calculating batch scores: {e}")
        return {pid: 0.0 for pid in product_ids}


def _generate_category_breakdown(features: dict, min_max: dict, brand: str = "", name: str = "") -> dict:
    """Generate user-facing quality categories for overall recommendations."""
    camera_score, _camera_details = calculate_camera_score(features, brand, name)

    cpu_gen = _infer_cpu_generation(features, brand, name)
    performance_score = (
        0.50 * _saturating_score(cpu_gen, 5.0)
        + 0.25 * _saturating_score(features.get("ram"), 12.0)
        + 0.25 * _saturating_score(features.get("storage"), 256.0)
    )

    resolution_score = (
        0.5 * _saturating_score(features.get("resolution_height"), 2800.0)
        + 0.5 * _saturating_score(features.get("resolution_width"), 1300.0)
    )
    screen_score = (
        0.40 * _saturating_score(features.get("refresh_rate"), 120.0, floor=0.45)
        + 0.35 * resolution_score
        + 0.25 * _saturating_score(features.get("display_size"), 6.7, floor=0.55)
    )

    battery_score = (
        0.65 * _saturating_score(features.get("battery_capacity"), 5000.0)
        + 0.35 * _saturating_score(features.get("charging_watts"), 80.0)
    )
    if brand.lower() == "apple" and "iphone" in name.lower():
        battery_score = _clamp(battery_score + 0.06)

    price = features.get("price")
    value_score = 0.55 if price is None else _clamp(1.0 - (float(price) - 300.0) / 1200.0, 0.20, 1.0)

    portability_score = (
        0.55 * _range_score(features.get("weight"), best=165.0, worst=240.0)
        + 0.45 * _range_score(features.get("thickness"), best=7.4, worst=9.2)
    )

    return {
        "camera": {"weighted_score": round(camera_score, 3)},
        "performance": {"weighted_score": round(_clamp(performance_score), 3)},
        "screen": {"weighted_score": round(_clamp(screen_score), 3)},
        "battery": {"weighted_score": round(_clamp(battery_score), 3)},
        "software_support": {"weighted_score": round(_software_support_score(brand, name), 3)},
        "value": {"weighted_score": round(_clamp(value_score), 3)},
        "portability": {"weighted_score": round(_clamp(portability_score), 3)},
    }


def _calculate_overall_score(breakdown: dict) -> float:
    weights = {
        "camera": 0.34,
        "performance": 0.19,
        "screen": 0.15,
        "battery": 0.09,
        "software_support": 0.14,
        "value": 0.04,
        "portability": 0.05,
    }
    return sum(
        float(breakdown.get(key, {}).get("weighted_score", 0.0)) * weight
        for key, weight in weights.items()
    )


def rank_products(db: Session, product_ids: list[int], use_case: str | None = None) -> list[dict]:
    """
    Rank products by a use-case profile using weighted scoring.

    Routing:
      • use_case == "camera"  → dedicated camera algorithm (OIS, telephoto, etc.)
      • use_case is None      → global-normalised base score (overall quality)
      • any other use_case    → weighted feature score from DB or built-in profiles
    
    All results pass through brand diversity enforcement (max 3 per brand).
    """
    if not product_ids:
        return []

    # Resolve aliases like "battery" → "battery_life", "photo" → "camera"
    use_case = _resolve_use_case(use_case)

    # Use global min/max for category breakdown calculations
    min_max = _get_global_min_max(db) or {}

    # ── Camera — dedicated expert scoring ──────────────────────────────────
    if use_case == "camera":
        placeholders = ", ".join([f":p{i}" for i in range(len(product_ids))])
        params = {f"p{i}": pid for i, pid in enumerate(product_ids)}

        try:
            rows = db.execute(text(f"""
                SELECT pf.product_id, pf.feature_key, pf.feature_value_numeric
                FROM product_features pf
                WHERE pf.product_id IN ({placeholders})
                  AND pf.feature_value_numeric IS NOT NULL
            """), params).fetchall()

            prod_features: dict = {}
            for row in rows:
                pid = row.product_id
                if pid not in prod_features:
                    prod_features[pid] = {}
                prod_features[pid][row.feature_key] = row.feature_value_numeric

            # Fetch product names for the result list
            info_rows = db.execute(text(f"""
                SELECT p.id, p.name, b.name AS brand
                FROM products p
                JOIN brands b ON b.id = p.brand_id
                WHERE p.id IN ({placeholders})
            """), params).fetchall()
            product_info = {row.id: {"name": row.name, "brand": row.brand} for row in info_rows}

            results = []
            for pid in product_ids:
                features = prod_features.get(pid, {})
                info = product_info.get(pid, {})
                score, cam_details = calculate_camera_score(
                    features,
                    info.get("brand", "Unknown"),
                    info.get("name", "Unknown"),
                )
                results.append({
                    "id": pid,
                    "name": info.get("name", "Unknown"),
                    "brand": info.get("brand", "Unknown"),
                    "score": round(score, 4),
                    "details": cam_details,
                })

            results.sort(key=lambda x: x["score"], reverse=True)
            return _enforce_brand_diversity(results)

        except Exception as e:
            logger.error(f"Camera scoring failed: {e}. Falling back to use-case weights.")
            use_case = "camera"  # fall through to weighted path below

    # ── No use_case — global-normalised base score ─────────────────────────
    if not use_case:
        placeholders = ", ".join([f":p{i}" for i in range(len(product_ids))])
        params = {f"p{i}": pid for i, pid in enumerate(product_ids)}
        info_rows = db.execute(text(f"""
            SELECT p.id, p.name, b.name AS brand
            FROM products p JOIN brands b ON b.id = p.brand_id
            WHERE p.id IN ({placeholders})
        """), params).fetchall()
        product_info = {row.id: {"name": row.name, "brand": row.brand} for row in info_rows}

        # Need features to compute breakdown
        feat_rows = db.execute(text(f"""
            SELECT pf.product_id, pf.feature_key, pf.feature_value_numeric
            FROM product_features pf
            WHERE pf.product_id IN ({placeholders})
              AND pf.feature_value_numeric IS NOT NULL
        """), params).fetchall()
        
        prod_features: dict = {}
        for row in feat_rows:
            pid = row.product_id
            if pid not in prod_features:
                prod_features[pid] = {}
            prod_features[pid][row.feature_key] = row.feature_value_numeric

        results = []
        for pid in product_ids:
            info = product_info.get(pid, {})
            brand = info.get("brand", "Unknown")
            name = info.get("name", "Unknown")
            feats = prod_features.get(pid, {})
            breakdown = _generate_category_breakdown(feats, min_max, brand, name)
            
            # Format real specs for the frontend (like Scenario 2)
            details = {}
            # Map of internal feature key to a relative importance weight for sorting
            spec_map = {
                "ram": (breakdown.get("performance", {}).get("weighted_score", 0.5), lambda v: f"{int(v)} GB"),
                "storage": (breakdown.get("performance", {}).get("weighted_score", 0.5) - 0.1, lambda v: f"{int(v)} GB"),
                "refresh_rate": (breakdown.get("screen", {}).get("weighted_score", 0.5), lambda v: f"{int(v)} Hz"),
                "battery_capacity": (breakdown.get("battery", {}).get("weighted_score", 0.5), lambda v: f"{int(v)} mAh"),
                "camera_mp": (breakdown.get("camera", {}).get("weighted_score", 0.5), lambda v: f"{int(v)} MP"),
                "charging_watts": (breakdown.get("battery", {}).get("weighted_score", 0.5) - 0.1, lambda v: f"{int(v)} W"),
            }
            
            for key, (score, formatter) in spec_map.items():
                val = feats.get(key)
                if val is not None:
                    details[key] = {
                        "value": val,
                        "display_value": formatter(val),
                        "weighted_score": score
                    }

            results.append({
                "id": pid,
                "name": name,
                "brand": brand,
                "score": round(_calculate_overall_score(breakdown), 4),
                "details": details,
            })

        results.sort(key=lambda x: x["score"], reverse=True)
        return _enforce_brand_diversity(results, max_per_brand=6, total=20)

    # ── Weighted use_case ranking ──────────────────────────────────────────
    # Try DB weights first, fall back to built-in profiles
    weight_rows = db.execute(
        text("SELECT feature_key, weight FROM use_case_weights WHERE use_case = :use_case"),
        {"use_case": use_case},
    ).fetchall()
    weights = {row.feature_key: row.weight for row in weight_rows}

    if not weights:
        # Fall back to built-in profile
        weights = BUILTIN_USE_CASE_PROFILES.get(use_case, {})
        if weights:
            logger.info(f"Using built-in weights for use case: {use_case}")
        else:
            logger.warning(f"No weights found for use case: {use_case} — using balanced profile")
            weights = BUILTIN_USE_CASE_PROFILES["balanced"]

    placeholders = ", ".join([f":p{i}" for i in range(len(product_ids))])
    params = {f"p{i}": pid for i, pid in enumerate(product_ids)}

    feat_rows = db.execute(text(f"""
        SELECT pf.product_id, p.name, b.name AS brand_name,
               pf.feature_key, pf.feature_value_numeric
        FROM product_features pf
        JOIN products p ON p.id = pf.product_id
        JOIN brands b ON b.id = p.brand_id
        WHERE pf.product_id IN ({placeholders})
          AND pf.feature_value_numeric IS NOT NULL
    """), params).fetchall()

    product_features: dict = {}
    product_info: dict = {}
    for row in feat_rows:
        if row.product_id not in product_features:
            product_features[row.product_id] = {}
            product_info[row.product_id] = {"name": row.name, "brand": row.brand_name}
        product_features[row.product_id][row.feature_key] = row.feature_value_numeric

    # Use global min/max for better cross-catalog normalisation
    min_max = _get_global_min_max(db)
    if not min_max:
        # Fallback: compute within compared set (original behaviour)
        all_values: dict = {}
        for pid, feats in product_features.items():
            for key, val in feats.items():
                all_values.setdefault(key, []).append(val)
        min_max = {key: (min(vals), max(vals)) for key, vals in all_values.items()}

    results = []
    for pid in product_ids:
        if pid not in product_features:
            continue

        feats = product_features[pid]
        score = 0.0
        details: dict = {}

        for feature_key, weight in weights.items():
            if feature_key in feats:
                val = feats[feature_key]
                mn, mx = min_max.get(feature_key, (0, 1))

                if mx > mn:
                    if feature_key in LOWER_IS_BETTER_FEATURES:
                        normalized = float(1.0 - (val - mn) / (mx - mn))
                    else:
                        normalized = float((val - mn) / (mx - mn))
                else:
                    normalized = 0.5

                weighted = float(normalized * weight)
                score += weighted
                
                # Format human-readable values
                disp = str(val)
                if feature_key in ("ram", "storage"): disp = f"{int(val)} GB"
                elif feature_key == "refresh_rate": disp = f"{int(val)} Hz"
                elif feature_key == "battery_capacity": disp = f"{int(val)} mAh"
                elif feature_key == "charging_watts": disp = f"{int(val)} W"
                elif feature_key == "display_size": disp = f"{val}\""
                elif feature_key == "weight": disp = f"{int(val)} g"
                elif feature_key == "camera_mp": disp = f"{int(val)} MP"
                elif val == int(val): disp = str(int(val))

                details[feature_key] = {
                    "value": val,
                    "display_value": disp,
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
    return _enforce_brand_diversity(results)


def _get_products_info(db: Session, product_ids: list[int]) -> list[dict]:
    """Get basic product info without ranking (used as fallback)."""
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
