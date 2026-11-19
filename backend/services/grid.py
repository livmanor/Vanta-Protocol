"""City-wide GHMC risk grid.

Changes in vanta-upgrade:
  - Configurable resolution and boundary from settings (GRID_* env vars).
  - Per-cell weather caching: each cell's weather is cached individually.
    On cache miss only the stale/missing cells are re-fetched from Open-Meteo.
  - Rate-limit semaphore: at most WEATHER_BATCH_CONCURRENCY concurrent batch
    requests to Open-Meteo, preventing 429 cascades.
  - Optional DEM: if DEM_FILE_PATH points to an existing rasterio-readable file
    the grid reads slope. If rasterio is absent or the file is missing the grid
    proceeds without DEM features and logs a one-time warning.
  - API response reports true prediction_resolution_km and dem_resolution_m.
  - Named hotspots stay on their own path in risk_engine.compute_real_risk_zones.
"""
from __future__ import annotations

import asyncio
import logging
import math
import statistics
from datetime import date, datetime, timedelta, timezone
from typing import Any, Dict, List, Optional, Tuple

import httpx

from backend.cache import global_cache
from backend.config import settings
from backend.data_sources.open_meteo import sum_hourly_precipitation_last_48h, today_daily_value
from backend.db import fetch_grid_elevations, fetch_incidents, save_grid_elevations
from backend.models import RiskExplanation, RiskGridCell, RiskGridResponse, RiskZone
from backend.data_sources.htp_waterlogging import get_hotspot_catalog
from backend.services.risk_engine import score_observations

logger = logging.getLogger("vanta.grid")

# ── Grid bounds and resolution from settings (defaults = original 10×12 layout) ─
# Module-level aliases kept for existing importers (e.g. test_grid.py).
LAT_MIN = settings.GRID_LAT_MIN
LAT_MAX = settings.GRID_LAT_MAX
LON_MIN = settings.GRID_LON_MIN
LON_MAX = settings.GRID_LON_MAX
LAT_COUNT = settings.GRID_LAT_COUNT
LON_COUNT = settings.GRID_LON_COUNT

# ── Rate limiting ───────────────────────────────────────────────────────────────
# Max concurrent batch requests to Open-Meteo. Each batch contains up to
# WEATHER_BATCH cell coordinates. Lowering this avoids 429 responses when the
# grid is large or many refreshes happen simultaneously.
WEATHER_BATCH_CONCURRENCY = 2
WEATHER_BATCH = 50
ELEVATION_BATCH = 40
WEATHER_CACHE_SECONDS = 1800
EMERGING_LIMIT = 10
INCIDENT_RADIUS_M = 500

_grid_lock = asyncio.Lock()
_weather_semaphore = asyncio.Semaphore(WEATHER_BATCH_CONCURRENCY)

# ── DEM support ─────────────────────────────────────────────────────────────────
_dem_warned = False   # log DEM issues only once per process


def _load_dem_slopes(cells: List[Dict[str, Any]]) -> Dict[str, Optional[float]]:
    """Extract slope (m/m) at each cell centre from a local DEM file.

    Returns a dict keyed by cell id. Value is None when:
      - DEM_FILE_PATH is unset
      - the file does not exist
      - rasterio is not installed
      - the cell coordinate falls in a nodata pixel

    Nothing is downloaded. Only files already present on disk are read.
    """
    global _dem_warned
    dem_path = settings.DEM_FILE_PATH.strip()
    slopes: Dict[str, Optional[float]] = {c["id"]: None for c in cells}

    if not dem_path:
        return slopes

    import os
    if not os.path.isfile(dem_path):
        if not _dem_warned:
            logger.warning("DEM_FILE_PATH %r does not exist; DEM features disabled.", dem_path)
            _dem_warned = True
        return slopes

    try:
        import numpy as np
        import rasterio  # type: ignore[import]
        from rasterio.windows import from_bounds as _from_bounds  # type: ignore[import]
    except ImportError:
        if not _dem_warned:
            logger.warning(
                "rasterio is not installed; DEM slope features disabled. "
                "Install rasterio to enable them."
            )
            _dem_warned = True
        return slopes

    try:
        with rasterio.open(dem_path) as src:
            nodata = src.nodata
            res_x, res_y = abs(src.res[1]), abs(src.res[0])  # metres per pixel
            for cell in cells:
                try:
                    row_idx, col_idx = src.index(cell["lon"], cell["lat"])
                    # Read a 3×3 window centred on the cell to compute slope.
                    win = rasterio.windows.Window(col_idx - 1, row_idx - 1, 3, 3)
                    tile = src.read(1, window=win, boundless=True,
                                    fill_value=nodata if nodata is not None else np.nan)
                    tile = tile.astype(float)
                    if nodata is not None:
                        tile[tile == nodata] = np.nan
                    if np.all(np.isnan(tile)):
                        slopes[cell["id"]] = None
                        continue
                    # Central differences in x and y directions.
                    dz_dx = (tile[1, 2] - tile[1, 0]) / (2 * res_x) if res_x else 0.0
                    dz_dy = (tile[2, 1] - tile[0, 1]) / (2 * res_y) if res_y else 0.0
                    slope = math.sqrt(dz_dx ** 2 + dz_dy ** 2)
                    slopes[cell["id"]] = round(slope, 5) if not math.isnan(slope) else None
                except Exception:
                    slopes[cell["id"]] = None
    except Exception as exc:
        if not _dem_warned:
            logger.warning("DEM read failed: %s; proceeding without DEM features.", exc)
            _dem_warned = True
    return slopes


