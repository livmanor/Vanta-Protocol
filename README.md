# Vanta Protocol — Version 2.0 (CipherCop 2026)

Real-time multi-hazard disaster-response planning tool for police control rooms, built for the **CipherCop 2026 AI Disaster Response track**.

This is the watch officer's decision loop, not a generic weather map. Vanta Protocol integrates an independent multi-hazard engine covering seismic, cyclonic, thermal, and urban stormwater hazards without unscientific composite risk scores. Live rain on **~64 monitored HTP waterlogging points** across GHMC divisions and a configurable 120-cell GHMC grid decides whether an evacuation window opens. A verified OpenStreetMap shelter and an OSRM corridor are attached only when one exists. Suggested patrol prepositioning and response mitigation actions require explicit officer approval before dispatch.

---

## Technical Documentation Suite

- [`docs/VANTA_IMPLEMENTATION_REPORT.md`](docs/VANTA_IMPLEMENTATION_REPORT.md): Comprehensive implementation and audit report (what was broken/fixed, files changed, models trained [0 trained due to 0 negatives], tests executed with results).
- [`docs/API_DOCUMENTATION.md`](docs/API_DOCUMENTATION.md): OpenAPI specification for the Unified Hazard Engine, Tier A & B modules, and officer action approvals.
- [`docs/DATASET_CATALOG.md`](docs/DATASET_CATALOG.md): Complete data provenance log (source organizations, URLs, licenses, download dates, bounding boxes, records count).
- [`docs/DATA_PIPELINE.md`](docs/DATA_PIPELINE.md): Ingestion architecture, bounding boxes, rate-limiting semaphores, caching TTLs, and offline fallbacks.
- [`docs/MODEL_TRAINING_GUIDE.md`](docs/MODEL_TRAINING_GUIDE.md): Label validation gate, negative candidate generation, and reproducible training pipeline.
- [`docs/KNOWN_LIMITATIONS.md`](docs/KNOWN_LIMITATIONS.md): Technical limitations, scientific unpredictability of earthquakes, sensor deficit analysis for Tier B hazards.
- [`docs/PROGRESS.md`](docs/PROGRESS.md): Live project progress log and command output record.

---

## Unified Multi-Hazard Engine Architecture

### Strict Principle: No Combined "Total Risk" Score
Vanta Protocol **never produces a combined total risk score**. Earthquakes, cyclones, wildfires, and floods operate on incompatible physical scales and casualty dynamics. Summing or averaging them is unscientific and operationally hazardous. `total_risk_score` is strictly `null`.

### Tier A Modules (Real Public Telemetry)
1. **Earthquake Seismicity & Monitoring:**
   - Real-time USGS ComCat catalog for the India bounding box ($6.5^\circ\text{N} - 37.5^\circ\text{N}, 68.0^\circ\text{E} - 98.0^\circ\text{E}$).
   - Seismicity and monitoring **only, NO prediction**. `is_observed: true`, `forecast_window_h: 0`, `method: "observed"`.
2. **Cyclone Track & Wind Exposure:**
   - NOAA NCEI IBTrACS v04r01 North Indian Ocean best tracks.
   - Storm track monitoring, central pressure, gale radii, and distance exposure buffers. Wind is strictly excluded from stormwater flood calculations.
3. **Wildfire & Thermal Anomaly Detection:**
   - NASA FIRMS VIIRS 375m & MODIS 1km active fire detections.
   - Reads `MAP_KEY` or `NASA_FIRMS_MAP_KEY` from environment. Gracefully displays `missing_credentials` status if unset without fabricating live fire points.
4. **Urban Flood & Waterlogging:**
   - 64 geocoded Hyderabad Traffic Police (HTP) dip coordinates with per-cell Open-Meteo precipitation and IMD heavy rainfall thresholds (+0.5/+1.0/+1.5).

