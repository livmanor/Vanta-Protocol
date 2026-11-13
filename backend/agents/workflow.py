import asyncio
import json
import math
from datetime import datetime, timezone, timedelta
from collections import defaultdict
from typing import Any, Dict, List

from backend.agents.gemini import generate_structured
from backend.agents.groq import generate_structured as generate_groq_structured
from backend.agents.schemas import PredictAgentOutput, PrepareAgentOutput, RespondAgentOutput
from backend.config import settings
from backend.models import PrepositionSuggestion, RiskZone
from backend.services.prepositioning import generate_prepositioning_suggestions
from backend.services.risk_engine import compute_real_risk_zones
from backend.db import fetch_units, fetch_incidents, fetch_blocked_roads
from backend.data_sources.elevation import get_real_elevations
from backend.data_sources.open_meteo import get_real_river_discharge, get_real_weather_forecast, get_recent_historical_rain
from backend.services.risk_engine import REAL_ZONES_METADATA


def _zone_context(zone: RiskZone, source_status: Dict[str, Any]) -> Dict[str, Any]:
    explanation = zone.explanation
    return {
        "zone_id": zone.id,
        "zone_name": zone.name,
        "risk_level": zone.risk_level,
        "computed_at": zone.computed_at,
        "metrics": {
            "rainfall_24h_mm": explanation.rainfall_24h_mm,
            "max_precipitation_probability": explanation.max_precipitation_probability,
            "wind_max_kmh": explanation.wind_max_kmh,
            "river_discharge_m3s": explanation.river_discharge_m3s,
            "mean_elevation_m": explanation.mean_elevation_m,
        } if explanation else None,
        "risk_model_note": "The score includes a mapped major waterlogging hotspot from the Hyderabad Traffic Police list dated 2025-08-06. This indicates historical vulnerability, not current flooding.",
        "source_status": source_status,
    }


def _predict_zone_context(zone: RiskZone, source_status: Dict[str, Any]) -> Dict[str, Any]:
    """Pass observations to the Predict LLM without the legacy weighted risk score."""
    explanation = zone.explanation
    return {
        "zone_id": zone.id,
        "zone_name": zone.name,
        "observed_forecast_metrics": {
            "forecast_precipitation_mm": explanation.rainfall_24h_mm,
            "precipitation_probability_percent": explanation.max_precipitation_probability,
            "forecast_max_wind_kmh": explanation.wind_max_kmh,
            "river_discharge_m3s": explanation.river_discharge_m3s,
            "elevation_m": explanation.mean_elevation_m,
            "historically_mapped_waterlogging_hotspot": explanation.historical_flood_prone,
        } if explanation else None,
        "source_status": source_status,
        "risk_score_note": "No precomputed weighted risk score is supplied to the Predict LLM. Assess observations qualitatively and mark insufficient_data when needed.",
    }


async def _collect_source_status() -> Dict[str, Dict[str, Any]]:
    """Collect freshness metadata without exposing exact coordinates to Gemini."""
    zone_inputs = await asyncio.gather(*[
        asyncio.gather(
            get_real_weather_forecast(*zone["centroid"]),
            get_real_river_discharge(*zone["centroid"]),
        )
        for zone in REAL_ZONES_METADATA
    ])
    coordinates = [zone["centroid"] for zone in REAL_ZONES_METADATA]
    elevation = await get_real_elevations(coordinates)
    elevation_status = {
        "name": "Open-Elevation",
        "status": elevation.get("status", "failed"),
        "last_updated": elevation.get("last_updated"),
    }
    return {
        zone["id"]: {
            "weather": {
                "name": "Open-Meteo Weather",
                "status": inputs[0].get("status", "failed"),
                "last_updated": inputs[0].get("last_updated"),
            },
            "river": {
                "name": "Open-Meteo GloFAS",
                "status": inputs[1].get("status", "failed"),
                "last_updated": inputs[1].get("last_updated"),
            },
            "elevation": elevation_status,
        }
        for zone, inputs in zip(REAL_ZONES_METADATA, zone_inputs)
    }