def _dem_resolution_m() -> Optional[int]:
    """Return the DEM pixel size in metres if a DEM was successfully opened."""
    dem_path = settings.DEM_FILE_PATH.strip()
    if not dem_path:
        return None
    import os
    if not os.path.isfile(dem_path):
        return None
    try:
        import rasterio  # type: ignore[import]
        with rasterio.open(dem_path) as src:
            return int(round(abs(src.res[0])))
    except Exception:
        return None


# ── Grid geometry ───────────────────────────────────────────────────────────────

def grid_steps() -> Tuple[float, float]:
    return (LAT_MAX - LAT_MIN) / LAT_COUNT, (LON_MAX - LON_MIN) / LON_COUNT


def spacing_km() -> float:
    lat_step, lon_step = grid_steps()
    mid_lat = (LAT_MIN + LAT_MAX) / 2
    lat_km = lat_step * 111.32
    lon_km = lon_step * 111.32 * math.cos(math.radians(mid_lat))
    return round((lat_km + lon_km) / 2, 2)


def generate_grid_cells() -> List[Dict[str, Any]]:
    """Cell centres inside the GHMC box. Ids stay stable so elevation is cached once."""
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
    a = (math.sin(lat_delta / 2) ** 2
         + math.cos(math.radians(lat1)) * math.cos(math.radians(lat2))
         * math.sin(lon_delta / 2) ** 2)
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


# ── Elevation (SQLite-backed, fetched once per cell id) ─────────────────────────

async def _elevations_for(cells: List[Dict[str, Any]]) -> Dict[str, Optional[float]]:
    """Read SQLite first. Fetch Open-Elevation only for cells never stored."""
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
            payload = {"locations": [{"latitude": c["lat"], "longitude": c["lon"]} for c in batch]}
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
                elev = result.get("elevation") if isinstance(result, dict) else None
                if isinstance(elev, (int, float)) and not isinstance(elev, bool):
                    fetched[cell["id"]] = float(elev)
                    rows.append((cell["id"], cell["lat"], cell["lon"], float(elev), now_iso))
            await save_grid_elevations(rows)
    return {cell["id"]: known.get(cell["id"], fetched.get(cell["id"])) for cell in cells}


# ── Per-cell weather with individual cache entries ──────────────────────────────

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


def _readings_from_archive_payload(payload: Dict[str, Any], day: str, previous_day: str) -> Dict[str, Any]:
    def _daily(key: str, d: str) -> Optional[float]:
        daily = payload.get("daily") or {}
        dates = daily.get("time") or []
        try:
            idx = dates.index(d)
            vals = daily.get(key) or []
            return vals[idx] if idx < len(vals) else None
        except (ValueError, TypeError):
            return None

    forecast = _daily("precipitation_sum", day)
    prior = _daily("precipitation_sum", previous_day)
    rain_48h = (float(forecast) + float(prior)) if forecast is not None and prior is not None else None
    if forecast is None and rain_48h is None:
        status = "failed"
    elif forecast is None or rain_48h is None:
        status = "partial"
    else:
        status = "live"
    return {
        "forecast_24h": None if forecast is None else float(forecast),
        "rain_48h": rain_48h,
        "status": status,
        "temperature_max_c": _daily("temperature_2m_max", day),
        "apparent_temperature_max_c": _daily("apparent_temperature_max", day),
    }


