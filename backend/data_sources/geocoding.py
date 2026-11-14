"""Open-Meteo place-name lookup for location-specific agent runs."""

import logging
import re
from datetime import datetime, timezone
from typing import Any, Dict

import httpx

from backend.cache import global_cache

logger = logging.getLogger("open_meteo_geocoding")
GEOCODING_URL = "https://geocoding-api.open-meteo.com/v1/search"


async def resolve_location(query: str) -> Dict[str, Any]:
    name = " ".join(query.split())
    if not name or len(name) > 120:
        raise ValueError("Enter a place name up to 120 characters.")
    key = re.sub(r"[^a-z0-9]+", "-", name.lower()).strip("-")
    cache_key = f"open_meteo_geocode_{key}"
    cached = global_cache.get(cache_key)
    if cached:
        data, _, _ = cached
        return data

    async with httpx.AsyncClient(timeout=10.0) as client:
        response = await client.get(GEOCODING_URL, params={
            "name": name, "count": 10, "language": "en", "format": "json",
        })
        response.raise_for_status()
        payload = response.json()

    results = payload.get("results") or []
    if not results:
        raise ValueError(f"No matching location found for '{name}'. Try a more specific place name.")
    # Prefer Hyderabad/Telangana matches for the control-room default while allowing
    # other locations to resolve when an officer explicitly requests them.
    result = next((item for item in results if item.get("admin1", "").lower() == "telangana" and item.get("country_code") == "IN"), results[0])
    resolved = {
        "name": result["name"],
        "admin1": result.get("admin1"),
        "country": result.get("country"),
        "latitude": float(result["latitude"]),
        "longitude": float(result["longitude"]),
        "elevation": result.get("elevation"),
        "timezone": result.get("timezone"),
        "source": "Open-Meteo Geocoding API (GeoNames)",
    }
    global_cache.set(cache_key, resolved, 30 * 86400, datetime.now(timezone.utc).isoformat())
    return resolved