### Tier B Modules (Interface & Docs Only — Explicit Sensor Deficits)
Each Tier B module implements `BaseHazardModule` and explicitly returns `not_implemented: missing X`:
- `flood_extension`: Missing 2D hydraulic/hydrodynamic routing model (SWMM/HEC-RAS) and urban storm drain cross-section network data.
- `landslide`: Missing geotechnical shear strength, depth-to-bedrock maps, and real-time piezometric soil pore-pressure sensor feeds.
- `drought`: Missing multi-month satellite SMAP/GRACE soil moisture anomalies, SPEI meteorological indices, and reservoir storage telemetry.
- `heatwave`: Missing wet-bulb globe temperature (WBGT) micro-sensor network, high-res urban heat island canopy models, and epidemiological mortality response curves.
- `tsunami`: Missing deep-ocean DART tsunameter real-time telemetry and coastal bathymetric run-up inundation modeling.
- `lightning`: Missing ground-based lightning detection network (LDN/LINET VHF/VLF sensor array) and total lightning pulse telemetry.
- `volcano`: Missing volcanic ash dispersion modeling and seismic tremor array (no active or Holocene volcanoes in Telangana / Deccan Traps).

---

## Officer Approval & Response Recommendations

All mitigation recommendations (infrastructure inspections, chainsaw squad prepositioning, dewatering pump dispatches, fire tender dispatches) start in the `suggested` state. Officers review and authorize each action via the Tactical Map detail panel or the API:
- `POST /api/hazards/actions/{action_id}/approve`
- `POST /api/hazards/actions/{action_id}/reject`

---

## Quickstart & Run Instructions

### 1. Ingest External Datasets
```powershell
Set-Location d:\Hackathons\Hackathons\Vanta-Protocol\venda
python scripts/fetch_hazard_data.py --hazard all
```

### 2. Run Test Suite (60 Tests)
```powershell
python -m pytest tests/ -v --tb=short
```

### 3. Start Backend API Server
```powershell
python -m uvicorn backend.main:app --host 0.0.0.0 --port 8000 --reload
```

### 4. Start Frontend Tactical Console
```powershell
Set-Location frontend
cmd /c npm run dev -- --port 5173
```
- Open `http://localhost:5173`.
- Sign in: **Username:** `admin` | **Password:** `123`.
- Navigate to **Tactical Map** $\rightarrow$ **Hazards** tab to toggle hazard layers and inspect live observations.

---

## Officer authentication

Control-room access uses **local officer accounts** stored in SQLite. Passwords are bcrypt-hashed. Sessions are opaque tokens (httpOnly cookie and optional `Authorization: Bearer`). There is no Auth0 or Google login in this build.

1. Set in `.env`:
   - `AUTH_REQUIRED=true`
   - `BOOTSTRAP_OFFICER_USERNAME=...`
   - `BOOTSTRAP_OFFICER_PASSWORD=...` (change immediately; never commit)
   - optional `BOOTSTRAP_OFFICER_DISPLAY_NAME=Watch Officer`
2. Restart the backend. The bootstrap username is created once if it does not already exist.
3. Open the landing page, sign in, then enter the control room.
4. `/api/health` and `POST /api/sos/status` stay public. Every other `/api` route requires a session when `AUTH_REQUIRED=true`.

`AUTH_REQUIRED` defaults to false so local tests keep working without an account. Production should turn it on.

## Prime Directive & Real Data Policy

In strict accordance with [`agent_rules.md`](./agent_rules.md):
- **Zero Mock Data**: Incidents, field units, risk zones, weather, roads, and ETAs are never fabricated, placeholder, or seeded.
- **Incident & Unit Intake**: The application starts with **zero incidents** and **zero units**. Incidents are added only via verified intake forms; units are registered with live browser GPS or station assignments.
- **Honest States**: In the event an external feed is unreachable, the system displays an honest error or empty state with the last known timestamp.
- **Human-in-the-Loop**: The system calculates recommendations; the watch officer reviews and authorizes dispatch.

---

## Connected Live Data Sources (All Free & Public)

Data feeds are fetched at runtime and displayed in the UI's **Source Status Bar** with live, partial, stale, or failed status and an update timestamp. A reachable endpoint is not proof that every requested field was returned.

