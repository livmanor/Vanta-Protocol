import asyncio
from datetime import datetime, timezone
from typing import List, Dict, Any, Optional
from backend.config import settings
from backend.models import RiskZone, RiskExplanation
from backend.data_sources.open_meteo import get_real_weather_forecast, get_real_river_discharge
from backend.data_sources.elevation import get_real_elevations
from backend.data_sources.imd import get_real_imd_alerts

# Geocoded major waterlogging points published by Hyderabad Traffic Police.
# Source list is dated 2025-08-06. These points are historical vulnerability
# locations, not administrative boundaries or reports of current inundation.
REAL_ZONES_METADATA = [
    {
        "id": "hyd-hotspot-nampally-metro",
        "name": "Nampally Metro Underpass",
        "centroid": (17.391440, 78.470213),
        "historical_flood_prone": True,
        "source_severity": "Major",
    },
    {
        "id": "hyd-hotspot-banjara-rd12",
        "name": "Banjara Hills · Road No. 12",
        "centroid": (17.411480, 78.435294),
        "historical_flood_prone": True,
        "source_severity": "Major",
    },
    {
        "id": "hyd-hotspot-gun-park",
        "name": "Gun Park / Hyderabad Traffic Police",
        "centroid": (17.4008462, 78.4698862),
        "historical_flood_prone": True,
        "source_severity": "Major",
    },
    {
        "id": "hyd-hotspot-chatrinaka",
        "name": "Chatrinaka Police Station",
        "centroid": (17.343282, 78.478107),
        "historical_flood_prone": True,
        "source_severity": "Major",
    },
    {
        "id": "hyd-hotspot-kachiguda",
        "name": "Kachiguda · 6 No. Junction",
        "centroid": (17.391500, 78.511201),
        "historical_flood_prone": True,
        "source_severity": "Major",
    },
    {
        "id": "hyd-hotspot-moosarambagh-bridge",
        "name": "Moosarambagh Bridge · Ali Café",
        "centroid": (17.381185, 78.517900),
        "historical_flood_prone": True,
        "source_severity": "Major",
    }
]

def calculate_zone_risk(
    rainfall_24h: float,
    precip_prob_max: float,
    wind_max_kmh: float,
    river_discharge: Optional[float],
    elevation_m: Optional[float],
    historical_flood: bool
) -> tuple[int, RiskExplanation]:
    """Calculates risk level 1-5 with transparent explainability.
    
    Formula weights:
    - 24h Rainfall: 35%
    - Wind gust / Cyclone intensity: 20%
    - River discharge anomaly: 20%
    - Low elevation (< 10m): 15%
    - Published major waterlogging hotspot: 10%
    """
    score = 1.0  # Base level 1 (Low)

    # 1. Rainfall score (0 to 1.5)
    # IMD standards: >64.5mm Heavy, >115.5mm Very Heavy, >204.4mm Extremely Heavy
    if rainfall_24h >= 115.5:
        score += 1.5
    elif rainfall_24h >= 64.5:
        score += 1.0
    elif rainfall_24h >= 25.0:
        score += 0.5

    # 2. Wind / Cyclone factor (0 to 1.0)
    # >62 km/h is deep depression / cyclonic storm
    if wind_max_kmh >= 62.0:
        score += 1.0
    elif wind_max_kmh >= 45.0:
        score += 0.5

    # 3. River discharge (0 to 1.0)
    if river_discharge is not None and river_discharge > 25.0:
        score += 1.0
    elif river_discharge is not None and river_discharge > 10.0:
        score += 0.5

    # 4. Low elevation / coastal depression (0 to 0.75)
    if elevation_m is not None:
        if elevation_m <= 4.0:
            score += 0.75
        elif elevation_m <= 10.0:
            score += 0.35

    # 5. Published major waterlogging hotspot (0 to 0.5)
    if historical_flood:
        score += 0.5

    final_level = min(5, max(1, round(score)))

    reasons = []
    if rainfall_24h > 20:
        reasons.append(f"Forecast 24h rainfall: {rainfall_24h:.1f} mm")
    if wind_max_kmh > 40:
        reasons.append(f"Max wind gusts: {wind_max_kmh:.1f} km/h")
    if river_discharge is not None:
        reasons.append(f"River discharge: {river_discharge:.1f} m³/s")
    if elevation_m is not None:
        reasons.append(f"Terrain elevation: {elevation_m:.1f} m (low-lying: {'Yes' if elevation_m < 10 else 'No'})")
    if historical_flood:
        reasons.append("Hyderabad Traffic Police major waterlogging hotspot (2025 list)")

    why_this = " | ".join(reasons) if reasons else "Normal meteorological conditions, minimal flood/cyclone hazard"

    explanation = RiskExplanation(
        rainfall_24h_mm=rainfall_24h,
        max_precipitation_probability=precip_prob_max,
        wind_max_kmh=wind_max_kmh,
        river_discharge_m3s=river_discharge,
        mean_elevation_m=elevation_m,
        historical_flood_prone=historical_flood,
        why_this=why_this
    )
    return final_level, explanation

