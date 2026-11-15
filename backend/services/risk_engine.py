import asyncio
from datetime import datetime, timezone
from typing import List, Dict, Any, Optional
from backend.config import settings
from backend.models import RiskZone, RiskExplanation
from backend.data_sources.open_meteo import get_real_weather_forecast, get_real_river_discharge, sum_hourly_precipitation_last_48h, today_daily_value
from backend.data_sources.elevation import get_real_elevations

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

def score_observations(
    rainfall_24h: Optional[float],
    precip_prob_max: Optional[float],
    wind_max_kmh: Optional[float],
    river_discharge: Optional[float],
    elevation_m: Optional[float],
    historical_flood: bool,
    rainfall_48h: Optional[float] = None,
    weather_status: Optional[str] = None,
    weather_last_updated: Optional[str] = None,
    low_lying: bool = False,
) -> tuple[Optional[int], Optional[float], RiskExplanation]:
    """Calculates risk level 1-5 with transparent explainability.
    
    Screening factors are additive and are not statistically calibrated:
    forecast rainfall, recent 48h accumulation, wind, river discharge, and
    published hotspot history. Elevation is context only for this inland city.
    Absolute elevation is retained as context only; it does not rank inland
    Hyderabad hotspots. This is a screening heuristic, not a calibrated forecast.
    """
    if rainfall_24h is None and rainfall_48h is None:
        explanation = RiskExplanation(
            rainfall_24h_mm=None, rainfall_48h_mm=None,
            weather_status=weather_status or "failed", weather_last_updated=weather_last_updated,
            max_precipitation_probability=precip_prob_max, wind_max_kmh=wind_max_kmh,
            river_discharge_m3s=river_discharge, mean_elevation_m=elevation_m,
            historical_flood_prone=historical_flood,
            why_this="Rainfall data unavailable; numerical risk withheld. Verify the weather feed and local conditions.",
        )
        return None, None, explanation

    score = 1.0  # Base level 1 (Low)

    # 1. Rainfall score (0 to 1.5)
    # IMD standards: >64.5mm Heavy, >115.5mm Very Heavy, >204.4mm Extremely Heavy
    if rainfall_24h is not None and rainfall_24h >= 115.5:
        score += 1.5
    elif rainfall_24h is not None and rainfall_24h >= 64.5:
        score += 1.0
    elif rainfall_24h is not None and rainfall_24h >= 25.0:
        score += 0.5

    # Past accumulation adds context when prolonged rain persists. These are
    # transparent demonstration thresholds, not locally validated triggers.
    if rainfall_48h is not None:
        if rainfall_48h >= 100.0:
            score += 0.75
        elif rainfall_48h >= 50.0:
            score += 0.5
        elif rainfall_48h >= 25.0:
            score += 0.25

    # 2. Wind / Cyclone factor (0 to 1.0)
    # >62 km/h is deep depression / cyclonic storm
    if wind_max_kmh is not None and wind_max_kmh >= 62.0:
        score += 1.0
    elif wind_max_kmh is not None and wind_max_kmh >= 45.0:
        score += 0.5

    # 3. River discharge (0 to 1.0)
    if river_discharge is not None and river_discharge > 25.0:
        score += 1.0
    elif river_discharge is not None and river_discharge > 10.0:
        score += 0.5

    # 4. Published major waterlogging hotspot (0 to 0.5)
    if historical_flood:
        score += 0.5

    # Grid cells below the city median sit in the drainage path more often.
    # Named hotspots leave this off so their existing levels stay unchanged.
    if low_lying and elevation_m is not None:
        score += 0.5

    raw_score = round(score, 2)
    final_level = min(5, max(1, round(score)))

    reasons = []
    if rainfall_24h is not None and rainfall_24h > 20:
        reasons.append(f"Forecast 24h rainfall: {rainfall_24h:.1f} mm")
    if rainfall_48h is not None:
        reasons.append(f"Estimated past 48h rainfall: {rainfall_48h:.1f} mm")
    if wind_max_kmh is not None and wind_max_kmh > 40:
        reasons.append(f"Max wind gusts: {wind_max_kmh:.1f} km/h")
    if river_discharge is not None:
        reasons.append(f"River discharge: {river_discharge:.1f} m³/s")
    if elevation_m is not None and low_lying:
        reasons.append(f"Below city median elevation ({elevation_m:.1f} m)")
    elif elevation_m is not None:
        reasons.append(f"Terrain elevation context: {elevation_m:.1f} m; not used as an absolute flood threshold")
    if historical_flood:
        reasons.append("Hyderabad Traffic Police major waterlogging hotspot (2025 list)")

    why_this = " | ".join(reasons) if reasons else "No elevated screening threshold crossed by the available weather and operational inputs."

    explanation = RiskExplanation(
        rainfall_24h_mm=rainfall_24h,
        rainfall_48h_mm=rainfall_48h,
        weather_status=weather_status,
        weather_last_updated=weather_last_updated,
        max_precipitation_probability=precip_prob_max,
        wind_max_kmh=wind_max_kmh,
        river_discharge_m3s=river_discharge,
        mean_elevation_m=elevation_m,
        historical_flood_prone=historical_flood,
        why_this=why_this
    )
    return final_level, raw_score, explanation


