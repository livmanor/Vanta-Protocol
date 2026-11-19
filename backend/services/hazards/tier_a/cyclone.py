"""Cyclone Tracking and Exposure Module (Tier A).

Data Source: NOAA NCEI IBTrACS / RSMC New Delhi (IMD).
Scope: Cyclone track monitoring, historical paths, and regional wind exposure ONLY.
Principle: Wind exposure is evaluated independently. Never merged with urban flood scores.
"""
from __future__ import annotations

import json
import logging
import math
import os
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

from backend.config import settings
from backend.models import (
    ContributingFactor,
    DataFreshness,
    HazardItem,
    HazardModuleStatus,
    RecommendedAction,
)
from backend.services.hazards.base import BaseHazardModule

logger = logging.getLogger("vanta.hazards.cyclone")

DEFAULT_IBTRACS_PATH = os.path.join("data", "ibtracs_active.json")


def _haversine_distance_km(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    R = 6371.0
    dlat = math.radians(lat2 - lat1)
    dlon = math.radians(lon2 - lon1)
    a = (math.sin(dlat / 2) ** 2 +
         math.cos(math.radians(lat1)) * math.cos(math.radians(lat2)) *
         math.sin(dlon / 2) ** 2)
    return 2 * R * math.asin(math.sqrt(max(0.0, min(1.0, a))))


class CycloneHazardModule(BaseHazardModule):
    @property
    def hazard_id(self) -> str:
        return "cyclone"

    @property
    def name(self) -> str:
        return "Cyclone Track & Wind Exposure"

    @property
    def tier(self) -> str:
        return "A"

    @property
    def data_source(self) -> str:
        return "NOAA NCEI IBTrACS / IMD RSMC New Delhi"

    async def get_status(self) -> HazardModuleStatus:
        now_iso = datetime.now(timezone.utc).isoformat()
        return HazardModuleStatus(
            hazard_id=self.hazard_id,
            name=self.name,
            tier=self.tier,
            status="implemented",
            data_source=self.data_source,
            message="Active IBTrACS / RSMC North Indian Ocean cyclone tracks. Monitoring and wind exposure only.",
            last_updated=now_iso,
            items_count=0,
        )

    async def assess(self, bbox: Optional[Dict[str, float]] = None) -> List[HazardItem]:
        ibtracs_file = settings.IBTRACS_DATA_PATH or DEFAULT_IBTRACS_PATH
        if not os.path.isabs(ibtracs_file):
            ibtracs_file = os.path.join(os.getcwd(), ibtracs_file)

        if not os.path.isfile(ibtracs_file):
            logger.warning("IBTrACS dataset %r does not exist", ibtracs_file)
            return []

        try:
            with open(ibtracs_file, "r", encoding="utf-8") as f:
                data = json.load(f)
        except Exception as exc:
            logger.error("Failed loading IBTrACS dataset: %s", exc)
            return []

        min_lat = bbox.get("min_lat", settings.INDIA_BBOX_MIN_LAT) if bbox else settings.INDIA_BBOX_MIN_LAT
        max_lat = bbox.get("max_lat", settings.INDIA_BBOX_MAX_LAT) if bbox else settings.INDIA_BBOX_MAX_LAT
        min_lon = bbox.get("min_lon", settings.INDIA_BBOX_MIN_LON) if bbox else settings.INDIA_BBOX_MIN_LON
        max_lon = bbox.get("max_lon", settings.INDIA_BBOX_MAX_LON) if bbox else settings.INDIA_BBOX_MAX_LON

        ref_lat, ref_lon = settings.DEFAULT_LAT, settings.DEFAULT_LNG
        now_iso = datetime.now(timezone.utc).isoformat()
        results: List[HazardItem] = []

        storms = data.get("storms", [])
        for storm in storms:
            track = storm.get("track", [])
            if not track:
                continue

            # Calculate closest point of approach to reference location
            closest_dist = float("inf")
            closest_fix = track[-1]
            coords_line = []

            for fix in track:
                f_lat, f_lon = fix["lat"], fix["lon"]
                coords_line.append([f_lon, f_lat])
                dist = _haversine_distance_km(ref_lat, ref_lon, f_lat, f_lon)
                if dist < closest_dist:
                    closest_dist = dist
                    closest_fix = fix

            last_fix = track[-1]
            last_lat, last_lon = last_fix["lat"], last_fix["lon"]

            # Filter within regional bounding box
            if not (min_lat <= last_lat <= max_lat and min_lon <= last_lon <= max_lon):
                # Also check if any track point is in bbox
                in_bbox = any(min_lat <= pt[1] <= max_lat and min_lon <= pt[0] <= max_lon for pt in coords_line)
                if not in_bbox:
                    continue

            name = storm.get("name", "UNNAMED")
            sid = storm.get("sid", "unknown")
            storm_type = storm.get("storm_type", "Cyclonic Storm")
            cat = storm.get("category", 2)
            max_wind = storm.get("max_wind_kmh", last_fix.get("wind_kmh", 0.0))
            min_press = storm.get("min_pressure_hpa", last_fix.get("pressure_hpa", 1000.0))
            closest_dist_km = round(closest_dist, 1)

            factors: List[ContributingFactor] = [
                ContributingFactor(name="maximum_sustained_wind", value=max_wind, unit="km/h"),
                ContributingFactor(name="minimum_central_pressure", value=min_press, unit="hPa"),
                ContributingFactor(name="closest_approach_distance", value=closest_dist_km, unit="km"),
                ContributingFactor(name="storm_classification", value=None, unit=None, note=storm_type),
            ]

            actions: List[RecommendedAction] = []
            if closest_dist_km <= 250:
                actions.append(RecommendedAction(
                    id=f"act-cyc-hoardings-{sid}",
                    hazard_id="cyclone",
                    action_type="hazard_mitigation",
                    description=f"Direct GHMC advertising wing to dismantle unstable rooftop hoardings along the path of Cyclone {name}.",
                    priority="high",
                    status="suggested",
                    suggested_at=now_iso,
                ))
                actions.append(RecommendedAction(
                    id=f"act-cyc-chainsaw-{sid}",
                    hazard_id="cyclone",
                    action_type="prepositioning",
                    description=f"Pre-position DRF tree-clearing squads with chainsaws at central traffic junctions ({name} outer wind band: {max_wind} km/h).",
                    priority="high",
                    status="suggested",
                    suggested_at=now_iso,
                ))
            else:
                actions.append(RecommendedAction(
                    id=f"act-cyc-monitor-{sid}",
                    hazard_id="cyclone",
                    action_type="coastal_coordination",
                    description=f"Maintain radar and IMD RSMC bulletin watch on Cyclone {name} ({closest_dist_km} km away).",
                    priority="medium",
                    status="suggested",
                    suggested_at=now_iso,
                ))

            # Emit track LineString
            results.append(HazardItem(
                id=f"cyclone-track-{sid}",
                hazard_id="cyclone",
                name=f"Cyclone {name} Track ({storm_type})",
                geometry={"type": "LineString", "coordinates": coords_line},
                is_observed=True,
                severity_level=cat,
                severity_label=f"{storm_type} (Cat {cat})",
                event_time=last_fix.get("time", now_iso),
                forecast_window_h=0,
                method="observed",
                model_version="IBTrACS-v04r01",
                probability=None,
                contributing_factors=factors,
                data_freshness=[
                    DataFreshness(
                        source="NOAA NCEI IBTrACS / IMD RSMC",
                        status="live",
                        fetched_at=now_iso,
                    )
                ],
                sources=["NOAA National Centers for Environmental Information (NCEI)", "IMD RSMC New Delhi"],
                warnings=[
                    "Wind and storm track exposure only. Cyclone wind effects are evaluated separately from urban stormwater flooding."
                ],
                summary=(
                    f"Cyclone {name} ({storm_type}): Max wind {max_wind} km/h, pressure {min_press} hPa. "
                    f"Closest approach to reference area: {closest_dist_km} km."
                ),
                recommended_actions=actions,
            ))

            # Also emit current/latest fix Point
            results.append(HazardItem(
                id=f"cyclone-eye-{sid}",
                hazard_id="cyclone",
                name=f"Cyclone {name} Eye Center",
                geometry={"type": "Point", "coordinates": [last_lon, last_lat]},
                is_observed=True,
                severity_level=cat,
                severity_label=f"{last_fix.get('status', storm_type)}",
                event_time=last_fix.get("time", now_iso),
                forecast_window_h=0,
                method="observed",
                model_version="IBTrACS-v04r01",
                probability=None,
                contributing_factors=factors,
                data_freshness=[
                    DataFreshness(
                        source="NOAA NCEI IBTrACS / IMD RSMC",
                        status="live",
                        fetched_at=now_iso,
                    )
                ],
                sources=["NOAA NCEI IBTrACS", "IMD Tropical Cyclone Bulletins"],
                warnings=["Track position observation. Wind exposure evaluated independently."],
                summary=f"Eye fix of Cyclone {name} at {last_lat:.2f}N, {last_lon:.2f}E.",
                recommended_actions=[],
            ))

        return results
