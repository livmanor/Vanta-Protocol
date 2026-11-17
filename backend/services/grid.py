"""City-wide GHMC grid. Named hotspots stay on their own path."""

import asyncio
import hashlib
import json
import logging
import math
import statistics
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, List, Optional, Tuple

import httpx

from backend.cache import global_cache
from backend.config import settings
from backend.data_sources.open_meteo import sum_hourly_precipitation_last_48h, today_daily_value
from backend.db import fetch_grid_elevations, fetch_incidents, save_grid_elevations
from backend.models import RiskExplanation, RiskGridCell, RiskGridResponse, RiskZone
from backend.services.risk_engine import REAL_ZONES_METADATA, score_observations

logger = logging.getLogger("vanta.grid")

# GHMC bounds. 10 by 12 cell centers fill the box and land on 120 cells.
# Implied spacing is about 2.8–2.9 km, the even split of these bounds nearest 2.5 km.
LAT_MIN = 17.30
LAT_MAX = 17.56
LON_MIN = 78.30
LON_MAX = 78.62
LAT_COUNT = 10
LON_COUNT = 12
WEATHER_BATCH = 50
ELEVATION_BATCH = 40
WEATHER_CACHE_SECONDS = 1800
EMERGING_LIMIT = 10
INCIDENT_RADIUS_M = 500
_grid_lock = asyncio.Lock()


def grid_steps() -> Tuple[float, float]:
    return (LAT_MAX - LAT_MIN) / LAT_COUNT, (LON_MAX - LON_MIN) / LON_COUNT


def spacing_km() -> float:
    lat_step, lon_step = grid_steps()
    mid_lat = (LAT_MIN + LAT_MAX) / 2
    lat_km = lat_step * 111.32
    lon_km = lon_step * 111.32 * math.cos(math.radians(mid_lat))
    return round((lat_km + lon_km) / 2, 2)


def generate_grid_cells() -> List[Dict[str, Any]]:
    """Cell centers inside the GHMC box. Ids stay stable so elevation is cached once."""
    lat_step, lon_step = grid_steps()
    cells = []
    for row in range(LAT_COUNT):
        lat = LAT_MIN + (row + 0.5) * lat_step
        for col in range(LON_COUNT):
            lon = LON_MIN + (col + 0.5) * lon_step
            cells.append({
                "id": f"hyd-grid-r{row:02d}-c{col:02d}",
                "name": f"Grid {lat:.3f}N {lon:.3f}E",
                "lat": round(lat, 6),
                "lon": round(lon, 6),
                "cell_type": "grid",
            })
    return cells


def _distance_m(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    lat_delta = math.radians(lat2 - lat1)
    lon_delta = math.radians(lon2 - lon1)
    a = math.sin(lat_delta / 2) ** 2 + math.cos(math.radians(lat1)) * math.cos(math.radians(lat2)) * math.sin(lon_delta / 2) ** 2
    return 6_371_000 * 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))


def _parse_timestamp(value: str) -> Optional[datetime]:
    if not value:
        return None
    try:
        parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError:
        return None
    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=timezone.utc)
    return parsed.astimezone(timezone.utc)


async def _elevations_for(cells: List[Dict[str, Any]]) -> Dict[str, Optional[float]]:
    """Read SQLite first. Fetch Open-Elevation only for cells that have never been stored."""
    cached = await fetch_grid_elevations()
    known = {
        cell_id: row["elevation_m"]
        for cell_id, row in cached.items()
        if row.get("elevation_m") is not None
    }
    missing = [cell for cell in cells if cell["id"] not in known]
    if not missing:
        return {cell["id"]: known.get(cell["id"]) for cell in cells}

    now_iso = datetime.now(timezone.utc).isoformat()
    fetched: Dict[str, Optional[float]] = {}
    async with httpx.AsyncClient(timeout=30.0) as client:
        for start in range(0, len(missing), ELEVATION_BATCH):
            batch = missing[start:start + ELEVATION_BATCH]
            payload = {"locations": [{"latitude": cell["lat"], "longitude": cell["lon"]} for cell in batch]}
            try:
                response = await client.post(settings.OPEN_ELEVATION_URL, json=payload)
                response.raise_for_status()
                results = response.json().get("results") or []
            except Exception as exc:
                logger.warning("Open-Elevation grid batch failed: %s", exc)
                continue
            if len(results) != len(batch):
                logger.warning("Open-Elevation returned %s elevations for %s cells", len(results), len(batch))
                continue
            rows = []
            for cell, result in zip(batch, results):
                elevation = result.get("elevation") if isinstance(result, dict) else None
                if isinstance(elevation, (int, float)) and not isinstance(elevation, bool):
                    fetched[cell["id"]] = float(elevation)
                    rows.append((cell["id"], cell["lat"], cell["lon"], float(elevation), now_iso))
            await save_grid_elevations(rows)
    return {cell["id"]: known.get(cell["id"], fetched.get(cell["id"])) for cell in cells}


