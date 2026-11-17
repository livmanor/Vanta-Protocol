import asyncio
import json
from datetime import datetime, timezone
from pathlib import Path
from typing import List, Dict, Any, Optional
from backend.config import settings
from backend.models import RiskZone, RiskExplanation
from backend.data_sources.open_meteo import get_real_weather_forecast, get_real_river_discharge, sum_hourly_precipitation_last_48h, today_daily_value
from backend.data_sources.elevation import get_real_elevations

def load_hotspot_catalog() -> List[Dict[str, Any]]:
    """Published HTP points. The file is a static reference list, not a live flood report."""
    path = Path(__file__).resolve().parents[2] / "data" / "hyderabad_hotspots.json"
    catalog = json.loads(path.read_text(encoding="utf-8"))
    zones = []
    for item in catalog["hotspots"]:
        lat, lon = item["centroid"]
        zones.append({
            **item,
            "centroid": (lat, lon),
            "list_label": catalog["label"],
            "list_as_of": catalog["as_of"],
            "list_source": catalog["source"],
        })
    return zones


REAL_ZONES_METADATA = load_hotspot_catalog()


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
    temperature_max_c: Optional[float] = None,
    apparent_temperature_max_c: Optional[float] = None,
) -> tuple[Optional[int], Optional[float], RiskExplanation]:
    """Calculates risk level 1-5 with transparent explainability.
    
    Screening factors are additive and are not statistically calibrated:
    forecast rainfall, recent 48h accumulation, wind, river discharge, and
    published hotspot history. Elevation is context only for this inland city.
    Absolute elevation is retained as context only; it does not rank inland
    Hyderabad hotspots. This is a screening heuristic, not a calibrated forecast.
    """
    heat_note = describe_heat(temperature_max_c, apparent_temperature_max_c)

    if rainfall_24h is None and rainfall_48h is None:
        explanation = RiskExplanation(
            rainfall_24h_mm=None, rainfall_48h_mm=None,
            weather_status=weather_status or "failed", weather_last_updated=weather_last_updated,
            max_precipitation_probability=precip_prob_max, wind_max_kmh=wind_max_kmh,
            river_discharge_m3s=river_discharge, mean_elevation_m=elevation_m,
            historical_flood_prone=historical_flood,
            why_this="Rainfall data unavailable; numerical risk withheld. Verify the weather feed and local conditions. " + heat_note,
            heat_temperature_max_c=temperature_max_c,
            heat_apparent_max_c=apparent_temperature_max_c,
            heat_note=heat_note,
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
    why_this = f"{why_this} {heat_note}"

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
        why_this=why_this,
        heat_temperature_max_c=temperature_max_c,
        heat_apparent_max_c=apparent_temperature_max_c,
        heat_note=heat_note,
    )
    return final_level, raw_score, explanation


def describe_heat(temperature_max_c: Optional[float], apparent_temperature_max_c: Optional[float]) -> str:
    """Separate heat screen. A missing temperature stays missing and does not become 0 C."""
    if temperature_max_c is None and apparent_temperature_max_c is None:
        return "Heat screening unavailable."
    plain = settings.HEAT_PLAIN_THRESHOLD_C
    severe = settings.HEAT_SEVERE_APPARENT_THRESHOLD_C
    temp_text = "unavailable" if temperature_max_c is None else f"{temperature_max_c:.1f} C"
    feels_text = "unavailable" if apparent_temperature_max_c is None else f"{apparent_temperature_max_c:.1f} C"
    crossed = []
    if temperature_max_c is not None and temperature_max_c >= plain:
        crossed.append(f"daily maximum meets the {plain:g} C plain heatwave screen")
    if apparent_temperature_max_c is not None and apparent_temperature_max_c >= severe:
        crossed.append(f"feels-like maximum meets the {severe:g} C severe-heat screen")
    outcome = "; ".join(crossed) if crossed else f"below the {plain:g} C plain heatwave screen"
    return (
        "Heat screening heuristic, separate from the flood level. "
        f"Daily maximum {temp_text}. Feels-like maximum {feels_text}. {outcome}."
    )


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
    temperature_max_c: Optional[float] = None,
    apparent_temperature_max_c: Optional[float] = None,
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
        temperature_max_c=temperature_max_c,
        apparent_temperature_max_c=apparent_temperature_max_c,
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
        temperature_max = today_daily_value(weather_data, "temperature_2m_max")
        apparent_max = today_daily_value(weather_data, "apparent_temperature_max")

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
                temperature_max_c=temperature_max,
                apparent_temperature_max_c=apparent_max,
            )
        else:
            risk_level = None
            heat_note = describe_heat(temperature_max, apparent_max)
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
                why_this="Raw live observations only; no weighted map score calculated for Predict. " + heat_note,
                heat_temperature_max_c=temperature_max,
                heat_apparent_max_c=apparent_max,
                heat_note=heat_note,
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

