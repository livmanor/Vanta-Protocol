"""Triage order uses only the incident fields and a supplied zone risk. Nothing is stored."""
from datetime import datetime, timedelta, timezone

from backend.models import Incident, RiskZone
from backend.services.triage import rank_incidents

NOW = datetime(2026, 11, 17, 12, 0, tzinfo=timezone.utc)


def _incident(incident_id, **overrides):
    values = {
        "id": incident_id,
        "lat": 17.39144,
        "lng": 78.470213,
        "type": "flood",
        "urgency": 2,
        "people": 0,
        "vulnerable": False,
        "message": "fixture text that triage must not rank on",
        "timestamp": NOW.isoformat(),
        "status": "new",
        "source": "test",
    }
    values.update(overrides)
    return Incident(**values)


def _zone(level):
    return RiskZone(
        id="hyd-hotspot-nampally-metro",
        name="Nampally",
        risk_level=level,
        polygon={"type": "Point", "coordinates": [78.470213, 17.39144]},
        population=None,
        derived_from=["test"],
        computed_at=NOW.isoformat(),
    )


def test_life_safety_report_ranks_above_a_road_block_and_a_resolved_report_is_omitted():
    trapped = _incident("trapped", type="trapped", urgency=5, people=8, vulnerable=True)
    flood = _incident("flood", type="flood", urgency=3, people=1, vulnerable=False)
    road = _incident("road", type="road_blocked", urgency=1, people=0, timestamp=(NOW - timedelta(hours=30)).isoformat())
    resolved = _incident("done", type="medical", urgency=5, people=10, vulnerable=True, status="resolved")
    ranked = rank_incidents([road, resolved, flood, trapped], [_zone(4)], NOW)
    assert [item.incident_id for item in ranked] == ["trapped", "flood", "road"]
    assert [item.rank for item in ranked] == [1, 2, 3]
    assert ranked[0].score > ranked[1].score > ranked[2].score
    assert "Model output, not a confirmed fact." in ranked[0].why_this
    assert "Type trapped +30" in ranked[0].why_this
    assert "Urgency 5 +50" in ranked[0].why_this
    assert "does not assign a unit" in ranked[0].why_this
    assert "fixture text" not in ranked[0].why_this


def test_missing_zone_risk_adds_nothing_and_a_fresh_report_outranks_an_older_one():
    fresh = _incident("fresh")
    older = _incident("older", timestamp=(NOW - timedelta(hours=3)).isoformat())
    away = _incident("away", lat=17.20, lng=78.30)
    ranked = rank_incidents([older, away, fresh], [_zone(None)], NOW)
    by_id = {item.incident_id: item for item in ranked}
    assert by_id["fresh"].rank < by_id["older"].rank
    assert "Zone risk unavailable +0" in by_id["away"].why_this
    assert by_id["fresh"].score == by_id["away"].score
