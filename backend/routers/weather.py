"""Per-hotspot weather. Unique ~0.1° Open-Meteo cells are fetched once and shared."""
from __future__ import annotations

import logging
from datetime import datetime, timezone
from typing import Any, Dict, Optional

import httpx
from fastapi import APIRouter

from backend.cache import global_cache
from backend.config import settings
from backend.data_sources.htp_waterlogging import ensure_catalog
from backend.data_sources.open_meteo import (
    _weather_payload_status,
    sum_hourly_precipitation_last_48h,
    today_daily_value,
)
from backend.models import WeatherCurrent, WeatherDaily, ZoneWeather

router = APIRouter(prefix="/api", tags=["Weather"])
logger = logging.getLogger("vanta.weather")

WEATHER_CODES = {
    0: "Clear sky", 1: "Mainly clear", 2: "Partly cloudy", 3: "Overcast",
    45: "Fog", 48: "Depositing rime fog",
    51: "Light drizzle", 53: "Moderate drizzle", 55: "Dense drizzle",
    56: "Light freezing drizzle", 57: "Dense freezing drizzle",
    61: "Slight rain", 63: "Moderate rain", 65: "Heavy rain",
    66: "Light freezing rain", 67: "Heavy freezing rain",
    71: "Slight snowfall", 73: "Moderate snowfall", 75: "Heavy snowfall", 77: "Snow grains",
    80: "Slight rain showers", 81: "Moderate rain showers", 82: "Violent rain showers",
    85: "Slight snow showers", 86: "Heavy snow showers",
    95: "Thunderstorm", 96: "Thunderstorm with slight hail",
    97: "Heavy thunderstorm", 99: "Thunderstorm with heavy hail",
}

GRID_DEG = 0.1
BATCH_SIZE = 40


def _number(obj: Dict[str, Any], key: str) -> Optional[float]:
    value = obj.get(key)
    return float(value) if isinstance(value, (int, float)) and not isinstance(value, bool) else None


def _condition(code: Any) -> Optional[str]:
    return WEATHER_CODES.get(code) if isinstance(code, int) else None


def _current_weather(data: Dict[str, Any]) -> Optional[WeatherCurrent]:
    current = data.get("current")
    if not isinstance(current, dict):
        return None
    code = current.get("weather_code")
    is_day = current.get("is_day")
    return WeatherCurrent(
        time=current.get("time"), weather_code=code, condition=_condition(code),
        temperature_c=_number(current, "temperature_2m"),
        feels_like_c=_number(current, "apparent_temperature"),
        relative_humidity_pct=_number(current, "relative_humidity_2m"),
        precipitation_mm=_number(current, "precipitation"),
        rain_mm=_number(current, "rain"), showers_mm=_number(current, "showers"),
        snowfall_cm=_number(current, "snowfall"), cloud_cover_pct=_number(current, "cloud_cover"),
        wind_speed_kmh=_number(current, "wind_speed_10m"),
        wind_direction_deg=_number(current, "wind_direction_10m"),
        wind_gusts_kmh=_number(current, "wind_gusts_10m"),
        is_day=bool(is_day) if isinstance(is_day, (int, bool)) else None,
    )


def _today_weather(data: Dict[str, Any]) -> Optional[WeatherDaily]:
    daily = data.get("daily")
    date_today = today_daily_value(data, "time")
    if not isinstance(daily, dict) or date_today is None:
        return None
    code = today_daily_value(data, "weather_code")
    return WeatherDaily(
        date=date_today, weather_code=code, condition=_condition(code),
        temperature_min_c=today_daily_value(data, "temperature_2m_min"),
        temperature_max_c=today_daily_value(data, "temperature_2m_max"),
        precipitation_sum_mm=today_daily_value(data, "precipitation_sum"),
        precipitation_probability_max_pct=today_daily_value(data, "precipitation_probability_max"),
        wind_speed_max_kmh=today_daily_value(data, "wind_speed_10m_max"),
        wind_gusts_max_kmh=today_daily_value(data, "wind_gusts_10m_max"),
    )


def _cell_key(lat: float, lon: float) -> tuple[float, float]:
    return (round(lat / GRID_DEG) * GRID_DEG, round(lon / GRID_DEG) * GRID_DEG)


