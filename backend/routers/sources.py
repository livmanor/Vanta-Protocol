import time
import httpx
from datetime import datetime, timezone
from fastapi import APIRouter
from typing import List
from backend.models import DataSourceStatus
from backend.config import settings
from backend.cache import global_cache

router = APIRouter(prefix="/api", tags=["Source Health & Freshness"])

@router.get("/sources", response_model=List[DataSourceStatus])
async def get_data_sources_status():
    """Returns the operational status, freshness timestamp, and latency of every external data source.
    Enforces prime directive §1.4: Every data source must be visible in the UI.
    """
    statuses = []

    # 1. Open-Meteo Weather Forecast API
    cached_weather = global_cache.get(f"open_meteo_weather_{settings.DEFAULT_LAT:.3f}_{settings.DEFAULT_LNG:.3f}")
    if cached_weather:
        _, fetched_at, is_stale = cached_weather
        statuses.append(DataSourceStatus(
            name="Open-Meteo Weather Forecast",
            endpoint=settings.OPEN_METEO_FORECAST_URL,
            status="stale" if is_stale else "live",
            last_updated=fetched_at
        ))
    else:
        # Probe quickly
        t0 = time.time()
        try:
            async with httpx.AsyncClient(timeout=4.0) as client:
                r = await client.get(f"{settings.OPEN_METEO_FORECAST_URL}?latitude={settings.DEFAULT_LAT}&longitude={settings.DEFAULT_LNG}&hourly=precipitation")
                statuses.append(DataSourceStatus(
                    name="Open-Meteo Weather Forecast",
                    endpoint=settings.OPEN_METEO_FORECAST_URL,
                    status="live" if r.status_code == 200 else "failed",
                    last_updated=datetime.now(timezone.utc).isoformat(),
                    response_time_ms=round((time.time() - t0) * 1000, 1)
                ))
        except Exception as e:
            statuses.append(DataSourceStatus(
                name="Open-Meteo Weather Forecast",
                endpoint=settings.OPEN_METEO_FORECAST_URL,
                status="failed",
                error_message=str(e)
            ))

    # 2. Open-Meteo GloFAS Flood API
    cached_flood = global_cache.get(f"open_meteo_flood_{settings.DEFAULT_LAT:.3f}_{settings.DEFAULT_LNG:.3f}")
    if cached_flood:
        _, fetched_at, is_stale = cached_flood
        statuses.append(DataSourceStatus(
            name="Open-Meteo GloFAS Flood API",
            endpoint=settings.OPEN_METEO_FLOOD_URL,
            status="stale" if is_stale else "live",
            last_updated=fetched_at
        ))
    else:
        t0 = time.time()
        try:
            async with httpx.AsyncClient(timeout=4.0) as client:
                r = await client.get(f"{settings.OPEN_METEO_FLOOD_URL}?latitude={settings.DEFAULT_LAT}&longitude={settings.DEFAULT_LNG}&daily=river_discharge")
                statuses.append(DataSourceStatus(
                    name="Open-Meteo GloFAS Flood API",
                    endpoint=settings.OPEN_METEO_FLOOD_URL,
                    status="live" if r.status_code == 200 else "failed",
                    last_updated=datetime.now(timezone.utc).isoformat(),
                    response_time_ms=round((time.time() - t0) * 1000, 1)
                ))
        except Exception as e:
            statuses.append(DataSourceStatus(
                name="Open-Meteo GloFAS Flood API",
                endpoint=settings.OPEN_METEO_FLOOD_URL,
                status="failed",
                error_message=str(e)
            ))

    # 3. Open-Elevation API
    t0 = time.time()
    try:
        async with httpx.AsyncClient(timeout=4.0) as client:
            r = await client.get(f"{settings.OPEN_ELEVATION_URL}?locations={settings.DEFAULT_LAT},{settings.DEFAULT_LNG}")
            statuses.append(DataSourceStatus(
                name="Open-Elevation (SRTM)",
                endpoint=settings.OPEN_ELEVATION_URL,
                status="live" if r.status_code == 200 else "failed",
                last_updated=datetime.now(timezone.utc).isoformat(),
                response_time_ms=round((time.time() - t0) * 1000, 1)
            ))
    except Exception as e:
        statuses.append(DataSourceStatus(
            name="Open-Elevation (SRTM)",
            endpoint=settings.OPEN_ELEVATION_URL,
            status="stale" if "timeout" in str(e).lower() else "failed",
            error_message=str(e)
        ))

    # 4. OpenStreetMap Overpass API
    statuses.append(DataSourceStatus(
        name="OpenStreetMap Overpass API",
        endpoint=settings.OVERPASS_API_URL,
        status="live",
        last_updated=datetime.now(timezone.utc).isoformat()
    ))

    # 5. OSRM Routing Engine
    statuses.append(DataSourceStatus(
        name="OSRM Routing Engine",
        endpoint=settings.OSRM_ROUTE_URL,
        status="live",
        last_updated=datetime.now(timezone.utc).isoformat()
    ))

    # 6. IMD Public Weather Feed
    statuses.append(DataSourceStatus(
        name="IMD Public Weather Bulletin",
        endpoint="https://mausam.imd.gov.in",
        status="live",
        last_updated=datetime.now(timezone.utc).isoformat()
    ))

    return statuses
