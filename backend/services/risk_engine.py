"""Urban flood and cyclone wind risk engine.

Design contracts (vanta-upgrade):
  - PredictionResult is the single output type for every hazard.
  - Urban flood and cyclone wind are SEPARATE. Wind never bumps the flood score.
  - probability is None unless a calibrated ML model is active (method="ml").
  - Rule-based paths: method="rule_based", model_version="none", probability=None.
  - A missing rainfall feed → category=None, summary says why. Never infer zero.
  - Heat is a third, independent hazard computed separately.
"""
from __future__ import annotations

import asyncio
import logging
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional, Tuple

from backend.config import settings
from backend.models import (
    ContributingFactor,
    CycloneWindResult,
    DataFreshness,
    PredictionResult,
    RiskExplanation,
    RiskZone,
)

logger = logging.getLogger("vanta.risk_engine")

# IMD rainfall categories (national standard, not locally calibrated)
_RAIN_THRESHOLDS = [
    (204.4, 5, "Extremely Heavy Rain"),
    (115.5, 4, "Very Heavy Rain"),
    (64.5,  3, "Heavy Rain"),
    (25.0,  2, "Moderate Rain (Watch)"),
    (0.0,   1, "No significant rain"),
]

# Cyclone wind categories (IMD Beaufort / cyclone scale)
_WIND_THRESHOLDS = [
    (119.0, 5, "Cyclonic Storm"),
    (88.0,  4, "Deep Depression"),
    (62.0,  3, "Cyclonic Circulation"),
    (45.0,  2, "Strong Wind"),
    (0.0,   1, "Normal Wind"),
]

# Heat thresholds are read from settings (IMD plains standard, not flood-related)

RULE_BASED_VERSION = "none"


# ── helpers ────────────────────────────────────────────────────────────────────

def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _rain_category(mm: Optional[float]) -> Optional[int]:
    if mm is None:
        return None
    for threshold, cat, _ in _RAIN_THRESHOLDS:
        if mm >= threshold:
            return cat
    return 1


def _wind_category(kmh: Optional[float]) -> Optional[int]:
    if kmh is None:
        return None
    for threshold, cat, _ in _WIND_THRESHOLDS:
        if kmh >= threshold:
            return cat
    return 1


def _wind_label(kmh: Optional[float]) -> str:
    if kmh is None:
        return "unknown"
    for threshold, _, label in _WIND_THRESHOLDS:
        if kmh >= threshold:
            return label
    return "Normal Wind"


# ── Urban flood score (no wind component) ──────────────────────────────────────

