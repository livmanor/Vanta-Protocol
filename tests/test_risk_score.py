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
    assert level_heavy == 2
    assert score_very == 2.75
    assert level_very == 3
