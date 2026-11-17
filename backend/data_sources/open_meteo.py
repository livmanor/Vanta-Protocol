import httpx
import logging
from datetime import datetime, timezone, timedelta
from typing import Optional, Dict, Any
from backend.config import settings
from backend.cache import global_cache

logger = logging.getLogger("open_meteo")
_weather_response_keys_logged = False
IST = timezone(timedelta(hours=5, minutes=30))


def sum_hourly_precipitation_last_48h(data: Dict[str, Any]) -> Optional[float]:
    """Sum hourly precipitation over the rolling 48 hours ending now in IST."""
    hourly = data.get("hourly") or {}
    times = hourly.get("time") or []
    values = hourly.get("precipitation") or []
    if len(times) != len(values):
        return None
    try:
        tz = IST
        now = datetime.now(tz)
        cutoff = now - timedelta(hours=48)
        samples = []
        for stamp, value in zip(times, values):
            if not isinstance(stamp, str):
                continue
            sample_time = datetime.fromisoformat(stamp)
            if sample_time.tzinfo is None:
                sample_time = sample_time.replace(tzinfo=tz)
            sample_time = sample_time.astimezone(tz)
            if cutoff < sample_time <= now and isinstance(value, (int, float)) and not isinstance(value, bool):
                samples.append(float(value))
    except (ValueError, TypeError):
        return None
    if not samples:
        return None
    return round(sum(samples), 1)


def today_daily_value(data: Dict[str, Any], key: str) -> Any:
    """Return a daily value for today's local date, even when past_days shifts the arrays."""
    daily = data.get("daily") or {}
    dates = daily.get("time") or []
    try:
        today = datetime.now(IST).date().isoformat()
        index = dates.index(today)
        values = daily.get(key) or []
        return values[index] if index < len(values) else None
    except (ValueError, TypeError):
        return None


async def get_recent_historical_rain(
    lat: float,
    lng: float,
    days: int = 30,
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
) -> Dict[str, Any]:
    """Fetch recent observed/reanalysis daily rainfall from Open-Meteo Archive."""
    today = datetime.now(timezone(timedelta(hours=5, minutes=30))).date()
    requested_end = datetime.fromisoformat(end_date).date() if end_date else today
    requested_start = datetime.fromisoformat(start_date).date() if start_date else requested_end - timedelta(days=days)
    cache_key = f"open_meteo_archive_rain_{lat:.3f}_{lng:.3f}_{requested_start}_{requested_end}"
    cached = global_cache.get(cache_key)
    if cached and not cached[2]:
        data, fetched_at, is_stale = cached
        return {"source": "Open-Meteo Historical Weather API", "status": "stale" if is_stale else "live", "last_updated": fetched_at, "data": data, "error": None}

    try:
        async with httpx.AsyncClient(timeout=15.0) as client:
            response = await client.get(settings.OPEN_METEO_ARCHIVE_URL, params={
                "latitude": lat,
                "longitude": lng,
                "start_date": requested_start.isoformat(),
                "end_date": requested_end.isoformat(),
                "daily": "precipitation_sum,rain_sum",
                "timezone": "Asia/Kolkata",
            })
            response.raise_for_status()
            data = response.json()
        now_iso = datetime.now(timezone.utc).isoformat()
        global_cache.set(cache_key, data, 21600, now_iso)
        return {"source": "Open-Meteo Historical Weather API", "status": "live", "last_updated": now_iso, "data": data, "error": None}
    except Exception as exc:
        logger.warning("Open-Meteo historical rainfall unavailable: %s", exc)
        if cached:
            data, fetched_at, _ = cached
            return {"source": "Open-Meteo Historical Weather API", "status": "stale", "last_updated": fetched_at, "data": data, "error": "Historical rainfall request failed; showing cached data."}
        return {"source": "Open-Meteo Historical Weather API", "status": "failed", "last_updated": None, "data": None, "error": "Historical rainfall is unavailable."}

async def get_real_weather_forecast(lat: float, lng: float) -> Dict[str, Any]:
    """Fetches real-time rainfall, precipitation probability, and wind speed from Open-Meteo.
    Respects rate limits via TTL caching and returns metadata including source status.
    """
    cache_key = f"open_meteo_weather_ist48h_heat_{lat:.3f}_{lng:.3f}"
    cached = global_cache.get(cache_key)
    if cached and not cached[2] and _weather_payload_status(cached[0]) == "live":
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
        "current": ",".join([
            "temperature_2m", "relative_humidity_2m", "apparent_temperature",
            "is_day", "precipitation", "rain", "showers", "snowfall",
            "weather_code", "cloud_cover", "wind_speed_10m",
            "wind_direction_10m", "wind_gusts_10m",
        ]),
        "hourly": "precipitation",
        "daily": "precipitation_sum,precipitation_probability_max,wind_speed_10m_max,weather_code,temperature_2m_max,temperature_2m_min,apparent_temperature_max,wind_gusts_10m_max",
        "forecast_days": 3,
        "past_days": 2,
        "timezone": "Asia/Kolkata"
    }

    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            resp = await client.get(url, params=params)
            resp.raise_for_status()
            data = resp.json()
            global _weather_response_keys_logged
            if not _weather_response_keys_logged:
                logger.info(
                    "Open-Meteo forecast response keys: top=%s current=%s hourly=%s daily=%s daily.time=%s",
                    sorted(data.keys()), sorted((data.get("current") or {}).keys()),
                    sorted((data.get("hourly") or {}).keys()), sorted((data.get("daily") or {}).keys()),
                    (data.get("daily") or {}).get("time"),
                )
                _weather_response_keys_logged = True
            now_iso = datetime.now(timezone.utc).isoformat()
            global_cache.set(cache_key, data, settings.WEATHER_CACHE_TTL, now_iso)
            payload_status = _weather_payload_status(data)
            return {
                "source": "Open-Meteo Forecast API",
                "status": payload_status,
                "last_updated": now_iso,
                "data": data,
                "error": None if payload_status == "live" else "Open-Meteo returned incomplete current, daily, or hourly precipitation data."
            }
    except Exception as e:
        logger.error(f"Error fetching Open-Meteo weather: {e}")
        # If cache exists even if expired, return it with stale status
        if cached:
            data, fetched_at, _ = cached
            cached_status = _weather_payload_status(data)
            return {
                "source": "Open-Meteo Forecast API",
                "status": "stale" if cached_status == "live" else cached_status,
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


def _weather_payload_status(data: Dict[str, Any]) -> str:
    current = data.get("current") or {}
    current_ok = any(current.get(field) is not None for field in ("temperature_2m", "precipitation", "weather_code"))
    daily_ok = all(today_daily_value(data, field) is not None for field in (
        "precipitation_sum", "precipitation_probability_max", "wind_speed_10m_max",
    ))
    hourly_ok = sum_hourly_precipitation_last_48h(data) is not None
    if current_ok and daily_ok and hourly_ok:
        return "live"
    if current_ok or daily_ok or hourly_ok:
        return "partial"
    return "failed"

async def get_real_river_discharge(lat: float, lng: float) -> Dict[str, Any]:
    """Fetches real-time GloFAS river discharge forecast from Open-Meteo Flood API.
    Used for flood risk analysis.
    """
    cache_key = f"open_meteo_flood_{lat:.3f}_{lng:.3f}"
    cached = global_cache.get(cache_key)
    if cached and not cached[2]:
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