def _weather_cache_key(cells: List[Dict[str, Any]]) -> str:
    identity = [(cell["id"], cell["lat"], cell["lon"]) for cell in cells]
    digest = hashlib.md5(json.dumps(identity).encode()).hexdigest()[:12]
    return f"grid_weather_v2_{digest}"


def _readings_from_payload(payload: Dict[str, Any]) -> Dict[str, Any]:
    forecast = today_daily_value(payload, "precipitation_sum")
    rain_48h = sum_hourly_precipitation_last_48h(payload)
    if forecast is None and rain_48h is None:
        status = "failed"
    elif forecast is None or rain_48h is None:
        status = "partial"
    else:
        status = "live"
    return {
        "forecast_24h": forecast,
        "rain_48h": rain_48h,
        "status": status,
        "temperature_max_c": today_daily_value(payload, "temperature_2m_max"),
        "apparent_temperature_max_c": today_daily_value(payload, "apparent_temperature_max"),
    }


async def _fetch_weather(cells: List[Dict[str, Any]]) -> Dict[str, Dict[str, Any]]:
    cache_key = _weather_cache_key(cells)
    cached = global_cache.get(cache_key)
    if cached and not cached[2]:
        data, _fetched_at, _is_stale = cached
        return data

    readings: Dict[str, Dict[str, Any]] = {}
    failed = False
    async with httpx.AsyncClient(timeout=30.0) as client:
        for start in range(0, len(cells), WEATHER_BATCH):
            batch = cells[start:start + WEATHER_BATCH]
            params = {
                "latitude": ",".join(f"{cell['lat']:.5f}" for cell in batch),
                "longitude": ",".join(f"{cell['lon']:.5f}" for cell in batch),
                "hourly": "precipitation",
                "daily": "precipitation_sum,temperature_2m_max,apparent_temperature_max",
                "past_days": 2,
                "forecast_days": 1,
                "timezone": "Asia/Kolkata",
            }
            try:
                response = await client.get(settings.OPEN_METEO_FORECAST_URL, params=params)
                response.raise_for_status()
                payload = response.json()
            except Exception as exc:
                logger.warning("Open-Meteo grid batch failed: %s", exc)
                failed = True
                for cell in batch:
                    readings[cell["id"]] = {"forecast_24h": None, "rain_48h": None, "status": "failed", "temperature_max_c": None, "apparent_temperature_max_c": None}
                continue
            rows = payload if isinstance(payload, list) else [payload]
            if len(rows) != len(batch) or any(isinstance(row, dict) and row.get("error") for row in rows):
                failed = True
                for cell in batch:
                    readings[cell["id"]] = {"forecast_24h": None, "rain_48h": None, "status": "failed", "temperature_max_c": None, "apparent_temperature_max_c": None}
                continue
            for cell, row in zip(batch, rows):
                readings[cell["id"]] = _readings_from_payload(row if isinstance(row, dict) else {})

    if not failed:
        now_iso = datetime.now(timezone.utc).isoformat()
        global_cache.set(cache_key, readings, WEATHER_CACHE_SECONDS, now_iso)
    elif cached:
        data, _fetched_at, _is_stale = cached
        for cell_id, reading in data.items():
            stale = dict(reading)
            stale["status"] = "stale"
            readings[cell_id] = stale
    return readings


def _recent_incidents(incidents, now: datetime):
    cutoff = now - timedelta(hours=24)
    recent = []
    for incident in incidents:
        stamp = _parse_timestamp(incident.timestamp or "")
        if stamp is not None and stamp >= cutoff:
            recent.append(incident)
    return recent


def _near_incident(lat: float, lon: float, incidents) -> bool:
    return any(_distance_m(lat, lon, incident.lat, incident.lng) <= INCIDENT_RADIUS_M for incident in incidents)