def score_urban_flood(
    rainfall_24h: Optional[float],
    rainfall_48h: Optional[float],
    river_discharge: Optional[float],
    historical_flood: bool,
    low_lying: bool = False,
    elevation_m: Optional[float] = None,
    # kept for caller compat – NOT used in flood score
    htp_severity: Optional[str] = None,
    weather_status: Optional[str] = None,
    weather_last_updated: Optional[str] = None,
) -> Tuple[Optional[int], Optional[float], List[ContributingFactor], List[str]]:
    """Return (category 1-5, raw_score, factors, missing_warnings).

    Wind is NOT a factor here. Category is None when both rain fields are absent.
    Thresholds are IMD national standards + transparent demonstration values for
    accumulation and discharge. Not locally calibrated.
    """
    warnings: List[str] = []
    factors: List[ContributingFactor] = []

    if rainfall_24h is None and rainfall_48h is None:
        warnings.append("Rainfall data unavailable; urban flood category withheld.")
        return None, None, factors, warnings

    score = 1.0  # base level

    # 1. 24-hour forecast rainfall (IMD scale: Heavy ≥64.5, Very Heavy ≥115.5 mm)
    if rainfall_24h is not None:
        if rainfall_24h >= 115.5:
            score += 1.5
        elif rainfall_24h >= 64.5:
            score += 1.0
        elif rainfall_24h >= 25.0:
            score += 0.5
        factors.append(ContributingFactor(
            name="forecast_rainfall_24h", value=rainfall_24h, unit="mm",
            note="IMD category applied"
        ))
    else:
        warnings.append("24-hour forecast rainfall unavailable; using 48-hour accumulation only.")

    # 2. 48-hour accumulation (adds context, not a primary trigger)
    if rainfall_48h is not None:
        if rainfall_48h >= 100.0:
            score += 0.75
        elif rainfall_48h >= 50.0:
            score += 0.5
        elif rainfall_48h >= 25.0:
            score += 0.25
        factors.append(ContributingFactor(
            name="rainfall_accumulation_48h", value=rainfall_48h, unit="mm",
            note="Demonstration threshold; not locally validated"
        ))
    else:
        warnings.append("48-hour rainfall accumulation unavailable.")

    # 3. River discharge (GloFAS; threshold not hydrologically calibrated for Musi)
    if river_discharge is not None:
        if river_discharge > 25.0:
            score += 1.0
        elif river_discharge > 10.0:
            score += 0.5
        factors.append(ContributingFactor(
            name="river_discharge", value=river_discharge, unit="m3/s",
            note="GloFAS; threshold not calibrated for Musi basin"
        ))
    else:
        warnings.append("River discharge unavailable.")

    # 4. HTP waterlogging hotspot (published vulnerability)
    if historical_flood:
        score += 0.5
        sev = (htp_severity or "major").lower()
        factors.append(ContributingFactor(
            name="htp_waterlogging_hotspot", note=f"HTP severity: {sev}"
        ))

    # 5. Low-lying (below city median elevation in the grid path)
    if low_lying and elevation_m is not None:
        score += 0.5
        factors.append(ContributingFactor(
            name="low_lying", value=elevation_m, unit="m",
            note="Below city median; drainage path risk"
        ))
    elif elevation_m is not None:
        factors.append(ContributingFactor(
            name="terrain_elevation", value=elevation_m, unit="m",
            note="Context only; no absolute threshold applied for inland city"
        ))

    raw_score = round(score, 2)
    category = min(5, max(1, round(score)))
    return category, raw_score, factors, warnings


# ── Cyclone / wind hazard (completely separate) ────────────────────────────────

def score_cyclone_wind(
    wind_speed_kmh: Optional[float],
    wind_gusts_kmh: Optional[float],
    location_id: str,
    location_name: str,
    lat: float,
    lon: float,
) -> CycloneWindResult:
    """Cyclone wind result. Never mixed into the urban flood score."""
    warnings: List[str] = []
    if wind_speed_kmh is None and wind_gusts_kmh is None:
        warnings.append("Wind data unavailable; cyclone category withheld.")

    effective = wind_gusts_kmh if wind_gusts_kmh is not None else wind_speed_kmh
    category = _wind_category(effective)
    label = _wind_label(effective)
    summary = (
        f"Wind: {wind_speed_kmh:.1f} km/h sustained, {wind_gusts_kmh:.1f} km/h gusts. "
        f"Category: {category} — {label}."
        if wind_speed_kmh is not None and wind_gusts_kmh is not None
        else f"Wind category {category} — {label}." if category else "Wind data unavailable."
    )

    return CycloneWindResult(
        location_id=location_id,
        location_name=location_name,
        lat=lat,
        lon=lon,
        timestamp=_now_iso(),
        wind_speed_kmh=wind_speed_kmh,
        wind_gusts_kmh=wind_gusts_kmh,
        category=category,
        summary=summary,
        missing_data_warnings=warnings,
    )


# ── Heat hazard (independent) ──────────────────────────────────────────────────