def _point_in_ring(lng: float, lat: float, ring: List[List[float]]) -> bool:
    inside = False
    previous = ring[-1] if ring else None
    for current in ring:
        if previous:
            x1, y1 = previous[0], previous[1]
            x2, y2 = current[0], current[1]
            if (y1 > lat) != (y2 > lat) and lng < (x2 - x1) * (lat - y1) / ((y2 - y1) or 1e-12) + x1:
                inside = not inside
        previous = current
    return inside


def _zone_for_point(lng: float, lat: float, zones: List[RiskZone]) -> str:
    # Point risk locations are fixed HTP waterlogging hotspots, not polygons.
    # Attribute an incident only when it is within 500 m of a mapped hotspot.
    for zone in zones:
        geometry = zone.polygon or {}
        if geometry.get("type") == "Point":
            point_lng, point_lat = geometry.get("coordinates", [None, None])
            if point_lng is not None and point_lat is not None:
                lat_delta = math.radians(lat - point_lat)
                lng_delta = math.radians(lng - point_lng)
                a = math.sin(lat_delta / 2) ** 2 + math.cos(math.radians(point_lat)) * math.cos(math.radians(lat)) * math.sin(lng_delta / 2) ** 2
                distance_m = 6_371_000 * 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))
                if distance_m <= 500:
                    return zone.id
            continue
        polygons = geometry.get("coordinates", [])
        if geometry.get("type") == "Polygon":
            polygons = [polygons]
        for polygon in polygons:
            if polygon and _point_in_ring(lng, lat, polygon[0]) and not any(_point_in_ring(lng, lat, hole) for hole in polygon[1:]):
                return zone.id
    return "unmapped"


