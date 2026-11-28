"""Screening score. A missing rainfall feed stays null and is never stored as 0 mm."""
from backend.services.risk_engine import score_observations


def _score(**kwargs):
    return score_observations(
        rainfall_24h=kwargs.get("rainfall_24h", 0.0),
        precip_prob_max=0,
        wind_max_kmh=10,
        river_discharge=1,
        elevation_m=500,
        historical_flood=False,
        rainfall_48h=kwargs.get("rainfall_48h", 0.0),
        low_lying=kwargs.get("low_lying", False),
    )


def test_failed_feed_withholds_the_level():
    level, score, explanation = score_observations(
        rainfall_24h=None,
        precip_prob_max=None,
        wind_max_kmh=None,
        river_discharge=None,
        elevation_m=500,
        historical_flood=True,
        rainfall_48h=None,
        weather_status="failed",
    )
    assert level is None
    assert score is None
    assert explanation.rainfall_24h_mm is None
    assert explanation.rainfall_48h_mm is None


def test_a_real_zero_stays_zero_and_nominal():
    level, score, explanation = _score(rainfall_24h=0.0, rainfall_48h=0.0)
    assert explanation.rainfall_48h_mm == 0.0
    assert score == 1.0
    assert level == 1


def test_watch_and_heavy_thresholds():
    level_25, score_25, _ = _score(rainfall_24h=25.0)
    level_heavy, score_heavy, _ = _score(rainfall_24h=64.5)
    level_very, score_very, _ = _score(rainfall_24h=115.5, rainfall_48h=25.0)
    assert score_25 == 1.5
    assert level_25 == 2
    assert score_heavy == 2.0
    assert level_heavy == 3   # IMD "Heavy Rain" (>=64.5 mm) is a hard floor of category 3
    assert score_very == 2.75
    assert level_very == 4    # IMD "Very Heavy Rain" (>=115.5 mm) is a hard floor of category 4


def test_htp_severity_differentiates_and_dry_hotspots_stay_l1():
    """HTP points are not a flat L2; major > minor; dry days stay category 1."""
    major_level, major_score, _ = score_observations(
        rainfall_24h=0.0, precip_prob_max=0, wind_max_kmh=10, river_discharge=1,
        elevation_m=500, historical_flood=True, rainfall_48h=0.0, htp_severity="major",
    )
    minor_level, minor_score, _ = score_observations(
        rainfall_24h=0.0, precip_prob_max=0, wind_max_kmh=10, river_discharge=1,
        elevation_m=500, historical_flood=True, rainfall_48h=0.0, htp_severity="minor",
    )
    assert major_level == 1
    assert minor_level == 1
    assert major_score > minor_score


# ── Regression tests: IMD floor, rounding, ML advisory ───────────────────────
from backend.services.risk_engine import score_urban_flood as _suf


def _cat(**kw):
    base = dict(rainfall_24h=0.0, rainfall_48h=0.0, river_discharge=0.0, historical_flood=False)
    base.update(kw)
    return _suf(**base)[0]


def test_imd_classes_are_a_floor_for_flood_category():
    assert _cat(rainfall_24h=70) >= 3      # Heavy
    assert _cat(rainfall_24h=120) >= 4     # Very heavy
    assert _cat(rainfall_24h=210) == 5     # Extremely heavy


def test_dry_day_with_hotspot_stays_category_one():
    assert _cat(rainfall_24h=0, historical_flood=True, htp_severity="major") == 1


def test_rounding_is_half_up_not_bankers():
    # 24h>=25 (+0.5) and 48h>=25 (+0.25)... score 1.75 -> 2; 2.5 must round to 3.
    cat, raw, *_ = _suf(rainfall_24h=70, rainfall_48h=60, river_discharge=0.0, historical_flood=False)
    assert raw == 2.5 and cat == 3


def test_ml_advisory_only_raises_and_is_labelled():
    base = _cat(rainfall_24h=30)
    cat, _raw, factors, _w = _suf(rainfall_24h=30, rainfall_48h=0.0, river_discharge=0.0,
                                   historical_flood=False, ml_p_heavy=0.4)
    assert cat >= base
    assert any(f.name == "ml_p_heavy_rain" for f in factors)
    assert _suf(rainfall_24h=30, rainfall_48h=0.0, river_discharge=0.0,
                historical_flood=False, ml_p_heavy=0.0)[0] == base