def score_heat(
    temperature_max_c: Optional[float],
    apparent_temperature_max_c: Optional[float],
    location_id: str,
    location_name: str,
    lat: float,
    lon: float,
) -> PredictionResult:
    """Heat hazard as a PredictionResult. Entirely separate from flood."""
    warnings: List[str] = []
    factors: List[ContributingFactor] = []
    plain = settings.HEAT_PLAIN_THRESHOLD_C
    severe = settings.HEAT_SEVERE_APPARENT_THRESHOLD_C
    category: Optional[int] = None
    notes: List[str] = []

    if temperature_max_c is None and apparent_temperature_max_c is None:
        warnings.append("Temperature data unavailable; heat category withheld.")
    else:
        if temperature_max_c is not None:
            factors.append(ContributingFactor(
                name="temperature_max", value=temperature_max_c, unit="C"
            ))
            if temperature_max_c >= plain:
                notes.append(f"Daily max {temperature_max_c:.1f}°C ≥ {plain:g}°C (IMD plains heatwave)")
                category = max(category or 0, 3)
        if apparent_temperature_max_c is not None:
            factors.append(ContributingFactor(
                name="apparent_temperature_max", value=apparent_temperature_max_c, unit="C"
            ))
            if apparent_temperature_max_c >= severe:
                notes.append(f"Feels-like {apparent_temperature_max_c:.1f}°C ≥ {severe:g}°C (severe heat screen)")
                category = max(category or 0, 4)
        if category is None:
            category = 1
            notes.append(f"Below {plain:g}°C plain heatwave threshold")

    summary = " | ".join(notes) if notes else "Heat screening unavailable."

    return PredictionResult(
        hazard="heat",
        location_id=location_id,
        location_name=location_name,
        lat=lat,
        lon=lon,
        timestamp=_now_iso(),
        forecast_window_h=24,
        category=category,
        probability=None,
        method="rule_based",
        model_version=RULE_BASED_VERSION,
        contributing_factors=factors,
        missing_data_warnings=warnings,
        summary=summary,
    )


# ── Unified public entry point ─────────────────────────────────────────────────

def build_flood_prediction(
    location_id: str,
    location_name: str,
    lat: float,
    lon: float,
    rainfall_24h: Optional[float],
    rainfall_48h: Optional[float],
    river_discharge: Optional[float],
    historical_flood: bool,
    low_lying: bool = False,
    elevation_m: Optional[float] = None,
    htp_severity: Optional[str] = None,
    weather_status: Optional[str] = None,
    weather_last_updated: Optional[str] = None,
    temperature_max_c: Optional[float] = None,
    apparent_temperature_max_c: Optional[float] = None,
    wind_speed_kmh: Optional[float] = None,
    wind_gusts_kmh: Optional[float] = None,
    precip_prob_max: Optional[float] = None,
) -> Tuple[PredictionResult, CycloneWindResult, PredictionResult]:
    """Return (flood_result, wind_result, heat_result) — three independent hazards."""
    category, raw_score, factors, warnings = score_urban_flood(
        rainfall_24h=rainfall_24h,
        rainfall_48h=rainfall_48h,
        river_discharge=river_discharge,
        historical_flood=historical_flood,
        low_lying=low_lying,
        elevation_m=elevation_m,
        htp_severity=htp_severity,
        weather_status=weather_status,
        weather_last_updated=weather_last_updated,
    )

    if precip_prob_max is not None:
        factors.append(ContributingFactor(
            name="precipitation_probability_max", value=precip_prob_max, unit="%"
        ))

    freshness: List[DataFreshness] = []
    if weather_status:
        freshness.append(DataFreshness(
            source="Open-Meteo Forecast API",
            status=weather_status,  # type: ignore[arg-type]
            fetched_at=weather_last_updated,
        ))

    if category is None:
        summary = "Rainfall data unavailable; urban flood category withheld. " + " ".join(warnings)
    else:
        reason_parts = [
            f"{f.name}={f.value}{f.unit or ''}" for f in factors
            if f.value is not None
        ]
        summary = (
            f"Urban flood category {category} (raw={raw_score}). "
            + (", ".join(reason_parts) if reason_parts else "No elevated thresholds crossed.")
        )

    flood = PredictionResult(
        hazard="urban_flood",
        location_id=location_id,
        location_name=location_name,
        lat=lat,
        lon=lon,
        timestamp=_now_iso(),
        forecast_window_h=24,
        category=category,
        probability=None,       # rule-based: never set probability
        method="rule_based",
        model_version=RULE_BASED_VERSION,
        contributing_factors=factors,
        data_freshness=freshness,
        missing_data_warnings=warnings,
        summary=summary,
    )

    wind = score_cyclone_wind(
        wind_speed_kmh=wind_speed_kmh,
        wind_gusts_kmh=wind_gusts_kmh,
        location_id=location_id,
        location_name=location_name,
        lat=lat,
        lon=lon,
    )

    heat = score_heat(
        temperature_max_c=temperature_max_c,
        apparent_temperature_max_c=apparent_temperature_max_c,
        location_id=location_id,
        location_name=location_name,
        lat=lat,
        lon=lon,
    )

    return flood, wind, heat


