"""Draft the next operations window from measured rain and CAP alert floors.

The calendar is not the evacuation path. The path comes from the routing service.
The calendar says when that path should be opened, when traffic should be held,
and whether a unit is available to stage. CAP orange/red alerts raise the band
as a floor; they never lower it. Officers still approve every event.
"""
import json
import time
from datetime import datetime, timedelta, timezone
from typing import Optional

import aiosqlite

from backend.config import settings
from backend.data_sources.cap_alerts import (
    BAND_RANK,
    active_floor_alerts,
    alert_signature,
    max_band,
    source_status_payload,
)
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
    """Open-Meteo / risk-level band only. CAP floors are applied separately."""
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


def combine_band(rain: str, floor_alerts: list[dict]) -> str:
    floors = [alert.get("floor") for alert in floor_alerts if alert.get("floor")]
    return max_band(rain, *floors)


def _event(event_id, start, end, category, title, location, details, assigned_unit=None, **extra):
    payload = {
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
    payload.update(extra)
    return payload


def _trigger_fingerprint(band: str, floor_alerts: list[dict]) -> dict:
    return {
        "band": band,
        "alert_ids": [alert.get("identifier") for alert in floor_alerts],
        "alert_colours": [alert.get("colour") for alert in floor_alerts],
    }


def _alert_details(alert: dict, peak_mm: float, source: dict) -> str:
    watch_cmp = "above" if peak_mm >= WATCH_MM else "below"
    lines = [
        f"IMD/NDMA CAP floor ({alert.get('colour', 'unknown')} → {alert.get('floor')}).",
        f"Headline: {alert.get('headline') or 'Not available'}.",
        f"Sender: {alert.get('sender') or 'Not available'}.",
        f"Effective–expires: {alert.get('effective') or '—'} – {alert.get('expires') or '—'}.",
        f"Identifier: {alert.get('identifier')}.",
        f"Open-Meteo peak {peak_mm:.1f} mm ({watch_cmp} watch line {WATCH_MM:.0f} mm).",
    ]
    if source.get("status") == "stale":
        lines.append(
            f"CAP feed is stale. Last successful poll: {source.get('last_success_at') or 'unknown'}."
        )
    return " ".join(lines)


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
    rain = rain_band(locations)
    floor_alerts = await active_floor_alerts()
    source = source_status_payload()
    # Stale feed still applies unexpired alert floors; failed feed never lowers the band.
    band = combine_band(rain, floor_alerts)
    signature = (
        band,
        rain,
        alert_signature(floor_alerts),
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
    peaks = [_peak_rain(item) for item in locations]
    peak = max((value for value in peaks if value is not None), default=0.0)
    trigger = _trigger_fingerprint(band, floor_alerts)
    raised_by_alert = bool(floor_alerts) and BAND_RANK.get(band, 0) > BAND_RANK.get(rain, 0)

    if band == "quiet":
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
            trigger=trigger,
            alert_driven=False,
        ))
    else:
        ranked = sorted(locations, key=lambda item: (_peak_rain(item) or -1, getattr(item, "risk_level", None) or 0), reverse=True)
        chosen = [item for item in ranked if (_peak_rain(item) or 0) >= WATCH_MM or (getattr(item, "risk_level", None) or 0) >= 3][:3]
        if not chosen and floor_alerts:
            chosen = ranked[:1]
        if not chosen:
            chosen = ranked[:1]
        route_lines = []
        for item in chosen:
            point = _coords(item)
            route = await find_evacuation_route(point[0], point[1], item.id, item.name) if point else None
            rain_mm = _peak_rain(item)
            rain_text = "rain unavailable" if rain_mm is None else f"{rain_mm:.1f} mm forecast or past 48h"
            alert_note = ""
            if floor_alerts:
                alert_note = " " + _alert_details(floor_alerts[0], peak, source)
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
                    f"({route.distance_meters / 1000:.1f} km, about {minutes} min). {route.why_this}{alert_note}"
                )
                route_lines.append(f"{item.name} → {route.shelter_name}")
            else:
                details = f"{item.name} has {rain_text}. No shelter route could be calculated for this window.{alert_note}"
                route_lines.append(f"{item.name} → route unavailable")
            events.append(_event(
                f"plan-evac-{item.id}",
                start,
                end,
                "evacuation",
                f"Open evacuation window — {item.name}",
                item.name,
                details,
                trigger=trigger,
                alert_driven=bool(floor_alerts),
                alert_badge="IMD alert" if floor_alerts else None,
            ))
        if not chosen and floor_alerts:
            events.append(_event(
                "plan-advisory-cap",
                start,
                end,
                "advisory",
                "CAP alert floor — verify corridors",
                "GHMC",
                _alert_details(floor_alerts[0], peak, source),
                trigger=trigger,
                alert_driven=True,
                alert_badge="IMD alert",
            ))
        events.append(_event(
            "plan-traffic",
            start,
            end,
            "traffic",
            "Hold the evacuation corridors",
            "Hyderabad",
            "Keep these corridors clear for the same window: " + "; ".join(route_lines or ["no corridor drafted"]) + ".",
            trigger=trigger,
            alert_driven=bool(floor_alerts),
            alert_badge="IMD alert" if floor_alerts else None,
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
        trigger=trigger,
        alert_driven=False,
    ))

    kept = []
    publish = []
    for event in events:
        previous = existing.get(event["id"])
        if previous and previous.get("status") in ("approved", "rejected"):
            previous_trigger = previous.get("trigger") or {}
            if previous_trigger != trigger:
                reviewed = dict(previous)
                reviewed["status"] = "needs_review"
                reviewed["review_reason"] = (
                    f"Trigger changed after officer decision. Was {previous_trigger}; now {trigger}."
                )
                reviewed["superseded_draft"] = event
                kept.append(event["id"])
                publish.append(reviewed)
            else:
                kept.append(event["id"])
                publish.append(previous)
        else:
            kept.append(event["id"])
            publish.append(event)

    # Preserve older needs_review rows that are not in the new draft set.
    for event_id, previous in existing.items():
        if event_id in kept:
            continue
        if previous.get("status") == "needs_review":
            kept.append(event_id)
            publish.append(previous)

    await _save_plan(publish, start, end, set(kept))

    if band == "quiet":
        summary = f"No evacuation window. Rain is under {WATCH_MM:.0f} mm and no cell is at level 3 or higher."
    elif raised_by_alert:
        summary = (
            f"CAP alert floor raised the band to {band}. "
            f"Corridors are drafted for {start.strftime('%H:%M')}–{end.strftime('%H:%M')} IST and still need officer approval."
        )
    elif band == "watch":
        summary = f"Rain or risk has crossed the watch line. Evacuation corridors are drafted for {start.strftime('%H:%M')}–{end.strftime('%H:%M')} IST and still need officer approval."
    else:
        summary = f"Heavy rain or level 4 risk. Evacuation corridors are drafted to open at {start.strftime('%H:%M')} IST and still need officer approval."
    if source.get("status") == "stale" and floor_alerts:
        summary += f" CAP feed is stale (last success {source.get('last_success_at')})."
    payload = {
        "band": band,
        "rain_band": rain,
        "alert_floor": combine_band("quiet", floor_alerts) if floor_alerts else None,
        "summary": summary,
        "valid_from": start.isoformat(),
        "valid_until": end.isoformat(),
        "events": publish,
        "cap_source_status": source.get("status"),
        "floor_alerts": floor_alerts,
    }
    _cache.update(signature=signature, at=time.time(), payload=payload)
    return payload
