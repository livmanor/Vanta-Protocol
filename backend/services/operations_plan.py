"""Draft the next operations window from measured rain. An officer still approves every event.

The calendar is not the evacuation path. The path comes from the routing service.
The calendar says when that path should be opened, when traffic should be held,
and whether a unit is available to stage.
"""
import json
import time
from datetime import datetime, timedelta, timezone
from typing import Optional

import aiosqlite

from backend.config import settings
from backend.db import fetch_units
from backend.services.routing import find_evacuation_route

IST = timezone(timedelta(hours=5, minutes=30))
WATCH_MM = 25.0
HEAVY_MM = 64.5
PLAN_CACHE_SECONDS = 1800
_cache = {"signature": None, "at": 0.0, "payload": None}


def _rain_values(item) -> list[float]:
    explanation = getattr(item, "explanation", None)
    if explanation is not None:
        values = [explanation.rainfall_24h_mm, explanation.rainfall_48h_mm]
    else:
        values = [getattr(item, "forecast_24h", None), getattr(item, "rain_48h", None)]
    return [value for value in values if value is not None]


def _peak_rain(item) -> Optional[float]:
    values = _rain_values(item)
    return max(values) if values else None


def _coords(item) -> Optional[tuple[float, float]]:
    lat = getattr(item, "lat", None)
    lon = getattr(item, "lon", None)
    if lat is not None and lon is not None:
        return float(lat), float(lon)
    polygon = getattr(item, "polygon", None) or {}
    coordinates = polygon.get("coordinates") if isinstance(polygon, dict) else None
    if isinstance(coordinates, list) and len(coordinates) >= 2 and not isinstance(coordinates[0], list):
        return float(coordinates[1]), float(coordinates[0])
    return None


def rain_band(locations) -> str:
    peaks = [_peak_rain(item) for item in locations]
    levels = [getattr(item, "risk_level", None) for item in locations]
    known = [value for value in peaks if value is not None]
    if not known:
        return "quiet"
    peak = max(known)
    if peak >= HEAVY_MM or any(level is not None and level >= 4 for level in levels):
        return "heavy"
    if peak >= WATCH_MM or any(level is not None and level >= 3 for level in levels):
        return "watch"
    return "quiet"


def _event(event_id, start, end, category, title, location, details, assigned_unit=None):
    return {
        "id": event_id,
        "start": start.isoformat(),
        "end": end.isoformat(),
        "category": category,
        "title": title,
        "location": location,
        "details": details,
        "assigned_unit": assigned_unit,
        "status": "planned",
    }


async def _stored_events():
    async with aiosqlite.connect(settings.DATABASE_PATH) as db:
        db.row_factory = aiosqlite.Row
        async with db.execute("SELECT id, event_json FROM operations_calendar") as cursor:
            rows = await cursor.fetchall()
    return {row["id"]: json.loads(row["event_json"]) for row in rows}


async def _save_plan(events, valid_from, valid_until, kept_ids):
    now = datetime.now(timezone.utc).isoformat()
    async with aiosqlite.connect(settings.DATABASE_PATH) as db:
        async with db.execute("SELECT id, event_json FROM operations_calendar") as cursor:
            rows = await cursor.fetchall()
        for row in rows:
            event = json.loads(row[1])
            if str(row[0]).startswith("plan-") and row[0] not in kept_ids and event.get("status") == "planned":
                await db.execute("DELETE FROM operations_calendar WHERE id = ?", (row[0],))
        for event in events:
            await db.execute(
                "INSERT OR REPLACE INTO operations_calendar VALUES (?, ?, ?, ?, ?)",
                (event["id"], json.dumps(event), valid_from.isoformat(), valid_until.isoformat(), now),
            )
        await db.commit()


