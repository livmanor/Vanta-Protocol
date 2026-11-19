"""Historical replay from Open-Meteo archive. Read-only: never writes DB or SMS."""
from __future__ import annotations

from datetime import date, datetime, timedelta, timezone
from typing import Any

from backend.data_sources.htp_waterlogging import ensure_catalog
from backend.models import RiskExplanation, RiskZone
from backend.services.grid import _fetch_archive_weather, compute_risk_grid
from backend.services.operations_plan import refresh_operations_plan
from backend.services.risk_engine import score_observations

IST = timezone(timedelta(hours=5, minutes=30))
BANNER = "REPLAY — historical data, not live"


async def build_replay(day: date) -> dict[str, Any]:
    catalog = await ensure_catalog()
    grid = await compute_risk_grid(as_of=day)
    day_s = day.isoformat()

    hotspot_cells = []
    for item in catalog:
        centroid = item.get("centroid") or [None, None]
        lat = float(centroid[0])
        lon = float(centroid[1])
        hotspot_cells.append({"id": item["id"], "lat": lat, "lon": lon, "name": item.get("name") or item["id"], "meta": item})

    readings = await _fetch_archive_weather(hotspot_cells, day) if hotspot_cells else {}
    now_iso = datetime.now(timezone.utc).isoformat()
    zones: list[RiskZone] = []
    for cell in hotspot_cells:
        reading = readings.get(cell["id"]) or {
            "forecast_24h": None,
            "rain_48h": None,
            "status": "failed",
            "temperature_max_c": None,
            "apparent_temperature_max_c": None,
        }
        meta = cell["meta"]
        level, score, explanation = score_observations(
            rainfall_24h=reading["forecast_24h"],
            precip_prob_max=None,
            wind_max_kmh=None,
            river_discharge=None,
            elevation_m=None,
            historical_flood=True,
            rainfall_48h=reading["rain_48h"],
            weather_status=reading["status"],
            weather_last_updated=day_s,
            htp_severity=meta.get("htp_severity") or meta.get("source_severity"),
            temperature_max_c=reading.get("temperature_max_c"),
            apparent_temperature_max_c=reading.get("apparent_temperature_max_c"),
        )
        why = explanation.why_this
        if level is not None:
            why = f"{BANNER}. Archive day {day_s}. " + why
        zones.append(
            RiskZone(
                id=cell["id"],
                name=cell["name"],
                risk_level=level,
                polygon={"type": "Point", "coordinates": [cell["lon"], cell["lat"]]},
                population=None,
                derived_from=["Open-Meteo Historical Weather API", "HTP waterlogging list"],
                computed_at=now_iso,
                explanation=RiskExplanation(
                    rainfall_24h_mm=reading["forecast_24h"],
                    rainfall_48h_mm=reading["rain_48h"],
                    weather_status=reading["status"],
                    weather_last_updated=day_s,
                    historical_flood_prone=True,
                    why_this=why,
                    heat_temperature_max_c=reading.get("temperature_max_c"),
                    heat_apparent_max_c=reading.get("apparent_temperature_max_c"),
                ),
                cell_type="hotspot",
            )
        )

    as_of = datetime(day.year, day.month, day.day, 12, 0, tzinfo=IST)
    plan = await refresh_operations_plan(
        zones,
        grid.cells,
        force=True,
        persist=False,
        as_of=as_of,
        use_cap=False,
    )
    return {
        "mode": "replay",
        "date": day_s,
        "banner": BANNER,
        "writes": False,
        "zones": [zone.model_dump() for zone in zones],
        "grid": grid.model_dump(),
        "operations_plan": plan,
    }
