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
| 1 | **Rainfall & Weather** | **Open-Meteo Weather Forecast API** | `https://api.open-meteo.com/v1/forecast` | Fetches 24h precipitation sum, precipitation probability, and wind gusts at zone centroids. | [`backend/data_sources/open_meteo.py`](backend/data_sources/open_meteo.py) |
| 2 | **River Discharge & Flooding** | **Open-Meteo GloFAS Flood API** | `https://flood-api.open-meteo.com/v1/flood` | Fetches real-time river discharge ($\text{m}^3/\text{s}$) to detect basin overflow hazards. | [`backend/data_sources/open_meteo.py`](backend/data_sources/open_meteo.py) |
| 3 | **Terrain Elevation** | **Open-Elevation (SRTM)** | `https://api.open-elevation.com/api/v1/lookup` | Measures topographical elevation; identifies low-lying coastal depressions ($\le 10\text{ m}$). | [`backend/data_sources/elevation.py`](backend/data_sources/elevation.py) |
| 4 | **Shelters & Police Stations** | **OpenStreetMap Overpass API** | `https://overpass-api.de/api/interpreter` | Queries verified civic shelters, community halls, hospitals, and police stations. | [`backend/data_sources/osm.py`](backend/data_sources/osm.py) |
| 5 | **Evacuation Routing & ETAs** | **OSRM (Open Source Routing Machine)** | `https://router.project-osrm.org/route/v1/driving` | Computes road-network evacuation corridors and turn-by-turn GeoJSON geometries to safe shelters. | [`backend/services/routing.py`](backend/services/routing.py) |
| 6 | **Official Bulletins & Warnings** | **IMD (India Meteorological Department)** | `https://mausam.imd.gov.in` | Ingests official regional weather bulletins and disaster alerts. | [`backend/data_sources/imd.py`](backend/data_sources/imd.py) |
| 7 | **Map Display** | **OpenStreetMap Carto Tiles** | `https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png` | Dark-mode interactive basemap tiles. | [`frontend/src/components/Map.jsx`](frontend/src/components/Map.jsx) |

---

## Core Capabilities (V1)

### 1. Predict Milestone
- **Dynamic Ward/Zone Risk Derivation**: Derives real-time flood and cyclone risk scores ($1\text{ to }5$) across municipal zones (e.g. Adyar Basin, Velachery/Pallikaranai Marsh, Cooum Corridor, Tondiarpet Coast).
- **Explainable Model Output**: Every zone displays a transparent "Why this?" breakdown (e.g. `24h Rain: 0.0mm | River Discharge: 0.4 m³/s | Elevation: 6.1m (low-lying) | Historical flood basin`).

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
    │       ├── Map.jsx        # Leaflet map with dark theme, polygons, vectors
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
