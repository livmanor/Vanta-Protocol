import httpx
import math
import logging
from datetime import datetime, timezone
from typing import Dict, Any, List, Optional, Tuple
from backend.config import settings
from backend.models import EvacuationRoute, BlockedRoad
from backend.data_sources.osm import get_real_shelters_and_stations
from backend.db import fetch_blocked_roads

logger = logging.getLogger("routing")

# A shelter farther than this is not a usable Hyderabad evacuation destination.
MAX_SHELTER_DISTANCE_KM = 30
MAX_SHELTERS_TO_TRY = 3
EARTH_RADIUS_M = 6_371_000
NO_VERIFIED_DESTINATION = (
    "No verified destination found. OpenStreetMap did not return a shelter, "
    "community centre, or hospital inside Hyderabad."
)
CLOSURE_STATUS_NOTE = (
    "Officer-entered blocks have no resolved status, so confirm they are still active."
)


def haversine_distance_km(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    R = 6371.0
    dlat = math.radians(lat2 - lat1)
    dlon = math.radians(lon2 - lon1)
    a = math.sin(dlat / 2)**2 + math.cos(math.radians(lat1)) * math.cos(math.radians(lat2)) * math.sin(dlon / 2)**2
    c = 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))
    return R * c


def _geometry_lines(geometry: Optional[Dict[str, Any]]) -> List[List[Tuple[float, float]]]:
    """Return polylines as (longitude, latitude) pairs. A Point is a one-vertex line."""
    if not isinstance(geometry, dict):
        return []
    kind = geometry.get("type")
    coords = geometry.get("coordinates")
    if kind == "Point" and isinstance(coords, (list, tuple)) and len(coords) >= 2:
        return [[(float(coords[0]), float(coords[1]))]]
    if kind == "LineString" and isinstance(coords, list):
        line = [(float(point[0]), float(point[1])) for point in coords if isinstance(point, (list, tuple)) and len(point) >= 2]
        return [line] if line else []
    if kind == "MultiLineString" and isinstance(coords, list):
        lines = []
        for part in coords:
            if not isinstance(part, list):
                continue
            line = [(float(point[0]), float(point[1])) for point in part if isinstance(point, (list, tuple)) and len(point) >= 2]
            if line:
                lines.append(line)
        return lines
    return []


def _xy_m(lat: float, lng: float, lat0: float) -> Tuple[float, float]:
    return (
        math.radians(lng) * math.cos(math.radians(lat0)) * EARTH_RADIUS_M,
        math.radians(lat) * EARTH_RADIUS_M,
    )


def _point_segment_m(px: float, py: float, ax: float, ay: float, bx: float, by: float) -> float:
    abx, aby = bx - ax, by - ay
    denom = abx * abx + aby * aby
    if denom == 0:
        return math.hypot(px - ax, py - ay)
    t = max(0.0, min(1.0, ((px - ax) * abx + (py - ay) * aby) / denom))
    return math.hypot(px - (ax + t * abx), py - (ay + t * aby))


def _segments_cross(a, b, c, d) -> bool:
    def orient(p, q, r):
        return (q[0] - p[0]) * (r[1] - p[1]) - (q[1] - p[1]) * (r[0] - p[0])
    return orient(a, b, c) * orient(a, b, d) < 0 and orient(c, d, a) * orient(c, d, b) < 0


def _segment_distance_m(a, b, c, d) -> float:
    if _segments_cross(a, b, c, d):
        return 0.0
    return min(
        _point_segment_m(*a, *c, *d),
        _point_segment_m(*b, *c, *d),
        _point_segment_m(*c, *a, *b),
        _point_segment_m(*d, *a, *b),
    )


def conflicting_road_names(route_geometry: Dict[str, Any], blocked_roads: List[BlockedRoad], buffer_m: float) -> List[str]:
    """Names of officer-reported closures whose geometry comes within buffer_m of the route."""
    route_lines = [line for line in _geometry_lines(route_geometry) if len(line) >= 2]
    if not route_lines:
        return []
    lat0 = route_lines[0][0][1]
    route_xy = [[_xy_m(lat, lng, lat0) for lng, lat in line] for line in route_lines]
    names = []
    for road in blocked_roads:
        name = road.name or "Unnamed closure"
        hit = False
        for road_line in _geometry_lines(road.geometry):
            road_xy = [_xy_m(lat, lng, lat0) for lng, lat in road_line]
            if len(road_xy) == 1:
                px, py = road_xy[0]
                for route in route_xy:
                    for index in range(len(route) - 1):
                        if _point_segment_m(px, py, *route[index], *route[index + 1]) <= buffer_m:
                            hit = True
                            break
                    if hit:
                        break
            else:
                for route in route_xy:
                    for index in range(len(route) - 1):
                        for road_index in range(len(road_xy) - 1):
                            if _segment_distance_m(route[index], route[index + 1], road_xy[road_index], road_xy[road_index + 1]) <= buffer_m:
                                hit = True
                                break
                        if hit:
                            break
                    if hit:
                        break
            if hit:
                break
        if hit:
            names.append(name)
    return names


