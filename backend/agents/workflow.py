import asyncio
import json
from datetime import datetime, timezone
from collections import defaultdict
from typing import Any, Dict, List

from backend.agents.gemini import generate_structured
from backend.agents.schemas import PredictAgentOutput, PrepareAgentOutput
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
            "river_discharge_m3s": explanation.river_discharge_m3s,
            "mean_elevation_m": explanation.mean_elevation_m,
        } if explanation else None,
        "risk_model_note": "The existing risk score can include a project-configured historical-flood flag; this flag is not verified by the live feeds.",
        "source_status": source_status,
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
    for zone in zones:
        geometry = zone.polygon or {}
        polygons = geometry.get("coordinates", [])
        if geometry.get("type") == "Polygon":
            polygons = [polygons]
        for polygon in polygons:
            if polygon and _point_in_ring(lng, lat, polygon[0]) and not any(_point_in_ring(lng, lat, hole) for hole in polygon[1:]):
                return zone.id
    return "unmapped"


async def _collect_recent_rain_impacts(zones: List[RiskZone]) -> Dict[str, Any]:
    """Join archive rainfall with only real, locally logged flood/road reports."""
    histories = await asyncio.gather(*[
        get_recent_historical_rain(*meta["centroid"])
        for meta in REAL_ZONES_METADATA
    ], return_exceptions=True)
    rainfall_by_date: Dict[str, Dict[str, float]] = defaultdict(dict)
    zone_rain: Dict[str, Dict[str, Any]] = {}
    source_status: Dict[str, Any] = {}
    for meta, result in zip(REAL_ZONES_METADATA, histories):
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
    if wet_dates:
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
                zone_id = _zone_for_point(incident.lng, incident.lat, zones)
                summary = impact_counts[zone_id]
                summary["incident_count"] += 1
                summary["incident_types"][incident.type] = summary["incident_types"].get(incident.type, 0) + 1
        for road in roads:
            day = (road.timestamp or "")[:10]
            if start_day <= day <= end_day:
                coords = (road.geometry or {}).get("coordinates") or []
                if coords:
                    middle = coords[len(coords) // 2]
                    zone_id = _zone_for_point(float(middle[0]), float(middle[1]), zones)
                    impact_counts[zone_id]["blocked_road_reports"] += 1

    profile = []
    for zone in zones:
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
        "status": "live" if any(item.get("status") == "live" for item in source_status.values()) else "failed",
        "last_updated": datetime.now(timezone.utc).isoformat(),
        "rain_archive_sources": source_status,
        "window_start": start.isoformat() if start else None,
        "window_end": end.isoformat() if end else None,
        "zones": profile,
        "traffic_data_note": "Traffic impacts are limited to real logged blocked-road and flood/trapped incident reports. No traffic feed is connected; zero reports means none are recorded, not that roads were clear.",
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


class PredictAgent:
    async def run(self, zones: List[RiskZone], source_status: Dict[str, Dict[str, Any]], recent_rain_impacts: Dict[str, Any], language: str) -> PredictAgentOutput:
        allowed_ids = {zone.id for zone in zones}
        context = json.dumps({"risk_zones": [_zone_context(zone, source_status.get(zone.id, {})) for zone in zones], "most_recent_observed_rain_event_and_logged_impacts": recent_rain_impacts}, ensure_ascii=False)
        output = await generate_structured(
            system_instruction=(
                "You are Vanta's Predict analyst. Compare the supplied live forecast/risk data with the most recent observed rain event and the locally logged impacts during that event. "
                "Use historical rainfall values and incident/blocked-road report counts by zone only when supplied. Clearly state when no impacts were recorded and distinguish that from roads being clear. "
                "Historical rainfall is reanalysis, not a rain gauge; local traffic evidence is incomplete officer-entered logs, not a live traffic feed. Interpret only supplied data. "
                f"Write all user-facing analysis in {'Hindi' if language == 'hi' else 'Telugu' if language == 'te' else 'English'}. "
                "Do not calculate or change risk scores, invent measurements, infer missing values, "
                "or claim a live source is healthy unless the input says so. Highlight the most "
                "important zones and give a verification check to the watch officer. This is advisory, "
                "not an alert or dispatch order. Do not present the configured historical-flood flag "
                "as verified history. Use only exact supplied zone IDs."
            ),
            context=context,
            schema=PredictAgentOutput,
        )
        output.focus_zones = [item for item in output.focus_zones if item.zone_id in allowed_ids][:3]
        source_gaps = []
        for zone in zones:
            for source in source_status.get(zone.id, {}).values():
                if source.get("status") in ("failed", "stale"):
                    source_gaps.append(f"{zone.name}: {source['name']} is {source['status']}.")
        output.data_gaps = list(dict.fromkeys(
            source_gaps + ["Historical-flood flags in the current risk model are configured values, not verified live data."] + output.data_gaps
        ))[:8]
        return output


class PrepareAgent:
    async def run(
        self,
        zones: List[RiskZone],
        suggestions: List[PrepositionSuggestion],
        prediction: PredictAgentOutput,
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
                "predict_summary": prediction.summary,
                "focus_zone_ids": [item.zone_id for item in prediction.focus_zones],
                "most_recent_observed_rain_event_and_logged_impacts": recent_rain_impacts,
                "risk_zones": [_zone_context(zone, source_status.get(zone.id, {})) for zone in zones],
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
    preparation = await prepare_agent.run(zones, suggestions, prediction, source_status, recent_rain_impacts, language)

    return {
        "status": "complete",
        "provider": "Google Gemini",
        "model": settings.GEMINI_MODEL,
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "risk_zone_count": len(zones),
        "available_unit_count": sum(1 for unit in units if unit.status == "available"),
        "recent_rain_impacts": recent_rain_impacts,
        "predict": prediction.model_dump(mode="json"),
        "prepare": preparation.model_dump(mode="json"),
        "positioning_recommendations": [item.model_dump(mode="json") for item in suggestions],
    }