_FAILED_READING: Dict[str, Any] = {
    "forecast_24h": None, "rain_48h": None, "status": "failed",
    "temperature_max_c": None, "apparent_temperature_max_c": None,
}


async def _fetch_weather(cells: List[Dict[str, Any]]) -> Dict[str, Dict[str, Any]]:
    """Per-cell weather with individual cache entries and rate-limit semaphore.

    Each cell's reading is cached under its own key. Only cells with an expired
    or absent cache entry are included in the fetch batch. A 429 or timeout for
    one batch marks those cells as "failed" but does not evict valid cached cells.
    """
    result: Dict[str, Dict[str, Any]] = {}
    to_fetch: List[Dict[str, Any]] = []
    stale_fallback: Dict[str, Dict[str, Any]] = {}

    for cell in cells:
        cache_key = f"grid_cell_wx_{cell['id']}"
        cached = global_cache.get(cache_key)
        if cached and not cached[2]:          # fresh hit
            result[cell["id"]] = cached[0]
        elif cached and cached[2]:            # stale — keep as fallback
            stale_fallback[cell["id"]] = {**cached[0], "status": "stale"}
            to_fetch.append(cell)
        else:                                 # never fetched
            to_fetch.append(cell)

    if not to_fetch:
        return result

    now_iso = datetime.now(timezone.utc).isoformat()
    batches = [to_fetch[i:i + WEATHER_BATCH] for i in range(0, len(to_fetch), WEATHER_BATCH)]

    async def _fetch_batch(batch: List[Dict[str, Any]]) -> None:
        params = {
            "latitude":  ",".join(f"{c['lat']:.5f}" for c in batch),
            "longitude": ",".join(f"{c['lon']:.5f}" for c in batch),
            "hourly":    "precipitation",
            "daily":     "precipitation_sum,temperature_2m_max,apparent_temperature_max",
            "past_days": 2,
            "forecast_days": 1,
            "timezone":  "Asia/Kolkata",
        }
        try:
            async with _weather_semaphore:
                async with httpx.AsyncClient(timeout=30.0) as client:
                    response = await client.get(settings.OPEN_METEO_FORECAST_URL, params=params)
                    if response.status_code == 429:
                        logger.warning("Open-Meteo 429 for grid batch of %d cells; using stale/failed.", len(batch))
                        for cell in batch:
                            result[cell["id"]] = stale_fallback.get(cell["id"], dict(_FAILED_READING))
                        return
                    response.raise_for_status()
                    payload = response.json()
        except (httpx.TimeoutException, httpx.RequestError) as exc:
            logger.warning("Open-Meteo grid batch timeout/error (%s): %s cells marked failed.", type(exc).__name__, len(batch))
            for cell in batch:
                result[cell["id"]] = stale_fallback.get(cell["id"], dict(_FAILED_READING))
            return
        except Exception as exc:
            logger.warning("Open-Meteo grid batch failed: %s", exc)
            for cell in batch:
                result[cell["id"]] = stale_fallback.get(cell["id"], dict(_FAILED_READING))
            return

        rows = payload if isinstance(payload, list) else [payload]
        if len(rows) != len(batch) or any(isinstance(r, dict) and r.get("error") for r in rows):
            for cell in batch:
                result[cell["id"]] = stale_fallback.get(cell["id"], dict(_FAILED_READING))
            return

        for cell, row in zip(batch, rows):
            reading = _readings_from_payload(row if isinstance(row, dict) else {})
            result[cell["id"]] = reading
            global_cache.set(f"grid_cell_wx_{cell['id']}", reading, WEATHER_CACHE_SECONDS, now_iso)

    await asyncio.gather(*[_fetch_batch(b) for b in batches])
    return result