async def _fetch_unique_cell_weather(cells: list[tuple[float, float]]) -> dict[tuple[float, float], dict[str, Any]]:
    """One Open-Meteo request per unique ~0.1° cell (batched). Missing stays failed."""
    out: dict[tuple[float, float], dict[str, Any]] = {}
    if not cells:
        return out

    # Cache hit per cell first.
    pending: list[tuple[float, float]] = []
    for lat, lon in cells:
        cache_key = f"open_meteo_weather_cell_{lat:.1f}_{lon:.1f}"
        cached = global_cache.get(cache_key)
        if cached and not cached[2] and _weather_payload_status(cached[0]) == "live":
            data, fetched_at, is_stale = cached
            out[(lat, lon)] = {
                "status": "stale" if is_stale else "live",
                "last_updated": fetched_at,
                "data": data,
                "error": None,
            }
        else:
            pending.append((lat, lon))

    if not pending:
        return out

    now_iso = datetime.now(timezone.utc).isoformat()
    async with httpx.AsyncClient(timeout=30.0, follow_redirects=True) as client:
        for start in range(0, len(pending), BATCH_SIZE):
            batch = pending[start:start + BATCH_SIZE]
            params = {
                "latitude": ",".join(f"{lat:.4f}" for lat, _ in batch),
                "longitude": ",".join(f"{lon:.4f}" for _, lon in batch),
                "current": ",".join([
                    "temperature_2m", "relative_humidity_2m", "apparent_temperature",
                    "is_day", "precipitation", "rain", "showers", "snowfall",
                    "weather_code", "cloud_cover", "wind_speed_10m",
                    "wind_direction_10m", "wind_gusts_10m",
                ]),
                "hourly": "precipitation",
                "daily": (
                    "precipitation_sum,precipitation_probability_max,wind_speed_10m_max,"
                    "weather_code,temperature_2m_max,temperature_2m_min,"
                    "apparent_temperature_max,wind_gusts_10m_max"
                ),
                "forecast_days": 3,
                "past_days": 2,
                "timezone": "Asia/Kolkata",
            }
            try:
                response = await client.get(settings.OPEN_METEO_FORECAST_URL, params=params)
                response.raise_for_status()
                payload = response.json()
            except Exception as exc:
                logger.warning("Open-Meteo weather batch failed: %s", type(exc).__name__)
                for cell in batch:
                    out[cell] = {
                        "status": "failed",
                        "last_updated": None,
                        "data": None,
                        "error": str(exc)[:160],
                    }
                continue

            rows = payload if isinstance(payload, list) else [payload]
            if len(rows) != len(batch):
                logger.warning(
                    "Open-Meteo weather batch size mismatch: got %s for %s cells",
                    len(rows), len(batch),
                )
                for cell in batch:
                    out[cell] = {
                        "status": "failed",
                        "last_updated": None,
                        "data": None,
                        "error": "Open-Meteo returned an unexpected batch size.",
                    }
                continue

            for cell, row in zip(batch, rows):
                data = row if isinstance(row, dict) else {}
                status = _weather_payload_status(data)
                if status == "live":
                    cache_key = f"open_meteo_weather_cell_{cell[0]:.1f}_{cell[1]:.1f}"
                    global_cache.set(cache_key, data, settings.WEATHER_CACHE_TTL, now_iso)
                out[cell] = {
                    "status": status,
                    "last_updated": now_iso if status != "failed" else None,
                    "data": data if status != "failed" else None,
                    "error": None if status == "live" else "Open-Meteo returned incomplete weather fields.",
                }
    return out


@router.get("/weather", response_model=list[ZoneWeather])
async def get_zone_weather():
    """Current/today Open-Meteo weather for HTP points, shared across unique ~0.1° cells."""
    catalog = await ensure_catalog()
    if not catalog:
        return []

    zones = []
    cell_for_zone: dict[str, tuple[float, float]] = {}
    unique_cells: dict[tuple[float, float], None] = {}
    for zone in catalog:
        lat, lng = zone["centroid"]
        cell = _cell_key(float(lat), float(lng))
        cell_for_zone[zone["id"]] = cell
        unique_cells[cell] = None
        zones.append(zone)

    cell_weather = await _fetch_unique_cell_weather(list(unique_cells.keys()))
    logger.info(
        "Zone weather: %s HTP points -> %s unique Open-Meteo cells",
        len(zones),
        len(unique_cells),
    )

    results = []
    for zone in zones:
        lat, lng = zone["centroid"]
        cell = cell_for_zone[zone["id"]]
        response = cell_weather.get(cell) or {
            "status": "failed",
            "last_updated": None,
            "data": None,
            "error": "Weather cell unavailable.",
        }
        data = response.get("data") or {}
        results.append(ZoneWeather(
            zone_id=zone["id"], zone_name=zone["name"], latitude=lat, longitude=lng,
            status=response["status"], last_updated=response.get("last_updated"),
            error_message=response.get("error"),
            current=_current_weather(data), today=_today_weather(data),
            rainfall_48h_mm=sum_hourly_precipitation_last_48h(data),
        ))
    return results
