"""Earthquake Monitoring Module (Tier A).

Data Source: USGS Earthquake Hazards Program (ComCat API).
Scope: Real-time monitoring and historical seismicity ONLY.
Scientific Law: Earthquake prediction is scientifically impossible.
                This module NEVER predicts or forecasts earthquakes.
"""
from __future__ import annotations

import json
import logging
import math
import os
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

import httpx

from backend.config import settings
from backend.models import (
    ContributingFactor,
    DataFreshness,
    HazardItem,
    HazardModuleStatus,
    RecommendedAction,
)
from backend.services.hazards.base import BaseHazardModule

logger = logging.getLogger("vanta.hazards.earthquake")

BASELINE_CATALOG_PATH = os.path.join("data", "earthquake_catalog.json")


def _haversine_distance_km(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    R = 6371.0
    dlat = math.radians(lat2 - lat1)
    dlon = math.radians(lon2 - lon1)
    a = (math.sin(dlat / 2) ** 2 +
         math.cos(math.radians(lat1)) * math.cos(math.radians(lat2)) *
         math.sin(dlon / 2) ** 2)
    return 2 * R * math.asin(math.sqrt(max(0.0, min(1.0, a))))


def _mag_to_category(mag: float) -> int:
    if mag >= 6.5:
        return 5
    if mag >= 5.5:
        return 4
    if mag >= 4.5:
        return 3
    if mag >= 3.5:
        return 2
    return 1


class EarthquakeHazardModule(BaseHazardModule):
    @property
    def hazard_id(self) -> str:
        return "earthquake"

    @property
    def name(self) -> str:
        return "Earthquake Seismicity & Monitoring"

    @property
    def tier(self) -> str:
        return "A"

    @property
    def data_source(self) -> str:
        return "USGS Earthquake Hazards Program (ComCat API)"

    async def get_status(self) -> HazardModuleStatus:
        now_iso = datetime.now(timezone.utc).isoformat()
        return HazardModuleStatus(
            hazard_id=self.hazard_id,
            name=self.name,
            tier=self.tier,
            status="implemented",
            data_source=self.data_source,
            message="Active USGS seismic feed. Monitoring and historical seismicity only; no prediction.",
            last_updated=now_iso,
            items_count=0,
        )

    async def assess(self, bbox: Optional[Dict[str, float]] = None) -> List[HazardItem]:
        min_lat = bbox.get("min_lat", settings.INDIA_BBOX_MIN_LAT) if bbox else settings.INDIA_BBOX_MIN_LAT
        max_lat = bbox.get("max_lat", settings.INDIA_BBOX_MAX_LAT) if bbox else settings.INDIA_BBOX_MAX_LAT
        min_lon = bbox.get("min_lon", settings.INDIA_BBOX_MIN_LON) if bbox else settings.INDIA_BBOX_MIN_LON
        max_lon = bbox.get("max_lon", settings.INDIA_BBOX_MAX_LON) if bbox else settings.INDIA_BBOX_MAX_LON

        params = {
            "format": "geojson",
            "minmagnitude": "2.5",
            "minlatitude": str(min_lat),
            "maxlatitude": str(max_lat),
            "minlongitude": str(min_lon),
            "maxlongitude": str(max_lon),
            "limit": "50",
        }

        geojson_data = None
        source_status = "live"

        try:
            async with httpx.AsyncClient(timeout=8.0) as client:
                res = await client.get(settings.USGS_EARTHQUAKE_URL, params=params)
                if res.status_code == 200:
                    geojson_data = res.json()
                else:
                    logger.warning("USGS query returned status %d; using baseline catalog", res.status_code)
                    source_status = "stale"
        except Exception as exc:
            logger.warning("USGS query network error (%s); using baseline catalog", exc)
            source_status = "stale"

        if not geojson_data:
            if os.path.isfile(BASELINE_CATALOG_PATH):
                try:
                    with open(BASELINE_CATALOG_PATH, "r", encoding="utf-8") as f:
                        geojson_data = json.load(f)
                except Exception as exc:
                    logger.error("Failed reading baseline earthquake catalog: %s", exc)
            if not geojson_data:
                return []

        features = geojson_data.get("features", [])
        results: List[HazardItem] = []
        now_iso = datetime.now(timezone.utc).isoformat()
        ref_lat, ref_lon = settings.DEFAULT_LAT, settings.DEFAULT_LNG

        for feat in features:
            props = feat.get("properties") or {}
            geom = feat.get("geometry") or {}
            coords = geom.get("coordinates") or []
            if len(coords) < 2:
                continue

            lon, lat = coords[0], coords[1]
            depth_km = coords[2] if len(coords) > 2 else None
            mag = float(props.get("mag") or 0.0)

            # Filter within target bounding box
            if not (min_lat <= lat <= max_lat and min_lon <= lon <= max_lon):
                continue

            dist_km = round(_haversine_distance_km(ref_lat, ref_lon, lat, lon), 1)
            cat = _mag_to_category(mag)
            place = props.get("place") or f"Seismic event at {lat:.2f}N, {lon:.2f}E"
            ev_time_ms = props.get("time")
            ev_time_iso = (
                datetime.fromtimestamp(ev_time_ms / 1000.0, timezone.utc).isoformat()
                if ev_time_ms else now_iso
            )

            factors: List[ContributingFactor] = [
                ContributingFactor(name="magnitude", value=mag, unit="M"),
                ContributingFactor(name="distance_to_hyderabad", value=dist_km, unit="km"),
            ]
            if depth_km is not None:
                factors.append(ContributingFactor(name="depth", value=round(float(depth_km), 1), unit="km"))
            if props.get("felt"):
                factors.append(ContributingFactor(name="felt_reports", value=float(props["felt"]), unit="reports"))

            actions: List[RecommendedAction] = []
            ev_id = str(feat.get("id") or f"eq-{lat:.2f}-{lon:.2f}")

            if mag >= 4.5 and dist_km <= 350:
                actions.append(RecommendedAction(
                    id=f"act-eq-inspect-{ev_id}",
                    hazard_id="earthquake",
                    action_type="infrastructure_inspection",
                    description=f"Inspect flyovers, PVNR Expressway, and metro viaducts following M{mag} seismic event ({dist_km} km away).",
                    priority="high",
                    status="suggested",
                    suggested_at=now_iso,
                ))
                actions.append(RecommendedAction(
                    id=f"act-eq-sdrf-{ev_id}",
                    hazard_id="earthquake",
                    action_type="rescue_standby",
                    description="Place Telangana SDRF and Fire Services urban search and rescue units on immediate standby.",
                    priority="critical",
                    status="suggested",
                    suggested_at=now_iso,
                ))
            else:
                actions.append(RecommendedAction(
                    id=f"act-eq-log-{ev_id}",
                    hazard_id="earthquake",
                    action_type="situation_log",
                    description=f"Log M{mag} earthquake ({place}) in Police Disaster Operations Room log; situational awareness only.",
                    priority="low",
                    status="suggested",
                    suggested_at=now_iso,
                ))

            results.append(HazardItem(
                id=f"eq-{ev_id}",
                hazard_id="earthquake",
                name=f"Earthquake M{mag:.1f} — {place}",
                geometry={"type": "Point", "coordinates": [lon, lat]},
                is_observed=True,
                severity_level=cat,
                severity_label=f"M{mag:.1f} (Category {cat})",
                event_time=ev_time_iso,
                forecast_window_h=0,
                method="observed",
                model_version="USGS-PDE-v1",
                probability=None,
                contributing_factors=factors,
                data_freshness=[
                    DataFreshness(
                        source="USGS Earthquake Hazards Program",
                        status=source_status,
                        fetched_at=now_iso,
                    )
                ],
                sources=["USGS Comprehensive Earthquake Catalog (ComCat)", "Global Seismographic Network"],
                warnings=[
                    "Earthquake monitoring and historical seismicity only. Earthquake prediction is scientifically not possible and is never claimed."
                ],
                summary=(
                    f"Observed earthquake: M{mag:.1f} at depth {depth_km or 'unknown'} km, {dist_km} km from central Hyderabad. "
                    "Seismic observation only; no prediction is implied."
                ),
                recommended_actions=actions,
            ))

        return results
