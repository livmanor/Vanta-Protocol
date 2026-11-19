"""Wildfire and Thermal Anomaly Detection Module (Tier A).

Data Source: NASA FIRMS (Fire Information for Resource Management System).
Sensors: VIIRS (375m) / MODIS (1km) Active Fire Detections.
Credential: Reads MAP_KEY or NASA_FIRMS_MAP_KEY from env.
            Gracefully reports missing_credentials when unset.
"""
from __future__ import annotations

import csv
import io
import json
import logging
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

logger = logging.getLogger("vanta.hazards.wildfire")

SAMPLE_FIRMS_PATH = os.path.join("data", "sample_firms.json")


def _get_firms_map_key() -> str:
    key = os.environ.get("MAP_KEY") or os.environ.get("NASA_FIRMS_MAP_KEY") or os.environ.get("FIRMS_MAP_KEY")
    if not key and hasattr(settings, "MAP_KEY"):
        key = settings.MAP_KEY
    if not key and hasattr(settings, "NASA_FIRMS_MAP_KEY"):
        key = settings.NASA_FIRMS_MAP_KEY
    return (key or "").strip()


def _frp_to_category(frp: float) -> int:
    if frp >= 60.0:
        return 5
    if frp >= 30.0:
        return 4
    if frp >= 15.0:
        return 3
    if frp >= 5.0:
        return 2
    return 1


