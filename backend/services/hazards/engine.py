"""Unified Hazard Engine.

Aggregates per-hazard assessments from Tier A and Tier B modules.
CRITICAL DESIGN RULE:
  Never computes, blends, or returns a combined 'total risk' score.
  Summing or averaging distinct physical hazards (e.g. seismic vs cyclone vs flood)
  is scientifically invalid and creates false confidence in life-safety operations.
"""
from __future__ import annotations

import asyncio
import logging
from datetime import datetime, timezone
from typing import Dict, List, Optional

from backend.models import (
    ContributingFactor,
    DataFreshness,
    HazardItem,
    HazardModuleStatus,
    RecommendedAction,
    UnifiedHazardResponse,
)
from backend.services.hazards.actions_store import save_actions
from backend.services.hazards.base import BaseHazardModule
from backend.services.hazards.tier_a.cyclone import CycloneHazardModule
from backend.services.hazards.tier_a.earthquake import EarthquakeHazardModule
from backend.services.hazards.tier_a.wildfire import WildfireHazardModule
from backend.services.hazards.tier_b.unimplemented import TIER_B_MODULES

logger = logging.getLogger("vanta.hazards.engine")


class UnifiedHazardEngine:
    def __init__(self) -> None:
        self._modules: Dict[str, BaseHazardModule] = {}
        # Register Tier A modules
        self.register_module(EarthquakeHazardModule())
        self.register_module(CycloneHazardModule())
        self.register_module(WildfireHazardModule())
        # Register Tier B modules
        for mod in TIER_B_MODULES:
            self.register_module(mod)

    def register_module(self, module: BaseHazardModule) -> None:
        self._modules[module.hazard_id] = module

    def get_module(self, hazard_id: str) -> Optional[BaseHazardModule]:
        return self._modules.get(hazard_id)

    async def get_module_statuses(self) -> Dict[str, HazardModuleStatus]:
        statuses: Dict[str, HazardModuleStatus] = {}
        for hid, mod in self._modules.items():
            try:
                statuses[hid] = await mod.get_status()
            except Exception as exc:
                logger.error("Error reading status for hazard %r: %s", hid, exc)
                statuses[hid] = HazardModuleStatus(
                    hazard_id=hid,
                    name=mod.name,
                    tier=mod.tier,  # type: ignore[arg-type]
                    status="failed",
                    data_source=mod.data_source,
                    message=f"Status check failed: {exc}",
                )
        return statuses

    async def assess_all(self, bbox: Optional[Dict[str, float]] = None) -> UnifiedHazardResponse:
        """Run assessments across all hazard modules in parallel.

        Returns per-hazard features and metadata.
        total_risk_score is ALWAYS None.
        """
        now_iso = datetime.now(timezone.utc).isoformat()
        statuses = await self.get_module_statuses()
        features: List[HazardItem] = []
        all_actions: List[RecommendedAction] = []

        # Run Tier A module assessments
        tier_a_modules = [m for m in self._modules.values() if m.tier == "A"]
        results = await asyncio.gather(
            *[mod.assess(bbox) for mod in tier_a_modules],
            return_exceptions=True,
        )

        for mod, res in zip(tier_a_modules, results):
            hid = mod.hazard_id
            if isinstance(res, Exception):
                logger.error("Hazard assessment for %r raised exception: %s", hid, res)
                if hid in statuses:
                    statuses[hid].status = "failed"
                    statuses[hid].message = f"Assessment failed: {res}"
            elif isinstance(res, list):
                features.extend(res)
                if hid in statuses:
                    statuses[hid].items_count = len(res)
                for item in res:
                    all_actions.extend(item.recommended_actions)

        # Also pull live urban flood hotspots from risk_engine if available
        # to ensure the tactical map shows all active hazards in one view
        try:
            from backend.services.risk_engine import compute_real_risk_zones
            zones = await compute_real_risk_zones(include_rule_score=True)
            flood_status_counts = 0
            for z in zones:
                if z.risk_level and z.risk_level >= 2:
                    coords = z.polygon.get("coordinates") if isinstance(z.polygon, dict) else None
                    if not coords or len(coords) < 2:
                        continue
                    lon, lat = coords[0], coords[1]
                    exp = z.explanation
                    rain_24 = exp.rainfall_24h_mm if exp else None
                    why = exp.why_this if exp else "HTP waterlogging hotspot"

                    factors: List[ContributingFactor] = []
                    if rain_24 is not None:
                        factors.append(ContributingFactor(name="rainfall_24h", value=rain_24, unit="mm"))
                    if exp and exp.wind_max_kmh is not None:
                        factors.append(ContributingFactor(name="wind_speed", value=exp.wind_max_kmh, unit="km/h"))

                    actions: List[RecommendedAction] = []
                    if z.risk_level >= 4:
                        actions.append(RecommendedAction(
                            id=f"act-fld-pump-{z.id}",
                            hazard_id="urban_flood",
                            action_type="dewatering_pump",
                            description=f"Deploy emergency dewatering pumps to high-risk waterlogging hotspot: {z.name}.",
                            priority="high",
                            status="suggested",
                            suggested_at=now_iso,
                        ))
                    elif z.risk_level == 3:
                        actions.append(RecommendedAction(
                            id=f"act-fld-traffic-{z.id}",
                            hazard_id="urban_flood",
                            action_type="traffic_diversion",
                            description=f"Station traffic police sub-inspector to divert light motor vehicles from inundated dip at {z.name}.",
                            priority="medium",
                            status="suggested",
                            suggested_at=now_iso,
                        ))

                    flood_item = HazardItem(
                        id=f"fld-{z.id}",
                        hazard_id="urban_flood",
                        name=f"Flood Hotspot: {z.name}",
                        geometry=z.polygon,
                        is_observed=False,          # Predicted / Rule-based screen!
                        severity_level=z.risk_level,
                        severity_label=f"Level {z.risk_level} Screen",
                        event_time=z.computed_at or now_iso,
                        forecast_window_h=24,
                        method="rule_based",
                        model_version="vanta-rule-v2",
                        probability=None,
                        contributing_factors=factors,
                        data_freshness=[
                            DataFreshness(
                                source="Open-Meteo & HTP Catalog",
                                status=exp.weather_status if exp and exp.weather_status else "live",
                                fetched_at=z.computed_at,
                            )
                        ],
                        sources=z.derived_from or ["HTP Waterlogging Catalog", "Open-Meteo"],
                        warnings=["Rule-based waterlogging screening. Officer confirmation required before declaring road closure."],
                        summary=why,
                        recommended_actions=actions,
                    )
                    features.append(flood_item)
                    all_actions.extend(actions)
                    flood_status_counts += 1

            # Update flood status
            statuses["urban_flood"] = HazardModuleStatus(
                hazard_id="urban_flood",
                name="Urban Flood (HTP Hotspots & IMD Thresholds)",
                tier="A",
                status="implemented",
                data_source="HTP Waterlogging Points & Open-Meteo Per-Cell",
                message="Rule-based heuristic flood risk screen. Wind excluded from flood calculation.",
                last_updated=now_iso,
                items_count=flood_status_counts,
            )
        except Exception as exc:
            logger.warning("Could not include urban flood hotspots in unified assessment: %s", exc)

        # Save actions for officer review
        if all_actions:
            save_actions(all_actions)

        return UnifiedHazardResponse(
            timestamp=now_iso,
            hazards=statuses,
            features=features,
            total_risk_score=None,  # STRICT CONTRACT: ALWAYS None!
            disclaimer=(
                "Per-hazard assessments and observations. Independent risk categories; no combined "
                "total risk score is computed. Risk colors do not imply a confirmed disaster without officer verification."
            ),
        )


unified_hazard_engine = UnifiedHazardEngine()
