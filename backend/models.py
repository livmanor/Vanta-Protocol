from typing import Literal, Optional, List, Any, Dict
from pydantic import BaseModel, Field

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
    max_precipitation_probability: Optional[float] = None
    river_discharge_m3s: Optional[float] = None
    mean_elevation_m: Optional[float] = None
    historical_flood_prone: bool = False
    why_this: str

class RiskZone(BaseModel):
    id: str
    name: str
    risk_level: int = Field(ge=1, le=5)
    polygon: Dict[str, Any]  # GeoJSON Polygon / MultiPolygon
    population: Optional[int] = None
    derived_from: List[str]
    computed_at: str
    explanation: Optional[RiskExplanation] = None

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
    status: Literal["live", "stale", "failed"]
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
    status: Literal["live", "stale", "failed"]
    last_updated: Optional[str] = None
    error_message: Optional[str] = None
    current: Optional[WeatherCurrent] = None
    today: Optional[WeatherDaily] = None

