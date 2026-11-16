# Vanta Protocol — Version 1.0 (CipherCop 2026)

Real-time disaster-response planning tool for police control rooms, built for the **CipherCop 2026 AI Disaster Response track**.

This is the watch officer's decision loop, not a weather map. Live rain on six published Hyderabad Traffic Police hotspots and a 120-cell GHMC grid decides whether an evacuation window opens. A verified OpenStreetMap shelter and an OSRM corridor are attached only when one exists. The officer approves the calendar entry and any SMS. Nothing is dispatched automatically.

---

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
| 5 | **Evacuation Routing & ETAs** | **OSRM (Open Source Routing Machine)** | `https://router.project-osrm.org/route/v1/driving` | Computes road-network evacuation corridors and turn-by-turn GeoJSON geometries to safe shelters. | [`backend/services/routing.py`](backend/services/routing.py) |
| 6 | **Official Bulletins & Warnings** | **IMD (India Meteorological Department)** | `https://mausam.imd.gov.in` | Checks the public IMD feed and reports its availability in source status. IMD alerts are not currently inputs to the risk score or agent reports. | [`backend/data_sources/imd.py`](backend/data_sources/imd.py) |
| 7 | **Map Display** | **OpenStreetMap Carto Tiles** | `https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png` | Basemap tiles. | [`frontend/src/components/Map.jsx`](frontend/src/components/Map.jsx) |
| 8 | **City grid** | **Open-Meteo**, batched | `GET /api/risk-grid` | 120 GHMC cells. `forecast_24h` is the evidence for the evacuation window. A failed cell stays null. | [`backend/services/grid.py`](backend/services/grid.py) |
| 9 | **Operations calendar** | Derived from the live risk grid | `POST /api/operations-calendar/refresh` | Under 25 mm: no evacuation window. At 25 mm or level 3: a 4-hour window. At 64.5 mm or level 4: a longer window. Officer approval required. | [`backend/services/operations_plan.py`](backend/services/operations_plan.py) |
| 10 | **Predict** | **Groq** | Officer-consented chat completion | Interprets the history question and writes the qualitative forecast. The question and summarized observations are sent only after consent. | [`backend/agents/groq.py`](backend/agents/groq.py) |
| 11 | **Prepare and Respond** | **Google Gemini** | `gemini-3.8-flash` by default | Readiness actions and the SOS draft. `gemini-2.5-flash` is deprecated for new use and reroutes on 2026-12-01. | [`backend/agents/gemini.py`](backend/agents/gemini.py) |
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
- **Hyderabad Waterlogging Hotspot Risk**: Derives screening risk levels ($1\text{ to }5$) at six geocoded major waterlogging points from the [Hyderabad Traffic Police list](https://echallan.tspolice.gov.in/htp/water_logging.html) (dated 2025-08-06). These are point locations, not ward boundaries, and indicate historical vulnerability rather than current flooding. The current pilot covers only these six published points.
- **Explainable Model Output**: Every hotspot displays a transparent "Why this?" breakdown of available weather, discharge, elevation and published vulnerability inputs.
- **Hotspot Weather Conditions**: Selecting a mapped hotspot shows Open-Meteo weather and forecast at that point; the panel includes feed status and update time. `GET /api/weather` exposes these readings per monitored location.

### 2. Prepare Milestone
- **Evacuation Corridors**: Automatically identifies the closest verified emergency shelter and routes civilian evacuation corridors via OSRM, accounting for active road blocks.
- **Patrol & Rescue Pre-Positioning**: Matches available field units (`rescue_boat`, `patrol`, `ambulance`) to high-risk zones based on asset suitability and proximity, calculating distance and response ETAs.
- **Officer Approval Workflow**: Pre-positioning recommendations remain in a pending state until authorized by the watch officer; approved dispatches are logged to an audit trail.
- **Road Diversions**: Officers can register road blocks or severe waterlogging zones to visually plan diversions.

---

## Architecture & Code Structure

```
Vanta Protocol/
├── data/hyderabad_hotspots.json   # Static HTP reference list, dated 2025-08-06
├── tests/                         # Pytest. HTTP is mocked only here
├── backend/
│   ├── main.py
│   ├── config.py
│   ├── models.py                  # RiskZone.risk_level is null when rainfall is missing
│   ├── db.py
│   ├── agents/                    # Predict (Groq), Prepare and Respond (Gemini)
│   ├── data_sources/              # Open-Meteo, elevation, Overpass, IMD
│   ├── services/
│   │   ├── risk_engine.py
│   │   ├── grid.py                # 120-cell GHMC grid
│   │   ├── routing.py             # Verified shelter or a clear failure
│   │   └── operations_plan.py     # Rainfall to evacuation window
│   └── routers/                   # risk, risk-grid, routes, operations, agents
└── frontend/src/
    ├── App.jsx
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
- Six hotspots: `http://127.0.0.1:8000/api/risk-zones`
- City grid: `http://127.0.0.1:8000/api/risk-grid`
- Feed health: `http://127.0.0.1:8000/api/sources`

Tests, from the project root, do not call live providers:

```bash
python -m pytest tests
```

### Agent provider setup
If you do not already have a project-root `.env`, copy `.env.example` to `.env`. Set `GROQ_API_KEY` for Predict and `GEMINI_API_KEY` for Prepare and Respond. Keep real keys out of source control and restart the backend after changing them. Public Open-Meteo endpoints do not require an API key.

### 2. Start the Frontend (React + Vite)
```powershell
cd frontend
npm run dev
```
- Control Room UI: `http://127.0.0.1:5173`

On Linux or macOS the same frontend command is `cd frontend && npm run dev`.

## Roadmap

These are not connected. They are not inputs to the risk score or the evacuation window.

- Windy API for an independent wind and precipitation cross-check.
- IMD cyclone bulletins as a structured alert, beyond the current public-feed availability check.
- A backtest of the 25 mm and 64.5 mm window rules against past Hyderabad rainfall and logged incidents.