def calculate_zone_risk(
    rainfall_24h: Optional[float],
    precip_prob_max: Optional[float],
    wind_max_kmh: Optional[float],
    river_discharge: Optional[float],
    elevation_m: Optional[float],
    historical_flood: bool,
    rainfall_48h: Optional[float] = None,
    weather_status: Optional[str] = None,
    weather_last_updated: Optional[str] = None,
    low_lying: bool = False,
) -> tuple[Optional[int], RiskExplanation]:
    """Level and explanation for the six named hotspots. Grid scoring uses score_observations."""
    level, _score, explanation = score_observations(
        rainfall_24h=rainfall_24h,
        precip_prob_max=precip_prob_max,
        wind_max_kmh=wind_max_kmh,
        river_discharge=river_discharge,
        elevation_m=elevation_m,
        historical_flood=historical_flood,
        rainfall_48h=rainfall_48h,
        weather_status=weather_status,
        weather_last_updated=weather_last_updated,
        low_lying=low_lying,
    )
    return level, explanation

async def compute_real_risk_zones(include_rule_score: bool = True) -> List[RiskZone]:
    """Collect live zone observations, optionally applying the shared map score rules.

    All per-zone HTTP calls are issued in parallel (asyncio.gather) to cut wall-clock
    time from ~20-35 s (sequential) down to ~3-6 s (parallel).
    """
    now_iso = datetime.now(timezone.utc).isoformat()
    coords = [zone["centroid"] for zone in REAL_ZONES_METADATA]

    # Fire all network calls at once — elevation (1 batch), weather × N, flood × N
    elevation_res, *zone_results = await asyncio.gather(
        get_real_elevations(coords),
        *[
            asyncio.gather(
                get_real_weather_forecast(lat, lng),
                get_real_river_discharge(lat, lng),
            )
            for lat, lng in coords
        ],
        return_exceptions=False,
    )

    elevations = elevation_res.get("data") or []
    risk_zones: List[RiskZone] = []

    for i, zone_meta in enumerate(REAL_ZONES_METADATA):
        c_lat, c_lng = zone_meta["centroid"]
        weather_res, flood_res = zone_results[i]

        weather_data = weather_res.get("data") or {}
        rainfall_24h = today_daily_value(weather_data, "precipitation_sum")
        rainfall_48h = sum_hourly_precipitation_last_48h(weather_data)

        precip_prob_max = today_daily_value(weather_data, "precipitation_probability_max")

        wind_max = today_daily_value(weather_data, "wind_speed_10m_max")

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
                historical_flood=zone_meta["historical_flood_prone"],
                rainfall_48h=rainfall_48h,
                weather_status=weather_res.get("status"),
                weather_last_updated=weather_res.get("last_updated"),
            )
        else:
            risk_level = None
            explanation = RiskExplanation(
                rainfall_24h_mm=rainfall_24h,
                rainfall_48h_mm=rainfall_48h,
                weather_status=weather_res.get("status"),
                weather_last_updated=weather_res.get("last_updated"),
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