async def compute_real_risk_zones(include_rule_score: bool = True) -> List[RiskZone]:
    """Collect live zone observations, optionally applying the shared map score rules."""
    now_iso = datetime.now(timezone.utc).isoformat()
    risk_zones: List[RiskZone] = []

    # Fetch city-wide elevation points in parallel
    coords = [zone["centroid"] for zone in REAL_ZONES_METADATA]
    elevation_res = await get_real_elevations(coords)
    elevations = elevation_res.get("data", [])

    for i, zone_meta in enumerate(REAL_ZONES_METADATA):
        c_lat, c_lng = zone_meta["centroid"]
        
        # Live weather forecast at centroid
        weather_res = await get_real_weather_forecast(c_lat, c_lng)
        weather_data = weather_res.get("data") or {}
        daily = weather_data.get("daily", {})
        
        precip_sums = daily.get("precipitation_sum", [0.0])
        rainfall_24h = precip_sums[0] if precip_sums and precip_sums[0] is not None else 0.0
        
        precip_probs = daily.get("precipitation_probability_max", [0.0])
        precip_prob_max = precip_probs[0] if precip_probs and precip_probs[0] is not None else 0.0
        
        wind_speeds = daily.get("wind_speed_10m_max", [0.0])
        wind_max = wind_speeds[0] if wind_speeds and wind_speeds[0] is not None else 0.0

        # Live GloFAS river discharge
        flood_res = await get_real_river_discharge(c_lat, c_lng)
        flood_data = flood_res.get("data") or {}
        river_daily = flood_data.get("daily", {}).get("river_discharge", [None])
        river_discharge = river_daily[0] if river_daily and river_daily[0] is not None else None

        # Elevation
        elev_m = None
        if i < len(elevations) and elevations[i]:
            elev_m = elevations[i].get("elevation")

        if include_rule_score:
            risk_level, explanation = calculate_zone_risk(
                rainfall_24h=rainfall_24h,
                precip_prob_max=precip_prob_max,
                wind_max_kmh=wind_max,
                river_discharge=river_discharge,
                elevation_m=elev_m,
                historical_flood=zone_meta["historical_flood_prone"]
            )
        else:
            risk_level = None
            explanation = RiskExplanation(
                rainfall_24h_mm=rainfall_24h,
                max_precipitation_probability=precip_prob_max,
                wind_max_kmh=wind_max,
                river_discharge_m3s=river_discharge,
                mean_elevation_m=elev_m,
                historical_flood_prone=zone_meta["historical_flood_prone"],
                why_this="Raw live observations only; no weighted map score calculated for Predict.",
            )

        sources = ["Open-Meteo Weather API", "Open-Meteo GloFAS Flood API"]
        if elev_m is not None:
            sources.append("Open-Elevation API")
        if zone_meta["historical_flood_prone"]:
            sources.append("Hyderabad Traffic Police waterlogging points (as of 2025-08-06)")

        risk_zones.append(
            RiskZone(
                id=zone_meta["id"],
                name=zone_meta["name"],
                risk_level=risk_level,
                polygon={"type": "Point", "coordinates": [c_lng, c_lat]},
                population=None,  # Rule 4: population may be null when no real source is available. Do not guess it.
                derived_from=sources,
                computed_at=now_iso,
                explanation=explanation
            )
        )

    return risk_zones

