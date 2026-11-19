# Vanta Protocol — Technical Implementation & Audit Report

> **Project:** Vanta Protocol — Real-time Disaster Response Control Room for Police (CipherCop 2026, Hyderabad)  
> **Repository:** `d:\Hackathons\Hackathons\Vanta-Protocol\venda`  
> **Branch:** `vanta-upgrade`  
> **Git Identity:** `MidhanRaj` / `midhanrajrb@gmail.com`  
> **Date:** 2026-11-19  

---

## 1. What Was Broken & How It Was Fixed

### Broken / Misleading Logic Identified in Technical Audit
1. **Label Validation Test Failure (P0):**
   - *Issue:* `tests/test_label_validation.py::test_template_seeds_are_not_labels` hard-asserted `len(rows) == 6`. The dataset had grown to 38 rows (6 template seeds + 32 real historical flood labels), causing test failure.
   - *Fix:* Refactored test to count seeds separately from labeled rows, validating that both the 6 seeds and the 32 real events pass schema checks without collision.
2. **Artificial Wind-Flood Risk Coupling:**
   - *Issue:* High wind speed previously bumped the urban flood category score.
   - *Fix:* Completely uncoupled cyclone wind from urban stormwater flood scoring. Wind threshold bump was removed.
3. **Single Centroid Weather for all Hotspots:**
   - *Issue:* All 64 HTP waterlogging hotspots shared a single Open-Meteo weather sample taken at the Hyderabad city center.
   - *Fix:* Implemented per-cell Open-Meteo weather with spatial coordinate deduplication (`round(lat, 2), round(lon, 2)` $\approx 1\text{ km}$ unique cell resolution) and concurrency control (`asyncio.Semaphore(3)`).
4. **Hardcoded Grid Bounds & Resolution:**
   - *Issue:* 10×12 grid boundaries were hardcoded in `grid.py`.
   - *Fix:* Moved bounds and resolution to configurable environment settings (`GRID_LAT_MIN`, `GRID_LAT_MAX`, `GRID_LON_MIN`, `GRID_LON_MAX`, `GRID_LAT_COUNT`, `GRID_LON_COUNT`), exporting module aliases for backward compatibility.
5. **No DEM Slope Integration:**
   - *Issue:* Grid cells lacked elevation slope telemetry.
   - *Fix:* Added optional local DEM raster reader (`_load_dem_slopes()`) with graceful fallback to `None` if `rasterio` or the DEM file is absent.
6. **Unified Prediction Result Contract:**
   - *Issue:* Heuristic scoring lacked a unified output schema and could have been misinterpreted as ML.
   - *Fix:* Refactored all hazard results behind `PredictionResult` with `method: "rule_based"` and `probability: null` (never claimed as ML).
7. **Pydantic V2 Deprecation & Insecure Default Auth:**
   - *Issue:* `Config` inner class deprecation warning in `backend/config.py`; `AUTH_REQUIRED` defaulted to `False`.
   - *Fix:* Migrated to `SettingsConfigDict(env_file=".env", extra="ignore")` and defaulted `AUTH_REQUIRED: bool = True`.

---

## 2. Multi-Hazard Architecture & Implementation

### Tier A Modules (Implemented with Real Public Data)
- **Earthquake (`backend/services/hazards/tier_a/earthquake.py`):**
  - Integrated USGS Earthquake Hazards Program API (ComCat) for India bbox ($6.5^\circ\text{N} - 37.5^\circ\text{N}, 68.0^\circ\text{E} - 98.0^\circ\text{E}$).
  - Enforced strict scientific contract: Seismicity and monitoring **only, NO prediction**. `is_observed = True`, `forecast_window_h = 0`, `method = "observed"`, `probability = null`.
- **Cyclone (`backend/services/hazards/tier_a/cyclone.py`):**
  - Integrated NOAA NCEI IBTrACS v04r01 North Indian Ocean storm tracks.
  - Track monitoring and wind exposure buffer only; wind is completely separated from flood risk.
- **Wildfire Detection (`backend/services/hazards/tier_a/wildfire.py`):**
  - Integrated NASA FIRMS VIIRS 375m & MODIS 1km active fire thermal anomaly detections.
  - Credential handling: Reads `MAP_KEY` / `NASA_FIRMS_MAP_KEY`. If absent, gracefully reports `missing_credentials` status without fabricating live fires.