| # | Domain | External Source | Endpoint | How It's Used | Implementation File |
|---|---|---|---|---|---|
| 1 | **Rainfall & Weather** | **Open-Meteo Weather Forecast API** | `https://api.open-meteo.com/v1/forecast` | Fetches current conditions, today's daily precipitation/probability/wind, and hourly precipitation for a rolling past-48-hour sum at each monitored location. Requests use `Asia/Kolkata`, two past days, and three forecast days. No API key is required for this public endpoint. | [`backend/data_sources/open_meteo.py`](backend/data_sources/open_meteo.py) |
| 2 | **River Discharge & Flooding** | **Open-Meteo GloFAS Flood API** | `https://flood-api.open-meteo.com/v1/flood` | Fetches real-time river discharge ($\text{m}^3/\text{s}$) to detect basin overflow hazards. | [`backend/data_sources/open_meteo.py`](backend/data_sources/open_meteo.py) |
| 3 | **Terrain Elevation** | **Open-Elevation (SRTM)** | `https://api.open-elevation.com/api/v1/lookup` | Provides terrain context. Hyderabad hotspot scoring does not use a coastal absolute-elevation cutoff; the city grid may compare cells against the city median elevation. | [`backend/data_sources/elevation.py`](backend/data_sources/elevation.py) |
| 4 | **Shelters & Police Stations** | **OpenStreetMap Overpass API** | `https://overpass-api.de/api/interpreter` | Queries verified civic shelters, community halls, hospitals, and police stations. | [`backend/data_sources/osm.py`](backend/data_sources/osm.py) |
| 5 | **Evacuation Routing & ETAs** | **OSRM (Open Source Routing Machine)** | `https://router.project-osrm.org/route/v1/driving` | Requests alternative driving corridors and keeps the fastest one that stays more than `BLOCKED_ROAD_BUFFER_M` (default 30 m) from an officer-reported closure. A corridor that still crosses a closure is returned with a warning. Closures have no resolved status. | [`backend/services/routing.py`](backend/services/routing.py) |
| 6 | **Official CAP alerts** | **NDMA SACHET + IMD CAP RSS** | `https://sachet.ndma.gov.in/cap_public_website/rss/rss_india.xml` and `https://cap-sources.s3.amazonaws.com/in-imd-en/rss.xml` | Polls CAP 1.2 XML, matches Greater Hyderabad by LGD district code (`507,700,518,691`), and can raise the operations calendar band as a floor (orange→watch, red→heavy). Colour is derived from CAP severity when the message has no colour parameter. District-level only; text-only areas are shown as unverified and do not raise the floor. Does not change the flood risk score. | [`backend/data_sources/cap_alerts.py`](backend/data_sources/cap_alerts.py) |
| 6b | **HTP waterlogging points** | **Hyderabad Traffic Police HTML list** | `https://echallan.tspolice.gov.in/htp/water_logging.html` | Polls ~64 Major/Minor points across GHMC. Successful polls are saved to SQLite `htp_snapshot`; a failed poll serves that snapshot as **stale** (no 6-point JSON fallback at runtime). | [`backend/data_sources/htp_waterlogging.py`](backend/data_sources/htp_waterlogging.py) |
| 6c | **Replay** | **Open-Meteo Archive** | `GET /api/replay?date=YYYY-MM-DD` | Scores HTP points + the GHMC grid on archive rain for one IST day and drafts an operations plan **without** writing incidents, units, SMS, or calendar rows. UI shows a permanent `REPLAY — historical data, not live` banner. | [`backend/routers/replay.py`](backend/routers/replay.py) |
| 7 | **Map Display** | **OpenStreetMap Carto Tiles** | `https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png` | Basemap tiles. | [`frontend/src/components/Map.jsx`](frontend/src/components/Map.jsx) |
| 8 | **City grid** | **Open-Meteo**, batched | `GET /api/risk-grid` | 120 GHMC cells. `forecast_24h` is the evidence for the evacuation window. A failed cell stays null. | [`backend/services/grid.py`](backend/services/grid.py) |
| 9 | **Operations calendar** | Derived from the live risk grid | `POST /api/operations-calendar/refresh` | Under 25 mm: no evacuation window. At 25 mm or level 3: a 4-hour window. At 64.5 mm or level 4: a longer window. Officer approval required. A corridor warning is copied into the event details. | [`backend/services/operations_plan.py`](backend/services/operations_plan.py) |
| 9b | **Incident triage** | Derived from logged incidents and live zone risk | `GET /api/incidents/triage` | Ranks active incidents from type, urgency, people, vulnerability, report age and zone risk. Model output only. It does not assign a unit. | [`backend/services/triage.py`](backend/services/triage.py) |
| 10 | **Predict** | **Groq** | Officer-consented chat completion | Interprets the history question and writes the qualitative forecast. The question and summarized observations are sent only after consent. | [`backend/agents/groq.py`](backend/agents/groq.py) |
| 11 | **Prepare and Respond** | **Google Gemini** | `GEMINI_MODEL` + `GEMINI_FALLBACK_MODELS` | Readiness actions and the SOS draft. Default primary is `gemini-2.5-flash` (documented reroute on 2026-12-01); configure comma-separated fallbacks in `.env`. Deprecation/redirect responses are logged. | [`backend/agents/gemini.py`](backend/agents/gemini.py) |
| 12 | **Contacts and SOS** | **Twilio or MSG91** | Officer-approved `POST /api/sos/send` | Phone numbers are stored in SQLite for the officer's contact book and send record. They are not written to application logs. `SMS_TEST_MODE` defaults to on, so no SMS leaves the server until an officer turns it off and confirms a send. | [`backend/services/sms.py`](backend/services/sms.py) |

