"""No typed-in hospital is used when OpenStreetMap returns nothing."""
import asyncio

from fastapi.testclient import TestClient

from backend.main import app
from backend.services.routing import NO_VERIFIED_DESTINATION, find_evacuation_route

client = TestClient(app)


def test_empty_overpass_does_not_invent_a_destination(monkeypatch):
    async def failed_shelters():
        return {
            "source": "OpenStreetMap Overpass API",
            "status": "failed",
            "last_updated": None,
            "data": [],
            "error": "All Overpass API mirrors unreachable from this network",
        }

    monkeypatch.setattr("backend.services.routing.get_real_shelters_and_stations", failed_shelters)
    route = asyncio.run(find_evacuation_route(17.39144, 78.470213, "hyd-hotspot-nampally-metro", "Nampally"))
    assert route is None


def test_route_endpoint_reports_no_verified_destination(monkeypatch):
    async def no_route(**kwargs):
        return None

    monkeypatch.setattr("backend.routers.routes.find_evacuation_route", no_route)
    response = client.post("/api/evacuation-route", json={
        "zone_id": "hyd-hotspot-nampally-metro",
        "zone_name": "Nampally Metro Underpass",
        "lat": 17.39144,
        "lng": 78.470213,
    })
    assert response.status_code == 404
    assert response.json()["detail"].startswith("No verified destination found")
    assert NO_VERIFIED_DESTINATION.startswith("No verified destination found")
