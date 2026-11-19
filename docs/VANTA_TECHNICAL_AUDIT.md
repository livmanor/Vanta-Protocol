# Vanta Protocol — Technical Audit
*Branch: vanta-upgrade | Audited: 2026-11-19*

---

## 1. Test Results

**Command:** `python -m pytest tests/ -v --tb=short`
**Output summary (41 passed, 1 failed, 3 warnings in 3.03s):**

| File | Result |
|---|---|
| test_auth_local (3) | ✅ PASS |
| test_blocked_route (3) | ✅ PASS |
| test_cap_alerts (8) | ✅ PASS |
| test_evacuation (2) | ✅ PASS |
| test_grid (1) | ✅ PASS |
| test_heat (2) | ✅ PASS |
| test_history_window (3) | ✅ PASS |
| test_htp_waterlogging (6) | ✅ PASS |
| **test_label_validation::test_template_seeds_are_not_labels** | ❌ FAIL |
| test_replay (1) | ✅ PASS |
| test_risk_score (3) | ✅ PASS |
| test_sos_gate (1) | ✅ PASS |
| test_triage (2) | ✅ PASS |

**Failing test:** `test_template_seeds_are_not_labels` asserts `len(rows) == 6` (original seed count), but the CSV now has 38 rows (6 seeds + 32 real positive labels). The test was written before labels were added and was never updated. The label data itself is valid — `training_gate` reports it cleanly:
```
Seeds: 6, Positives: 32, Negatives: 0, Events: 5, Rejected: [], Ready: True
```

---

## 2. Working Features

| Feature | Status | Notes |
|---|---|---|
| Officer auth (bcrypt/SQLite sessions) | ✅ Working | `AUTH_REQUIRED` default is `False` in config — production risk |
| CAP/SACHET alert ingestion | ✅ Working | XXE rejected, host allowlist enforced, floor logic tested |
| HTP waterlogging poller | ✅ Working | Stale snapshot served on failure; snapshot saved to SQLite |
| Risk score engine (`score_observations`) | ✅ Working | Additive heuristic 1–5; correctly withholds score when both rain fields are null |
| GHMC 120-cell risk grid | ✅ Working | 10×12 cells, elevation cached in SQLite, `low_lying` flag from city median |
| Evacuation routing (OSRM + OSM Overpass) | ✅ Working | Blocked-road buffer logic tested; never invents destination |
| SOS / SMS gate | ✅ Working | Officer approval required; `SMS_TEST_MODE=True` by default |
| Incident triage | ✅ Working | Ranks by urgency/type/age; resolved incidents excluded |
| Replay (`GET /api/replay?date=`) | ✅ Working | Uses archive API; writes nothing to DB |
| Predict agent (Groq) | ✅ Config-gated | Key absent → "setup required"; no key in repo |
| Prepare/Respond agents (Gemini) | ✅ Config-gated | Key absent → "setup required" |

---

## 3. Broken / Misleading Logic

### 3.1 `test_label_validation.py::test_template_seeds_are_not_labels`
- **Bug:** Test hardcodes `assert len(rows) == 6` and `all(is_seed(row) for row in rows)`. Both fail once real labels exist. The CSV now has 32 real positive labels + 6 seeds = 38 rows.
- **Fix:** Update assertion to check seed count separately from label count (`sum(is_seed(r) for r in rows) == 6`).

### 3.2 `scripts/train_model.py` — model cannot be trained (zero negatives)
- **What it does:** Fetches Open-Meteo archive features for each labelled row, runs leave-one-event-out cross-validation with Logistic Regression + Gradient Boosting.
- **What actually happened (from `docs/model_report.md`, run 2026-11-19T13:28:01):**
  - 32 positives, **0 negatives** in the label file.
  - Every LOEO fold has a single class → `ValueError: training fold has a single class (1); binary classifier not fit`.
  - Baseline (≥25 mm threshold): `F1=0.000, tp=0, fp=0, fn=32` — baseline never predicted positive because all test rows also had >25 mm and the fold-level logic only tests held-out event (all positive), producing zero recall.
- **Result:** No trained model exists or can be produced from current labels. This is an **acceptable, honest outcome** per project rules.
- **Root cause:** The `negative_candidates.csv` path exists in `label_schema.py` but no negatives have been verified/added to `hyderabad_events.csv`.

### 3.3 `backend/services/risk_engine.py` — single-point weather broadcast
- **Line 208–213:** `compute_real_risk_zones()` fetches weather **once** at city centroid (`DEFAULT_LAT=17.3914, DEFAULT_LNG=78.4702`) and applies it to all 60+ HTP points.
- **Legitimate reason:** Per-point calls hit Open-Meteo rate limits and caused 429s. But this means every HTP point gets identical weather readings regardless of its actual location.
- **Misleading aspect:** The `why_this` field appends a note: *"sampled at city focus … and applied across HTP GHMC points to avoid provider rate limits"* — this disclosure is correct but buried.