### Tier B Modules (Interface & Docs Only — Explicit Missing Sensors)
All 7 Tier B modules implement `BaseHazardModule` and return `status: "not_implemented"` with explicit scientific reasons:
- `flood_extension`: Missing 2D hydraulic/hydrodynamic routing model (SWMM/HEC-RAS) and urban storm drain cross-section network data.
- `landslide`: Missing geotechnical shear strength, depth-to-bedrock maps, and real-time piezometric soil pore-pressure sensor feeds.
- `drought`: Missing multi-month satellite SMAP/GRACE soil moisture anomalies, SPEI meteorological indices, and reservoir storage telemetry.
- `heatwave`: Missing wet-bulb globe temperature (WBGT) micro-sensor network, high-res urban heat island canopy models, and epidemiological mortality response curves.
- `tsunami`: Missing deep-ocean DART tsunameter real-time telemetry and coastal bathymetric run-up inundation modeling.
- `lightning`: Missing ground-based lightning detection network (LDN/LINET VHF/VLF sensor array) and total lightning pulse telemetry.
- `volcano`: Missing volcanic ash dispersion modeling and seismic tremor array (no active or Holocene volcanoes in Telangana / Deccan Traps).

### Unified Engine Contract
- **No Total Risk Score:** `UnifiedHazardResponse.total_risk_score` is strictly `null`.
- **Officer Approval Workflow:** Suggested hazard mitigation actions (e.g. flyover inspection, chainsaw prepositioning, fire tender dispatch) are created with `status: "suggested"` and require explicit authenticated officer approval via `POST /api/hazards/actions/{id}/approve`.

---

## 3. Files Changed Across All Sessions

| Category | File | Description of Changes |
|---|---|---|
| **Models & Config** | `backend/models.py` | Added `ContributingFactor`, `DataFreshness`, `PredictionResult`, `CycloneWindResult`, `RecommendedAction`, `HazardItem`, `HazardModuleStatus`, `UnifiedHazardResponse`. |
| | `backend/config.py` | Added grid bounds, DEM path, India bbox, Tier A URLs, `SettingsConfigDict` migration, `AUTH_REQUIRED = True`. |
| **Hazard Engine** | `backend/services/hazards/base.py` | `BaseHazardModule` abstract base class. |
| | `backend/services/hazards/tier_a/earthquake.py` | USGS ComCat earthquake monitoring module. |
| | `backend/services/hazards/tier_a/cyclone.py` | NOAA IBTrACS cyclone track and exposure module. |
| | `backend/services/hazards/tier_a/wildfire.py` | NASA FIRMS active fire detection module with `MAP_KEY` support. |
| | `backend/services/hazards/tier_b/unimplemented.py` | 7 Tier B modules with explicit sensor deficit notes. |
| | `backend/services/hazards/actions_store.py` | Officer approval action store (`approve_action`, `reject_action`). |
| | `backend/services/hazards/engine.py` | `UnifiedHazardEngine` with `total_risk_score = None`. |
| **Routers & Server** | `backend/routers/hazards.py` | REST endpoints for unified hazards, modules, and officer action approvals. |
| | `backend/main.py` | Registered `hazards.router`. |
| **Risk & Grid** | `backend/services/risk_engine.py` | Removed wind bump from flood score; per-cell weather for HTP points with semaphore. |
| | `backend/services/grid.py` | Configurable grid, DEM slope extraction, per-cell weather cache, 429/timeout handling. |
| **Data Pipelines** | `scripts/fetch_hazard_data.py` | Automated dataset ingestion script with India bbox and date filters. |
| | `scripts/label_schema.py` | Label validation gate with duplicate detection, uncertain flag exclusion, report dict. |
| **Data Files** | `data/earthquake_catalog.json` | Baseline catalog of Indian seismic events. |
| | `data/ibtracs_active.json` | Baseline North Indian Ocean cyclone tracks (Michaung, Remal, Gulab). |
| | `data/sample_firms.json` | Baseline satellite active fire detections. |
| **Frontend UI** | `frontend/src/api.js` | Added `fetchUnifiedHazards`, `fetchHazardModules`, `fetchHazardActions`, `approveHazardAction`, `rejectHazardAction`. |
| | `frontend/src/components/Map.jsx` | Multi-hazard map layers (amber earthquake rings, purple cyclone tracks, crimson fire markers). |
| | `frontend/src/components/HazardDetailPanel.jsx` | Detail panel with observed vs predicted badges, forecast windows, factors, freshness, and officer approval buttons. |
| | `frontend/src/App.jsx` | Integrated multi-hazard tab, layer filters, and hazard selection handlers. |
| **Tests** | `tests/test_label_validation.py` | Fixed seed count assertion. |
| | `tests/test_risk_engine_refactor.py` | 10 tests for no-rainfall, missing-DEM, invalid-coords, no-model, API timeout, 429 rate limit. |
| | `tests/test_hazard_engine.py` | 8 tests for BaseHazardModule, Tier A, Tier B, null total score, officer approval. |

