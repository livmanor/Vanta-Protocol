import hashlib
import httpx
import json as _json
import logging
from datetime import datetime, timezone
from typing import List, Dict, Any, Tuple
from backend.config import settings
from backend.cache import global_cache

logger = logging.getLogger("elevation")

async def get_real_elevations(points: List[Tuple[float, float]]) -> Dict[str, Any]:
    """Fetches real elevation in meters for a list of (lat, lng) points from Open-Elevation API.
    Points in coastal river basins with elevation < 5m-10m have high inundation vulnerability.
    """
    if not points:
        return {"source": "Open-Elevation API", "status": "live", "data": [], "last_updated": datetime.now(timezone.utc).isoformat()}

    # Stable cache key across any subset/ordering of points
    key_hash = hashlib.md5(_json.dumps(sorted(points)).encode()).hexdigest()[:10]
    cache_key = f"elevation_points_{key_hash}"
    cached = global_cache.get(cache_key)
    if cached:
        data, fetched_at, is_stale = cached
        return {
            "source": "Open-Elevation API",
            "status": "stale" if is_stale else "live",
            "last_updated": fetched_at,
            "data": data,
            "error": None
        }

    loc_str = "|".join([f"{p[0]},{p[1]}" for p in points[:10]])
    url = f"{settings.OPEN_ELEVATION_URL}?locations={loc_str}"

    try:
        async with httpx.AsyncClient(timeout=8.0) as client:
            resp = await client.get(url)
            resp.raise_for_status()
            data = resp.json().get("results", [])
            now_iso = datetime.now(timezone.utc).isoformat()
            global_cache.set(cache_key, data, settings.ELEVATION_CACHE_TTL, now_iso)
            return {
                "source": "Open-Elevation API",
                "status": "live",
                "last_updated": now_iso,
                "data": data,
                "error": None
            }
    except Exception as e:
        logger.warning(f"Open-Elevation API lookup failed: {e}. Checking cache or fallback.")
        if cached:
            data, fetched_at, _ = cached
            return {
                "source": "Open-Elevation API",
                "status": "stale",
                "last_updated": fetched_at,
                "data": data,
                "error": str(e)
            }
        return {
            "source": "Open-Elevation API",
            "status": "failed",
            "last_updated": None,
            "data": None,
            "error": str(e)
        }

