# Vanta Protocol — Known Technical Limitations & Operational Constraints

## 1. No Combined "Total Risk" Score
Vanta Protocol **refuses** to produce a combined multi-hazard or "total risk" composite index.
- **Scientific Justification:** Earthquakes, cyclones, wildfires, and urban flash floods operate on distinct physical regimes with fundamentally different casualty mechanisms, response lead times, and vulnerability functions.
- **Operational Danger:** A composite score (e.g. summing flood category 2 and earthquake magnitude 4) gives dispatchers a misleading impression of total danger, obscuring the primary life-safety priority.
- **Contract Enforced:** `UnifiedHazardResponse.total_risk_score` is strictly `null`.

---

## 2. Earthquake Seismicity Monitoring vs. Prediction
- **Impossibility of Prediction:** In accordance with USGS and global seismological consensus, earthquake prediction (specifying exact time, location, and magnitude in advance) is scientifically impossible with current physical understanding.
- **Scope Enforced:** The earthquake module provides **real-time observation and historical cataloging only** (`method: "observed"`, `forecast_window_h: 0`). The system never forecasts seismic events.

---

## 3. NASA FIRMS Active Fire Thermal Detections
- **Spatial Resolution:** VIIRS 375m nadir resolution means fires smaller than $\approx 100\text{ m}^2$ or low-intensity agricultural burning may go undetected.
- **Cloud Occlusion:** Heavy monsoon or cyclone cloud cover completely masks surface thermal radiative signals from spaceborne infrared sensors.
- **Credential Dependency:** Real-time satellite feeds require a NASA Earthdata / FIRMS `MAP_KEY`. If unset, the system gracefully falls back to baseline sample data without fabricating live events.

---

## 4. Meteorological Resolution vs. Urban Micro-Terrain
- **Weather Grid Resolution:** Open-Meteo uses ECMWF / GFS / ICON models with spatial resolutions between $0.1^\circ$ ($\approx 11\text{ km}$) and $0.25^\circ$.
- **Impact on Urban Flooding:** Local convective cloudbursts and localized street-level waterlogging occur at $50\text{ m} - 500\text{ m}$ scales. While per-cell weather queries mitigate city-wide uniformity, macro-model outputs cannot resolve micro-scale drainage choke points.
- **Mitigation:** The system overlays 64 field-verified Hyderabad Traffic Police (HTP) dip coordinates onto the meteorological forecast.

---

## 5. Machine Learning Training Status (Zero Negatives)
- **Current State:** 32 verified flood positive locations, 0 verified negatives.
- **Model Training Status:** **Refused.** No supervised binary classifier is loaded.
- **Active Method:** Rule-based heuristic scoring based on IMD rainfall thresholds (+0.5/+1.0/+1.5). All predictions explicitly declare `method: "rule_based"`, `model_version: "none"`, and `probability: null`.

---

## 6. Tier B Sensor & Telemetry Deficits
The following hazard modules are implemented as interface specifications only, with explicit missing sensor notifications:

| Hazard Module | Missing Sensor & Telemetry Requirements |
|---|---|
| **`flood_extension`** | Missing 2D hydraulic/hydrodynamic storm routing engine (SWMM/HEC-RAS) and municipal stormwater pipe GIS network. |
| **`landslide`** | Missing geotechnical shear strength, depth-to-bedrock maps, and real-time piezometric soil pore-water pressure telemetry. |
| **`drought`** | Missing multi-month satellite SMAP/GRACE soil moisture anomalies, SPEI meteorological indices, and reservoir storage telemetry. |
| **`heatwave`** | Missing wet-bulb globe temperature (WBGT) micro-sensor network, high-res urban canopy models, and calibrated epidemiological mortality curves. |
| **`tsunami`** | Missing deep-ocean DART tsunameter real-time telemetry and coastal bathymetric run-up inundation modeling (inland Greater Hyderabad has 0 direct ocean tsunami hazard). |
| **`lightning`** | Missing ground-based lightning detection network (LDN/LINET time-of-arrival VHF/VLF sensor array) and total lightning pulse telemetry. |
| **`volcano`** | Missing volcanic ash dispersion modeling and seismic tremor array (no active or Holocene volcanoes exist in Telangana or the Deccan Volcanic Province). |
