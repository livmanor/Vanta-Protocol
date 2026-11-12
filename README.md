# Vanta Protocol — Version 1.0 (CipherCop 2026)

Real-time disaster-response planning tool for police control rooms, built for the **CipherCop 2026 AI Disaster Response track**.

---

## Prime Directive & Real Data Policy

In strict accordance with [`agent_rules.md`](./agent_rules.md):
- **Zero Mock Data**: Incidents, field units, risk zones, weather, roads, and ETAs are never fabricated, placeholder, or seeded.
- **Incident & Unit Intake**: The application starts with **zero incidents** and **zero units**. Incidents are added only via verified intake forms; units are registered with live browser GPS or station assignments.
- **Honest States**: In the event an external feed is unreachable, the system displays an honest error or empty state with the last known timestamp.
- **Human-in-the-Loop**: The system calculates recommendations; the watch officer reviews and authorizes dispatch.

---

## Connected Live Data Sources (All Free & Public)

Every data source is connected at runtime and displayed in the UI's **Source Status Bar** with its endpoint, live/stale/unreachable status badge, and update timestamp:

| # | Domain | External Source | Endpoint | How It's Used | Implementation File |
|---|---|---|---|---|---|
| 1 | **Rainfall & Weather** | **Open-Meteo Weather Forecast API** | `https://api.open-meteo.com/v1/forecast` | Fetches current WMO weather condition, temperature, feels-like temperature, humidity, rain, cloud cover, wind and gusts, plus today's and the next two days' forecast at each monitored location. No API key is required for this public endpoint. | [`backend/data_sources/open_meteo.py`](backend/data_sources/open_meteo.py) |
| 2 | **River Discharge & Flooding** | **Open-Meteo GloFAS Flood API** | `https://flood-api.open-meteo.com/v1/flood` | Fetches real-time river discharge ($\text{m}^3/\text{s}$) to detect basin overflow hazards. | [`backend/data_sources/open_meteo.py`](backend/data_sources/open_meteo.py) |
| 3 | **Terrain Elevation** | **Open-Elevation (SRTM)** | `https://api.open-elevation.com/api/v1/lookup` | Measures topographical elevation; identifies low-lying coastal depressions ($\le 10\text{ m}$). | [`backend/data_sources/elevation.py`](backend/data_sources/elevation.py) |
| 4 | **Shelters & Police Stations** | **OpenStreetMap Overpass API** | `https://overpass-api.de/api/interpreter` | Queries verified civic shelters, community halls, hospitals, and police stations. | [`backend/data_sources/osm.py`](backend/data_sources/osm.py) |
| 5 | **Evacuation Routing & ETAs** | **OSRM (Open Source Routing Machine)** | `https://router.project-osrm.org/route/v1/driving` | Computes road-network evacuation corridors and turn-by-turn GeoJSON geometries to safe shelters. | [`backend/services/routing.py`](backend/services/routing.py) |
| 6 | **Official Bulletins & Warnings** | **IMD (India Meteorological Department)** | `https://mausam.imd.gov.in` | Ingests official regional weather bulletins and disaster alerts. | [`backend/data_sources/imd.py`](backend/data_sources/imd.py) |
| 7 | **Map Display** | **OpenStreetMap Carto Tiles** | `https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png` | Dark-mode interactive basemap tiles. | [`frontend/src/components/Map.jsx`](frontend/src/components/Map.jsx) |

---

## Core Capabilities (V1)

