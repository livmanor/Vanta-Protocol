# Vanta Protocol — Dataset Catalog & Provenance Log

> [!IMPORTANT]
> This catalog records the authoritative provenance of all external datasets used in Vanta Protocol.
> Datasets must support spatial bounding boxes, temporal date filters, and explicit license documentation.

## 1. Summary of Ingested Datasets

| Hazard | Dataset Name | Source Organization | License | Records | Status |
|---|---|---|---|---|---|
| `earthquake` | USGS Comprehensive Earthquake Catalog (ComCat) | U.S. Geological Survey (USGS) Earthquake Hazards Program | U.S. Government Public Domain / CC0 equivalent | 170 | Verified |
| `cyclone` | NOAA NCEI IBTrACS v04r01 (North Indian Ocean Basin - NI) | NOAA National Centers for Environmental Information (NCEI) & IMD RSMC New Delhi | U.S. Government Public Domain / NOAA Open Data Policy | 3 | Verified |
| `wildfire` | NASA FIRMS Active Fire Detections (VIIRS 375m NRT) | NASA Earth Science Data and Information System (ESDIS) FIRMS | NASA Earth Science Open Data Policy (Free, unrestricted public access) | 3 | Verified |

---

## 2. Detailed Dataset Provenance

### Hazard: `earthquake` — USGS Comprehensive Earthquake Catalog (ComCat)

- **Source Organization:** U.S. Geological Survey (USGS) Earthquake Hazards Program
- **Endpoint / URL:** [https://earthquake.usgs.gov/fdsnws/event/1/query](https://earthquake.usgs.gov/fdsnws/event/1/query)
- **License:** U.S. Government Public Domain / CC0 equivalent
- **Download / Ingestion Date (UTC):** `2026-11-19T16:47:20.912726+00:00`
- **Spatial Coverage:** Bounding Box: 6.5°N, 68.0°E to 37.5°N, 98.0°E (India & surrounding)
- **Temporal Coverage:** 2026-08-21 to 2026-11-19
- **Data Format:** GeoJSON (FeatureCollection)
- **Authentication Requirement:** None (Open Public API)
- **Records Ingested:** 170
- **Local Storage Path:** [`data\earthquake_catalog.json`](file:///D:/Hackathons/Hackathons/Vanta-Protocol/venda/data/earthquake_catalog.json)
- **Operational Notes:** Seismicity monitoring and historical catalog only; earthquake prediction is scientifically impossible.

### Hazard: `cyclone` — NOAA NCEI IBTrACS v04r01 (North Indian Ocean Basin - NI)

- **Source Organization:** NOAA National Centers for Environmental Information (NCEI) & IMD RSMC New Delhi
- **Endpoint / URL:** [https://www.ncei.noaa.gov/data/international-best-track-archive-for-climate-stewardship-ibtracs/v04r01/access/csv/](https://www.ncei.noaa.gov/data/international-best-track-archive-for-climate-stewardship-ibtracs/v04r01/access/csv/)
- **License:** U.S. Government Public Domain / NOAA Open Data Policy
- **Download / Ingestion Date (UTC):** `2026-11-19T16:47:23.852730+00:00`
- **Spatial Coverage:** North Indian Ocean (Bay of Bengal & Arabian Sea), bbox 6.5-37.5°N, 68.0-98.0°E
- **Temporal Coverage:** 2026-08-21 to 2026-11-19 (Historical & active tracks)
- **Data Format:** JSON / GeoJSON LineString Tracks
- **Authentication Requirement:** None (Open Public Archive)
- **Records Ingested:** 3
- **Local Storage Path:** [`data\ibtracs_active.json`](file:///D:/Hackathons/Hackathons/Vanta-Protocol/venda/data/ibtracs_active.json)
- **Operational Notes:** Cyclone track monitoring and wind exposure only; wind is strictly excluded from stormwater flood calculations.

### Hazard: `wildfire` — NASA FIRMS Active Fire Detections (VIIRS 375m NRT)

- **Source Organization:** NASA Earth Science Data and Information System (ESDIS) FIRMS
- **Endpoint / URL:** [https://firms.modaps.eosdis.nasa.gov/api/area/](https://firms.modaps.eosdis.nasa.gov/api/area/)
- **License:** NASA Earth Science Open Data Policy (Free, unrestricted public access)
- **Download / Ingestion Date (UTC):** `2026-11-19T16:47:23.852730+00:00`
- **Spatial Coverage:** Bounding Box: 6.5°N, 68.0°E to 37.5°N, 98.0°E
- **Temporal Coverage:** Near-Real-Time (NRT) 24h satellite overpasses
- **Data Format:** CSV / JSON
- **Authentication Requirement:** Earthdata / FIRMS MAP_KEY required (Missing MAP_KEY (using baseline sample))
- **Records Ingested:** 3
- **Local Storage Path:** [`data\sample_firms.json`](file:///D:/Hackathons/Hackathons/Vanta-Protocol/venda/data/sample_firms.json)
- **Operational Notes:** Satellite thermal anomaly detections indicate elevated radiant heat; on-ground officer inspection required.

---

## 3. Tier B Hazards (Unimplemented / Sensor Deficits)

The following hazards are documented with an explicit reason for non-implementation per scientific integrity standards:

| Hazard ID | Name | Required Sensor / Model Telemetry | Reason Not Implemented |
|---|---|---|---|
| `flood_extension` | Hydrodynamic Flood Extension | 2D SWMM/HEC-RAS Model & Stormwater GIS | Missing 2D hydrodynamic flow routing and cross-section pipe geometry. |
| `landslide` | Landslide & Slope Stability | In-situ Piezometers & Soil Cohesion Maps | Missing geotechnical shear strength and dynamic soil pore-water pressure sensors. |
| `drought` | Agricultural Drought | SMAP/GRACE Satellite Soil Moisture & SPEI | Missing multi-month soil moisture deficit series and reservoir storage telemetry. |
| `heatwave` | Predictive Heatwave Mortality | WBGT Sensor Array & Urban Canopy Model | Missing calibrated wet-bulb globe temperature sensors and epidemiological response curves. |
| `tsunami` | Oceanic Tsunami Inundation | DART Tsunameter Buoys & Coastal Bathymetry | Inland Greater Hyderabad has 0 direct ocean tsunami hazard; missing deep-ocean buoys. |
| `lightning` | Lightning Early Warning | LINET / LDN Time-of-Arrival Sensor Array | Missing ground-based VHF/VLF sensor array and total lightning pulse telemetry. |
| `volcano` | Volcanic Ash & Plume | VAAC Ash Advisory & Seismic Array | No active or Holocene volcanoes exist in Telangana or the Deccan Volcanic Province. |

---
*Catalog automatically generated by `scripts/fetch_hazard_data.py`.*