async def refresh_operations_plan(zones, cells, force: bool = False) -> dict:
    emerging = [cell for cell in cells if getattr(cell, "emerging", False)]
    locations = [*zones, *emerging]
    band = rain_band(locations)
    signature = (
        band,
        tuple(sorted(
            (item.id, None if _peak_rain(item) is None else round(_peak_rain(item), 1), getattr(item, "risk_level", None))
            for item in locations
        )),
    )
    if not force and _cache["payload"] and _cache["signature"] == signature and time.time() - _cache["at"] < PLAN_CACHE_SECONDS:
        return _cache["payload"]

    now = datetime.now(IST)
    if band == "heavy":
        start, end = now + timedelta(minutes=30), now + timedelta(hours=8, minutes=30)
    elif band == "watch":
        start, end = now + timedelta(hours=1), now + timedelta(hours=5)
    else:
        start, end = now, now + timedelta(hours=6)

    existing = await _stored_events()
    units = await fetch_units()
    available = [unit for unit in units if unit.status == "available"]
    events = []

    if band == "quiet":
        peak = max((_peak_rain(item) or 0 for item in locations), default=0)
        events.append(_event(
            "plan-advisory",
            start,
            end,
            "advisory",
            "Rain watch — no evacuation window",
            "GHMC",
            (
                f"The highest forecast or past-48h rain on the hotspots and emerging cells is {peak:.1f} mm. "
                f"An evacuation window opens at {WATCH_MM:.0f} mm or risk level 3, and a longer window opens at {HEAVY_MM:.0f} mm or level 4. "
                "No route is placed on the calendar while the city stays under that line."
            ),
        ))
    else:
        ranked = sorted(locations, key=lambda item: (_peak_rain(item) or -1, getattr(item, "risk_level", None) or 0), reverse=True)
        chosen = [item for item in ranked if (_peak_rain(item) or 0) >= WATCH_MM or (getattr(item, "risk_level", None) or 0) >= 3][:3]
        if not chosen:
            chosen = ranked[:1]
        route_lines = []
        for item in chosen:
            point = _coords(item)
            route = await find_evacuation_route(point[0], point[1], item.id, item.name) if point else None
            rain = _peak_rain(item)
            rain_text = "rain unavailable" if rain is None else f"{rain:.1f} mm forecast or past 48h"
            if route:
                minutes = max(1, round(route.duration_seconds / 60))
                warning = ""
                if route.blocked_road_conflicts:
                    warning = (
                        "WARNING: this route crosses "
                        + ", ".join(route.blocked_road_conflicts)
                        + "; verify on the ground. Officer-entered blocks have no resolved status, so confirm they are still active. "
                    )
                details = (
                    f"{warning}{item.name} has {rain_text}. Open the corridor to {route.shelter_name} "
                    f"({route.distance_meters / 1000:.1f} km, about {minutes} min). {route.why_this}"
                )
                route_lines.append(f"{item.name} → {route.shelter_name}")
            else:
                details = f"{item.name} has {rain_text}. No shelter route could be calculated for this window."
                route_lines.append(f"{item.name} → route unavailable")
            events.append(_event(
                f"plan-evac-{item.id}",
                start,
                end,
                "evacuation",
                f"Open evacuation window — {item.name}",
                item.name,
                details,
            ))
        events.append(_event(
            "plan-traffic",
            start,
            end,
            "traffic",
            "Hold the evacuation corridors",
            "Hyderabad",
            "Keep these corridors clear for the same window: " + "; ".join(route_lines) + ".",
        ))

    if available:
        resource_details = f"{len(available)} registered unit(s) are available to stage before the window: " + ", ".join(unit.id for unit in available[:6]) + "."
        assigned = available[0].id
    else:
        resource_details = "No field unit is registered. Register a patrol, boat, or ambulance before this window can name a unit."
        assigned = None
    events.append(_event(
        "plan-resources",
        start,
        end,
        "resources",
        "Stage field units" if available else "Register a field unit",
        "Control room",
        resource_details,
        assigned,
    ))

    kept = []
    publish = []
    for event in events:
        previous = existing.get(event["id"])
        if previous and previous.get("status") in ("approved", "rejected"):
            kept.append(event["id"])
            publish.append(previous)
        else:
            kept.append(event["id"])
            publish.append(event)
    await _save_plan(publish, start, end, set(kept))

    if band == "quiet":
        summary = f"No evacuation window. Rain is under {WATCH_MM:.0f} mm and no cell is at level 3 or higher."
    elif band == "watch":
        summary = f"Rain or risk has crossed the watch line. Evacuation corridors are drafted for {start.strftime('%H:%M')}–{end.strftime('%H:%M')} IST and still need officer approval."
    else:
        summary = f"Heavy rain or level 4 risk. Evacuation corridors are drafted to open at {start.strftime('%H:%M')} IST and still need officer approval."
    payload = {
        "band": band,
        "summary": summary,
        "valid_from": start.isoformat(),
        "valid_until": end.isoformat(),
        "events": publish,
    }
    _cache.update(signature=signature, at=time.time(), payload=payload)
    return payload