### 3.4 `backend/services/grid.py` — archive rain_48h is daily sum of two days, not hourly
- **Lines 162–168 (`_readings_from_archive_payload`):** Archive 48h rain = `forecast + prior` (two daily precipitation_sum values). The live path (`_readings_from_payload`) uses actual hourly precipitation summed. These are different quantities — the archive path is documented nowhere in the UI.
- **Impact:** Replay scores are not on the same scale as live scores for 48h.

### 3.5 `backend/config.py` — `AUTH_REQUIRED` defaults to `False`
- **Line 57:** `AUTH_REQUIRED: bool = False`. The `.env.example` sets it to `True`, but if `.env` is missing or omitted, the backend starts with zero auth, exposing all officer routes.

### 3.6 Hardcoded values
| Location | Value | Concern |
|---|---|---|
| `risk_engine.py:88` | `river_discharge > 25.0` → score +1.0 | No hydrological citation for Musi basin threshold |
| `risk_engine.py:63` | IMD scale: 25/64.5/115.5 mm | These are national IMD standards — appropriate but not locally validated |
| `grid.py:INCIDENT_RADIUS_M=500` | 500 m incident proximity | Arbitrary; undocumented rationale |
| `grid.py:EMERGING_LIMIT=10` | Top 10 emerging cells returned | Arbitrary cap |
| `grid.py:LAT_COUNT=10, LON_COUNT=12` | 120 cells over GHMC box | Implies ~2.8 km spacing; not tied to any GHMC administrative boundary |
| `config.py:GROQ_MODEL` | `openai/gpt-oss-20b` | Non-standard model ID string; may not resolve at Groq |

### 3.7 `scripts/label_schema.py` — `is_seed()` relies on all-blank detection
- A row with `date=""`, `label=""`, `label_type=""`, `source=""` is treated as a seed. If someone accidentally blanks those fields in a real label row, it silently becomes a seed instead of being rejected. This is a low-severity schema gap.

---

## 4. External APIs

| API | Auth | Rate Limits | Notes |
|---|---|---|---|
| Open-Meteo Forecast | None | ~10,000 req/day free tier | Multi-location batched; grid uses batch of 50 |
| Open-Meteo Archive | None | Same free tier | Used in training + replay |
| Open-Meteo GloFAS Flood | None | Same free tier | Single-point call at city centroid |
| Open-Elevation (SRTM) | None | Community instance; undocumented rate limit | Elevation cached in SQLite to reduce calls |
| Overpass API (OSM) | None | Fair-use; heavy queries throttled | 3600s cache; Overpass timeout 25s |
| OSRM (project-osrm.org) | None | Public demo; no SLA | Should be self-hosted for production |
| NDMA SACHET CAP RSS | None | Polled every 300s | Host-allowlisted; body-size capped at 1 MB |
| IMD CAP RSS (S3) | None | Polled every 300s | Same allowlist/cap |
| HTP waterlogging HTML | None | Polled every 900s | HTML scrape; brittle to page structure changes |
| Twilio / MSG91 SMS | Key required | Per Twilio plan | `SMS_TEST_MODE=True` by default; no key in repo |
| Groq (Predict agent) | Key required | Per Groq plan | Model ID `openai/gpt-oss-20b` — verify this resolves |
| Google Gemini (Prepare/Respond) | Key required | Per Gemini plan | `gemini-2.5-flash` documented reroute 2026-12-01 |

---

## 5. Prioritized Fix List

| Priority | Item | File(s) | Effort |
|---|---|---|---|
| P0 | Fix `test_template_seeds_are_not_labels` — test assumption broken by real labels | `tests/test_label_validation.py` | 2 lines |
| P1 | Add verified negatives to `hyderabad_events.csv` so a model can be trained | `data/labels/hyderabad_events.csv` | Research / labelling work |
| P1 | Document archive vs. live 48h rain discrepancy in replay UI banner | `backend/services/grid.py`, frontend replay banner | Small |
| P2 | `AUTH_REQUIRED` default should be `True` in `config.py` (or document why `False`) | `backend/config.py` | 1 line + doc update |
| P2 | Verify Groq model ID `openai/gpt-oss-20b` resolves; update if not | `backend/config.py`, `.env.example` | Small |
| P2 | Add a Pydantic V2-style `model_config = ConfigDict(...)` to fix deprecation warning | `backend/config.py` | 3 lines |
| P3 | Add source citation for river discharge threshold (25 m³/s) or annotate as placeholder | `backend/services/risk_engine.py` | Comment |
| P3 | Self-host or proxy OSRM for production reliability | Infrastructure | Large |
| P3 | HTP HTML scraper — add structural change detection to fail loudly | `backend/data_sources/htp_waterlogging.py` | Small |