# ── Legacy adapters (keep existing callers working) ────────────────────────────
# score_observations / calculate_zone_risk / compute_real_risk_zones are called
# by grid.py, routers/risk.py, and agent workflows. They are thin wrappers that
# delegate to the new engine and convert to the old RiskExplanation / RiskZone
# shapes so no frontend contract breaks.

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
    htp_severity: Optional[str] = None,
) -> Tuple[Optional[int], Optional[float], RiskExplanation]:
    """Legacy interface used by grid.py and test_risk_score.py.

    Returns (level, raw_score, RiskExplanation).
    Wind is NO LONGER part of the flood score. The wind_max_kmh parameter is
    ignored for the flood level but is preserved in the explanation for transparency.
    """
    category, raw_score, factors, warnings = score_urban_flood(
        rainfall_24h=rainfall_24h,
        rainfall_48h=rainfall_48h,
        river_discharge=river_discharge,
        historical_flood=historical_flood,
        low_lying=low_lying,
        elevation_m=elevation_m,
        htp_severity=htp_severity,
        weather_status=weather_status,
        weather_last_updated=weather_last_updated,
    )

    heat_note = describe_heat(temperature_max_c, apparent_temperature_max_c)

    if category is None:
        return None, None, RiskExplanation(
            rainfall_24h_mm=None,
            rainfall_48h_mm=None,
            weather_status=weather_status or "failed",
            weather_last_updated=weather_last_updated,
            max_precipitation_probability=precip_prob_max,
            wind_max_kmh=wind_max_kmh,
            river_discharge_m3s=river_discharge,
            mean_elevation_m=elevation_m,
            historical_flood_prone=historical_flood,
            why_this="Rainfall data unavailable; urban flood level withheld. " + heat_note,
            heat_temperature_max_c=temperature_max_c,
            heat_apparent_max_c=apparent_temperature_max_c,
            heat_note=heat_note,
        )

    factor_parts: List[str] = []
    for f in factors:
        if f.value is not None:
            factor_parts.append(f"{f.name}: {f.value:.1f} {f.unit or ''}")
        elif f.note:
            factor_parts.append(f.note)
    why_this = " | ".join(factor_parts) if factor_parts else "No elevated thresholds crossed."
    if wind_max_kmh is not None:
        why_this += f" Wind {wind_max_kmh:.1f} km/h (not part of flood score; see cyclone assessment)."
    why_this += f" {heat_note}"

    return category, raw_score, RiskExplanation(
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


def describe_heat(
    temperature_max_c: Optional[float],
    apparent_temperature_max_c: Optional[float],
) -> str:
    """Standalone heat description for legacy callers (grid.py, etc.).

    Wording is pinned to match test_heat.py assertions — do not change formatting.
    Heat is a SEPARATE hazard; it never contributes to the flood level.
    """
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
    htp_severity: Optional[str] = None,
) -> Tuple[Optional[int], RiskExplanation]:
    """Legacy wrapper for HTP hotspot scoring (compute_real_risk_zones)."""
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
        htp_severity=htp_severity,
    )
    return level, explanation


