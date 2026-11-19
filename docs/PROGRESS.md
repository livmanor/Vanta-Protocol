# Vanta Protocol — Progress Log
*Branch: vanta-upgrade*

---

## Session 1 — 2026-11-19

### Done

**Audit: `docs/VANTA_TECHNICAL_AUDIT.md` written**

Command run:
```
python -m pytest tests/ -v --tb=short
```
Real output summary: 41 passed, 1 failed in 3.03s.
- 1 failure: `test_label_validation::test_template_seeds_are_not_labels` — asserts `len(rows)==6`, CSV now has 38 rows (6 seeds + 32 real positive labels).

Training gate checked:
```
python -c "from scripts.label_schema import read_rows, training_gate, LABELS_PATH; ..."
```
Output: Seeds=6, Positives=32, Negatives=0, Events=5, Ready=True — but zero negatives means binary classifier cannot be fit.

`docs/model_report.md` confirms last training run (2026-11-19): every LOEO fold raised `ValueError: training fold has a single class (1)`. No model trained. Honest outcome.

### Verified Working Features
- Auth (bcrypt + SQLite sessions)
- CAP/SACHET ingestion and floor logic
- HTP waterlogging poller with stale-snapshot fallback
- Risk score engine (1–5 heuristic), correctly withholds score when both rain fields null
- 120-cell GHMC grid, elevation cached in SQLite
- Evacuation routing with blocked-road buffer
- SOS gate with officer approval
- Incident triage
- Replay (archive-only, writes nothing)
- Predict/Prepare/Respond agents (config-gated; no keys committed)

### Known Issues (see VANTA_TECHNICAL_AUDIT.md for full list)
1. `test_template_seeds_are_not_labels` stale assertion — P0 fix
2. Zero negatives in label file → no trainable model
3. All HTP points use city-centroid weather sample (rate limit workaround, disclosed in `why_this`)
4. Archive 48h rain ≠ live 48h rain (daily sum vs. hourly sum)
5. `AUTH_REQUIRED` defaults `False` in code
6. Groq model ID `openai/gpt-oss-20b` unverified
7. Pydantic V2 `Config` class deprecation warning

### Blocked
- Nothing blocked at this stage (audit-only session, no code changes required except fixing the test).

---

## Session 2 — 2026-11-19 (Risk Engine Refactor + Label Validation)

### Done

**Label pipeline (`scripts/label_schema.py`)**
- Added `is_uncertain()`, `_duplicate_key()`, `OPTIONAL_COLUMNS`, `MIN_NEGATIVES`, `MIN_EVENTS_PER_CLASS`.
- `training_gate()` now returns full report dict: accepted/rejected/excluded counts, both_classes/only_positives/only_negatives flags, events per class.
- Backward-compat aliases preserved (`MIN_EVENTS`, `events` key).
- `test_template_seeds_are_not_labels` fixed to count seeds separately from real labels.

**Risk engine (`backend/services/risk_engine.py`)**
- Unified `PredictionResult` schema: hazard, location, timestamp, forecast_window_h, probability (None unless ML), category, contributing_factors, data_freshness, missing_data_warnings, model_version, method.
- Urban flood and cyclone wind are **fully separate**. Wind-threshold flood bump removed.
- `score_urban_flood()` → pure IMD rainfall thresholds, returns `(category, raw_score, factors, warnings)`.
- `score_cyclone_wind()` → returns `CycloneWindResult`.
- `score_heat()` → returns `PredictionResult(hazard="heat")`.
- `build_flood_prediction()` → returns `(flood, wind, heat)` triple.
- `score_observations()` / `calculate_zone_risk()` kept as backward-compat wrappers.
- `compute_real_risk_zones()`: per-cell weather for all HTP hotspots. Deduplicates by Open-Meteo ~1 km cell (`round(lat,2)`). Semaphore(3). Stale fallback on failure. Fixed stale vars `weather_res`/`sample_note` → `wx_res`/`weather_note`.

**Grid (`backend/services/grid.py`)**
- Configurable resolution and boundary from `settings.GRID_*`.
- Module-level aliases `LAT_MIN` etc. kept for existing test imports.
- `_load_dem_slopes()`: reads rasterio DEM if present; graceful fallback (no crash, one-time warning log) when DEM_FILE_PATH missing or rasterio absent.
- `_fetch_weather()`: per-cell cache under `grid_cell_wx_{cell_id}`; semaphore(2) batches; 429 and timeout caught — cells marked `failed` or use stale fallback, no exception propagated.
- `compute_risk_grid()`: includes `prediction_resolution_km`, `dem_resolution_m`, `weather_source` in response.

**Models (`backend/models.py`)**
- Added `ContributingFactor`, `DataFreshness`, `PredictionResult`, `CycloneWindResult`.
- `RiskGridCell` extended with `slope_m_per_m: Optional[float]`.
- `RiskGridResponse` extended with `prediction_resolution_km`, `dem_resolution_m`, `weather_source`.

**Config (`backend/config.py`)**
- Added `GRID_LAT_MIN/MAX`, `GRID_LON_MIN/MAX`, `GRID_LAT_COUNT`, `GRID_LON_COUNT`, `DEM_FILE_PATH`.

**Tests (`tests/test_risk_engine_refactor.py` — 10 new tests)**
- `test_no_rainfall_data_returns_none_level_and_score` ✅
- `test_no_rainfall_data_with_river_still_none` ✅
- `test_missing_dem_returns_all_none_slopes` ✅
- `test_empty_dem_path_returns_all_none` ✅
- `test_invalid_coords_chennai_rejected` ✅
- `test_valid_coords_hyderabad_accepted` ✅
- `test_no_model_flood_prediction_is_rule_based` ✅
- `test_no_model_flood_no_rainfall_category_is_none` ✅
- `test_api_timeout_marks_cells_failed` ✅
- `test_rate_limit_429_marks_cells_failed` ✅

Command run:
```
python -m pytest tests/ -v --tb=short
```
Real output: **52 passed, 0 failed in 3.14s** (42 original + 10 new).

Commit: `2572ddb` — "refactor: unified PredictionResult, separate flood/wind/heat, per-cell weather, configurable grid, optional DEM"

### Verified Still Working
All 42 previously passing tests continue to pass. No regressions.

### Known Issues (carried from Session 1, not yet fixed)
1. `AUTH_REQUIRED` defaults `False` — P2
2. Groq model ID `openai/gpt-oss-20b` unverified — P2
3. Pydantic V2 `Config` class deprecation warning — P2
4. Archive 48h rain ≠ live 48h rain — documented in replay banner logic needed
5. Zero negatives in label file → no trainable ML model (honest outcome per audit)

### Blocked
- Nothing blocked.

---

## Next Steps
1. Fix `AUTH_REQUIRED` default (`True`) in `backend/config.py:57` — P2.
2. Pydantic V2 `ConfigDict` migration in `backend/config.py:90` — P2.
3. Verify Groq model ID — P2.
4. Add verified negatives to labels if proceeding with ML model.
5. Push `vanta-upgrade` to remote.
