"""Common hazard-module interface.

Contract:
  - Every hazard (Tier A and Tier B) implements BaseHazardModule.
  - Per-hazard results are returned as discrete HazardItem instances.
  - No module or engine may produce or return a combined 'total risk' score.
  - Tier A modules fetch real public datasets with offline graceful fallbacks.
  - Tier B modules state explicitly: 'not implemented: missing X'.
"""
from __future__ import annotations

from abc import ABC, abstractmethod
from typing import Any, Dict, List, Optional
from backend.models import HazardItem, HazardModuleStatus


class BaseHazardModule(ABC):
    """Abstract base class for all hazard modules."""

    @property
    @abstractmethod
    def hazard_id(self) -> str:
        """Machine identifier, e.g. 'earthquake', 'cyclone', 'wildfire'."""
        pass

    @property
    @abstractmethod
    def name(self) -> str:
        """Human-readable display title."""
        pass

    @property
    @abstractmethod
    def tier(self) -> str:
        """'A' for implemented with public data; 'B' for interface & docs only."""
        pass

    @property
    @abstractmethod
    def data_source(self) -> str:
        """Primary dataset source or required sensor network."""
        pass

    @abstractmethod
    async def get_status(self) -> HazardModuleStatus:
        """Return module operational status and availability metadata."""
        pass

    @abstractmethod
    async def assess(self, bbox: Optional[Dict[str, float]] = None) -> List[HazardItem]:
        """Fetch and return discrete hazard features inside the requested bounding box.

        Must NEVER compute or merge a combined multi-hazard risk score.
        """
        pass