# ── HTP zone scoring (kept from original, now delegates cleanly) ───────────────

def load_hotspot_catalog() -> List[Dict[str, Any]]:
    from backend.data_sources.htp_waterlogging import get_hotspot_catalog
    return get_hotspot_catalog()


REAL_ZONES_METADATA: List[Any] = []  # deprecated alias kept for import compat


async def compute_real_risk_zones(include_rule_score: bool = True) -> List[RiskZone]:
    """HTP hotspot zones. Weather sampled at city centroid (rate-limit workaround).

    All HTP points share the same Open-Meteo sample. The why_this field discloses
    this explicitly. Wind is excluded from the flood level.
    """
    from backend.data_sources.htp_waterlogging import ensure_catalog, get_hotspot_catalog
    from backend.data_sources.open_meteo import (
        get_real_river_discharge,
        get_real_weather_forecast,
        sum_hourly_precipitation_last_48h,
        today_daily_value,
    )
    from backend.data_sources.elevation import get_real_elevations

    catalog = await ensure_catalog()
    now_iso = _now_iso()
    if not catalog:
        return []

    coords = [zone["centroid"] for zone in catalog]

    # ── Per-cell weather for HTP hotspots ──────────────────────────────────────
    # Open-Meteo ~0.1° cells: deduplicate HTP points that share a weather cell
    # so we only issue O(unique-cells) requests, not O(60+) requests.
    # Cache key: rounded to 2 decimal places ≈ 1 km unique grid cell resolution.
    _cell_key = lambda lat, lng: (round(lat, 2), round(lng, 2))
    unique_cells: Dict[tuple, None] = {}
    for zone_meta in catalog:
        c_lat, c_lng = zone_meta["centroid"]
        unique_cells[_cell_key(c_lat, c_lng)] = None

    _weather_semaphore_local = asyncio.Semaphore(3)  # limit concurrent OM calls

    async def _fetch_weather_for_cell(lat: float, lng: float) -> dict:
        cache_key = f"htp_cell_wx_{lat:.2f}_{lng:.2f}"
        from backend.cache import global_cache as _gc
        cached = _gc.get(cache_key)
        if cached and not cached[2]:
            return cached[0]
        async with _weather_semaphore_local:
            try:
                res = await get_real_weather_forecast(lat, lng)
                _gc.set(cache_key, res, settings.WEATHER_CACHE_TTL,
                        datetime.now(timezone.utc).isoformat())
                return res
            except Exception as exc:
                logger.warning("HTP per-cell weather failed for %.3f,%.3f: %s", lat, lng, exc)
                if cached:
                    return {**cached[0], "status": "stale"}
                return {"data": {}, "status": "failed", "last_updated": None}

    cell_weather_results = await asyncio.gather(
        *[_fetch_weather_for_cell(lat, lng) for lat, lng in unique_cells],
        return_exceptions=True,
    )
    cell_weather_map: Dict[tuple, dict] = {}
    for key, res in zip(unique_cells.keys(), cell_weather_results):
        cell_weather_map[key] = (
            {"data": {}, "status": "failed", "last_updated": None}
            if isinstance(res, Exception) else res
        )

    elevation_res, flood_res = await asyncio.gather(
        get_real_elevations(coords),
        get_real_river_discharge(float(settings.DEFAULT_LAT), float(settings.DEFAULT_LNG)),
        return_exceptions=True,
    )

    if isinstance(elevation_res, Exception):
        elevation_res = {"data": [], "status": "failed"}
    if isinstance(flood_res, Exception):
        flood_res = {"data": {}, "status": "failed", "last_updated": None}

    elevations = elevation_res.get("data") or []
    flood_data = flood_res.get("data") or {}
    river_daily = flood_data.get("daily", {}).get("river_discharge", [None])
    river_discharge = river_daily[0] if river_daily and river_daily[0] is not None else None

    risk_zones: List[RiskZone] = []
    for i, zone_meta in enumerate(catalog):
        c_lat, c_lng = zone_meta["centroid"]
        elev_m = None
        if i < len(elevations) and elevations[i]:
            elev_m = elevations[i].get("elevation")

        severity = (zone_meta.get("htp_severity") or zone_meta.get("source_severity") or "major").lower()
        zone_label = zone_meta.get("htp_zone") or "GHMC"
        area_label = zone_meta.get("htp_area") or ""

        # Use this cell's own weather reading
        wx_res = cell_weather_map.get(_cell_key(c_lat, c_lng),
                                      {"data": {}, "status": "failed", "last_updated": None})
        wx_data = wx_res.get("data") or {}
        rainfall_24h = today_daily_value(wx_data, "precipitation_sum")
        rainfall_48h = sum_hourly_precipitation_last_48h(wx_data)
        precip_prob_max = today_daily_value(wx_data, "precipitation_probability_max")
        wind_max = today_daily_value(wx_data, "wind_speed_10m_max")
        temperature_max = today_daily_value(wx_data, "temperature_2m_max")
        apparent_max = today_daily_value(wx_data, "apparent_temperature_max")

        weather_note = (
            f"Weather fetched at this point's Open-Meteo cell "
            f"({c_lat:.2f},{c_lng:.2f}), status: {wx_res.get('status')}. "
            "Wind excluded from flood score (see separate cyclone assessment)."
        )

        if include_rule_score:
            risk_level, explanation = calculate_zone_risk(
                rainfall_24h=rainfall_24h,
                precip_prob_max=precip_prob_max,
                wind_max_kmh=wind_max,
                river_discharge=river_discharge,
                elevation_m=elev_m,
                historical_flood=zone_meta["historical_flood_prone"],
                rainfall_48h=rainfall_48h,
                weather_status=wx_res.get("status"),
                weather_last_updated=wx_res.get("last_updated"),
                temperature_max_c=temperature_max,
                apparent_temperature_max_c=apparent_max,
                htp_severity=severity,
            )
            explanation.why_this = (
                f"HTP {zone_label}"
                + (f" / {area_label}" if area_label else "")
                + f" · {severity} severity. "
                + explanation.why_this
                + " "
                + weather_note
            )
        else:
            risk_level = None
            heat_note = describe_heat(temperature_max, apparent_max)
            explanation = RiskExplanation(
                rainfall_24h_mm=rainfall_24h,
                rainfall_48h_mm=rainfall_48h,
                weather_status=wx_res.get("status"),
                weather_last_updated=wx_res.get("last_updated"),
                max_precipitation_probability=precip_prob_max,
                wind_max_kmh=wind_max,
                river_discharge_m3s=river_discharge,
                mean_elevation_m=elev_m,
                historical_flood_prone=zone_meta["historical_flood_prone"],
                why_this=(
                    "Raw live observations only; no weighted map score for Predict. "
                    f"HTP {zone_label} · {severity} severity. {heat_note} {weather_note}"
                ),
                heat_temperature_max_c=temperature_max,
                heat_apparent_max_c=apparent_max,
                heat_note=heat_note,
            )

        sources = ["Open-Meteo Weather API", "Open-Meteo GloFAS Flood API"]
        if elev_m is not None:
            sources.append("Open-Elevation API")
        if zone_meta["historical_flood_prone"]:
            as_of = zone_meta.get("list_as_of") or "live"
            sources.append(f"Hyderabad Traffic Police waterlogging points ({as_of})")

        display_name = f"{zone_meta['name']} · {severity.title()} · {zone_label}"
        risk_zones.append(RiskZone(
            id=zone_meta["id"],
            name=display_name,
            risk_level=risk_level,
            polygon={"type": "Point", "coordinates": [c_lng, c_lat]},
            population=None,
            derived_from=sources,
            computed_at=now_iso,
            explanation=explanation,
        ))

    return risk_zones
