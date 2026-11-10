import httpx
import logging
from datetime import datetime, timezone
from typing import Dict, Any, List
from backend.config import settings
from backend.cache import global_cache

logger = logging.getLogger("osm")

async def get_real_shelters_and_stations(bbox: tuple = None) -> Dict[str, Any]:
    """Fetches real police stations, hospitals, and emergency shelters/community halls
    from OpenStreetMap Overpass API for the target bounding box.
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

    # Query for police, shelter, community halls, and hospitals
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

    try:
        async with httpx.AsyncClient(timeout=15.0) as client:
            resp = await client.post(settings.OVERPASS_API_URL, data={"data": overpass_query})
            resp.raise_for_status()
            raw_elements = resp.json().get("elements", [])
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
            now_iso = datetime.now(timezone.utc).isoformat()
            global_cache.set(cache_key, facilities, settings.OSM_CACHE_TTL, now_iso)
            return {
                "source": "OpenStreetMap Overpass API",
                "status": "live",
                "last_updated": now_iso,
                "data": facilities,
                "error": None
            }
    except Exception as e:
        logger.warning(f"Overpass API error: {e}")
        if cached:
            data, fetched_at, _ = cached
            return {
                "source": "OpenStreetMap Overpass API",
                "status": "stale",
                "last_updated": fetched_at,
                "data": data,
                "error": str(e)
            }
        return {
            "source": "OpenStreetMap Overpass API",
            "status": "failed",
            "last_updated": None,
            "data": [],
            "error": str(e)
        }