---

## Core Capabilities (V1)

### Agent Workbench
- The **Agents** workspace offers three separately selectable and independently run agents: Weather Predict, Prepare and Respond. Each has its own goal, data disclosure and report; one agent does not silently run the others.
- The **Predict** agent uses Groq to interpret a freeform history question and produce a qualitative, per-hotspot forecast assessment from supplied observations. Its default history window is the last seven days through today's Hyderabad local date; officers can specify a different window. The Predict LLM receives forecast/history evidence without the shared map's fixed weighted risk score. `POST /api/agents/predict/search` parses a history question; `POST /api/agents/predict/run` runs a selected historical window.
- The **Prepare** agent uses the forecast, those historical impacts, resource availability and deterministic positioning recommendations to produce evidence-linked pre-event readiness actions and officer checks. It can provide checks when no units are registered; it never creates units, changes assignments, or dispatches.
- The workflow is manually started from the **Agents** tab; it does not call Gemini during automatic dashboard refreshes.
- Each agent run requires provider-specific operator consent: Predict uses Groq, while Prepare and Respond use Gemini. Predict sends the officer's question for interpretation first, then sends selected forecast/history summaries only after separate run consent. Raw incident reports, unit IDs, station names and exact responder locations are excluded.
- Historical rainfall is reanalysis rather than rain-gauge observation. Traffic evidence is limited to records entered in this app; no live traffic or external traffic archive is connected. No record means unknown/unreported, not that roads were clear.
- For each location, `GET /api/weather` returns current conditions, a `today` daily forecast, and `rainfall_48h_mm` from hourly precipitation in the rolling interval `(now IST - 48 hours, now IST]`. Today's daily values are selected by matching the IST date in Open-Meteo's `daily.time`; arrays can begin in the past because the request includes `past_days=2`.
- Weather status is `live` only when current, today's required daily fields, and rolling 48-hour precipitation are available; partial data is marked `partial`. Feed failures are `failed` or `stale` when only cached data is available. Missing rainfall is kept null (shown as `—`) and is never interpreted as zero. The numeric risk score is withheld if both today's and 48-hour rainfall are missing.
- Risk levels are transparent screening heuristics, not a trained or locally calibrated flood prediction model. A live weather status means the requested fields were returned; it does not mean a gauge or officer verified conditions on the ground.
- The event explorer shows the archive's actual available-through date because historical product freshness can vary. Event totals are point samples at six mapped waterlogging hotspots, not citywide rainfall totals. Only incidents and blocked roads recorded in Vanta during the selected dates appear as local effects.
- Configure `GROQ_API_KEY` and optionally `GROQ_MODEL` in the project-root `.env` for Predict. `GEMINI_API_KEY` continues to power Prepare and Respond. The search question itself is sent to Groq for intent parsing; the UI asks for consent before that request and separately before sending summarized forecast/history evidence for analysis.
- Configure `GEMINI_API_KEY` in the project-root `.env` file (never commit the key). `GEMINI_MODEL` can select the model.
- `GET /api/agents/status` reports each provider's configuration and agent goals. `POST /api/agents/run/predict`, `/prepare` or `/respond` runs only the selected agent. The legacy `POST /api/agents/run` combined endpoint requires both provider keys and both consents. Without a provider key, the UI reports setup is required.

