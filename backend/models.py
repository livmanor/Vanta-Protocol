from typing import Literal, Optional, List, Any, Dict
from pydantic import BaseModel, Field


# ── Unified Prediction Result ───────────────────────────────────────────────────
# Every hazard score emitted by risk_engine.py uses this contract.
# Rules enforced here and in risk_engine.py:
#   - probability is only populated when a calibrated ML model produced it.
#     Rule-based paths always leave it None.
#   - method is ALWAYS "rule_based" for the heuristic engine. Never claim ML.
#   - forecast_window_h: hours the category/probability covers (typically 24).
#   - model_version: "none" when no saved model was applied.

class ContributingFactor(BaseModel):
    name: str
    value: Optional[float] = None
    unit: Optional[str] = None
    note: Optional[str] = None


class DataFreshness(BaseModel):
    source: str
    status: Literal["live", "partial", "stale", "failed"]
    fetched_at: Optional[str] = None
    missing_fields: List[str] = Field(default_factory=list)


class RecommendedAction(BaseModel):
    """Suggested officer response action. Requires officer approval before execution."""
    id: str
    hazard_id: str
    action_type: str                      # e.g., "patrol_preposition", "shelter_standby", "traffic_diversion", "public_advisory", "sos_gate_alert"
    description: str
    priority: Literal["low", "medium", "high", "critical"] = "medium"
    status: Literal["suggested", "approved", "rejected"] = "suggested"
    suggested_at: str
    approved_by: Optional[str] = None
    approved_at: Optional[str] = None


class HazardItem(BaseModel):
    """Discrete hazard observation or prediction on the map."""
    id: str
    hazard_id: str                        # "earthquake", "cyclone", "wildfire", "urban_flood", "heat"
    name: str
    geometry: Dict[str, Any]              # GeoJSON Point, LineString, or Polygon
    is_observed: bool                     # True for observed event, False for predicted risk screen
    severity_level: Optional[int] = Field(default=None, ge=1, le=5)
    severity_label: Optional[str] = None  # e.g. "M4.2 Light", "VIIRS High Confidence", "Category 3"
    event_time: str                       # ISO-8601 UTC
    forecast_window_h: int = 0            # 0 for observed events; >0 for predictions
    method: Literal["rule_based", "ml", "observed"] = "observed"
    model_version: str = "none"
    probability: Optional[float] = Field(default=None, ge=0.0, le=1.0)
    contributing_factors: List[ContributingFactor] = Field(default_factory=list)
    data_freshness: List[DataFreshness] = Field(default_factory=list)
    sources: List[str] = Field(default_factory=list)
    warnings: List[str] = Field(default_factory=list)
    summary: str
    recommended_actions: List[RecommendedAction] = Field(default_factory=list)


class HazardModuleStatus(BaseModel):
    """Status metadata for each hazard module in the engine."""
    hazard_id: str
    name: str
    tier: Literal["A", "B"]
    status: Literal["implemented", "not_implemented", "missing_credentials", "failed"]
    data_source: str
    message: str                          # Tier B: explicit "not implemented: missing X"
    last_updated: Optional[str] = None
    items_count: int = 0


class UnifiedHazardResponse(BaseModel):
    """Unified engine response. Explicitly returns per-hazard outputs WITHOUT a combined total score."""
    timestamp: str
    hazards: Dict[str, HazardModuleStatus]
    features: List[HazardItem]
    total_risk_score: None = None         # ALWAYS None. Summing distinct hazard risks is unscientific.
    disclaimer: str = (
        "Per-hazard assessments and observations. Independent risk categories; no combined total risk "
        "score is computed. Risk colors do not imply a confirmed disaster without officer verification."
    )


