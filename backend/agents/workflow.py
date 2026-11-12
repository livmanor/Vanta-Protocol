import asyncio
import json
from datetime import datetime, timezone
from typing import Any, Dict, List

from backend.agents.gemini import generate_structured
from backend.agents.schemas import PredictAgentOutput, PrepareAgentOutput
from backend.config import settings
from backend.models import PrepositionSuggestion, RiskZone
from backend.services.prepositioning import generate_prepositioning_suggestions
from backend.services.risk_engine import compute_real_risk_zones
from backend.db import fetch_units
from backend.data_sources.elevation import get_real_elevations
from backend.data_sources.open_meteo import get_real_river_discharge, get_real_weather_forecast
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
    async def run(self, zones: List[RiskZone], source_status: Dict[str, Dict[str, Any]]) -> PredictAgentOutput:
        allowed_ids = {zone.id for zone in zones}
        context = json.dumps({"risk_zones": [_zone_context(zone, source_status.get(zone.id, {})) for zone in zones]}, ensure_ascii=False)
        output = await generate_structured(
            system_instruction=(
                "You are Vanta's Predict analyst. Interpret only the supplied computed zone data. "
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
    ) -> PrepareAgentOutput:
        allowed_ids = {zone.id for zone in zones}
        supported_zone_ids = {item.target_zone_id for item in suggestions}
        if not suggestions:
            return PrepareAgentOutput(
                summary="No registered available units produced a positioning recommendation in this run.",
                zone_notes=[],
                readiness_gaps=["No deterministic unit-positioning recommendations were available."],
            )
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
                "risk_zones": [_zone_context(zone, source_status.get(zone.id, {})) for zone in zones],
                "deterministic_positioning_recommendations": summarized_suggestions,
            },
            ensure_ascii=False,
        )
        output = await generate_structured(
            system_instruction=(
                "You are Vanta's Prepare analyst. Review the existing deterministic unit-to-zone "
                "recommendations using only the supplied facts. Do not invent units, capabilities, "
                "routes, shelters, ETAs, measurements, or assignments. Do not change the existing "
                "recommendations. If none are supplied, say that no unit positioning recommendation "
                "can be made from registered available units. Provide a short readiness note and a "
                "verification check for the officer; never issue a dispatch order. Use only exact supplied zone IDs."
            ),
            context=context,
            schema=PrepareAgentOutput,
        )
        output.zone_notes = [
            item for item in output.zone_notes
            if item.zone_id in allowed_ids and item.zone_id in supported_zone_ids
        ][:6]
        output.readiness_gaps = output.readiness_gaps[:5]
        return output


async def run_predict_prepare_workflow() -> Dict[str, Any]:
    """Run the deterministic risk/preposition tools, then Gemini's bounded analyses."""
    zones = await compute_real_risk_zones()
    units = await fetch_units()
    suggestions = generate_prepositioning_suggestions(units, zones)
    source_status = await _collect_source_status()

    predict_agent = PredictAgent()
    prepare_agent = PrepareAgent()
    prediction = await predict_agent.run(zones, source_status)
    preparation = await prepare_agent.run(zones, suggestions, prediction, source_status)

    return {
        "status": "complete",
        "provider": "Google Gemini",
        "model": settings.GEMINI_MODEL,
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "risk_zone_count": len(zones),
        "available_unit_count": sum(1 for unit in units if unit.status == "available"),
        "predict": prediction.model_dump(mode="json"),
        "prepare": preparation.model_dump(mode="json"),
        "positioning_recommendations": [item.model_dump(mode="json") for item in suggestions],
    }