### Gemini Agent Workbench
- The **Agents** workspace offers three separately selectable and independently run agents: Weather Predict, Prepare and Respond. Each has its own goal, data disclosure and report; one agent does not silently run the others.
- The **Predict** agent accepts a freeform history question (for example, “show last year's flood effects in Hyderabad”), resolves a requested historical period and optional named hotspot, retrieves matching rainfall events, and shows rainfall plus app-recorded effects before the officer chooses an event to analyze. `POST /api/agents/predict/search` resolves and retrieves the history; `POST /api/agents/predict/run` runs the selected event.
- The **Prepare** agent uses the forecast, those historical impacts, resource availability and deterministic positioning recommendations to produce evidence-linked pre-event readiness actions and officer checks. It can provide checks when no units are registered; it never creates units, changes assignments, or dispatches.
- The workflow is manually started from the **Agents** tab; it does not call Gemini during automatic dashboard refreshes.
- Each run requires an operator to confirm the zone forecasts, historical rainfall and aggregate impact counts sent to Google. Raw incident reports, unit IDs, station names and exact unit coordinates are excluded. Responses follow the selected English, Hindi or Telugu UI language.
- Historical rainfall is reanalysis rather than rain-gauge observation. Traffic evidence is limited to records entered in this app; no live traffic or external traffic archive is connected. No record means unknown/unreported, not that roads were clear.
- The event explorer shows the archive's actual available-through date because historical product freshness can vary. Event totals are point samples at six mapped waterlogging hotspots, not citywide rainfall totals. Only incidents and blocked roads recorded in Vanta during the selected dates appear as local effects.
- Plain-language history search resolves named years (including “last year”), explicit years, and “last N days”; without a recognized period it searches the previous 90 days. It is currently a bounded date and area resolver, not an unrestricted chatbot or external news search.
- Configure `GEMINI_API_KEY` in the local backend `.env` file (never commit the key). `GEMINI_MODEL` can select the model.
- `GET /api/agents/status` reports configuration and agent goals. `POST /api/agents/run/predict`, `/prepare` or `/respond` runs only the selected agent. The legacy `POST /api/agents/run` combined endpoint remains for compatibility. Without a key, the UI reports setup is required.

### 1. Predict Milestone
- **Hyderabad Waterlogging Hotspot Risk**: Derives forecast-based risk scores ($1\text{ to }5$) at six geocoded major waterlogging points from the [Hyderabad Traffic Police list](https://echallan.tspolice.gov.in/htp/water_logging.html) (dated 2025-08-06). These are point locations, not ward boundaries, and indicate historical vulnerability rather than current flooding. The current pilot covers only these six published points.
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
├── backend/
│   ├── main.py                # FastAPI entrypoint, lifespan & CORS
│   ├── config.py              # Environment settings (Pydantic Settings)
│   ├── models.py              # Frozen Pydantic data contracts (Incident, Unit, RiskZone, BlockedRoad)
│   ├── db.py                  # SQLite database (aiosqlite) for incidents, units, roads, audit log
│   ├── cache.py               # TTL cache with freshness & source tracking
│   ├── data_sources/
│   │   ├── open_meteo.py      # Open-Meteo Weather Forecast & GloFAS Flood client
│   │   ├── elevation.py       # Open-Elevation SRTM client
│   │   ├── osm.py             # OpenStreetMap Overpass API client
│   │   └── imd.py             # IMD public feed parser
│   ├── services/
│   │   ├── risk_engine.py     # Derives RiskZone 1-5 from live telemetry
│   │   ├── routing.py         # OSRM evacuation & emergency routing
│   │   └── prepositioning.py  # Unit-to-zone matching & ETA calculation
│   └── routers/
│       ├── risk.py            # GET /api/risk-zones
│       ├── routes.py          # POST /api/evacuation-route, /api/blocked-roads
│       ├── units.py           # CRUD /api/units, /api/prepositioning
│       ├── incidents.py       # CRUD /api/incidents
│       └── sources.py         # GET /api/sources (Live status of all APIs)
│
└── frontend/
    ├── src/
    │   ├── App.jsx            # Control room workspace & tactical ribbon
    │   ├── api.js             # API wrapper
    │   └── components/
    │       ├── Map.jsx        # Leaflet map with hotspot markers, polygons, vectors
    │       ├── SourceStatusBar.jsx   # Live feed integrity & freshness indicators
    │       ├── RiskZonePanel.jsx     # "Why this?" metrics & route trigger
    │       ├── EvacuationPanel.jsx   # OSRM route & shelter ETA
    │       ├── PrepositionPanel.jsx  # AI recommendations & officer approval
    │       ├── UnitRegisterModal.jsx # Register unit + browser GPS
    │       ├── IncidentIntakeModal.jsx # Officer incident intake form
    │       └── BlockedRoadModal.jsx  # Road diversion reporting
    ├── index.html
    └── vite.config.js
```

---

## Quickstart

### Prerequisites
- Python 3.10+
- Node.js 18+ and npm

### 1. Start the Backend (FastAPI)
```powershell
# From the project root
.\venv\Scripts\python -m uvicorn backend.main:app --host 127.0.0.1 --port 8000
```
- API Health: `http://127.0.0.1:8000/api/health`
- Interactive OpenAPI Docs: `http://127.0.0.1:8000/docs`

### 2. Start the Frontend (React + Vite)
```powershell
cd frontend
npm run dev
```
- Control Room UI: `http://127.0.0.1:5173`