async def _request_osrm_routes(start_lng: float, start_lat: float, dest_lng: float, dest_lat: float) -> Optional[List[Dict[str, Any]]]:
    """Return OSRM alternatives, or None when the router cannot be used."""
    url = (
        f"{settings.OSRM_ROUTE_URL}/{start_lng},{start_lat};{dest_lng},{dest_lat}"
        "?overview=full&geometries=geojson&alternatives=true"
    )
    try:
        async with httpx.AsyncClient(timeout=8.0) as client:
            resp = await client.get(url)
            if resp.status_code != 200:
                logger.warning("OSRM returned %s for %s", resp.status_code, url)
                return None
            parsed = []
            for route in resp.json().get("routes") or []:
                geometry = route.get("geometry")
                if not geometry:
                    continue
                parsed.append({
                    "distance": float(route.get("distance") or 0),
                    "duration": float(route.get("duration") or 0),
                    "geometry": geometry,
                })
            return parsed
    except Exception as exc:
        logger.warning("OSRM routing request failed: %s", exc)
        return None


def _route_model(zone_id, zone_name, shelter, route, why_this, conflicts, computed_at) -> EvacuationRoute:
    return EvacuationRoute(
        id=f"route-{zone_id}-{int(datetime.now().timestamp())}",
        zone_id=zone_id,
        zone_name=zone_name,
        shelter_name=shelter.get("name") or "Designated Emergency Shelter",
        shelter_lat=shelter["lat"],
        shelter_lng=shelter["lng"],
        distance_meters=round(route["distance"], 1),
        duration_seconds=round(route["duration"], 1),
        geometry=route["geometry"],
        why_this=why_this,
        computed_at=computed_at,
        blocked_road_conflicts=conflicts,
    )


async def find_evacuation_route(
    start_lat: float,
    start_lng: float,
    zone_id: str,
    zone_name: str
) -> Optional[EvacuationRoute]:
    """Fastest OSRM corridor to a verified shelter that stays clear of officer-reported closures.

    Up to three nearest shelters are tried. If every alternative still crosses a closure,
    the shortest corridor is returned with an explicit warning.
    """
    now_iso = datetime.now(timezone.utc).isoformat()

    facilities_res = await get_real_shelters_and_stations()
    facilities = facilities_res.get("data", [])
    shelters = [
        facility for facility in facilities
        if facility.get("type") in ("shelter", "community_centre", "hospital")
        and facility.get("lat") is not None
        and facility.get("lng") is not None
    ]
    ranked = []
    for shelter in shelters:
        distance_km = haversine_distance_km(start_lat, start_lng, shelter["lat"], shelter["lng"])
        if distance_km <= MAX_SHELTER_DISTANCE_KM:
            ranked.append((distance_km, shelter))
    ranked.sort(key=lambda item: item[0])
    ranked = ranked[:MAX_SHELTERS_TO_TRY]
    if not ranked:
        logger.warning(NO_VERIFIED_DESTINATION)
        return None

    cache_note = ""
    if facilities_res.get("status") == "stale" and facilities_res.get("last_updated"):
        cache_note = f" Using the last successful OpenStreetMap shelter list from {facilities_res.get('last_updated')}."

    blocked_roads = await fetch_blocked_roads()
    buffer_m = settings.BLOCKED_ROAD_BUFFER_M
    blocked_count = len(blocked_roads)
    crossing_options = []
    osrm_reached = False

    for _distance_km, shelter in ranked:
        routes = await _request_osrm_routes(start_lng, start_lat, shelter["lng"], shelter["lat"])
        if routes is None:
            continue
        osrm_reached = True
        clean = []
        for route in routes:
            conflicts = conflicting_road_names(route["geometry"], blocked_roads, buffer_m)
            if conflicts:
                crossing_options.append((route["distance"], route["duration"], shelter, route, conflicts))
            else:
                clean.append((route["duration"], route["distance"], shelter, route))
        if clean and routes:
            duration, distance, chosen_shelter, chosen = min(clean, key=lambda item: (item[0], item[1]))
            name = chosen_shelter.get("name") or "Designated Emergency Shelter"
            why_this = (
                f"{len(routes)} alternatives checked, route avoids {blocked_count} officer-reported closures. "
                f"Route calculated via OSRM to '{name}' ({distance / 1000:.1f} km).{cache_note}"
            )
            if blocked_count:
                why_this += f" {CLOSURE_STATUS_NOTE}"
            chosen["distance"] = distance
            chosen["duration"] = duration
            return _route_model(zone_id, zone_name, chosen_shelter, chosen, why_this, [], now_iso)

    if crossing_options:
        distance, duration, shelter, route, conflicts = min(crossing_options, key=lambda item: (item[0], item[1]))
        name = shelter.get("name") or "Designated Emergency Shelter"
        listed = ", ".join(conflicts)
        why_this = (
            f"WARNING: this route crosses {listed}; verify on the ground. "
            f"Route calculated via OSRM to '{name}' ({distance / 1000:.1f} km).{cache_note} "
            f"{CLOSURE_STATUS_NOTE}"
        )
        route["distance"] = distance
        route["duration"] = duration
        return _route_model(zone_id, zone_name, shelter, route, why_this, conflicts, now_iso)

    distance_km, shelter = ranked[0]
    name = shelter.get("name") or "Designated Emergency Shelter"
    geometry = {
        "type": "LineString",
        "coordinates": [[start_lng, start_lat], [shelter["lng"], shelter["lat"]]],
    }
    conflicts = conflicting_road_names(geometry, blocked_roads, buffer_m)
    if conflicts:
        listed = ", ".join(conflicts)
        why_this = (
            f"WARNING: this route crosses {listed}; verify on the ground. "
            f"Direct line to verified shelter '{name}' ({distance_km:.2f} km). "
            f"OSRM was unreachable, so this is not a driven route.{cache_note} {CLOSURE_STATUS_NOTE}"
        )
    else:
        why_this = (
            f"Direct line to verified shelter '{name}' ({distance_km:.2f} km). "
            f"OSRM was unreachable, so this is not a driven route.{cache_note}"
        )
        if blocked_count:
            why_this += (
                f" {blocked_count} officer-reported closures were checked against this direct line. "
                f"{CLOSURE_STATUS_NOTE}"
            )
    if not osrm_reached:
        logger.warning("OSRM routing request failed. Generating straight-line emergency corridor.")
    return _route_model(
        zone_id,
        zone_name,
        shelter,
        {
            "distance": distance_km * 1000,
            "duration": (distance_km / 25.0) * 3600,
            "geometry": geometry,
        },
        why_this,
        conflicts,
        now_iso,
    )