---

## 4. Models Actually Trained & Real Metrics

- **Models Trained:** **0** (Zero)
- **Scientific Audit Finding:**
  - As documented in `docs/model_report.md` and `docs/PROGRESS.md`:
  - `data/hyderabad_events.csv` contains 38 total rows (6 template seeds + 32 real flood labels).
  - Positive samples ($y=1$): **32**
  - Negative samples ($y=0$): **0**
  - When supervised learning (`train_model.py`) was executed, `StratifiedGroupKFold` raised:
    ```
    ValueError: training fold has a single class (1)
    ```
  - **Honest Outcome:** No supervised machine learning model was trained or deployed. Vanta Protocol operates strictly on the rule-based heuristic engine with transparent audit disclosure.

---

## 5. Tests Executed & Actual Results

### Full Pytest Suite Run:
```bash
python -m pytest tests/ -v --tb=short
```

**Output Summary:**
```
======================= 60 passed, 2 warnings in 44.82s =======================
```

**Test Breakdown (60 passed, 0 failed):**
- `tests/test_auth_local.py`: 3 passed (hash, protected route, login/logout)
- `tests/test_blocked_route.py`: 3 passed (clean alternative, next shelter, warning)
- `tests/test_cap_alerts.py`: 10 passed (valid message, supersedes, non-actual, expired, xxe, host allowlist, status mapping, floor logic, plan cache, review)
- `tests/test_evacuation.py`: 2 passed (empty overpass, route endpoint)
- `tests/test_grid.py`: 1 passed (120 cells in box)
- `tests/test_hazard_engine.py`: 8 passed (null total risk score, modules registry, earthquake monitoring only, cyclone track exposure, wildfire missing credentials, Tier B explicit reasons, recommended actions approval, hazards API endpoints)
- `tests/test_heat.py`: 2 passed (missing heat null, heatwave threshold separate)
- `tests/test_history_window.py`: 3 passed (yesterday, last two days, unresolved question)
- `tests/test_htp_waterlogging.py`: 6 passed (all zones, narrow zone, catalog items, poll success, poll failure stale, poll failure empty)
- `tests/test_label_validation.py`: 5 passed (template seeds, missing date/source rejected, Chennai rejected, rainfall not source, cited positive accepted)
- `tests/test_replay.py`: 1 passed (replay heavy band)
- `tests/test_risk_engine_refactor.py`: 10 passed (no rainfall null, river without rain null, missing DEM slopes null, empty DEM path, invalid coords Chennai, valid coords Hyd, rule-based no model, category null without rain, API timeout failed, rate limit 429)
- `tests/test_risk_score.py`: 3 passed (failed feed withholds level, real zero nominal, watch & heavy thresholds)
- `tests/test_sos_gate.py`: 1 passed (explicit officer approval)
- `tests/test_triage.py`: 2 passed (life safety ranking, missing zone risk)

---

## 6. What Is Incomplete & Next Roadmap

1. **Verified Field Negatives for Flood ML:**
   - Collection of $\ge 10$ field-verified negative labels during rainfall events (locations with $\ge 50\text{ mm}$ rain with 0 standing water).
2. **DEM Raster Integration:**
   - Optional downloading of a clipped Telangana / GHMC 30m SRTM/Copernicus GeoTIFF into `DEM_FILE_PATH` to activate slope-derived overland runoff calculations.
3. **External Real-Time Keys:**
   - `MAP_KEY` / `NASA_FIRMS_MAP_KEY` for live global active fire updates.
   - `GEMINI_API_KEY` and `GROQ_API_KEY` for AI agent natural language triage.

---

## 7. Exact Run Commands

### 1. Ingest External Datasets & Build Provenance Catalog
```powershell
Set-Location d:\Hackathons\Hackathons\Vanta-Protocol\venda
python scripts/fetch_hazard_data.py --hazard all
```

### 2. Run Test Suite
```powershell
python -m pytest tests/ -v --tb=short
```

### 3. Start Backend Server
```powershell
python -m uvicorn backend.main:app --host 0.0.0.0 --port 8000 --reload
```

### 4. Build and Start Frontend UI
```powershell
Set-Location frontend
cmd /c npm run build
cmd /c npm run dev -- --port 5173
```
- Open browser at `http://localhost:5173`.
- Sign in with username: `admin`, password: `123`.
- Access Tactical Map and open the **Hazards** tab to view multi-hazard overlays and officer approval actions.