class PredictionResult(BaseModel):
    """Unified hazard prediction. See method/probability rules above."""
    hazard: str                           # "urban_flood", "cyclone_wind", "heat", etc.
    location_id: str
    location_name: str
    lat: float
    lon: float
    timestamp: str                        # ISO-8601 UTC
    forecast_window_h: int                # hours covered (usually 24)
    category: Optional[int] = Field(default=None, ge=1, le=5)
    probability: Optional[float] = Field(default=None, ge=0.0, le=1.0)
    method: Literal["rule_based", "ml", "observed"] = "rule_based"
    model_version: str = "none"
    contributing_factors: List[ContributingFactor] = Field(default_factory=list)
    data_freshness: List[DataFreshness] = Field(default_factory=list)
    missing_data_warnings: List[str] = Field(default_factory=list)
    summary: str                          # human-readable rationale


class CycloneWindResult(BaseModel):
    """Cyclone / wind-only hazard. Never merged into the urban flood score."""
    location_id: str
    location_name: str
    lat: float
    lon: float
    timestamp: str
    wind_speed_kmh: Optional[float] = None
    wind_gusts_kmh: Optional[float] = None
    category: Optional[int] = Field(default=None, ge=1, le=5)
    summary: str
    data_freshness: List[DataFreshness] = Field(default_factory=list)
    missing_data_warnings: List[str] = Field(default_factory=list)

# --- Frozen Data Contracts (agent_rules.md §4) ---

class Incident(BaseModel):
    id: str
    lat: float
    lng: float
    type: Literal["flood", "trapped", "medical", "fire", "road_blocked"]
    urgency: int = Field(ge=1, le=5)
    people: int = Field(default=0, ge=0)
    vulnerable: bool = False
    message: str
    timestamp: str
    status: Literal["new", "assigned", "resolved"] = "new"
    source: str

class IncidentCreate(BaseModel):
    lat: float
    lng: float
    type: Literal["flood", "trapped", "medical", "fire", "road_blocked"]
    urgency: int = Field(ge=1, le=5)
    people: int = Field(default=0, ge=0)
    vulnerable: bool = False
    message: str
    source: str = "Officer Form"

class Unit(BaseModel):
    id: str
    kind: Literal["patrol", "rescue_boat", "ambulance"]
    lat: float
    lng: float
    capacity: int = Field(default=1, ge=1)
    status: Literal["available", "assigned"] = "available"
    station: str
    position_updated_at: str

class UnitCreate(BaseModel):
    id: Optional[str] = None
    kind: Literal["patrol", "rescue_boat", "ambulance"]
    lat: float
    lng: float
    capacity: int = Field(default=2, ge=1)
    station: str

class BlockedRoad(BaseModel):
    id: str
    name: str
    geometry: Dict[str, Any]  # GeoJSON LineString
    reason: str
    reported_by: str
    timestamp: str

class BlockedRoadCreate(BaseModel):
    name: str
    geometry: Dict[str, Any]
    reason: str
    reported_by: str = "Control Room"

class RiskExplanation(BaseModel):
    rainfall_24h_mm: Optional[float] = None
    rainfall_48h_mm: Optional[float] = None
    weather_status: Optional[Literal["live", "partial", "stale", "failed"]] = None
    weather_last_updated: Optional[str] = None
    max_precipitation_probability: Optional[float] = None
    wind_max_kmh: Optional[float] = None
    river_discharge_m3s: Optional[float] = None
    mean_elevation_m: Optional[float] = None
    historical_flood_prone: bool = False
    why_this: str
    # Heat is a separate screening hazard. Null means the forecast did not return the value.
    heat_temperature_max_c: Optional[float] = None
    heat_apparent_max_c: Optional[float] = None
    heat_note: Optional[str] = None

class RiskZone(BaseModel):
    id: str
    name: str
    risk_level: Optional[int] = Field(default=None, ge=1, le=5)
    polygon: Dict[str, Any]  # GeoJSON Point (hotspot) or Polygon / MultiPolygon
    population: Optional[int] = None
    derived_from: List[str]
    computed_at: str
    explanation: Optional[RiskExplanation] = None
    cell_type: Literal["hotspot", "grid"] = "hotspot"


