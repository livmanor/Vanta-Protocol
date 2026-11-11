import time
import httpx
from datetime import datetime, timezone
from fastapi import APIRouter
from typing import List
from backend.models import DataSourceStatus
from backend.config import settings
from backend.cache import global_cache
from backend.data_sources.osm import OVERPASS_MIRRORS, OVERPASS_HEADERS

router = APIRouter(prefix="/api", tags=["Source Health & Freshness"])


async def _probe(name: str, url: str, timeout: float = 8.0, method: str = "GET", **kwargs) -> DataSourceStatus:
    """Makes a real live probe to an external endpoint and returns its status."""
    t0 = time.time()
    try:
        async with httpx.AsyncClient(timeout=timeout, follow_redirects=True) as client:
            fn = client.get if method == "GET" else client.post
            r = await fn(url, **kwargs)
            elapsed = round((time.time() - t0) * 1000, 1)
            status = "live" if r.status_code < 500 else "failed"
            return DataSourceStatus(
                name=name,
                endpoint=url,
                status=status,
                last_updated=datetime.now(timezone.utc).isoformat(),
                response_time_ms=elapsed,
                error_message=None if status == "live" else f"HTTP {r.status_code}"
            )
    except Exception as e:
        return DataSourceStatus(
            name=name,
            endpoint=url,
            status="stale" if "timeout" in str(e).lower() else "failed",
            error_message=str(e)[:120]
        )


@router.get("/sources", response_model=List[DataSourceStatus])
async def get_data_sources_status():
    """Returns the operational status, freshness timestamp, and latency of every external data source.
    Every entry is either read from the TTL cache (proving a recent real call worked) or
    actively probed now — never hard-coded.
    Enforces prime directive §1.4: Every data source must be visible in the UI.
    """
    statuses: List[DataSourceStatus] = []

    # 1. Open-Meteo Weather Forecast API — reuse cache if available
    cached_weather = global_cache.get(
        f"open_meteo_weather_{settings.DEFAULT_LAT:.3f}_{settings.DEFAULT_LNG:.3f}"
    )
    if cached_weather:
        _, fetched_at, is_stale = cached_weather
        statuses.append(DataSourceStatus(
            name="Open-Meteo Weather Forecast",
            endpoint=settings.OPEN_METEO_FORECAST_URL,
            status="stale" if is_stale else "live",
            last_updated=fetched_at
        ))
    else:
        statuses.append(await _probe(
            "Open-Meteo Weather Forecast",
            f"{settings.OPEN_METEO_FORECAST_URL}?latitude={settings.DEFAULT_LAT}&longitude={settings.DEFAULT_LNG}&hourly=precipitation&forecast_days=1",
            timeout=8.0
        ))

    # 2. Open-Meteo GloFAS Flood API — reuse cache if available
    cached_flood = global_cache.get(
        f"open_meteo_flood_{settings.DEFAULT_LAT:.3f}_{settings.DEFAULT_LNG:.3f}"
    )
    if cached_flood:
        _, fetched_at, is_stale = cached_flood
        statuses.append(DataSourceStatus(
            name="Open-Meteo GloFAS Flood API",
            endpoint=settings.OPEN_METEO_FLOOD_URL,
            status="stale" if is_stale else "live",
            last_updated=fetched_at
        ))
    else:
        statuses.append(await _probe(
            "Open-Meteo GloFAS Flood API",
            f"{settings.OPEN_METEO_FLOOD_URL}?latitude={settings.DEFAULT_LAT}&longitude={settings.DEFAULT_LNG}&daily=river_discharge&forecast_days=1",
            timeout=8.0
        ))

    # 3. Open-Elevation (SRTM) — reuse cache; probe with 10s timeout (endpoint is slow)
    cached_elev = global_cache.get(
        f"elevation_points_6_{settings.DEFAULT_LAT:.3f}_{settings.DEFAULT_LNG:.3f}"
    )
    if cached_elev:
        _, fetched_at, is_stale = cached_elev
        statuses.append(DataSourceStatus(
            name="Open-Elevation (SRTM)",
            endpoint=settings.OPEN_ELEVATION_URL,
            status="stale" if is_stale else "live",
            last_updated=fetched_at
        ))
    else:
        statuses.append(await _probe(
            "Open-Elevation (SRTM)",
            f"{settings.OPEN_ELEVATION_URL}?locations={settings.DEFAULT_LAT},{settings.DEFAULT_LNG}",
            timeout=10.0  # Increased from 4s — endpoint typically takes 6-9s
        ))

    # 4. OpenStreetMap Overpass API — REAL probe against first working mirror
    osm_status = None
    for mirror_url in OVERPASS_MIRRORS:
        t0 = time.time()
        try:
            async with httpx.AsyncClient(timeout=8.0) as client:
                r = await client.post(
                    mirror_url,
                    data={"data": "[out:json]; node(1); out;"},  # Minimal valid query
                    headers=OVERPASS_HEADERS
                )
                elapsed = round((time.time() - t0) * 1000, 1)
                if r.status_code == 200:
                    osm_status = DataSourceStatus(
                        name="OpenStreetMap Overpass API",
                        endpoint=mirror_url,
                        status="live",
                        last_updated=datetime.now(timezone.utc).isoformat(),
                        response_time_ms=elapsed
                    )
                    break
                else:
                    osm_status = DataSourceStatus(
                        name="OpenStreetMap Overpass API",
                        endpoint=mirror_url,
                        status="failed",
                        last_updated=datetime.now(timezone.utc).isoformat(),
                        error_message=f"HTTP {r.status_code} from {mirror_url}"
                    )
        except Exception as e:
            osm_status = DataSourceStatus(
                name="OpenStreetMap Overpass API",
                endpoint=mirror_url,
                status="failed",
                error_message=str(e)[:120]
            )
    if osm_status:
        statuses.append(osm_status)

    # 5. OSRM Routing Engine — REAL probe: lightweight route request
    osrm_probe_url = (
        f"{settings.OSRM_ROUTE_URL}/{settings.DEFAULT_LNG},{settings.DEFAULT_LAT}"
        f";{settings.DEFAULT_LNG + 0.01},{settings.DEFAULT_LAT + 0.01}"
        "?overview=false"
    )
    statuses.append(await _probe(
        "OSRM Routing Engine",
        osrm_probe_url,
        timeout=8.0
    ))

    # 6. IMD Public Weather Bulletin — reuse cache; probe the working base domain
    cached_imd = global_cache.get(f"imd_alerts_{settings.CITY_NAME.lower()}")
    if cached_imd:
        _, fetched_at, is_stale = cached_imd
        statuses.append(DataSourceStatus(
            name="IMD Public Weather Bulletin",
            endpoint="https://mausam.imd.gov.in",
            status="stale" if is_stale else "live",
            last_updated=fetched_at
        ))
    else:
        # Probe the IMD homepage (200) and report honestly
        s = await _probe(
            "IMD Public Weather Bulletin",
            "https://mausam.imd.gov.in/",
            timeout=8.0
        )
        # Override endpoint to show the domain, not the probe path
        s.endpoint = "https://mausam.imd.gov.in"
        statuses.append(s)

    return statuses