async def compute_risk_grid() -> RiskGridResponse:
    """Score every GHMC cell. A failed weather feed stays null, never 0 mm."""
    async with _grid_lock:
        cells = generate_grid_cells()
        elevations, readings, incidents = await asyncio.gather(
            _elevations_for(cells),
            _fetch_weather(cells),
            fetch_incidents(),
        )
        measured = [value for value in elevations.values() if isinstance(value, (int, float)) and not isinstance(value, bool)]
        median = statistics.median(measured) if measured else None
        recent = _recent_incidents(incidents, datetime.now(timezone.utc))
        lat_step, lon_step = grid_steps()
        scored: List[RiskGridCell] = []
        for cell in cells:
            elevation = elevations.get(cell["id"])
            reading = readings.get(cell["id"]) or {
                "forecast_24h": None, "rain_48h": None, "status": "failed",
                "temperature_max_c": None, "apparent_temperature_max_c": None,
            }
            low_lying = median is not None and isinstance(elevation, (int, float)) and elevation < median
            level, score, explanation = score_observations(
                rainfall_24h=reading["forecast_24h"],
                precip_prob_max=None,
                wind_max_kmh=None,
                river_discharge=None,
                elevation_m=elevation if isinstance(elevation, (int, float)) else None,
                historical_flood=False,
                rainfall_48h=reading["rain_48h"],
                weather_status=reading["status"],
                low_lying=low_lying,
                temperature_max_c=reading.get("temperature_max_c"),
                apparent_temperature_max_c=reading.get("apparent_temperature_max_c"),
            )
            status = reading["status"]
            if status == "live" and elevation is None:
                status = "partial"
            why = "data unavailable" if level is None else explanation.why_this
            emerging = (level is not None and level >= 3) or _near_incident(cell["lat"], cell["lon"], recent)
            scored.append(RiskGridCell(
                id=cell["id"],
                name=cell["name"],
                lat=cell["lat"],
                lon=cell["lon"],
                risk_level=level,
                score=score,
                rain_48h=reading["rain_48h"],
                forecast_24h=reading["forecast_24h"],
                heat_temperature_max_c=reading.get("temperature_max_c"),
                heat_apparent_max_c=reading.get("apparent_temperature_max_c"),
                elevation_m=elevation if isinstance(elevation, (int, float)) else None,
                low_lying=low_lying,
                emerging=emerging,
                source_status=status,
                why_this=why,
            ))
        return RiskGridResponse(
            cell_count=len(scored),
            hotspot_count=len(REAL_ZONES_METADATA),
            emerging_count=sum(1 for cell in scored if cell.emerging),
            spacing_km=spacing_km(),
            lat_step=lat_step,
            lon_step=lon_step,
            cells=scored,
        )


async def emerging_hotspot_zones(limit: int = EMERGING_LIMIT) -> Tuple[List[RiskZone], Dict[str, Dict[str, Any]]]:
    """Top emerging grid cells for Predict. The six named hotspots are added by the caller."""
    report = await compute_risk_grid()
    ranked = sorted(
        (cell for cell in report.cells if cell.emerging),
        key=lambda cell: cell.score if cell.score is not None else float("-inf"),
        reverse=True,
    )[:limit]
    now_iso = datetime.now(timezone.utc).isoformat()
    zones: List[RiskZone] = []
    status: Dict[str, Dict[str, Any]] = {}
    for cell in ranked:
        explanation = RiskExplanation(
            rainfall_24h_mm=cell.forecast_24h,
            rainfall_48h_mm=cell.rain_48h,
            weather_status=cell.source_status,
            mean_elevation_m=cell.elevation_m,
            historical_flood_prone=False,
            why_this=cell.why_this,
            heat_temperature_max_c=cell.heat_temperature_max_c,
            heat_apparent_max_c=cell.heat_apparent_max_c,
        )
        zones.append(RiskZone(
            id=cell.id,
            name=f"Emerging · {cell.name}",
            risk_level=cell.risk_level,
            polygon={"type": "Point", "coordinates": [cell.lon, cell.lat]},
            population=None,
            derived_from=["Open-Meteo Weather API", "Open-Elevation API", "GHMC monitoring grid"],
            computed_at=now_iso,
            explanation=explanation,
            cell_type="grid",
        ))
        status[cell.id] = {
            "weather": {"name": "Open-Meteo Weather", "status": cell.source_status, "last_updated": now_iso if cell.source_status != "failed" else None},
            "elevation": {
                "name": "Open-Elevation",
                "status": "live" if cell.elevation_m is not None else "failed",
                "last_updated": now_iso if cell.elevation_m is not None else None,
            },
        }
    return zones, status
