"""Heat is reported beside the flood level. A missing temperature is not stored as 0 C."""
from backend.services.risk_engine import score_observations


def _dry(**kwargs):
    return score_observations(
        rainfall_24h=0.0,
        precip_prob_max=0,
        wind_max_kmh=10,
        river_discharge=1,
        elevation_m=500,
        historical_flood=False,
        rainfall_48h=0.0,
        temperature_max_c=kwargs.get("temperature_max_c"),
        apparent_temperature_max_c=kwargs.get("apparent_temperature_max_c"),
    )


def test_missing_heat_stays_null_and_does_not_change_the_flood_level():
    cool_level, cool_score, cool = _dry()
    missing_level, missing_score, missing = _dry(temperature_max_c=None, apparent_temperature_max_c=None)
    assert missing.heat_temperature_max_c is None
    assert missing.heat_apparent_max_c is None
    assert missing.heat_note == "Heat screening unavailable."
    assert missing_level == cool_level == 1
    assert missing_score == cool_score


def test_plain_heatwave_threshold_is_separate_from_the_flood_level():
    below_level, below_score, below = _dry(temperature_max_c=39.9, apparent_temperature_max_c=44.9)
    crossed_level, crossed_score, crossed = _dry(temperature_max_c=40.0, apparent_temperature_max_c=45.0)
    assert below_level == crossed_level
    assert below_score == crossed_score
    assert "below the 40 C plain heatwave screen" in below.heat_note
    assert "daily maximum meets the 40 C plain heatwave screen" in crossed.heat_note
    assert "feels-like maximum meets the 45 C severe-heat screen" in crossed.heat_note
    assert crossed.heat_temperature_max_c == 40.0
    assert "separate from the flood level" in crossed.why_this