async def _fetch_archive_weather(cells: List[Dict[str, Any]], day: date) -> Dict[str, Dict[str, Any]]:
    """Archive weather for replay — no caching (replay is not a live feed)."""
    day_s = day.isoformat()
    previous = (day - timedelta(days=1)).isoformat()
    readings: Dict[str, Dict[str, Any]] = {}
    async with httpx.AsyncClient(timeout=60.0) as client:
        for start in range(0, len(cells), WEATHER_BATCH):
            batch = cells[start:start + WEATHER_BATCH]
            params = {
                "latitude":  ",".join(f"{c['lat']:.5f}" for c in batch),
                "longitude": ",".join(f"{c['lon']:.5f}" for c in batch),
                "start_date": previous,
                "end_date":   day_s,
                "daily":      "precipitation_sum,temperature_2m_max,apparent_temperature_max",
                "timezone":   "Asia/Kolkata",
            }
            try:
                response = await client.get(settings.OPEN_METEO_ARCHIVE_URL, params=params)
                response.raise_for_status()
                payload = response.json()
            except Exception as exc:
                logger.warning("Open-Meteo archive grid batch failed: %s", exc)
                for cell in batch:
                    readings[cell["id"]] = dict(_FAILED_READING)
                continue
            rows = payload if isinstance(payload, list) else [payload]
            if len(rows) != len(batch):
                for cell in batch:
                    readings[cell["id"]] = dict(_FAILED_READING)
                continue
            for cell, row in zip(batch, rows):
                readings[cell["id"]] = _readings_from_archive_payload(
                    row if isinstance(row, dict) else {}, day_s, previous
                )
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
    return any(
        _distance_m(lat, lon, inc.lat, inc.lng) <= INCIDENT_RADIUS_M
        for inc in incidents
    )


# ── Main grid computation ───────────────────────────────────────────────────────

async def compute_risk_grid(as_of: Optional[date] = None) -> RiskGridResponse:
    """Score every GHMC cell.

    - Weather is fetched per cell (individually cached, rate-limited).
    - DEM slope is loaded once per process from DEM_FILE_PATH if present.
    - A failed weather feed stays null, never 0 mm.
    - as_of: use Open-Meteo archive for replay (writes nothing to DB).
    - API response reports prediction_resolution_km and dem_resolution_m.
    """
    async with _grid_lock:
        cells = generate_grid_cells()
        dem_slopes = _load_dem_slopes(cells)

        if as_of is None:
            elevations, readings, incidents = await asyncio.gather(
                _elevations_for(cells),
                _fetch_weather(cells),
                fetch_incidents(),
            )
            recent = _recent_incidents(incidents, datetime.now(timezone.utc))
        else:
            elevations, readings = await asyncio.gather(
                _elevations_for(cells),
                _fetch_archive_weather(cells, as_of),
            )
            recent = []

        measured = [
            v for v in elevations.values()
            if isinstance(v, (int, float)) and not isinstance(v, bool)
        ]
        median = statistics.median(measured) if measured else None
        lat_step, lon_step = grid_steps()
        res_km = spacing_km()

        scored: List[RiskGridCell] = []
        for cell in cells:
            elevation = elevations.get(cell["id"])
            reading = readings.get(cell["id"]) or dict(_FAILED_READING)
            slope = dem_slopes.get(cell["id"])
            low_lying = (
                median is not None
                and isinstance(elevation, (int, float))
                and elevation < median
            )
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
            if as_of is not None and level is not None:
                why = f"REPLAY {as_of.isoformat()} archive. " + why
            emerging = (
                (level is not None and level >= 3)
                or _near_incident(cell["lat"], cell["lon"], recent)
            )
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
                slope_m_per_m=slope,
                low_lying=low_lying,
                emerging=emerging,
                source_status=status,
                why_this=why,
            ))

        return RiskGridResponse(
            cell_count=len(scored),
            hotspot_count=len(get_hotspot_catalog()),
            emerging_count=sum(1 for c in scored if c.emerging),
            spacing_km=res_km,
            lat_step=lat_step,
            lon_step=lon_step,
            prediction_resolution_km=res_km,
            dem_resolution_m=_dem_resolution_m(),
            weather_source="Open-Meteo per-cell",
            cells=scored,
        )


async def emerging_hotspot_zones(limit: int = EMERGING_LIMIT) -> Tuple[List[RiskZone], Dict[str, Dict[str, Any]]]:
    """Top emerging grid cells for Predict. Named hotspots added by the caller."""
    report = await compute_risk_grid()
    ranked = sorted(
        (c for c in report.cells if c.emerging),
        key=lambda c: c.score if c.score is not None else float("-inf"),
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
            "weather": {
                "name": "Open-Meteo Weather",
                "status": cell.source_status,
                "last_updated": now_iso if cell.source_status != "failed" else None,
            },
            "elevation": {
                "name": "Open-Elevation",
                "status": "live" if cell.elevation_m is not None else "failed",
                "last_updated": now_iso if cell.elevation_m is not None else None,
            },
        }
    return zones, status
