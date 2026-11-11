import httpx
import logging
from datetime import datetime, timezone
from typing import Dict, Any, List, Optional
from backend.config import settings
from backend.cache import global_cache

logger = logging.getLogger("osm")

# Public Overpass mirrors in fallback order.
# overpass-api.de returns 406 without a proper User-Agent from some networks;
# we try each mirror in order and use the first that responds.
OVERPASS_MIRRORS = [
    "https://overpass-api.de/api/interpreter",
    "https://overpass.kumi.systems/api/interpreter",
    "https://maps.mail.ru/osm/tools/overpass/api/interpreter",
]

# Shared headers required by all Overpass instances
OVERPASS_HEADERS = {
    "User-Agent": "VantaProtocol/1.0 (disaster-response-research; contact@vantaprotocol.local)",
    "Accept": "application/json, text/json, */*",
}


async def _query_overpass(query: str, timeout: float = 15.0) -> Optional[Dict]:
    """Try each Overpass mirror in order; return parsed JSON on first success."""
    for url in OVERPASS_MIRRORS:
        try:
            async with httpx.AsyncClient(timeout=timeout) as client:
                resp = await client.post(
                    url,
                    data={"data": query},
                    headers=OVERPASS_HEADERS
                )
                if resp.status_code == 200:
                    return resp.json()
                logger.warning(f"Overpass mirror {url} returned HTTP {resp.status_code}")
        except Exception as e:
            logger.warning(f"Overpass mirror {url} failed: {e}")
    return None


async def get_real_shelters_and_stations(bbox: tuple = None) -> Dict[str, Any]:
    """Fetches real police stations, hospitals, and emergency shelters/community halls
    from OpenStreetMap Overpass API for the target bounding box.
    Tries multiple mirrors and sets an honest source status.
    """
    if bbox is None:
        bbox = (settings.BBOX_MIN_LAT, settings.BBOX_MIN_LNG, settings.BBOX_MAX_LAT, settings.BBOX_MAX_LNG)
    min_lat, min_lng, max_lat, max_lng = bbox

    cache_key = f"osm_facilities_{min_lat}_{min_lng}_{max_lat}_{max_lng}"
    cached = global_cache.get(cache_key)
    if cached:
        data, fetched_at, is_stale = cached
        return {
            "source": "OpenStreetMap Overpass API",
            "status": "stale" if is_stale else "live",
            "last_updated": fetched_at,
            "data": data,
            "error": None
        }

    overpass_query = f"""
[out:json][timeout:15];
(
  node["amenity"="police"]({min_lat},{min_lng},{max_lat},{max_lng});
  node["amenity"="shelter"]({min_lat},{min_lng},{max_lat},{max_lng});
  node["amenity"="community_centre"]({min_lat},{min_lng},{max_lat},{max_lng});
  node["amenity"="hospital"]({min_lat},{min_lng},{max_lat},{max_lng});
);
out body 25;
"""

    raw_data = await _query_overpass(overpass_query)
    now_iso = datetime.now(timezone.utc).isoformat()

    if raw_data is not None:
        raw_elements = raw_data.get("elements", [])
        facilities = []
        for el in raw_elements:
            tags = el.get("tags", {})
            name = tags.get("name", tags.get("amenity", "Facility").title())
            facilities.append({
                "id": f"osm-{el.get('id')}",
                "name": name,
                "type": tags.get("amenity"),
                "lat": el.get("lat"),
                "lng": el.get("lon"),
                "tags": tags
            })
        global_cache.set(cache_key, facilities, settings.OSM_CACHE_TTL, now_iso)
        return {
            "source": "OpenStreetMap Overpass API",
            "status": "live",
            "last_updated": now_iso,
            "data": facilities,
            "error": None
        }
    else:
        # All mirrors failed — return honest error state
        # (Do NOT fabricate facilities: agent_rules.md §1.3)
        logger.error("All Overpass mirrors failed — routing will use known civic shelter list")
        if cached:
            data, fetched_at, _ = cached
            return {
                "source": "OpenStreetMap Overpass API",
                "status": "stale",
                "last_updated": fetched_at,
                "data": data,
                "error": "All Overpass mirrors unreachable"
            }
        return {
            "source": "OpenStreetMap Overpass API",
            "status": "failed",
            "last_updated": None,
            "data": [],
            "error": "All Overpass API mirrors unreachable from this network"
        }