class WildfireHazardModule(BaseHazardModule):
    @property
    def hazard_id(self) -> str:
        return "wildfire"

    @property
    def name(self) -> str:
        return "Wildfire & Thermal Anomaly Detection"

    @property
    def tier(self) -> str:
        return "A"

    @property
    def data_source(self) -> str:
        return "NASA FIRMS (VIIRS / MODIS Active Fire Detections)"

    async def get_status(self) -> HazardModuleStatus:
        now_iso = datetime.now(timezone.utc).isoformat()
        map_key = _get_firms_map_key()
        if not map_key:
            return HazardModuleStatus(
                hazard_id=self.hazard_id,
                name=self.name,
                tier=self.tier,
                status="missing_credentials",
                data_source=self.data_source,
                message="NASA FIRMS MAP_KEY env var not set. Real-time satellite thermal anomaly feed requires an Earthdata/FIRMS MAP_KEY.",
                last_updated=now_iso,
                items_count=0,
            )
        return HazardModuleStatus(
            hazard_id=self.hazard_id,
            name=self.name,
            tier=self.tier,
            status="implemented",
            data_source=self.data_source,
            message="Active NASA FIRMS satellite thermal anomaly detection feed.",
            last_updated=now_iso,
            items_count=0,
        )

    async def assess(self, bbox: Optional[Dict[str, float]] = None) -> List[HazardItem]:
        min_lat = bbox.get("min_lat", settings.GRID_LAT_MIN) if bbox else settings.GRID_LAT_MIN
        max_lat = bbox.get("max_lat", settings.GRID_LAT_MAX) if bbox else settings.GRID_LAT_MAX
        min_lon = bbox.get("min_lon", settings.GRID_LON_MIN) if bbox else settings.GRID_LON_MIN
        max_lon = bbox.get("max_lon", settings.GRID_LON_MAX) if bbox else settings.GRID_LON_MAX

        map_key = _get_firms_map_key()
        now_iso = datetime.now(timezone.utc).isoformat()
        items: List[HazardItem] = []

        if not map_key:
            # Fallback to local baseline sample file if available
            if os.path.isfile(SAMPLE_FIRMS_PATH):
                try:
                    with open(SAMPLE_FIRMS_PATH, "r", encoding="utf-8") as f:
                        cached = json.load(f)
                    detections = cached.get("detections", [])
                    for d in detections:
                        lat, lon = float(d["lat"]), float(d["lon"])
                        if not (min_lat <= lat <= max_lat and min_lon <= lon <= max_lon):
                            continue
                        frp = float(d.get("frp_mw", 0.0))
                        cat = _frp_to_category(frp)
                        items.append(self._build_hazard_item(
                            item_id=d["id"],
                            lat=lat,
                            lon=lon,
                            frp=frp,
                            brightness_k=float(d.get("brightness_k", 300.0)),
                            confidence=d.get("confidence", "nominal"),
                            satellite=d.get("satellite", "SNPP"),
                            instrument=d.get("instrument", "VIIRS"),
                            acq_time=d.get("acq_datetime", now_iso),
                            location_name=d.get("location_name", f"Thermal anomaly at {lat:.2f}N, {lon:.2f}E"),
                            source_status="stale",
                            now_iso=now_iso,
                            missing_key=True,
                        ))
                except Exception as exc:
                    logger.error("Failed reading sample FIRMS file: %s", exc)
            return items

        # Live FIRMS query
        # URL format: https://firms.modaps.eosdis.nasa.gov/api/area/csv/[MAP_KEY]/VIIRS_SNPP_NRT/[min_lon],[min_lat],[max_lon],[max_lat]/1
        url = f"https://firms.modaps.eosdis.nasa.gov/api/area/csv/{map_key}/VIIRS_SNPP_NRT/{min_lon:.3f},{min_lat:.3f},{max_lon:.3f},{max_lat:.3f}/1"
        try:
            async with httpx.AsyncClient(timeout=10.0) as client:
                res = await client.get(url)
                if res.status_code == 200 and not res.text.startswith("Invalid"):
                    reader = csv.DictReader(io.StringIO(res.text))
                    for i, row in enumerate(reader):
                        try:
                            lat = float(row["latitude"])
                            lon = float(row["longitude"])
                            frp = float(row.get("frp") or 0.0)
                            bright = float(row.get("bright_ti4") or 300.0)
                            conf = row.get("confidence") or "nominal"
                            sat = row.get("satellite") or "SNPP"
                            inst = row.get("instrument") or "VIIRS"
                            acq_d = row.get("acq_date") or ""
                            acq_t = row.get("acq_time") or ""
                            acq_iso = f"{acq_d}T{acq_t[:2]}:{acq_t[2:4]}:00Z" if acq_d and len(acq_t) >= 4 else now_iso

                            items.append(self._build_hazard_item(
                                item_id=f"firms-{lat:.3f}-{lon:.3f}-{i}",
                                lat=lat,
                                lon=lon,
                                frp=frp,
                                brightness_k=bright,
                                confidence=conf,
                                satellite=sat,
                                instrument=inst,
                                acq_time=acq_iso,
                                location_name=f"Thermal detection ({lat:.3f}N, {lon:.3f}E)",
                                source_status="live",
                                now_iso=now_iso,
                                missing_key=False,
                            ))
                        except Exception as e:
                            logger.warning("Error parsing FIRMS row: %s", e)
                else:
                    logger.warning("FIRMS API returned HTTP %d: %s", res.status_code, res.text[:100])
        except Exception as exc:
            logger.error("FIRMS fetch error: %s", exc)

        return items

    def _build_hazard_item(
        self,
        item_id: str,
        lat: float,
        lon: float,
        frp: float,
        brightness_k: float,
        confidence: str,
        satellite: str,
        instrument: str,
        acq_time: str,
        location_name: str,
        source_status: str,
        now_iso: str,
        missing_key: bool,
    ) -> HazardItem:
        cat = _frp_to_category(frp)
        factors = [
            ContributingFactor(name="fire_radiative_power", value=round(frp, 1), unit="MW"),
            ContributingFactor(name="brightness_temperature", value=round(brightness_k, 1), unit="K"),
            ContributingFactor(name="detection_confidence", value=None, unit=None, note=str(confidence)),
            ContributingFactor(name="sensor", value=None, unit=None, note=f"{satellite} / {instrument}"),
        ]

        warnings: List[str] = [
            "Satellite thermal anomaly observation. Does not replace ground firefighter verification."
        ]
        if missing_key:
            warnings.append("MAP_KEY env var not set; displayed detection is from offline baseline dataset.")

        actions: List[RecommendedAction] = []
        if frp >= 15.0 or confidence in ("high", "h"):
            actions.append(RecommendedAction(
                id=f"act-fire-tender-{item_id}",
                hazard_id="wildfire",
                action_type="fire_dispatch",
                description=f"Dispatch local Fire & Emergency Services tender to verify thermal detection ({location_name}, FRP {frp:.1f} MW).",
                priority="high",
                status="suggested",
                suggested_at=now_iso,
            ))
            actions.append(RecommendedAction(
                id=f"act-fire-smoke-{item_id}",
                hazard_id="wildfire",
                action_type="public_advisory",
                description="Issue local particulate/smoke awareness notice to adjacent residential zones.",
                priority="medium",
                status="suggested",
                suggested_at=now_iso,
            ))
        else:
            actions.append(RecommendedAction(
                id=f"act-fire-monitor-{item_id}",
                hazard_id="wildfire",
                action_type="forest_patrol",
                description=f"Task beat patrol / beat officer to inspect perimeter at {location_name} for open burning.",
                priority="low",
                status="suggested",
                suggested_at=now_iso,
            ))

        return HazardItem(
            id=item_id,
            hazard_id="wildfire",
            name=f"Fire Hotspot ({confidence.title()} Conf) — {location_name}",
            geometry={"type": "Point", "coordinates": [lon, lat]},
            is_observed=True,
            severity_level=cat,
            severity_label=f"FRP {frp:.1f} MW (Cat {cat})",
            event_time=acq_time,
            forecast_window_h=0,
            method="observed",
            model_version=f"NASA-{instrument}-NRT",
            probability=None,
            contributing_factors=factors,
            data_freshness=[
                DataFreshness(
                    source="NASA FIRMS",
                    status=source_status,  # type: ignore[arg-type]
                    fetched_at=now_iso,
                )
            ],
            sources=["NASA FIRMS (Earthdata VIIRS/MODIS NRT)"],
            warnings=warnings,
            summary=(
                f"Observed satellite thermal anomaly: Fire Radiative Power {frp:.1f} MW, "
                f"brightness temp {brightness_k:.1f} K ({confidence} confidence)."
            ),
            recommended_actions=actions,
        )