async def _collect_recent_rain_impacts(
    zones: List[RiskZone],
    start_date: str | None = None,
    end_date: str | None = None,
    zone_id: str | None = None,
) -> Dict[str, Any]:
    """Join archive rainfall with locally logged reports for the selected event window."""
    history_metadata = [meta for meta in REAL_ZONES_METADATA if not zone_id or meta["id"] == zone_id]
    histories = await asyncio.gather(*[
        get_recent_historical_rain(
            *meta["centroid"],
            start_date=start_date,
            end_date=end_date,
        )
        for meta in history_metadata
    ], return_exceptions=True)
    rainfall_by_date: Dict[str, Dict[str, float]] = defaultdict(dict)
    zone_rain: Dict[str, Dict[str, Any]] = {}
    source_status: Dict[str, Any] = {}
    for meta, result in zip(history_metadata, histories):
        if isinstance(result, Exception):
            source_status[meta["id"]] = {"name": "Open-Meteo Historical Weather API", "status": "failed", "last_updated": None}
            continue
        source_status[meta["id"]] = {key: result.get(key) for key in ("source", "status", "last_updated")}
        data = result.get("data") or {}
        daily = data.get("daily") or {}
        dates = daily.get("time") or []
        rain = daily.get("precipitation_sum") or []
        zone_rain[meta["id"]] = {day: value for day, value in zip(dates, rain) if value is not None}
        for day, value in zip(dates, rain):
            if value is not None:
                rainfall_by_date[day][meta["id"]] = float(value)

    wet_dates = sorted(day for day, values in rainfall_by_date.items() if any(value > 0 for value in values.values()))
    if start_date and end_date:
        start = datetime.fromisoformat(start_date).date()
        end = datetime.fromisoformat(end_date).date()
        event_dates = sorted(day for day in rainfall_by_date if start_date <= day <= end_date)
    elif wet_dates:
        end = datetime.fromisoformat(wet_dates[-1]).date()
        start = end
        for day in reversed(wet_dates[:-1]):
            date = datetime.fromisoformat(day).date()
            if (end - date).days > 1:
                break
            start = date
        event_dates = [day for day in wet_dates if start.isoformat() <= day <= end.isoformat()]
    else:
        start = end = None
        event_dates = []

    impact_counts: Dict[str, Dict[str, Any]] = defaultdict(lambda: {"incident_count": 0, "incident_types": {}, "blocked_road_reports": 0})
    if event_dates:
        incidents, roads = await asyncio.gather(fetch_incidents(), fetch_blocked_roads())
        start_day, end_day = event_dates[0], event_dates[-1]
        for incident in incidents:
            day = (incident.timestamp or "")[:10]
            if start_day <= day <= end_day and incident.type in ("flood", "trapped", "road_blocked"):
                impact_zone_id = _zone_for_point(incident.lng, incident.lat, zones)
                summary = impact_counts[impact_zone_id]
                summary["incident_count"] += 1
                summary["incident_types"][incident.type] = summary["incident_types"].get(incident.type, 0) + 1
        for road in roads:
            day = (road.timestamp or "")[:10]
            if start_day <= day <= end_day:
                coords = (road.geometry or {}).get("coordinates") or []
                if coords:
                    middle = coords[len(coords) // 2]
                    impact_zone_id = _zone_for_point(float(middle[0]), float(middle[1]), zones)
                    impact_counts[impact_zone_id]["blocked_road_reports"] += 1

    profile = []
    profile_zones = [zone for zone in zones if not zone_id or zone.id == zone_id]
    for zone in profile_zones:
        values = zone_rain.get(zone.id, {})
        event_rain = [values[day] for day in event_dates if day in values]
        profile.append({
            "zone_id": zone.id,
            "zone_name": zone.name,
            "event_precipitation_total_mm": round(sum(event_rain), 1) if event_rain else None,
            "event_max_daily_precipitation_mm": round(max(event_rain), 1) if event_rain else None,
            **impact_counts.get(zone.id, {"incident_count": 0, "incident_types": {}, "blocked_road_reports": 0}),
        })
    return {
        "source": "Open-Meteo Historical Weather API and Vanta officer-entered incident / blocked-road records",
        "status": "live" if any(item.get("status") == "live" for item in source_status.values()) else "stale" if any(item.get("status") == "stale" for item in source_status.values()) else "failed",
        "last_updated": datetime.now(timezone.utc).isoformat(),
        "rain_archive_sources": source_status,
        "window_start": start.isoformat() if start else None,
        "window_end": end.isoformat() if end else None,
        "selected_zone_id": zone_id,
        "zones": profile,
        "traffic_data_note": "Traffic impacts are limited to real logged blocked-road and flood/trapped incident reports. No traffic feed is connected; zero reports means none are recorded, not that roads were clear.",
    }


async def list_rain_history_events(
    days: int = 90,
    start_date: str | None = None,
    end_date: str | None = None,
) -> Dict[str, Any]:
    """Discover rainfall events and summarize only app-recorded impacts by hotspot."""
    today = datetime.now(timezone(timedelta(hours=5, minutes=30))).date()
    requested_start = datetime.fromisoformat(start_date).date() if start_date else today - timedelta(days=days)
    requested_end = datetime.fromisoformat(end_date).date() if end_date else today
    histories = await asyncio.gather(*[
        get_recent_historical_rain(
            *meta["centroid"],
            start_date=requested_start.isoformat(),
            end_date=requested_end.isoformat(),
        )
        for meta in REAL_ZONES_METADATA
    ], return_exceptions=True)

    rainfall_by_date: Dict[str, Dict[str, float]] = defaultdict(dict)
    zone_rain: Dict[str, Dict[str, float]] = {}
    source_status: Dict[str, Dict[str, Any]] = {}
    for meta, result in zip(REAL_ZONES_METADATA, histories):
        if isinstance(result, Exception):
            source_status[meta["id"]] = {"source": "Open-Meteo Historical Weather API", "status": "failed", "last_updated": None}
            continue
        source_status[meta["id"]] = {key: result.get(key) for key in ("source", "status", "last_updated")}
        daily = (result.get("data") or {}).get("daily") or {}
        dates = daily.get("time") or []
        values = daily.get("precipitation_sum") or []
        zone_rain[meta["id"]] = {day: float(value) for day, value in zip(dates, values) if value is not None}
        for day, value in zip(dates, values):
            if value is not None:
                rainfall_by_date[day][meta["id"]] = float(value)

    wet_days = sorted(
        day for day, values in rainfall_by_date.items()
        if day < today.isoformat() and any(value > 0 for value in values.values())
    )
    event_windows: List[List[str]] = []
    for day in wet_days:
        if not event_windows or (datetime.fromisoformat(day).date() - datetime.fromisoformat(event_windows[-1][-1]).date()).days > 1:
            event_windows.append([day])
        else:
            event_windows[-1].append(day)

    incidents, roads = await asyncio.gather(fetch_incidents(), fetch_blocked_roads()) if event_windows else ([], [])
    mapped_zones = [
        RiskZone(
            id=meta["id"],
            name=meta["name"],
            risk_level=1,
            polygon={"type": "Point", "coordinates": [meta["centroid"][1], meta["centroid"][0]]},
            derived_from=["Hyderabad Traffic Police waterlogging points"],
            computed_at="",
        )
        for meta in REAL_ZONES_METADATA
    ] if event_windows else []
    events = []
    for days_in_event in reversed(event_windows[-50:]):
        event_start, event_end = days_in_event[0], days_in_event[-1]
        area_summaries = []
        for meta in REAL_ZONES_METADATA:
            amounts = [zone_rain.get(meta["id"], {}).get(day) for day in days_in_event]
            recorded_amounts = [amount for amount in amounts if amount is not None]
            incident_counts: Dict[str, int] = {}
            road_count = 0
            for incident in incidents:
                report_day = (incident.timestamp or "")[:10]
                if event_start <= report_day <= event_end and incident.type in ("flood", "trapped", "road_blocked"):
                    if _zone_for_point(incident.lng, incident.lat, mapped_zones) == meta["id"]:
                        incident_counts[incident.type] = incident_counts.get(incident.type, 0) + 1
            for road in roads:
                report_day = (road.timestamp or "")[:10]
                coords = (road.geometry or {}).get("coordinates") or []
                if event_start <= report_day <= event_end and coords:
                    middle = coords[len(coords) // 2]
                    # Hotspot assignment uses the same 500 m rule as the Predict Agent.
                    if _zone_for_point(float(middle[0]), float(middle[1]), mapped_zones) == meta["id"]:
                        road_count += 1
            area_summaries.append({
                "zone_id": meta["id"],
                "zone_name": meta["name"],
                "rainfall_total_mm": round(sum(recorded_amounts), 1) if recorded_amounts else None,
                "max_daily_rainfall_mm": round(max(recorded_amounts), 1) if recorded_amounts else None,
                "incident_reports": sum(incident_counts.values()),
                "incident_types": incident_counts,
                "blocked_road_reports": road_count,
            })
        measured_totals = [area["rainfall_total_mm"] for area in area_summaries if area["rainfall_total_mm"] is not None]
        events.append({
            "id": f"{event_start}:{event_end}",
            "window_start": event_start,
            "window_end": event_end,
            "mean_hotspot_rainfall_mm": round(sum(measured_totals) / len(measured_totals), 1) if measured_totals else None,
            "rainfall_point_count": len(measured_totals),
            "hotspot_count": len(REAL_ZONES_METADATA),
            "areas": area_summaries,
        })

    available_days = sorted(rainfall_by_date)
    statuses = [item.get("status") for item in source_status.values()]
    healthy_sources = sum(status in ("live", "stale") for status in statuses)
    history_status = "live" if statuses and all(status == "live" for status in statuses) else "partial" if healthy_sources else "failed"
    return {
        "source": "Open-Meteo Historical Weather API",
        "status": history_status,
        "requested_days": days,
        "available_from": available_days[0] if available_days else None,
        "available_through": available_days[-1] if available_days else None,
        "last_updated": datetime.now(timezone.utc).isoformat(),
        "source_status": source_status,
        "events": events,
        "rainfall_note": "Rainfall is Open-Meteo historical reanalysis sampled at six mapped waterlogging hotspots, not gauge measurements or a citywide total. Archive availability varies by dataset; check available-through date.",
        "impact_note": "Effects count only flood, trapped-person and road-block reports recorded in this app during the event window. No record means unreported, not that the area or road was clear.",
    }
class PredictAgent:
    async def run(self, zones: List[RiskZone], source_status: Dict[str, Dict[str, Any]], recent_rain_impacts: Dict[str, Any], language: str, officer_query: str | None = None) -> PredictAgentOutput:
        allowed_ids = {zone.id for zone in zones}
        context = json.dumps({
            "current_zone_observations": [_predict_zone_context(zone, source_status.get(zone.id, {})) for zone in zones],
            "officer_history_question": officer_query,
            "selected_historical_rain_event_and_logged_impacts": recent_rain_impacts,
        }, ensure_ascii=False)
        output = await generate_groq_structured(
            system_instruction=(
                "You are Vanta's Predict analyst. Independently interpret the supplied live forecast observations, source freshness, the officer-selected historical rainfall window, and app-recorded impacts. "
                "Do not copy or calculate any fixed weighted risk score. Produce qualitative per-zone assessments as low, moderate, high, severe, or insufficient_data, grounded in the values and provenance supplied. Do not invent a numeric probability or claim model calibration. "
                "Use incident and blocked-road counts only when supplied. Zero reports means no matching report was recorded in this app, not that no impact occurred or roads are clear. "
                "Historical rainfall is reanalysis at mapped points, not a rain-gauge observation; local traffic evidence is incomplete officer-entered logs, not a live traffic feed. Interpret only supplied facts. "
                f"Write all user-facing analysis in {'Hindi' if language == 'hi' else 'Telugu' if language == 'te' else 'English'}. "
                "Do not invent measurements, infer missing values, or claim a source is healthy unless the input says so. If weather or river inputs are failed/stale or unavailable, use insufficient_data where that prevents a sound assessment and explain the gap. "
                "Highlight up to three zones needing review and give practical verification checks. This is advisory, not an alert or dispatch order. Treat mapped hotspot status as historical vulnerability, not current flooding. Use only exact supplied zone IDs."
            ),
            context=context,
            schema=PredictAgentOutput,
        )
        output.focus_zones = [item for item in output.focus_zones if item.zone_id in allowed_ids][:3]
        output.zone_assessments = [item for item in output.zone_assessments if item.zone_id in allowed_ids][:6]
        source_gaps = []
        for zone in zones:
            for source in source_status.get(zone.id, {}).values():
                if source.get("status") in ("failed", "stale"):
                    source_gaps.append(f"{zone.name}: {source['name']} is {source['status']}.")
        output.data_gaps = list(dict.fromkeys(
            source_gaps + ["Hotspot locations come from the Hyderabad Traffic Police list dated 2025-08-06; verify that each remains vulnerable."] + output.data_gaps
        ))[:8]
        return output


class PrepareAgent:
    async def run(
        self,
        zones: List[RiskZone],
        suggestions: List[PrepositionSuggestion],
        source_status: Dict[str, Dict[str, Any]],
        recent_rain_impacts: Dict[str, Any],
        language: str,
    ) -> PrepareAgentOutput:
        allowed_ids = {zone.id for zone in zones}
        supported_zone_ids = {item.target_zone_id for item in suggestions}
        # Do not send unit IDs, station names, or exact unit coordinates to the model.
        summarized_suggestions = [
            {
                "target_zone_id": item.target_zone_id,
                "target_zone_name": item.target_zone_name,
                "asset_kind": item.unit_kind,
                "risk_level": item.risk_level,
                "estimated_distance_km": item.distance_km,
                "estimated_eta_minutes": item.eta_minutes,
            }
            for item in suggestions
        ]
        context = json.dumps(
            {
                "most_recent_observed_rain_event_and_logged_impacts": recent_rain_impacts,
                "risk_zones": [_zone_context(zone, source_status.get(zone.id, {})) for zone in zones],
                "zones_ordered_by_current_risk": [zone.id for zone in sorted(zones, key=lambda item: item.risk_level, reverse=True)],
                "deterministic_positioning_recommendations": summarized_suggestions,
            },
            ensure_ascii=False,
        )
        output = await generate_structured(
            system_instruction=(
                "You are Vanta's Prepare analyst. Prepare officers for the supplied upcoming forecast/disaster by reviewing the forecast, the most recent observed rain impacts, and existing deterministic unit-to-zone "
                "recommendations using only the supplied facts. Provide concrete pre-event readiness actions (such as verifying the affected area's accessible routes, checking that registered units are available, or validating a recorded road closure) only when supported by the supplied evidence; each action must cite its basis and include an officer verification step. Do not invent units, capabilities, "
                "routes, shelters, ETAs, measurements, or assignments. Do not change the existing "
                "recommendations. If none are supplied, say that no unit positioning recommendation "
                "can be made from registered available units. Still provide general evidence-based readiness actions even when no units are registered. Provide a short readiness note and a "
                f"Write all user-facing analysis in {'Hindi' if language == 'hi' else 'Telugu' if language == 'te' else 'English'}. "
                "verification check for the officer; never issue a dispatch order. Use only exact supplied zone IDs."
            ),
            context=context,
            schema=PrepareAgentOutput,
        )
        output.zone_notes = [
            item for item in output.zone_notes
            if item.zone_id in allowed_ids and item.zone_id in supported_zone_ids
        ][:6]
        output.readiness_actions = [item for item in output.readiness_actions if not item.zone_id or item.zone_id in allowed_ids][:8]
        output.readiness_gaps = output.readiness_gaps[:5]
        return output


class RespondAgent:
    async def run(self, zones: List[RiskZone], operational_context: Dict[str, Any], language: str) -> RespondAgentOutput:
        allowed_ids = {zone.id for zone in zones}
        context = json.dumps(operational_context, ensure_ascii=False)
        output = await generate_structured(
            system_instruction=(
                "You are Vanta's Respond agent. Your separate goal is to help the control-room officer assess current active incidents and coordinate a safe, timely response. "
                "Use only supplied active incident summaries, logged road-closure reports, current risk and aggregate unit availability. Road closures have no resolution status, so always recommend verifying whether a recorded closure remains active. Prioritize reported life-safety needs and areas with supporting evidence. "
                "Do not invent incident details, traffic state, routes, facilities, unit capabilities, or instructions from authorities. Do not assign units, send messages, or dispatch. "
                "Phrase all steps as recommendations for officer review and provide a check before action. If there are no recorded incidents, clearly say so rather than implying none exist in reality. "
                f"Write all user-facing analysis in {'Hindi' if language == 'hi' else 'Telugu' if language == 'te' else 'English'}."
            ),
            context=context,
            schema=RespondAgentOutput,
        )
        output.priorities = [item for item in output.priorities if not item.zone_id or item.zone_id in allowed_ids][:6]
        output.immediate_checks = output.immediate_checks[:8]
        output.data_gaps = output.data_gaps[:8]
        return output


async def _weather_and_history(
    start_date: str | None = None,
    end_date: str | None = None,
    zone_id: str | None = None,
    include_rule_score: bool = True,
):
    zones = await compute_real_risk_zones(include_rule_score=include_rule_score)
    source_status = await _collect_source_status()
    recent_rain_impacts = await _collect_recent_rain_impacts(zones, start_date, end_date, zone_id)
    return zones, source_status, recent_rain_impacts


async def run_predict_agent(
    language: str = "en",
    event_start: str | None = None,
    event_end: str | None = None,
    zone_id: str | None = None,
    officer_query: str | None = None,
) -> Dict[str, Any]:
    zones, source_status, recent_rain_impacts = await _weather_and_history(
        event_start,
        event_end,
        zone_id,
        include_rule_score=False,
    )
    prediction = await PredictAgent().run(zones, source_status, recent_rain_impacts, language, officer_query)
    return {
        "status": "complete", "agent": "predict", "provider": "Groq", "model": settings.GROQ_MODEL,
        "generated_at": datetime.now(timezone.utc).isoformat(), "risk_zone_count": len(zones),
        "history_selection": {"query": officer_query, "start": event_start, "end": event_end, "zone_id": zone_id},
        "recent_rain_impacts": recent_rain_impacts, "predict": prediction.model_dump(mode="json"),
    }


async def run_prepare_agent(language: str = "en") -> Dict[str, Any]:
    zones, source_status, recent_rain_impacts = await _weather_and_history()
    units = await fetch_units()
    suggestions = generate_prepositioning_suggestions(units, zones)
    preparation = await PrepareAgent().run(zones, suggestions, source_status, recent_rain_impacts, language)
    return {
        "status": "complete", "agent": "prepare", "provider": "Google Gemini", "model": settings.GEMINI_MODEL,
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "risk_zone_count": len(zones), "available_unit_count": sum(1 for unit in units if unit.status == "available"),
        "recent_rain_impacts": recent_rain_impacts, "prepare": preparation.model_dump(mode="json"),
        "positioning_recommendations": [item.model_dump(mode="json") for item in suggestions],
    }


async def _collect_respond_context(zones: List[RiskZone], source_status: Dict[str, Any]) -> Dict[str, Any]:
    incidents, roads, units = await asyncio.gather(fetch_incidents(), fetch_blocked_roads(), fetch_units())
    active_incidents = [incident for incident in incidents if incident.status in ("new", "assigned")]
    by_zone: Dict[str, Dict[str, Any]] = defaultdict(lambda: {"active_incidents": 0, "incident_types": {}, "urgency_counts": {}, "people_reported": 0, "blocked_road_reports": 0, "latest_blocked_road_report_at": None})
    for incident in active_incidents:
        item = by_zone[_zone_for_point(incident.lng, incident.lat, zones)]
        item["active_incidents"] += 1
        item["incident_types"][incident.type] = item["incident_types"].get(incident.type, 0) + 1
        item["urgency_counts"][str(incident.urgency)] = item["urgency_counts"].get(str(incident.urgency), 0) + 1
        item["people_reported"] += incident.people
    for road in roads:
        coords = (road.geometry or {}).get("coordinates") or []
        if coords:
            point = coords[len(coords) // 2]
            item = by_zone[_zone_for_point(float(point[0]), float(point[1]), zones)]
            item["blocked_road_reports"] += 1
            if not item["latest_blocked_road_report_at"] or road.timestamp > item["latest_blocked_road_report_at"]:
                item["latest_blocked_road_report_at"] = road.timestamp
    area_activity = []
    for zone in zones:
        item = by_zone.get(zone.id, {"active_incidents": 0, "incident_types": {}, "urgency_counts": {}, "people_reported": 0, "blocked_road_reports": 0, "latest_blocked_road_report_at": None})
        area_activity.append({"zone_id": zone.id, "zone_name": zone.name, "risk_level": zone.risk_level, **item})
    return {
        "current_zone_risks_and_source_freshness": [_zone_context(zone, source_status.get(zone.id, {})) for zone in zones],
        "active_incident_and_logged_road_closure_counts_by_zone": area_activity,
        "registered_unit_availability_by_type_and_status": {
            kind: {status: sum(1 for unit in units if unit.kind == kind and unit.status == status) for status in ("available", "assigned")}
            for kind in ("patrol", "rescue_boat", "ambulance")
        },
        "incident_input_note": "Incident totals include records in new or assigned status. Only aggregated type, urgency and people counts are sent; no incident message, exact location, unit or officer identifier is sent.",
        "traffic_input_note": "Road closure counts come from officer-entered blocked road records, which have no resolved/active status. Verify each closure before treating it as current. There is no live traffic feed; no records does not establish that roads are clear.",
    }


async def run_respond_agent(language: str = "en") -> Dict[str, Any]:
    zones = await compute_real_risk_zones()
    source_status = await _collect_source_status()
    operational_context = await _collect_respond_context(zones, source_status)
    response = await RespondAgent().run(zones, operational_context, language)
    return {
        "status": "complete", "agent": "respond", "provider": "Google Gemini", "model": settings.GEMINI_MODEL,
        "generated_at": datetime.now(timezone.utc).isoformat(), "risk_zone_count": len(zones),
        "respond": response.model_dump(mode="json"), "operational_context": operational_context,
    }


async def run_predict_prepare_workflow(language: str = "en") -> Dict[str, Any]:
    """Run the deterministic risk/preposition tools, then Gemini's bounded analyses."""
    zones = await compute_real_risk_zones()
    units = await fetch_units()
    suggestions = generate_prepositioning_suggestions(units, zones)
    source_status = await _collect_source_status()
    recent_rain_impacts = await _collect_recent_rain_impacts(zones)

    predict_agent = PredictAgent()
    prepare_agent = PrepareAgent()
    prediction = await predict_agent.run(zones, source_status, recent_rain_impacts, language)
    preparation = await prepare_agent.run(zones, suggestions, source_status, recent_rain_impacts, language)

    return {
        "status": "complete",
        "provider": "Groq + Google Gemini",
        "model": {"predict": settings.GROQ_MODEL, "prepare": settings.GEMINI_MODEL},
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "risk_zone_count": len(zones),
        "available_unit_count": sum(1 for unit in units if unit.status == "available"),
        "recent_rain_impacts": recent_rain_impacts,
        "predict": prediction.model_dump(mode="json"),
        "prepare": preparation.model_dump(mode="json"),
        "positioning_recommendations": [item.model_dump(mode="json") for item in suggestions],
    }
