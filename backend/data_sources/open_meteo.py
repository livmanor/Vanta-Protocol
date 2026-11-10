import httpx
import logging
from datetime import datetime, timezone
from typing import Optional, Dict, Any
from backend.config import settings
from backend.cache import global_cache

logger = logging.getLogger("open_meteo")

async def get_real_weather_forecast(lat: float, lng: float) -> Dict[str, Any]:
    """Fetches real-time rainfall, precipitation probability, and wind speed from Open-Meteo.
    Respects rate limits via TTL caching and returns metadata including source status.
    """
    cache_key = f"open_meteo_weather_{lat:.3f}_{lng:.3f}"
    cached = global_cache.get(cache_key)
    if cached:
        data, fetched_at, is_stale = cached
        return {
            "source": "Open-Meteo Forecast API",
            "status": "stale" if is_stale else "live",
            "last_updated": fetched_at,
            "data": data,
            "error": None
        }

    url = settings.OPEN_METEO_FORECAST_URL
    params = {
        "latitude": lat,
        "longitude": lng,
        "hourly": "precipitation,precipitation_probability,rain,wind_speed_10m,wind_gusts_10m",
        "daily": "precipitation_sum,precipitation_probability_max,wind_speed_10m_max",
        "forecast_days": 3,
        "timezone": "auto"
    }

    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            resp = await client.get(url, params=params)
            resp.raise_for_status()
            data = resp.json()
            now_iso = datetime.now(timezone.utc).isoformat()
            global_cache.set(cache_key, data, settings.WEATHER_CACHE_TTL, now_iso)
            return {
                "source": "Open-Meteo Forecast API",
                "status": "live",
                "last_updated": now_iso,
                "data": data,
                "error": None
            }
    except Exception as e:
        logger.error(f"Error fetching Open-Meteo weather: {e}")
        # If cache exists even if expired, return it with stale status
        if cached:
            data, fetched_at, _ = cached
            return {
                "source": "Open-Meteo Forecast API",
                "status": "stale",
                "last_updated": fetched_at,
                "data": data,
                "error": str(e)
            }
        return {
            "source": "Open-Meteo Forecast API",
            "status": "failed",
            "last_updated": None,
            "data": None,
            "error": str(e)
        }

async def get_real_river_discharge(lat: float, lng: float) -> Dict[str, Any]:
    """Fetches real-time GloFAS river discharge forecast from Open-Meteo Flood API.
    Used for flood risk analysis.
    """
    cache_key = f"open_meteo_flood_{lat:.3f}_{lng:.3f}"
    cached = global_cache.get(cache_key)
    if cached:
        data, fetched_at, is_stale = cached
        return {
            "source": "Open-Meteo GloFAS Flood API",
            "status": "stale" if is_stale else "live",
            "last_updated": fetched_at,
            "data": data,
            "error": None
        }

    url = settings.OPEN_METEO_FLOOD_URL
    params = {
        "latitude": lat,
        "longitude": lng,
        "daily": "river_discharge",
        "forecast_days": 3
    }

    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            resp = await client.get(url, params=params)
            resp.raise_for_status()
            data = resp.json()
            now_iso = datetime.now(timezone.utc).isoformat()
            global_cache.set(cache_key, data, settings.FLOOD_CACHE_TTL, now_iso)
            return {
                "source": "Open-Meteo GloFAS Flood API",
                "status": "live",
                "last_updated": now_iso,
                "data": data,
                "error": None
            }
    except Exception as e:
        logger.error(f"Error fetching Open-Meteo flood: {e}")
        if cached:
            data, fetched_at, _ = cached
            return {
                "source": "Open-Meteo GloFAS Flood API",
                "status": "stale",
                "last_updated": fetched_at,
                "data": data,
                "error": str(e)
            }
        return {
            "source": "Open-Meteo GloFAS Flood API",
            "status": "failed",
            "last_updated": None,
            "data": None,
            "error": str(e)
        }

