import asyncio
import time
import httpx
from datetime import datetime, timezone
from fastapi import APIRouter
from typing import List
from backend.models import DataSourceStatus
from backend.config import settings
from backend.cache import global_cache
from backend.data_sources.osm import OVERPASS_MIRRORS, OVERPASS_HEADERS
from backend.data_sources.cap_alerts import source_status_payload
from backend.data_sources.htp_waterlogging import source_status_payload as htp_status_payload

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


async def _osm_status() -> DataSourceStatus:
    osm_status = DataSourceStatus(
        name="OpenStreetMap Overpass API",
        endpoint=OVERPASS_MIRRORS[0],
        status="failed",
        error_message="No Overpass mirror responded.",
    )
    for mirror_url in OVERPASS_MIRRORS:
        t0 = time.time()
        try:
            async with httpx.AsyncClient(timeout=8.0) as client:
                response = await client.post(
                    mirror_url,
                    data={"data": "[out:json]; node(1); out;"},
                    headers=OVERPASS_HEADERS,
                )
                elapsed = round((time.time() - t0) * 1000, 1)
                if response.status_code == 200:
                    return DataSourceStatus(
                        name="OpenStreetMap Overpass API",
                        endpoint=mirror_url,
                        status="live",
                        last_updated=datetime.now(timezone.utc).isoformat(),
                        response_time_ms=elapsed,
                    )
                osm_status = DataSourceStatus(
                    name="OpenStreetMap Overpass API",
                    endpoint=mirror_url,
                    status="failed",
                    last_updated=datetime.now(timezone.utc).isoformat(),
                    error_message=f"HTTP {response.status_code} from {mirror_url}",
                )
        except Exception as exc:
            osm_status = DataSourceStatus(
                name="OpenStreetMap Overpass API",
                endpoint=mirror_url,
                status="failed",
                error_message=str(exc)[:120],
            )
    return osm_status


async def _cap_status() -> DataSourceStatus:
    payload = source_status_payload()
    return DataSourceStatus(
        name=payload["name"],
        endpoint=payload["endpoint"],
        status=payload["status"],
        last_updated=payload.get("last_updated"),
        error_message=payload.get("error_message"),
    )


async def _htp_status() -> DataSourceStatus:
    payload = htp_status_payload()
    if payload.get("status") == "stale":
        stamp = payload.get("snapshot_fetched_at") or payload.get("last_updated") or "unknown"
        detail = f"Stale snapshot from {stamp}; live HTP page unreachable."
        if payload.get("error_message"):
            detail = f"{detail} ({payload['error_message']})"
    elif payload.get("error_message") and payload.get("status") != "live":
        detail = payload["error_message"]
    else:
        detail = f"{payload.get('point_count', 0)} points · filter {payload.get('zone_filter')}"
    return DataSourceStatus(
        name=payload["name"],
        endpoint=payload["endpoint"],
        status=payload["status"],
        last_updated=payload.get("last_updated"),
        error_message=detail,
    )


async def _collect_source_statuses() -> List[DataSourceStatus]:
    """Probe independent feeds together. A cached weather or elevation call is not probed again."""
    cached_weather = global_cache.get(
        f"open_meteo_weather_ist48h_{settings.DEFAULT_LAT:.3f}_{settings.DEFAULT_LNG:.3f}"
    )
    cached_flood = global_cache.get(
        f"open_meteo_flood_{settings.DEFAULT_LAT:.3f}_{settings.DEFAULT_LNG:.3f}"
    )
    cached_elev = global_cache.get(
        f"elevation_points_6_{settings.DEFAULT_LAT:.3f}_{settings.DEFAULT_LNG:.3f}"
    )

    async def weather_status():
        if cached_weather:
            _, fetched_at, is_stale = cached_weather
            return DataSourceStatus(name="Open-Meteo Weather Forecast", endpoint=settings.OPEN_METEO_FORECAST_URL, status="stale" if is_stale else "live", last_updated=fetched_at)
        return await _probe("Open-Meteo Weather Forecast", f"{settings.OPEN_METEO_FORECAST_URL}?latitude={settings.DEFAULT_LAT}&longitude={settings.DEFAULT_LNG}&hourly=precipitation&past_days=2&forecast_days=1", timeout=8.0)

    async def flood_status():
        if cached_flood:
            _, fetched_at, is_stale = cached_flood
            return DataSourceStatus(name="Open-Meteo GloFAS Flood API", endpoint=settings.OPEN_METEO_FLOOD_URL, status="stale" if is_stale else "live", last_updated=fetched_at)
        return await _probe("Open-Meteo GloFAS Flood API", f"{settings.OPEN_METEO_FLOOD_URL}?latitude={settings.DEFAULT_LAT}&longitude={settings.DEFAULT_LNG}&daily=river_discharge&forecast_days=1", timeout=8.0)

    async def elevation_status():
        if cached_elev:
            _, fetched_at, is_stale = cached_elev
            return DataSourceStatus(name="Open-Elevation (SRTM)", endpoint=settings.OPEN_ELEVATION_URL, status="stale" if is_stale else "live", last_updated=fetched_at)
        return await _probe("Open-Elevation (SRTM)", f"{settings.OPEN_ELEVATION_URL}?locations={settings.DEFAULT_LAT},{settings.DEFAULT_LNG}", timeout=10.0)

    osrm_probe_url = (
        f"{settings.OSRM_ROUTE_URL}/{settings.DEFAULT_LNG},{settings.DEFAULT_LAT}"
        f";{settings.DEFAULT_LNG + 0.01},{settings.DEFAULT_LAT + 0.01}?overview=false"
    )
    results = await asyncio.gather(
        weather_status(), flood_status(), elevation_status(), _osm_status(),
        _probe("OSRM Routing Engine", osrm_probe_url, timeout=8.0), _cap_status(), _htp_status(),
        return_exceptions=True,
    )
    statuses: List[DataSourceStatus] = []
    for item in results:
        if isinstance(item, DataSourceStatus):
            statuses.append(item)
    return statuses


@router.get("/sources", response_model=List[DataSourceStatus])
async def get_data_sources_status():
    """Returns the operational status of every external data source.
    A fresh snapshot is reused for two minutes so the control-room refresh is not blocked on Overpass and CAP.
    """
    cached = global_cache.get("source_status_snapshot_v1")
    if cached and not cached[2]:
        return [DataSourceStatus(**item) for item in cached[0]]
    statuses = await _collect_source_statuses()
    global_cache.set(
        "source_status_snapshot_v1",
        [item.model_dump() for item in statuses],
        120,
        datetime.now(timezone.utc).isoformat(),
    )
    return statuses
