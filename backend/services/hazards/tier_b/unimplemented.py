"""Tier B Hazard Modules: Interface and documentation only.

Every Tier B module implements BaseHazardModule and returns:
  status="not_implemented"
  message="not implemented: missing X"

No fake data or synthetic predictions are ever returned.
"""
from __future__ import annotations

from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

from backend.models import HazardItem, HazardModuleStatus
from backend.services.hazards.base import BaseHazardModule


class FloodExtensionModule(BaseHazardModule):
    @property
    def hazard_id(self) -> str:
        return "flood_extension"

    @property
    def name(self) -> str:
        return "Hydrodynamic Flood Extension"

    @property
    def tier(self) -> str:
        return "B"

    @property
    def data_source(self) -> str:
        return "2D SWMM/HEC-RAS Hydraulic Model & Urban Drainage GIS"

    async def get_status(self) -> HazardModuleStatus:
        return HazardModuleStatus(
            hazard_id=self.hazard_id,
            name=self.name,
            tier=self.tier,
            status="not_implemented",
            data_source=self.data_source,
            message="not implemented: missing high-resolution 2D hydraulic/hydrodynamic routing model and urban storm drain cross-section network data",
            last_updated=datetime.now(timezone.utc).isoformat(),
            items_count=0,
        )

    async def assess(self, bbox: Optional[Dict[str, float]] = None) -> List[HazardItem]:
        return []


class LandslideModule(BaseHazardModule):
    @property
    def hazard_id(self) -> str:
        return "landslide"

    @property
    def name(self) -> str:
        return "Landslide & Slope Stability"

    @property
    def tier(self) -> str:
        return "B"

    @property
    def data_source(self) -> str:
        return "Geotechnical Soil Cohesion Maps & Piezometer Array"

    async def get_status(self) -> HazardModuleStatus:
        return HazardModuleStatus(
            hazard_id=self.hazard_id,
            name=self.name,
            tier=self.tier,
            status="not_implemented",
            data_source=self.data_source,
            message="not implemented: missing high-resolution geotechnical shear strength, depth-to-bedrock maps, and real-time piezometric soil pore-pressure sensor feeds",
            last_updated=datetime.now(timezone.utc).isoformat(),
            items_count=0,
        )

    async def assess(self, bbox: Optional[Dict[str, float]] = None) -> List[HazardItem]:
        return []


class DroughtModule(BaseHazardModule):
    @property
    def hazard_id(self) -> str:
        return "drought"

    @property
    def name(self) -> str:
        return "Agricultural & Hydrological Drought"

    @property
    def tier(self) -> str:
        return "B"

    @property
    def data_source(self) -> str:
        return "Satellite SMAP/GRACE Soil Moisture & Multi-Month SPEI Index"

    async def get_status(self) -> HazardModuleStatus:
        return HazardModuleStatus(
            hazard_id=self.hazard_id,
            name=self.name,
            tier=self.tier,
            status="not_implemented",
            data_source=self.data_source,
            message="not implemented: missing multi-month satellite SMAP/GRACE soil moisture anomalies, SPEI meteorological indices, and reservoir storage telemetry",
            last_updated=datetime.now(timezone.utc).isoformat(),
            items_count=0,
        )

    async def assess(self, bbox: Optional[Dict[str, float]] = None) -> List[HazardItem]:
        return []


class HeatwaveModule(BaseHazardModule):
    @property
    def hazard_id(self) -> str:
        return "heatwave"

    @property
    def name(self) -> str:
        return "Predictive Heatwave & WBGT Mortality Risk"

    @property
    def tier(self) -> str:
        return "B"

    @property
    def data_source(self) -> str:
        return "Wet-Bulb Globe Temperature (WBGT) Array & Urban Heat Island Canopy"

    async def get_status(self) -> HazardModuleStatus:
        return HazardModuleStatus(
            hazard_id=self.hazard_id,
            name=self.name,
            tier=self.tier,
            status="not_implemented",
            data_source=self.data_source,
            message="not implemented: missing wet-bulb globe temperature (WBGT) micro-sensor network, high-res urban heat island canopy models, and epidemiological heat-mortality response curves (basic ambient temperature screening is available in Risk Engine)",
            last_updated=datetime.now(timezone.utc).isoformat(),
            items_count=0,
        )

    async def assess(self, bbox: Optional[Dict[str, float]] = None) -> List[HazardItem]:
        return []


class TsunamiModule(BaseHazardModule):
    @property
    def hazard_id(self) -> str:
        return "tsunami"

    @property
    def name(self) -> str:
        return "Oceanic Tsunami Inundation"

    @property
    def tier(self) -> str:
        return "B"

    @property
    def data_source(self) -> str:
        return "INCOIS / DART Deep-Ocean Tsunameter Buoys & Coastal Bathymetry"

    async def get_status(self) -> HazardModuleStatus:
        return HazardModuleStatus(
            hazard_id=self.hazard_id,
            name=self.name,
            tier=self.tier,
            status="not_implemented",
            data_source=self.data_source,
            message="not implemented: missing deep-ocean DART tsunameter real-time telemetry and coastal bathymetric run-up inundation modeling (inland Greater Hyderabad has 0 direct ocean tsunami hazard)",
            last_updated=datetime.now(timezone.utc).isoformat(),
            items_count=0,
        )

    async def assess(self, bbox: Optional[Dict[str, float]] = None) -> List[HazardItem]:
        return []


class LightningModule(BaseHazardModule):
    @property
    def hazard_id(self) -> str:
        return "lightning"

    @property
    def name(self) -> str:
        return "Lightning Early Warning & Ground Strikes"

    @property
    def tier(self) -> str:
        return "B"

    @property
    def data_source(self) -> str:
        return "Ground-based Lightning Detection Network (LINET / VHF/VLF Array)"

    async def get_status(self) -> HazardModuleStatus:
        return HazardModuleStatus(
            hazard_id=self.hazard_id,
            name=self.name,
            tier=self.tier,
            status="not_implemented",
            data_source=self.data_source,
            message="not implemented: missing ground-based lightning detection network (LDN/LINET time-of-arrival VHF/VLF sensor array) and total lightning pulse telemetry",
            last_updated=datetime.now(timezone.utc).isoformat(),
            items_count=0,
        )

    async def assess(self, bbox: Optional[Dict[str, float]] = None) -> List[HazardItem]:
        return []


class VolcanoModule(BaseHazardModule):
    @property
    def hazard_id(self) -> str:
        return "volcano"

    @property
    def name(self) -> str:
        return "Volcanic Ash & Eruption Plume"

    @property
    def tier(self) -> str:
        return "B"

    @property
    def data_source(self) -> str:
        return "VAAC Toulouse/Darwin Ash Advisory & Seismic Tremor Monitoring"

    async def get_status(self) -> HazardModuleStatus:
        return HazardModuleStatus(
            hazard_id=self.hazard_id,
            name=self.name,
            tier=self.tier,
            status="not_implemented",
            data_source=self.data_source,
            message="not implemented: missing volcanic ash dispersion modeling and seismic tremor array (no active or Holocene volcanoes exist in Telangana or the Deccan Volcanic Province)",
            last_updated=datetime.now(timezone.utc).isoformat(),
            items_count=0,
        )

    async def assess(self, bbox: Optional[Dict[str, float]] = None) -> List[HazardItem]:
        return []


TIER_B_MODULES = [
    FloodExtensionModule(),
    LandslideModule(),
    DroughtModule(),
    HeatwaveModule(),
    TsunamiModule(),
    LightningModule(),
    VolcanoModule(),
]
