# Vanta Protocol — API Documentation

> **Base URL:** `http://localhost:8000/api`  
> **API Version:** `1.0.0`  
> **Specification Standard:** RESTful JSON with OpenAPI 3.1 & Pydantic V2  

---

## 1. Unified Multi-Hazard Engine Endpoints

Vanta Protocol implements an independent multi-hazard engine.

> [!IMPORTANT]
> **No Combined "Total Risk" Score:**  
> The API strictly returns per-hazard outputs (`hazards` and `features`). `total_risk_score` is **always `null`**. Distinct physical hazards (seismic, cyclonic, thermal, hydrological) operate on incompatible physical dimensions and casualty vulnerability profiles; blending them into a single score is scientifically invalid and life-safety hazardous.

### `GET /api/hazards`
Retrieve discrete hazard features and operational statuses across all active Tier A and Tier B modules.

- **Query Parameters:**
  - `min_lat` *(float, optional)*: Southern latitude bound.
  - `max_lat` *(float, optional)*: Northern latitude bound.
  - `min_lon` *(float, optional)*: Western longitude bound.
  - `max_lon` *(float, optional)*: Eastern longitude bound.

- **Response:** `UnifiedHazardResponse`
```json
{
  "timestamp": "2026-11-19T22:20:00.000000+00:00",
  "hazards": {
    "earthquake": {
      "hazard_id": "earthquake",
      "name": "Earthquake Seismicity & Monitoring",
      "tier": "A",
      "status": "implemented",
      "data_source": "USGS Earthquake Hazards Program (ComCat API)",
      "message": "Active USGS seismic feed. Monitoring and historical seismicity only; no prediction.",
      "last_updated": "2026-11-19T22:20:00.000000+00:00",
      "items_count": 5
    },
    "cyclone": {
      "hazard_id": "cyclone",
      "name": "Cyclone Track & Wind Exposure",
      "tier": "A",
      "status": "implemented",
      "data_source": "NOAA NCEI IBTrACS / IMD RSMC New Delhi",
      "message": "Active IBTrACS / RSMC North Indian Ocean cyclone tracks.",
      "last_updated": "2026-11-19T22:20:00.000000+00:00",
      "items_count": 6
    },
    "wildfire": {
      "hazard_id": "wildfire",
      "name": "Wildfire & Thermal Anomaly Detection",
      "tier": "A",
      "status": "implemented",
      "data_source": "NASA FIRMS (VIIRS / MODIS Active Fire Detections)",
      "message": "Active NASA FIRMS satellite thermal anomaly detection feed.",
      "last_updated": "2026-11-19T22:20:00.000000+00:00",
      "items_count": 3
    },
    "landslide": {
      "hazard_id": "landslide",
      "name": "Landslide & Slope Stability",
      "tier": "B",
      "status": "not_implemented",
      "data_source": "Geotechnical Soil Cohesion Maps & Piezometer Array",
      "message": "not implemented: missing high-resolution geotechnical shear strength, depth-to-bedrock maps, and real-time piezometric soil pore-pressure sensor feeds",
      "last_updated": "2026-11-19T22:20:00.000000+00:00",
      "items_count": 0
    }
  },
  "features": [
    {
      "id": "eq-us7000sample1",
      "hazard_id": "earthquake",
      "name": "Earthquake M4.6 — 42 km SE of Warangal, Telangana, India",
      "geometry": { "type": "Point", "coordinates": [79.88, 17.65] },
      "is_observed": true,
      "severity_level": 3,
      "severity_label": "M4.6 (Category 3)",
      "event_time": "2024-11-18T10:33:20+00:00",
      "forecast_window_h": 0,
      "method": "observed",
      "model_version": "USGS-PDE-v1",
      "probability": null,
      "contributing_factors": [
        { "name": "magnitude", "value": 4.6, "unit": "M" },
        { "name": "distance_to_hyderabad", "value": 142.3, "unit": "km" },
        { "name": "depth", "value": 12.4, "unit": "km" }
      ],
      "data_freshness": [
        { "source": "USGS Earthquake Hazards Program", "status": "live", "fetched_at": "2026-11-19T22:20:00Z" }
      ],
      "sources": ["USGS Comprehensive Earthquake Catalog (ComCat)"],
      "warnings": [
        "Earthquake monitoring and historical seismicity only. Earthquake prediction is scientifically not possible and is never claimed."
      ],
      "summary": "Observed earthquake: M4.6 at depth 12.4 km, 142.3 km from central Hyderabad.",
      "recommended_actions": [
        {
          "id": "act-eq-inspect-us7000sample1",
          "hazard_id": "earthquake",
          "action_type": "infrastructure_inspection",
          "description": "Inspect flyovers and metro viaducts following M4.6 seismic event.",
          "priority": "high",
          "status": "suggested",
          "suggested_at": "2026-11-19T22:20:00Z"
        }
      ]
    }
  ],
  "total_risk_score": null,
  "disclaimer": "Per-hazard assessments and observations. Independent risk categories; no combined total risk score is computed."
}
```

