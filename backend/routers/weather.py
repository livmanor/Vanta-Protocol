from typing import Any, Dict, Optional

from fastapi import APIRouter

from backend.data_sources.open_meteo import get_real_weather_forecast
from backend.models import WeatherCurrent, WeatherDaily, ZoneWeather
from backend.services.risk_engine import REAL_ZONES_METADATA

router = APIRouter(prefix="/api", tags=["Weather"])

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


def _number(obj: Dict[str, Any], key: str) -> Optional[float]:
    value = obj.get(key)
    return float(value) if isinstance(value, (int, float)) and not isinstance(value, bool) else None


def _at(obj: Dict[str, Any], key: str, index: int = 0) -> Any:
    values = obj.get(key)
    return values[index] if isinstance(values, list) and len(values) > index else None


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
    if not isinstance(daily, dict):
        return None
    code = _at(daily, "weather_code")
    if code is None and not daily.get("time"):
        return None
    return WeatherDaily(
        date=_at(daily, "time"), weather_code=code, condition=_condition(code),
        temperature_min_c=_at(daily, "temperature_2m_min"),
        temperature_max_c=_at(daily, "temperature_2m_max"),
        precipitation_sum_mm=_at(daily, "precipitation_sum"),
        precipitation_probability_max_pct=_at(daily, "precipitation_probability_max"),
        wind_speed_max_kmh=_at(daily, "wind_speed_10m_max"),
        wind_gusts_max_kmh=_at(daily, "wind_gusts_10m_max"),
    )


@router.get("/weather", response_model=list[ZoneWeather])
async def get_zone_weather():
    """Returns current and today's real Open-Meteo weather for monitored zone centroids."""
    results = []
    for zone in REAL_ZONES_METADATA:
        lat, lng = zone["centroid"]
        response = await get_real_weather_forecast(lat, lng)
        data = response.get("data") or {}
        results.append(ZoneWeather(
            zone_id=zone["id"], zone_name=zone["name"], latitude=lat, longitude=lng,
            status=response["status"], last_updated=response.get("last_updated"),
            error_message=response.get("error"),
            current=_current_weather(data), today=_today_weather(data),
        ))
    return results
