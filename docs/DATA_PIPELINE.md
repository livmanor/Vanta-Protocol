# Vanta Protocol — Data Ingestion & Processing Pipeline

## 1. Overview
The Vanta Protocol data pipeline ingests, validates, caches, and transforms external telemetry from satellite, radar, meteorological, seismic, and municipal feeds into actionable tactical situational awareness for police control rooms.

---

## 2. Ingested Data Sources

| Source | Organization | Telemetry / Content | Access Method | Update Cadence | Fallback Strategy |
|---|---|---|---|---|---|
| **USGS ComCat** | U.S. Geological Survey | Real-time global seismic catalog (M2.5+ for India bbox) | REST API (GeoJSON) | On-demand / 15 min poll | Stale cached response; local baseline [`data/earthquake_catalog.json`](file:///d:/Hackathons/Hackathons/Vanta-Protocol/venda/data/earthquake_catalog.json) |
| **NOAA IBTrACS** | NOAA NCEI / IMD RSMC | Tropical cyclone best tracks, central pressure, gale radii | REST / Curated GeoJSON | 6-hourly storm fixes | Local baseline [`data/ibtracs_active.json`](file:///d:/Hackathons/Hackathons/Vanta-Protocol/venda/data/ibtracs_active.json) |
| **NASA FIRMS** | NASA ESDIS | VIIRS 375m & MODIS 1km active fire thermal anomalies | Area CSV API | Near-Real-Time (NRT) overpasses | Graceful `missing_credentials` status if `MAP_KEY` unset; baseline [`data/sample_firms.json`](file:///d:/Hackathons/Hackathons/Vanta-Protocol/venda/data/sample_firms.json) |
| **Open-Meteo Weather** | Open-Meteo / ECMWF / DWD | Per-cell precipitation sum, temperature, wind gusts | Async HTTP REST | 30 min cache TTL | Per-cell cache hit; stale snapshot on 429 / timeout |
| **Open-Meteo GloFAS** | Copernicus / ECMWF | Basin river discharge ($m^3/s$) | REST API | 30 min cache TTL | Stale cached reading; null with warning |
| **HTP Waterlogging** | Hyderabad Traffic Police | Geocoded historical flood dips and vulnerable points | HTML table scraping | 15 min poller | SQLite snapshot table with timestamp |
| **NDMA SACHET** | National Disaster Management Authority | Common Alerting Protocol (CAP 1.2) XML feeds | RSS / XML Feed | 5 min background poller | In-memory alerts store with district code filter |
| **Open-Elevation** | Open-Elevation Project | Point elevations ($m$ above sea level) | Batch REST API | 24 hour SQLite cache | Stale SQLite cache |
| **OSM / Overpass** | OpenStreetMap Foundation | Emergency shelters, police stations, roads | Overpass QL API | 1 hour cache TTL | Fallback station catalog |

---

## 3. Spatial Bounding Boxes & Reference Geometries

```
+--------------------------------------------------------------+
| India National BBox (USGS, IBTrACS, FIRMS)                  |
| 6.5° N to 37.5° N  |  68.0° E to 98.0° E                     |
|                                                              |
|       +---------------------------------------------+        |
|       | Telangana & Regional Cyclone Exposure Area   |        |
|       | 15.0° N to 19.5° N  |  77.0° E to 81.5° E   |        |
|       |                                             |        |
|       |       +-----------------------------+       |        |
|       |       | GHMC Monitoring Grid (10x12)|       |        |
|       |       | 17.30° N to 17.56° N        |       |        |
|       |       | 78.30° E to 78.62° E        |       |        |
|       |       | Res: 2.76 km per cell       |       |        |
|       |       +-----------------------------+       |        |
|       +---------------------------------------------+        |
+--------------------------------------------------------------+
```

---

## 4. Rate Limiting & Concurrency Controls

External APIs (especially Open-Meteo, USGS, and Overpass) enforce strict rate limits and burst restrictions. The pipeline implements:

1. **Per-Cell Cache Keys:**
   - Weather is cached per grid cell: `grid_cell_wx_{cell_id}`.
   - Hotspots deduplicate by rounding coordinates to 2 decimal places ($\approx 1\text{ km}$ unique cell): `htp_cell_wx_{lat:.2f}_{lng:.2f}`. 64 HTP points require only $\sim 5$ unique Open-Meteo API requests.
2. **Batch Concurrency Semaphores:**
   - Grid batch fetch: `asyncio.Semaphore(2)`.
   - HTP hotspot fetch: `asyncio.Semaphore(3)`.
3. **HTTP 429 & Timeout Graceful Degradation:**
   - HTTP 429 responses are intercepted without throwing unhandled exceptions.
   - Affected cells revert to stale cached values (marked `status: "stale"`) or `status: "failed"`.
   - Never aborts the entire city grid due to a single failed batch.

---

## 5. Dataset Ingestion Script

The pipeline provides `scripts/fetch_hazard_data.py` to ingest public hazard datasets and regenerate provenance documentation:

```bash
# Ingest all Tier A hazard datasets for India bbox
python scripts/fetch_hazard_data.py --hazard all

# Query earthquakes for custom bbox and date window
python scripts/fetch_hazard_data.py --hazard earthquake --bbox 15.0,77.0,19.0,81.0 --start-date 2024-01-01 --end-date 2024-11-19

# Query NASA FIRMS with explicit key
python scripts/fetch_hazard_data.py --hazard wildfire --firms-key YOUR_MAP_KEY
```

All invocations append verified provenance to [`docs/DATASET_CATALOG.md`](file:///d:/Hackathons/Hackathons/Vanta-Protocol/venda/docs/DATASET_CATALOG.md).