class RiskGridCell(BaseModel):
    id: str
    name: str
    lat: float
    lon: float
    cell_type: Literal["grid"] = "grid"
    risk_level: Optional[int] = Field(default=None, ge=1, le=5)
    score: Optional[float] = None
    rain_48h: Optional[float] = None
    forecast_24h: Optional[float] = None
    heat_temperature_max_c: Optional[float] = None
    heat_apparent_max_c: Optional[float] = None
    elevation_m: Optional[float] = None
    slope_m_per_m: Optional[float] = None   # DEM-derived; None if no DEM
    low_lying: bool = False
    emerging: bool = False
    source_status: Literal["live", "partial", "stale", "failed"]
    why_this: str


class RiskGridResponse(BaseModel):
    cell_count: int
    hotspot_count: int
    emerging_count: int
    spacing_km: float
    lat_step: float
    lon_step: float
    # True prediction resolution reported to the caller.
    prediction_resolution_km: float          # same as spacing_km; explicit field
    dem_resolution_m: Optional[int] = None   # None when no DEM was used
    weather_source: str = "Open-Meteo per-cell"
    cells: List[RiskGridCell]

# --- Preparedness Models ---

class RouteCoordinate(BaseModel):
    lat: float
    lng: float

class EvacuationRoute(BaseModel):
    id: str
    zone_id: str
    zone_name: str
    shelter_name: str
    shelter_lat: float
    shelter_lng: float
    distance_meters: float
    duration_seconds: float
    geometry: Dict[str, Any]  # GeoJSON LineString from OSRM
    why_this: str
    computed_at: str
    # Empty when the chosen corridor stays clear of officer-reported closures.
    blocked_road_conflicts: List[str] = Field(default_factory=list)

class PrepositionSuggestion(BaseModel):
    id: str
    unit_id: str
    unit_kind: str
    current_lat: float
    current_lng: float
    station: str
    target_zone_id: str
    target_zone_name: str
    target_lat: float
    target_lng: float
    risk_level: int
    distance_km: float
    eta_minutes: float
    why_this: str
    status: Literal["recommended", "approved", "rejected"] = "recommended"

class DataSourceStatus(BaseModel):
    name: str
    endpoint: str
    status: Literal["live", "partial", "stale", "failed"]
    last_updated: Optional[str] = None
    response_time_ms: Optional[float] = None
    error_message: Optional[str] = None

class WeatherCurrent(BaseModel):
    time: Optional[str] = None
    weather_code: Optional[int] = None
    condition: Optional[str] = None
    temperature_c: Optional[float] = None
    feels_like_c: Optional[float] = None
    relative_humidity_pct: Optional[float] = None
    precipitation_mm: Optional[float] = None
    rain_mm: Optional[float] = None
    showers_mm: Optional[float] = None
    snowfall_cm: Optional[float] = None
    cloud_cover_pct: Optional[float] = None
    wind_speed_kmh: Optional[float] = None
    wind_direction_deg: Optional[float] = None
    wind_gusts_kmh: Optional[float] = None
    is_day: Optional[bool] = None

class WeatherDaily(BaseModel):
    date: Optional[str] = None
    weather_code: Optional[int] = None
    condition: Optional[str] = None
    temperature_min_c: Optional[float] = None
    temperature_max_c: Optional[float] = None
    precipitation_sum_mm: Optional[float] = None
    precipitation_probability_max_pct: Optional[float] = None
    wind_speed_max_kmh: Optional[float] = None
    wind_gusts_max_kmh: Optional[float] = None

class ZoneWeather(BaseModel):
    zone_id: str
    zone_name: str
    latitude: float
    longitude: float
    status: Literal["live", "partial", "stale", "failed"]
    last_updated: Optional[str] = None
    error_message: Optional[str] = None
    current: Optional[WeatherCurrent] = None
    today: Optional[WeatherDaily] = None
    rainfall_48h_mm: Optional[float] = None

