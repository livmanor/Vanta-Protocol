# Vanta Protocol — Version 1.0 (CipherCop 2026)

Real-time disaster-response planning tool for police control rooms. Built for the AI Disaster Response track.

---

## Key Capabilities (V1)

### 1. Predict: Flood & Cyclone Risk by Ward / Zone
- **Live Meteorological Ingestion**: Open-Meteo Weather Forecast API (24h rainfall, wind gusts, precipitation probability).
- **River Discharge Telemetry**: Open-Meteo GloFAS Flood API.
- **Topographical Inundation Risk**: Open-Elevation (SRTM) real elevation lookups (low-lying terrain < 10m).
- **Basin History**: Historical flood corridors (Adyar, Cooum, Velachery / Pallikaranai).
- **Explainability**: Every zone has a transparent "Why this?" formula breakdown and model output label.

### 2. Prepare: Evacuation, Pre-positioning & Diversions
- **Dynamic Evacuation Routing**: OSRM routing engine calculates turn-by-turn corridors from vulnerable zones to nearest verified emergency shelters / community relief centres.
- **Patrol & Rescue Pre-Positioning**: Recommends matching closest available units (`patrol`, `rescue_boat`, `ambulance`) to high-risk zones, giving ETAs and distance.
- **Human-in-the-Loop**: Pre-positioning requires officer approval before dispatch; all decisions logged to an audit trail.
- **Road Diversions**: Officers can register road blocks / diversions that feed into route planning.

### 3. Data Integrity & Prime Directive
- **Zero Mock Data**: Incidents and units start at 0 and are entered strictly through real officer intake or device GPS.
- **Source Health Bar**: Every data source displays its name, endpoint, last-updated timestamp, and a live/stale/unreachable status badge.

---

## System Architecture

```
Vanta Protocol/
├── backend/
│   ├── main.py                # FastAPI app & lifespan initialization
│   ├── config.py              # Configuration (.env driven)
│   ├── models.py              # Frozen Pydantic data contracts
│   ├── db.py                  # SQLite (aiosqlite) for incidents, units, roads, decisions
│   ├── cache.py               # TTL cache with freshness & source tracking
│   ├── data_sources/
│   │   ├── open_meteo.py      # Rainfall forecast & GloFAS river discharge
│   │   ├── elevation.py       # Open-Elevation SRTM client
│   │   ├── osm.py             # Overpass API (shelters, police stations)
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
│       └── sources.py         # GET /api/sources
│
└── frontend/
    ├── src/
    │   ├── App.jsx            # Control room workspace & tactical ribbon
    │   ├── api.js             # API client
    │   └── components/
    │       ├── Map.jsx        # Leaflet map with dark theme, polygons, vectors
    │       ├── SourceStatusBar.jsx  # Live feed health & freshness indicators
    │       ├── RiskZonePanel.jsx    # "Why this?" metrics & route trigger
    │       ├── EvacuationPanel.jsx  # OSRM route & shelter ETA
    │       ├── PrepositionPanel.jsx # AI recommendations & officer approval
    │       ├── UnitRegisterModal.jsx # Register unit + browser GPS
    │       ├── IncidentIntakeModal.jsx # Officer incident intake form
    │       └── BlockedRoadModal.jsx # Road diversion reporting
    └── vite.config.js
```

---

## Quickstart

### 1. Backend (FastAPI)
```powershell
# Create venv and install dependencies
py -m venv venv
.\venv\Scripts\python -m pip install -r requirements.txt

# Start backend server
.\venv\Scripts\python -m uvicorn backend.main:app --host 127.0.0.1 --port 8000
```
Backend runs at: `http://127.0.0.1:8000` (Docs at `http://127.0.0.1:8000/docs`)

### 2. Frontend (React + Vite)
```powershell
cd frontend
npm install
npm run dev
```
Frontend runs at: `http://127.0.0.1:5173`