---

### `GET /api/hazards/modules`
List operational statuses and sensor deficit explanations for all 10 hazard modules.

- **Response:** `Dict[str, HazardModuleStatus]`
- **Tier A Modules:** `earthquake`, `cyclone`, `wildfire`, `urban_flood`
- **Tier B Modules:** `flood_extension`, `landslide`, `drought`, `heatwave`, `tsunami`, `lightning`, `volcano`

---

### `GET /api/hazards/actions`
List response recommendations generated across all hazard modules.

- **Query Parameters:**
  - `status` *(string, optional)*: Filter by `suggested`, `approved`, or `rejected`.
- **Response:** `List[RecommendedAction]`

---

### `POST /api/hazards/actions/{action_id}/approve`
Officer approval for a suggested response action.

- **Path Parameters:**
  - `action_id` *(string)*: Unique identifier of the recommendation.
- **Headers:** Optional session cookie or `Authorization: Bearer <token>`.
- **Response:** Updated `RecommendedAction` with `status: "approved"`, `approved_by: "<officer>"`, `approved_at: "<timestamp>"`.

---

### `POST /api/hazards/actions/{action_id}/reject`
Officer rejection of a suggested response action.

- **Path Parameters:**
  - `action_id` *(string)*: Unique identifier of the recommendation.
- **Response:** Updated `RecommendedAction` with `status: "rejected"`, `approved_by: "<officer>"`.

---

## 2. Core Hydrological & Tactical Endpoints

### `GET /api/risk-zones`
Returns the 64 geocoded Hyderabad Traffic Police (HTP) waterlogging hotspots with per-cell weather and rule-based risk levels (1–5).

### `GET /api/risk-grid`
Returns the city-wide 120-cell GHMC monitoring grid (10×12) with per-cell Open-Meteo precipitation, DEM slope attributes, and true prediction resolution (`prediction_resolution_km: 2.76`).

### `GET /api/weather`
Returns Open-Meteo weather forecasts and 48-hour precipitation totals for monitored GHMC divisions.

### `POST /api/evacuation-route`
Calculates OSRM evacuation routes that automatically detour around officer-reported road closures and active waterlogging zones.

### `GET /api/preposition/suggestions`
Generates patrol and rescue boat pre-positioning recommendations based on incoming rainfall bands and nearest available police units.

### `PATCH /api/preposition/{suggestion_id}/approve`
Approves a pre-positioning suggestion.

---

## 3. Data Schema Rules

1. **`is_observed` Flag:**
   - `true`: Telemetry from physical sensors or authoritative catalogs (USGS seismicity, NASA FIRMS thermal anomaly, IBTrACS storm fix).
   - `false`: Predictive heuristic or screening model (e.g. IMD rainfall thresholds on HTP waterlogging dips).

2. **`method` Property:**
   - `"observed"`: Sensor observation.
   - `"rule_based"`: Heuristic rule-based threshold engine.
   - `"ml"`: Calibrated machine learning model (only populated when a verified model is loaded; currently inactive due to 0-negative label status).

3. **`probability` Property:**
   - Left `null` on all rule-based and observed paths. Never fabricated.
