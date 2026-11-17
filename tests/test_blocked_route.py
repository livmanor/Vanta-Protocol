"""OSRM alternatives are rejected when they pass through an officer-reported closure.

The shelter list, the closure geometry, and the OSRM replies exist only in this file.
"""
import asyncio

from backend.models import BlockedRoad
from backend.services.routing import find_evacuation_route

START = (17.39, 78.47)
NEAR = {"name": "Near Shelter", "type": "shelter", "lat": 17.40, "lng": 78.48}
FAR = {"name": "Far Shelter", "type": "shelter", "lat": 17.42, "lng": 78.50}
DIRECT = {"type": "LineString", "coordinates": [[78.47, 17.39], [78.48, 17.40]]}
CLEAR = {
    "type": "LineString",
    "coordinates": [[78.47, 17.39], [78.47, 17.38], [78.49, 17.38], [78.49, 17.41], [78.48, 17.41], [78.48, 17.40]],
}
FAR_CLEAR = {"type": "LineString", "coordinates": [[78.47, 17.39], [78.40, 17.39], [78.40, 17.42], [78.50, 17.42]]}
CLOSURE = {
    "type": "LineString",
    "coordinates": [[78.47, 17.40], [78.48, 17.39]],
}


def _closure(name="Tank Bund", geometry=None):
    return BlockedRoad(
        id="block-test",
        name=name,
        geometry=geometry or CLOSURE,
        reason="water over the carriageway",
        reported_by="Control Room",
        timestamp="2026-11-17T08:00:00+00:00",
    )


def _osrm(distance, duration, geometry):
    return {"distance": distance, "duration": duration, "geometry": geometry}


def _install(monkeypatch, shelters, roads, routes_for):
    async def shelters_response():
        return {"status": "live", "last_updated": "2026-11-17T08:00:00+00:00", "data": shelters}

    async def blocked():
        return roads

    async def osrm(start_lng, start_lat, dest_lng, dest_lat):
        return routes_for(dest_lat, dest_lng)

    monkeypatch.setattr("backend.services.routing.get_real_shelters_and_stations", shelters_response)
    monkeypatch.setattr("backend.services.routing.fetch_blocked_roads", blocked)
    monkeypatch.setattr("backend.services.routing._request_osrm_routes", osrm)


def test_clean_alternative_is_chosen_over_the_blocked_fast_route(monkeypatch):
    def routes_for(dest_lat, dest_lng):
        assert abs(dest_lat - NEAR["lat"]) < 1e-6
        return [
            _osrm(1500, 100, DIRECT),
            _osrm(8000, 400, CLEAR),
        ]

    _install(monkeypatch, [NEAR, FAR], [_closure()], routes_for)
    route = asyncio.run(find_evacuation_route(*START, "zone-1", "Nampally"))
    assert route.shelter_name == "Near Shelter"
    assert route.duration_seconds == 400
    assert route.blocked_road_conflicts == []
    assert "2 alternatives checked, route avoids 1 officer-reported closures" in route.why_this
    assert "no resolved status" in route.why_this


def test_next_shelter_is_used_when_every_alternative_is_blocked(monkeypatch):
    seen = []

    def routes_for(dest_lat, dest_lng):
        seen.append(round(dest_lat, 2))
        if abs(dest_lat - NEAR["lat"]) < 1e-6:
            return [_osrm(1500, 100, DIRECT), _osrm(1600, 120, DIRECT)]
        return [_osrm(9000, 700, FAR_CLEAR)]

    _install(monkeypatch, [NEAR, FAR], [_closure()], routes_for)
    route = asyncio.run(find_evacuation_route(*START, "zone-1", "Nampally"))
    assert seen == [17.40, 17.42]
    assert route.shelter_name == "Far Shelter"
    assert route.blocked_road_conflicts == []
    assert "1 alternatives checked, route avoids 1 officer-reported closures" in route.why_this


def test_warning_when_every_shelter_route_crosses_a_closure(monkeypatch):
    point = {"type": "Point", "coordinates": [78.475, 17.395]}

    def routes_for(dest_lat, dest_lng):
        if abs(dest_lat - NEAR["lat"]) < 1e-6:
            return [_osrm(5000, 100, DIRECT)]
        return [_osrm(1000, 900, {"type": "LineString", "coordinates": [[78.47, 17.39], [78.475, 17.395], [78.50, 17.42]]})]

    _install(monkeypatch, [NEAR, FAR], [_closure("Afzal Gunj", point)], routes_for)
    route = asyncio.run(find_evacuation_route(*START, "zone-1", "Nampally"))
    assert route.shelter_name == "Far Shelter"
    assert route.distance_meters == 1000
    assert route.blocked_road_conflicts == ["Afzal Gunj"]
    assert route.why_this.startswith("WARNING: this route crosses Afzal Gunj; verify on the ground.")
    assert "no resolved status" in route.why_this