### 1. Predict Milestone
- **Hyderabad Waterlogging Hotspot Risk**: Derives screening risk levels ($1\text{ to }5$) at geocoded points from the live [Hyderabad Traffic Police waterlogging list](https://echallan.tspolice.gov.in/htp/water_logging.html), **GHMC zone-wise** (`HTP_ZONE_FILTER=all` by default). Each point keeps division (Khairatabad, Golconda, …) and Major/Minor severity. The catalog refreshes on a poller so agents see page updates; points without coordinates are skipped. These are vulnerability points, not a live flood report.
- **Explainable Model Output**: Every hotspot displays a transparent "Why this?" breakdown of available weather, discharge, elevation and published vulnerability inputs.
- **Hotspot Weather Conditions**: Selecting a mapped hotspot shows Open-Meteo weather and forecast at that point; the panel includes feed status and update time. `GET /api/weather` exposes these readings per monitored location.

### 2. Prepare Milestone
- **Evacuation Corridors**: Identifies the nearest verified emergency shelter and asks OSRM for alternatives. The fastest corridor that stays clear of officer-reported closures is shown. If every alternative and the next two shelters still cross a closure, the shortest corridor is shown with an explicit warning. Closures have no resolved status, so the officer confirms they are still active.
- **Patrol & Rescue Pre-Positioning**: Matches available field units (`rescue_boat`, `patrol`, `ambulance`) to high-risk zones based on asset suitability and proximity, calculating distance and response ETAs.
- **Officer Approval Workflow**: Pre-positioning recommendations remain in a pending state until authorized by the watch officer; approved dispatches are logged to an audit trail.
- **Road Diversions**: Officers can register road blocks or severe waterlogging zones to visually plan diversions.

---

## Architecture & Code Structure

```
Vanta Protocol/
├── data/hyderabad_hotspots.json   # Seed coordinates for labelling only (not used at runtime)
├── data/labels/                   # Human waterlogging labels (no invented rows)
├── docs/backtest_report.md        # 64 HTP points -> 5 unique weather cells
├── docs/model_report.md           # Train comparison or "labels below gate"
├── tests/                         # Pytest. HTTP is mocked only here
├── backend/
│   ├── main.py
│   ├── config.py
│   ├── models.py                  # RiskZone.risk_level is null when rainfall is missing
│   ├── db.py                      # Includes htp_snapshot for last good HTP list
│   ├── agents/                    # Predict (Groq), Prepare and Respond (Gemini)
│   ├── data_sources/              # Open-Meteo, elevation, Overpass, HTP, CAP
│   ├── services/
│   │   ├── risk_engine.py
│   │   ├── grid.py                # 120-cell GHMC grid (+ archive replay)
│   │   ├── routing.py             # Verified shelter or a clear failure
│   │   ├── operations_plan.py     # Rainfall to evacuation window
│   │   └── replay.py              # Historical day loop (read-only)
│   └── routers/                   # risk, risk-grid, replay, routes, operations, agents
└── frontend/src/
    ├── App.jsx                    # Replay toggle + permanent REPLAY banner
    ├── api.js
    └── components/                # Map, calendar, SMS approval, intake modals
```

---

## Quickstart

### Prerequisites
- Python 3.10+
- Node.js 18+ and npm

### 1. Start the Backend (FastAPI)

Windows, from the project root:

```powershell
.\venv\Scripts\python -m uvicorn backend.main:app --host 127.0.0.1 --port 8000
```

Linux or macOS, from the project root:

```bash
source venv/bin/activate
python -m uvicorn backend.main:app --host 127.0.0.1 --port 8000
```

- API health: `http://127.0.0.1:8000/api/health`
- OpenAPI docs: `http://127.0.0.1:8000/docs`
- HTP points (live/stale snapshot): `http://127.0.0.1:8000/api/risk-zones`
- City grid: `http://127.0.0.1:8000/api/risk-grid`
- Replay a past day: `http://127.0.0.1:8000/api/replay?date=2024-09-01`
- Feed health: `http://127.0.0.1:8000/api/sources`

Tests, from the project root, do not call live providers:

```bash
python -m pytest tests
```

### Agent provider setup
If you do not already have a project-root `.env`, copy `.env.example` to `.env`. Set `GROQ_API_KEY` for Predict and `GEMINI_API_KEY` for Prepare and Respond. Optionally set `GEMINI_MODEL` and comma-separated `GEMINI_FALLBACK_MODELS` (primary `gemini-2.5-flash` is documented to reroute on 2026-12-01). Keep real keys out of source control and restart the backend after changing them. Public Open-Meteo endpoints do not require an API key.

### 2. Start the Frontend (React + Vite)
```powershell
cd frontend
npm run dev
```
- Control Room UI: `http://127.0.0.1:5173`

On Linux or macOS the same frontend command is `cd frontend && npm run dev`.

## Hazard coverage

Flood screening uses Open-Meteo rainfall and wind, GloFAS river discharge, elevation context, and the published Hyderabad Traffic Police waterlogging list. Heat screening uses the same Open-Meteo forecast's daily maximum and feels-like maximum. It is shown separately and does not change the flood level. The plain threshold is 40 C, the IMD heatwave criterion for plains, used here as a screening heuristic. A missing temperature stays blank.

Earthquake and landslide handling are not included. No ground-truth feed for those hazards is connected.

## Trigger-frequency check

`python scripts/backtest_thresholds.py` loads all geocoded HTP points, snaps them to the Open-Meteo ~0.1° grid, and writes `docs/backtest_report.md`. Latest run: **64 points -> 5 unique weather cells**, with per-cell watch/heavy counts and hourly-peak misses (≥30 mm/hour while daily total is under 25 mm or missing). Missing archive days stay missing. This is trigger frequency only, not labelled accuracy, and is not an input to the live risk level.

## Replay mode

Toggle **Replay** in the control-room header, pick an IST date (e.g. `2024-09-01`, a heavy day in the backtest), and the map/calendar load archive-backed risk + a drafted evacuation window. The UI keeps a permanent banner: `REPLAY — historical data, not live`. Replay never writes incidents, units, SMS, or calendar rows.

## Going live with SMS

`SMS_TEST_MODE` defaults to true. In that mode the Respond banner says TEST MODE and a confirmed send is stored as queued. No provider is called.

To send for real, set `SMS_TEST_MODE=false` and restart the backend. The banner then says LIVE MODE.

Twilio:

```
SMS_PROVIDER=twilio
SMS_SENDER=+1XXXXXXXXXX
TWILIO_ACCOUNT_SID=
TWILIO_AUTH_TOKEN=
SMS_DLT_TEMPLATE_ID=
SMS_STATUS_CALLBACK_URL=https://<public-host>/api/sos/status
```

India delivery needs a DLT-registered template. Put its id in `SMS_DLT_TEMPLATE_ID`. Twilio then sends that content template instead of a free-form body. Delivery updates arrive at `POST /api/sos/status`. The handler checks the Twilio signature against `SMS_STATUS_CALLBACK_URL` and maps the provider status onto the send log (Queued, Sent, Delivered, or Failed).

MSG91:

```
SMS_PROVIDER=msg91
SMS_SENDER=<approved-sender-id>
MSG91_AUTH_KEY=
MSG91_TEMPLATE_ID=
SMS_DLT_TEMPLATE_ID=
```

MSG91 also requires an approved DLT flow template. The status callback above is the Twilio webhook. MSG91 delivery updates are not given a separate callback in this build.

Phone numbers stay in the SQLite contact book and the send log. They are not written to application logs. Rotate any key that was shared, pasted into a chat, or placed in a zip.

## Waterlogging labels and model training

`data/labels/hyderabad_events.csv` is for human-verified labels only (see `docs/LABELING_GUIDE.md`). Current file has location seeds with blank dates — **not trained yet, labels below gate** (`docs/model_report.md`).

`python scripts/validate_labels.py` prints valid positives/negatives, distinct events, and how many more are needed to reach 30 positives / 3 events. Bad rows are rejected.

`python scripts/train_model.py` refuses until that gate clears. When it runs, it compares the ≥25 mm baseline to logistic regression and gradient boosting with leave-one-event-out validation and writes real precision/recall/F1 to `docs/model_report.md` (including poor scores). Uncertain negatives are excluded. The live rule score in `backend/services/risk_engine.py` is unchanged.

## Roadmap

These are not inputs to the live risk score.

- Windy API for an independent wind and precipitation cross-check.
- CAP orange/red floors can raise the operations calendar band. They still do not change the numeric flood risk score on the map. Matching is district-code only for Greater Hyderabad.
- Earthquake and landslide coverage. No ground-truth feed is connected.