async def snap_to_nearest_road(lat: float, lng: float) -> Dict[str, Any]:
    """Snap a coordinate (lat, lng) to the nearest drivable road using OSRM nearest service.
    If the point is off-road, moves it to the nearest valid road geometry.
    """
    nearest_base = settings.OSRM_ROUTE_URL.replace("/route/v1/driving", "/nearest/v1/driving")
    url = f"{nearest_base}/{lng},{lat}?number=1"
    try:
        async with httpx.AsyncClient(timeout=6.0) as client:
            resp = await client.get(url)
            if resp.status_code == 200:
                data = resp.json()
                waypoints = data.get("waypoints") or []
                if waypoints and len(waypoints) > 0:
                    wp = waypoints[0]
                    loc = wp.get("location") or [lng, lat]
                    dist_m = float(wp.get("distance", 0.0))
                    road_name = wp.get("name") or ""
                    return {
                        "snapped": True,
                        "original_lat": lat,
                        "original_lng": lng,
                        "lat": loc[1],
                        "lng": loc[0],
                        "distance_m": round(dist_m, 1),
                        "road_name": road_name,
                    }
    except Exception as exc:
        logger.warning("OSRM nearest road snapping error: %s", exc)

    return {
        "snapped": False,
        "original_lat": lat,
        "original_lng": lng,
        "lat": lat,
        "lng": lng,
        "distance_m": 0.0,
        "road_name": "",
    }


async def compute_patrol_route(waypoints: List[Dict[str, float]]) -> Optional[Dict[str, Any]]:
    """Compute driving route connecting multiple patrol waypoints via OSRM."""
    if len(waypoints) < 2:
        return None

    coords_str = ";".join(f"{wp['lng']},{wp['lat']}" for wp in waypoints)
    url = f"{settings.OSRM_ROUTE_URL}/{coords_str}?overview=full&geometries=geojson"
    try:
        async with httpx.AsyncClient(timeout=8.0) as client:
            resp = await client.get(url)
            if resp.status_code == 200:
                data = resp.json()
                routes = data.get("routes") or []
                if routes:
                    r = routes[0]
                    return {
                        "distance_meters": round(float(r.get("distance", 0)), 1),
                        "duration_seconds": round(float(r.get("duration", 0)), 1),
                        "geometry": r.get("geometry"),
                        "waypoints": data.get("waypoints", []),
                    }
    except Exception as exc:
        logger.warning("OSRM patrol route computation failed: %s", exc)
    return None

