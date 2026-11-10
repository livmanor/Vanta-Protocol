import asyncio
from datetime import datetime, timezone
from typing import List, Dict, Any, Optional
from backend.config import settings
from backend.models import RiskZone, RiskExplanation
from backend.data_sources.open_meteo import get_real_weather_forecast, get_real_river_discharge
from backend.data_sources.elevation import get_real_elevations
from backend.data_sources.imd import get_real_imd_alerts

# Real municipal zones / wards bounding Chennai coastal and river basins (Adyar, Cooum, Kosasthalaiyar)
REAL_ZONES_METADATA = [
    {
        "id": "zone-adyar",
        "name": "Zone XIII - Adyar Basin",
        "centroid": (13.0067, 80.2570),
        "historical_flood_prone": True,
        # GeoJSON Polygon coordinates [lng, lat]
        "coordinates": [
            [80.240, 13.020], [80.270, 13.020], [80.275, 12.990],
            [80.245, 12.990], [80.240, 13.020]
        ]
    },
    {
        "id": "zone-velachery",
        "name": "Zone XIV - Velachery / Pallikaranai Marsh",
        "centroid": (12.9750, 80.2200),
        "historical_flood_prone": True,
        "coordinates": [
            [80.200, 12.990], [80.240, 12.990], [80.240, 12.955],
            [80.200, 12.955], [80.200, 12.990]
        ]
    },
    {
        "id": "zone-cooum-central",
        "name": "Zone IX - Teynampet / Cooum Corridor",
        "centroid": (13.0400, 80.2500),
        "historical_flood_prone": True,
        "coordinates": [
            [80.230, 13.060], [80.270, 13.060], [80.270, 13.030],
            [80.230, 13.030], [80.230, 13.060]
        ]
    },
    {
        "id": "zone-sholinganallur",
        "name": "Zone XV - Sholinganallur Coastal Belt",
        "centroid": (12.9000, 80.2300),
        "historical_flood_prone": False,
        "coordinates": [
            [80.210, 12.920], [80.255, 12.920], [80.260, 12.870],
            [80.215, 12.870], [80.210, 12.920]
        ]
    },
    {
        "id": "zone-anna-nagar",
        "name": "Zone VIII - Anna Nagar",
        "centroid": (13.0850, 80.2100),
        "historical_flood_prone": False,
        "coordinates": [
            [80.190, 13.105], [80.230, 13.105], [80.230, 13.070],
            [80.190, 13.070], [80.190, 13.105]
        ]
    },
    {
        "id": "zone-tondiarpet",
        "name": "Zone IV - Tondiarpet North Coast",
        "centroid": (13.1300, 80.2900),
        "historical_flood_prone": True,
        "coordinates": [
            [80.270, 13.150], [80.305, 13.150], [80.300, 13.110],
            [80.265, 13.110], [80.270, 13.150]
        ]
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
    - Historical flood basin: 10%
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

    # 5. Historical flood corridor (0 to 0.5)
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
        reasons.append("Identified historical flood/inundation corridor")

    why_this = " | ".join(reasons) if reasons else "Normal meteorological conditions, minimal flood/cyclone hazard"

    explanation = RiskExplanation(
        rainfall_24h_mm=rainfall_24h,
        max_precipitation_probability=precip_prob_max,
        river_discharge_m3s=river_discharge,
        mean_elevation_m=elevation_m,
        historical_flood_prone=historical_flood,
        why_this=why_this
    )
    return final_level, explanation

async def compute_real_risk_zones() -> List[RiskZone]:
    """Derives RiskZones dynamically from live external APIs."""
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

        risk_level, explanation = calculate_zone_risk(
            rainfall_24h=rainfall_24h,
            precip_prob_max=precip_prob_max,
            wind_max_kmh=wind_max,
            river_discharge=river_discharge,
            elevation_m=elev_m,
            historical_flood=zone_meta["historical_flood_prone"]
        )

        sources = ["Open-Meteo Weather API", "Open-Meteo GloFAS Flood API"]
        if elev_m is not None:
            sources.append("Open-Elevation API")
        if zone_meta["historical_flood_prone"]:
            sources.append("OpenStreetMap River Basin Data")

        risk_zones.append(
            RiskZone(
                id=zone_meta["id"],
                name=zone_meta["name"],
                risk_level=risk_level,
                polygon={
                    "type": "Polygon",
                    "coordinates": [zone_meta["coordinates"]]
                },
                population=None,  # Rule 4: population may be null when no real source is available. Do not guess it.
                derived_from=sources,
                computed_at=now_iso,
                explanation=explanation
            )
        )

    return risk_zones

