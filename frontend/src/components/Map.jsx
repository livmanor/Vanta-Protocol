import React, { useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import { Search, X, MapPin, Loader2, Compass, Shield, Navigation, CheckCircle2 } from 'lucide-react';
import { HYDERABAD_LOCATIONS, searchHyderabadLocations } from '../data/hyderabadLocations';
import { snapPointToRoad, fetchPatrolRoute } from '../api';
import PatrolPanel from './PatrolPanel';

const riskColor = (level) => {
  if (level === null || level === undefined) return '#94a3b8';
  switch (level) {
    case 5: return '#dc2626';
    case 4: return '#ea580c';
    case 3: return '#d97706';
    case 2: return '#059669';
    default: return '#059669';
  }
};

export default function Map({
  riskZones,
  selectedZone,
  onSelectZone,
  activeRoute,
  units,
  incidents,
  blockedRoads,
  prepositionSuggestions,
  onOpenWindy,
  pinnedLocation,
  onPinLocation,
  onLogIncidentAtPin,
  hazards = [],
  activeHazardFilters = {},
  selectedHazard = null,
  onSelectHazard = () => {},
  citizenReports = [],
  selectedCitizenReport = null,
  onSelectCitizenReport = () => {},
}) {
  const mapContainerRef = useRef(null);
  const mapInstanceRef = useRef(null);
  const onSelectRef = useRef(onSelectZone);
  onSelectRef.current = onSelectZone;
  const onPinLocationRef = useRef(onPinLocation);
  onPinLocationRef.current = onPinLocation;
  const onLogIncidentRef = useRef(onLogIncidentAtPin);
  onLogIncidentRef.current = onLogIncidentAtPin;
  const pinnedLocationRef = useRef(pinnedLocation);
  pinnedLocationRef.current = pinnedLocation;

  // Patrol Route & Road Snapping State
  const [patrolPoints, setPatrolPoints] = useState([]);
  const [activePointIndex, setActivePointIndex] = useState(0);
  const [isPatrolMode, setIsPatrolMode] = useState(false);
  const [isPatrolAddMode, setIsPatrolAddMode] = useState(false);
  const [patrolRouteStats, setPatrolRouteStats] = useState(null);
  const [isSimulatingPatrol, setIsSimulatingPatrol] = useState(false);
  const [snappedToast, setSnappedToast] = useState(null);

  const isPatrolAddModeRef = useRef(isPatrolAddMode);
  isPatrolAddModeRef.current = isPatrolAddMode;
  const patrolPointsRef = useRef(patrolPoints);
  patrolPointsRef.current = patrolPoints;
  const handleAddPatrolPointRef = useRef(null);

  // Location Search State
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [isSearching, setIsSearching] = useState(false);
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const searchContainerRef = useRef(null);

  // Close search dropdown on click outside
  useEffect(() => {
    function handleClickOutside(e) {
      if (searchContainerRef.current && !searchContainerRef.current.contains(e.target)) {
        setIsSearchOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Comprehensive search combining directory, live riskZones, coordinates, and Nominatim
  useEffect(() => {
    const q = searchQuery.trim();
    if (!q) {
      // Default / empty search: show top key pilot locations & hotspots
      const defaults = HYDERABAD_LOCATIONS.slice(0, 8).map(loc => ({
        id: `default-${loc.name}`,
        name: loc.name,
        subText: loc.subText,
        lat: loc.lat,
        lng: loc.lng,
        category: loc.category,
        type: loc.category.toLowerCase()
      }));
      setSearchResults(defaults);
      setIsSearching(false);
      return;
    }

    // Check if query is raw coordinates: e.g. "17.3914, 78.4702" or "17.3914 78.4702"
    const coordMatch = q.match(/^([-+]?\d{1,2}(?:\.\d+)?)[,\s]+([-+]?\d{1,3}(?:\.\d+)?)$/);
    if (coordMatch) {
      const lat = parseFloat(coordMatch[1]);
      const lng = parseFloat(coordMatch[2]);
      if (lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180) {
        setSearchResults([{
          id: 'coord-direct',
          name: `Coordinates: ${lat.toFixed(6)}, ${lng.toFixed(6)}`,
          subText: 'Custom GPS Coordinate Point',
          lat,
          lng,
          category: 'GPS',
          type: 'coord'
        }]);
        setIsSearching(false);
        setIsSearchOpen(true);
        return;
      }
    }

    // 1. Instant match from comprehensive Hyderabad directory
    const catalogMatches = searchHyderabadLocations(q).map(loc => ({
      id: `dir-${loc.name}`,
      name: loc.name,
      subText: loc.subText,
      lat: loc.lat,
      lng: loc.lng,
      category: loc.category,
      type: loc.category.toLowerCase()
    }));

    // 2. Local search from live riskZones (HTP Hotspots)
    const zoneMatches = [];
    if (riskZones && Array.isArray(riskZones)) {
      riskZones.forEach(z => {
        if (z.name && z.name.toLowerCase().includes(q.toLowerCase())) {
          const coords = z.polygon?.coordinates;
          const lat = z.lat ?? coords?.[1];
          const lng = z.lng ?? z.lon ?? coords?.[0];
          if (lat != null && lng != null) {
            zoneMatches.push({
              id: `zone-${z.id}`,
              name: z.name,
              subText: `Waterlogging Hotspot · Risk Level ${z.risk_level ?? 'N/A'}`,
              lat,
              lng,
              category: 'Hotspot',
              type: 'hotspot',
              raw: z
            });
          }
        }
      });
    }

    // Combine all instant local matches
    const initialList = [...zoneMatches];
    catalogMatches.forEach(cm => {
      if (!initialList.some(item => Math.abs(item.lat - cm.lat) < 0.003 && Math.abs(item.lng - cm.lng) < 0.003)) {
        initialList.push(cm);
      }
    });

    setSearchResults(initialList);
    if (initialList.length > 0) {
      setIsSearchOpen(true);
    }

    // 4. Remote pan-India geocoding search on OpenStreetMap Nominatim with street-level resolution
    setIsSearching(true);
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      try {
        const url = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(q)}&countrycodes=in&addressdetails=1&limit=10`;
        const res = await fetch(url, {
          signal: controller.signal,
          headers: { 'Accept': 'application/json' }
        });
        if (res.ok) {
          const data = await res.json();
          const remoteMatches = data
            .map((item, idx) => {
              const lat = parseFloat(item.lat);
              const lon = parseFloat(item.lon);
              // Filter to India bounding box
              if (lat < 6.0 || lat > 38.0 || lon < 68.0 || lon > 98.0) return null;
              if (isNaN(lat) || isNaN(lon)) return null;

              const addr = item.address || {};
              const parts = item.display_name.split(',');

              // Determine name and category
              let title = parts[0].trim();
              let category = 'Location';

              if (addr.road || addr.pedestrian || addr.footway || item.class === 'highway') {
                category = 'Street';
                title = addr.road || addr.pedestrian || parts[0].trim();
              } else if (addr.hospital || addr.clinic || item.type === 'hospital') {
                category = 'Hospital';
              } else if (addr.police || item.type === 'police') {
                category = 'Police';
              } else if (addr.suburb || addr.neighbourhood || addr.residential) {
                category = 'Area';
              } else if (addr.city || addr.town || addr.village) {
                category = 'City';
              }

              // Build informative subtext: neighbourhood, city, state, pincode
              const localityParts = [
                addr.suburb || addr.neighbourhood,
                addr.city || addr.town || addr.village || addr.county,
                addr.state,
                addr.postcode
              ].filter(Boolean);

              const subText = localityParts.length > 0 ? localityParts.join(', ') : parts.slice(1, 4).join(',').trim();

              return {
                id: `nominatim-${idx}-${item.place_id}`,
                name: title,
                subText,
                lat,
                lng: lon,
                category,
                type: category.toLowerCase()
              };
            })
            .filter(Boolean);

          const merged = [...initialList];
          remoteMatches.forEach(rm => {
            if (!merged.some(c => Math.abs(c.lat - rm.lat) < 0.0015 && Math.abs(c.lng - rm.lng) < 0.0015)) {
              merged.push(rm);
            }
          });
          setSearchResults(merged);
          setIsSearchOpen(true);
        }
      } catch (err) {
        if (err.name !== 'AbortError') {
          console.warn('Pan-India geocoding search failed:', err);
        }
      } finally {
        setIsSearching(false);
      }
    }, 300);

  return () => {
    clearTimeout(timer);
    controller.abort();
  };
}, [searchQuery, riskZones]);

const handleSelectLocation = (loc) => {
  setIsSearchOpen(false);
  setSearchQuery(loc.name);

  const map = mapInstanceRef.current;
  if (map) {
    map.flyTo([loc.lat, loc.lng], 15, { animate: true, duration: 1.2 });
    // Zoom dynamically: street-level gets close zoom 17, areas zoom 15, cities zoom 12
    const targetZoom = loc.category === 'Street' ? 17 : loc.category === 'City' ? 12 : 15;
    map.flyTo([loc.lat, loc.lng], targetZoom, { animate: true, duration: 1.2 });
  }

  // Automatically drop pin at searched location
  onPinLocationRef.current?.({
    lat: Number(loc.lat.toFixed(6)),
    lng: Number(loc.lng.toFixed(6))
  });

  if (loc.raw) {
    onSelectRef.current?.(loc.raw);
  }
};

  const drawPatrolRouteOnMap = (geometry) => {
    const map = mapInstanceRef.current;
    if (!map) return;

    if (layersRef.current.patrolRoute) {
      map.removeLayer(layersRef.current.patrolRoute);
      layersRef.current.patrolRoute = null;
    }

    if (!geometry) return;

    const routeLayer = L.geoJSON(
      { type: 'Feature', geometry },
      {
        style: {
          color: '#09090B',
          weight: 5,
          opacity: 0.88,
          dashArray: '8, 6',
          lineCap: 'round',
          lineJoin: 'round'
        }
      }
    );

    routeLayer.addTo(map);
    layersRef.current.patrolRoute = routeLayer;
  };

  const handleAddPatrolPoint = async (lat, lng) => {
    // Snap clicked point to nearest road
    const res = await snapPointToRoad(lat, lng);
    const newPt = {
      id: `patrol-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
      lat: res.lat,
      lng: res.lng,
      original_lat: lat,
      original_lng: lng,
      distance_m: res.distance_m,
      road_name: res.road_name,
      snapped: res.snapped,
      created_at: new Date().toISOString()
    };

    setPatrolPoints(prev => {
      const updated = [...prev, newPt];
      if (updated.length >= 2) {
        fetchPatrolRoute(updated).then(routeData => {
          if (routeData) {
            setPatrolRouteStats({
              distance_meters: routeData.distance_meters,
              duration_seconds: routeData.duration_seconds
            });
            drawPatrolRouteOnMap(routeData.geometry);
          }
        });
      }
      return updated;
    });

    setIsPatrolMode(true);

    if (res.distance_m > 3) {
      setSnappedToast({
        text: `Point ${patrolPointsRef.current.length + 1} snapped to nearest road${res.road_name ? ` (${res.road_name})` : ''} · moved ${res.distance_m}m`,
        timestamp: Date.now()
      });
      setTimeout(() => setSnappedToast(null), 4500);
    }
  };
  handleAddPatrolPointRef.current = handleAddPatrolPoint;

  const handleAdvancePoint = () => {
    setActivePointIndex(prev => prev + 1);
  };

  const handleResetPatrol = () => {
    setActivePointIndex(0);
    setIsSimulatingPatrol(false);
  };

  const handleClearPatrol = () => {
    setPatrolPoints([]);
    setActivePointIndex(0);
    setIsPatrolMode(false);
    setIsPatrolAddMode(false);
    setIsSimulatingPatrol(false);
    setPatrolRouteStats(null);
    const map = mapInstanceRef.current;
    if (map) {
      if (layersRef.current.patrolMarkers) {
        map.removeLayer(layersRef.current.patrolMarkers);
        layersRef.current.patrolMarkers = null;
      }
      if (layersRef.current.patrolRoute) {
        map.removeLayer(layersRef.current.patrolRoute);
        layersRef.current.patrolRoute = null;
      }
      if (layersRef.current.patrolSnapLines) {
        map.removeLayer(layersRef.current.patrolSnapLines);
        layersRef.current.patrolSnapLines = null;
      }
    }
  };

  const handleRemovePoint = (id) => {
    setPatrolPoints(prev => {
      const updated = prev.filter(p => p.id !== id);
      if (updated.length >= 2) {
        fetchPatrolRoute(updated).then(routeData => {
          if (routeData) {
            setPatrolRouteStats({
              distance_meters: routeData.distance_meters,
              duration_seconds: routeData.duration_seconds
            });
            drawPatrolRouteOnMap(routeData.geometry);
          }
        });
      } else {
        setPatrolRouteStats(null);
        if (layersRef.current.patrolRoute && mapInstanceRef.current) {
          mapInstanceRef.current.removeLayer(layersRef.current.patrolRoute);
          layersRef.current.patrolRoute = null;
        }
      }
      return updated;
    });
  };

  const layersRef = useRef({
    zones: null,
    route: null,
    shelter: null,
    units: null,
    incidents: null,
    blockedRoads: null,
    prepositions: null,
    pin: null,
    patrolMarkers: null,
    patrolRoute: null,
    patrolSnapLines: null,
    hazards: null,
    citizenReports: null,
  });
  const onSelectCitizenReportRef = useRef(onSelectCitizenReport);
  onSelectCitizenReportRef.current = onSelectCitizenReport;

  // Initialize Map
  useEffect(() => {
    if (!mapContainerRef.current || mapInstanceRef.current) return;

    const map = L.map(mapContainerRef.current, {
      center: [17.3914, 78.4702],
      zoom: 12,
      zoomControl: true,
      attributionControl: true
    });

    // Keyless OpenStreetMap tiles. Keep this to interactive viewport requests;
    // the public tile service is best-effort and must not be used for prefetching.
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
      maxZoom: 19
    }).addTo(map);

    // Drop pin or add patrol point on map click
    map.on('click', async (e) => {
      const coords = {
        lat: Number(e.latlng.lat.toFixed(6)),
        lng: Number(e.latlng.lng.toFixed(6))
      };

      if (isPatrolAddModeRef.current) {
        await handleAddPatrolPointRef.current?.(coords.lat, coords.lng);
        return;
      }

      onPinLocationRef.current?.(coords);
    });

    // Handle button clicks inside pin popups
    map.on('popupopen', (e) => {
      const popupEl = e.popup?.getElement();
      if (!popupEl) return;
      const logBtn = popupEl.querySelector('#btn-log-incident-pin');
      if (logBtn) {
        logBtn.onclick = () => {
          if (pinnedLocationRef.current) {
            onLogIncidentRef.current?.(pinnedLocationRef.current);
          }
        };
      }
      const addPatrolBtn = popupEl.querySelector('#btn-add-patrol-pin');
      if (addPatrolBtn) {
        addPatrolBtn.onclick = () => {
          if (pinnedLocationRef.current) {
            handleAddPatrolPointRef.current?.(pinnedLocationRef.current.lat, pinnedLocationRef.current.lng);
          }
        };
      }
      const clearBtn = popupEl.querySelector('#btn-clear-pin');
      if (clearBtn) {
        clearBtn.onclick = () => {
          onPinLocationRef.current?.(null);
        };
      }
      const advanceBtn = popupEl.querySelector('button[id^="btn-advance-patrol-"]');
      if (advanceBtn) {
        advanceBtn.onclick = () => {
          handleAdvancePoint();
        };
      }
    });

  mapInstanceRef.current = map;

  return () => {
    map.remove();
    mapInstanceRef.current = null;
  };
}, []);

// Update Risk Zones GeoJSON Layer
useEffect(() => {
  const map = mapInstanceRef.current;
  if (!map) return;

  if (layersRef.current.zones) {
    map.removeLayer(layersRef.current.zones);
  }

  if (!riskZones || riskZones.length === 0) return;

  // Standard high-visibility disaster risk palette on light map
  const zoneLayer = L.geoJSON(riskZones.map(z => ({
    type: "Feature",
    geometry: z.polygon,
    properties: { ...z }
  })), {
    pointToLayer: (feature, latlng) => L.circleMarker(latlng, {
      radius: 10,
      fillColor: riskColor(feature.properties.risk_level),
      color: '#ffffff',
      weight: 2.5,
      opacity: 1,
      fillOpacity: 0.95,
    }),
    style: (feature) => {
      const isSelected = selectedZone && selectedZone.id === feature.properties.id;
      const color = riskColor(feature.properties.risk_level);
      return {
        fillColor: color,
        weight: isSelected ? 3.5 : 2,
        opacity: 1,
        color: isSelected ? '#1e1b4b' : color,
        fillOpacity: isSelected ? 0.45 : 0.25,
        dashArray: isSelected ? '' : '3'
      };
    },
    onEachFeature: (feature, layer) => {
      const z = feature.properties;
      layer.on({
        click: (e) => {
          if (e.latlng) {
            onPinLocationRef.current?.({
              lat: Number(e.latlng.lat.toFixed(6)),
              lng: Number(e.latlng.lng.toFixed(6))
            });
          }
          onSelectZone(z);
        },
        mouseover: () => layer.setStyle({ fillOpacity: 0.6 }),
        mouseout: () => {
          const isSelected = selectedZone && selectedZone.id === z.id;
          layer.setStyle({ fillOpacity: isSelected ? 0.45 : 0.25 });
        }
      });
      layer.bindTooltip(`
          <div class="font-sans text-xs p-1">
            <div class="font-extrabold text-slate-900">${z.name}</div>
            <div class="text-zinc-800 font-bold mt-0.5">${z.risk_level == null ? 'Data unavailable · verify conditions' : 'Risk Level: ' + z.risk_level + ' / 5'}</div>
            <div class="text-[11px] text-slate-500">Weather feed: ${z.explanation?.weather_status || 'unknown'}</div>
            <div class="text-[11px] text-slate-500 mt-1 max-w-[210px]">${z.explanation?.why_this || ''}</div>
          </div>
        `, { sticky: true, className: 'leaflet-tooltip-light' });
    }
  }).addTo(map);

  layersRef.current.zones = zoneLayer;
  zoneLayer.bringToFront();
}, [riskZones, selectedZone, onSelectZone]);

// Update Unified Multi-Hazard Layer (Earthquake, Cyclone, Wildfire, etc.)
useEffect(() => {
  const map = mapInstanceRef.current;
  if (!map) return;

  if (layersRef.current.hazards) {
    map.removeLayer(layersRef.current.hazards);
    layersRef.current.hazards = null;
  }

  if (!hazards || hazards.length === 0) return;

  const hazardGroup = L.featureGroup();

  hazards.forEach((item) => {
    if (activeHazardFilters[item.hazard_id] === false) return;

    const isSelected = selectedHazard && selectedHazard.id === item.id;
    const geom = item.geometry;
    if (!geom || !geom.coordinates) return;

    if (item.hazard_id === 'earthquake') {
      const [lon, lat] = geom.coordinates;
      const magFactor = item.severity_level || 2;
      const radius = Math.max(8, magFactor * 3.5);

      const circle = L.circleMarker([lat, lon], {
        radius: isSelected ? radius + 4 : radius,
        fillColor: '#D97706',
        color: isSelected ? '#451A03' : '#92400E',
        weight: isSelected ? 3.5 : 2,
        opacity: 1,
        fillOpacity: 0.85,
      });

      const shockwave = L.circle([lat, lon], {
        radius: (magFactor * 15000),
        color: '#D97706',
        weight: 1.5,
        opacity: 0.45,
        fillColor: '#FEF3C7',
        fillOpacity: 0.08,
        dashArray: '4, 6',
      });

      circle.on('click', () => onSelectHazard(item));
      circle.bindTooltip(`
        <div class="font-sans text-xs p-1">
          <div class="text-[10px] font-bold text-emerald-700 uppercase">[OBSERVED SEISMIC EVENT]</div>
          <div class="font-bold text-slate-900">${item.name}</div>
          <div class="text-amber-700 font-semibold mt-0.5">${item.severity_label || ''}</div>
          <div class="text-[11px] text-slate-500">Method: ${item.method} · USGS ComCat</div>
          <div class="text-[10px] text-slate-400 mt-0.5">Click for details & response actions</div>
        </div>
      `, { sticky: true });

      hazardGroup.addLayer(shockwave);
      hazardGroup.addLayer(circle);
    } else if (item.hazard_id === 'cyclone') {
      if (geom.type === 'LineString') {
        const lineCoords = geom.coordinates.map(([lon, lat]) => [lat, lon]);
        const track = L.polyline(lineCoords, {
          color: isSelected ? '#581C87' : '#9333EA',
          weight: isSelected ? 5 : 3.5,
          opacity: 0.9,
          dashArray: '6, 6',
        });
        track.on('click', () => onSelectHazard(item));
        track.bindTooltip(`
          <div class="font-sans text-xs p-1">
            <div class="text-[10px] font-bold text-zinc-800 uppercase">[OBSERVED CYCLONE TRACK]</div>
            <div class="font-bold text-slate-900">${item.name}</div>
            <div class="text-slate-600">${item.summary}</div>
          </div>
        `, { sticky: true });
        hazardGroup.addLayer(track);
      } else if (geom.type === 'Point') {
        const [lon, lat] = geom.coordinates;
        const eyeMarker = L.circleMarker([lat, lon], {
          radius: isSelected ? 12 : 9,
          fillColor: '#9333EA',
          color: '#ffffff',
          weight: 2.5,
          opacity: 1,
          fillOpacity: 0.9,
        });
        eyeMarker.on('click', () => onSelectHazard(item));
        hazardGroup.addLayer(eyeMarker);
      }
    } else if (item.hazard_id === 'wildfire') {
      const [lon, lat] = geom.coordinates;
      const fireMarker = L.circleMarker([lat, lon], {
        radius: isSelected ? 12 : 8,
        fillColor: '#DC2626',
        color: isSelected ? '#450A0A' : '#7F1D1D',
        weight: isSelected ? 3 : 1.5,
        opacity: 1,
        fillOpacity: 0.88,
      });

      const aura = L.circle([lat, lon], {
        radius: 2500,
        color: '#DC2626',
        weight: 1,
        opacity: 0.3,
        fillColor: '#FEE2E2',
        fillOpacity: 0.1,
      });

      fireMarker.on('click', () => onSelectHazard(item));
      fireMarker.bindTooltip(`
        <div class="font-sans text-xs p-1">
          <div class="text-[10px] font-bold text-red-700 uppercase">[OBSERVED THERMAL ANOMALY]</div>
          <div class="font-bold text-slate-900">${item.name}</div>
          <div class="text-red-700 font-semibold mt-0.5">${item.severity_label || ''}</div>
          <div class="text-[11px] text-slate-500">Method: ${item.method} · NASA FIRMS</div>
        </div>
      `, { sticky: true });

      hazardGroup.addLayer(aura);
      hazardGroup.addLayer(fireMarker);
    }
  });

  hazardGroup.addTo(map);
  layersRef.current.hazards = hazardGroup;
  hazardGroup.bringToFront();
}, [hazards, activeHazardFilters, selectedHazard, onSelectHazard]);

// Citizen field photo reports (unverified until officer review)
useEffect(() => {
  const map = mapInstanceRef.current;
  if (!map) return;
  if (layersRef.current.citizenReports) {
    map.removeLayer(layersRef.current.citizenReports);
    layersRef.current.citizenReports = null;
  }
  if (!citizenReports?.length) return;

  const group = L.featureGroup();
  citizenReports.forEach((report) => {
    if (report.lat == null || report.lng == null) return;
    const selected = selectedCitizenReport?.id === report.id;
    const pending = report.status === 'pending';
    const color = pending ? '#EA580C' : report.status === 'accepted' ? '#16A34A' : '#64748B';
    const marker = L.circleMarker([report.lat, report.lng], {
      radius: selected ? 10 : 7,
      fillColor: color,
      color: '#ffffff',
      weight: 2,
      fillOpacity: 0.92,
    });
    marker.bindTooltip(`
      <div class="font-sans text-xs p-1">
        <div class="text-[10px] font-bold uppercase" style="color:${color}">Citizen report · ${report.status}</div>
        <div class="font-bold text-slate-900">${report.phase} · ${report.citizen_display_name || report.citizen_username || 'citizen'}</div>
        <div class="text-[11px] text-slate-600 mt-0.5">${(report.message || '').slice(0, 120)}</div>
      </div>
    `, { sticky: true });
    marker.on('click', () => onSelectCitizenReportRef.current?.(report));
    group.addLayer(marker);
  });
  group.addTo(map);
  layersRef.current.citizenReports = group;
  group.bringToFront();
}, [citizenReports, selectedCitizenReport]);

// Update Evacuation Route & Shelter Pin
useEffect(() => {
  const map = mapInstanceRef.current;
  if (!map) return;

  if (layersRef.current.route) {
    map.removeLayer(layersRef.current.route);
    layersRef.current.route = null;
  }
  if (layersRef.current.shelter) {
    map.removeLayer(layersRef.current.shelter);
    layersRef.current.shelter = null;
  }

  if (!activeRoute) return;

  // Draw route LineString with vivid Indigo corridor
  const routeLayer = L.geoJSON({
    type: "Feature",
    geometry: activeRoute.geometry
  }, {
    style: {
      color: '#4f46e5',
      weight: 6,
      opacity: 0.95,
      lineCap: 'round',
      lineJoin: 'round'
    }
  }).addTo(map);

  // Shelter marker with clean circular badge
  const shelterIcon = L.divIcon({
    className: 'custom-shelter-marker',
    html: `
        <div class="relative flex items-center justify-center">
          <div class="absolute w-8 h-8 bg-zinc-500/20 rounded-full animate-ping"></div>
          <div class="w-8 h-8 bg-zinc-800 border-2 border-white rounded-xl flex items-center justify-center text-white text-xs font-black shadow-lg">
            S
          </div>
        </div>
      `,
    iconSize: [32, 32],
    iconAnchor: [16, 16]
  });

  const shelterMarker = L.marker([activeRoute.shelter_lat, activeRoute.shelter_lng], { icon: shelterIcon })
    .bindPopup(`
        <div class="text-xs p-1">
          <div class="font-extrabold text-zinc-800 uppercase tracking-wide text-[10px]">Designated Relief Shelter</div>
          <div class="text-slate-900 font-bold text-sm mt-0.5">${activeRoute.shelter_name}</div>
          <div class="text-slate-600 mt-1 font-medium">Route Distance: ${(activeRoute.distance_meters / 1000).toFixed(1)} km</div>
          <div class="text-slate-600 font-medium">Est. Travel Time: ${(activeRoute.duration_seconds / 60).toFixed(0)} mins</div>
        </div>
      `)
    .addTo(map);

  layersRef.current.route = routeLayer;
  layersRef.current.shelter = shelterMarker;

  try {
    map.fitBounds(routeLayer.getBounds(), { padding: [50, 50] });
  } catch (e) {
    // ignore
  }
}, [activeRoute]);

// Update Registered Units Pins
useEffect(() => {
  const map = mapInstanceRef.current;
  if (!map) return;

  if (layersRef.current.units) {
    map.removeLayer(layersRef.current.units);
    layersRef.current.units = null;
  }

  if (!units || units.length === 0) return;

  const unitGroup = L.layerGroup();
  units.forEach(u => {
    const isBoat = u.kind === 'rescue_boat';
    const isAmbulance = u.kind === 'ambulance';
    const label = isBoat ? '⛵' : isAmbulance ? '🚑' : '🚔';

    const unitIcon = L.divIcon({
      className: 'custom-unit-icon',
      html: `
          <div class="w-8 h-8 bg-white border-2 border-slate-300 hover:border-zinc-800 rounded-xl flex items-center justify-center shadow-md text-sm transition">
            ${label}
          </div>
        `,
      iconSize: [32, 32],
      iconAnchor: [16, 16]
    });

    const m = L.marker([u.lat, u.lng], { icon: unitIcon })
      .bindPopup(`
          <div class="text-xs p-1">
            <div class="font-extrabold text-zinc-800 uppercase tracking-wide text-[10px]">${u.kind.replace('_', ' ')}</div>
            <div class="text-slate-900 font-bold text-sm mt-0.5">Unit ID: ${u.id}</div>
            <div class="text-slate-600 mt-1">Station: <strong class="text-slate-800">${u.station}</strong></div>
            <div class="text-slate-600">Status: <span class="capitalize font-bold text-emerald-700">${u.status}</span></div>
            <div class="text-slate-400 text-[10px] mt-1.5 font-mono">Telemetry: ${new Date(u.position_updated_at).toLocaleTimeString()}</div>
          </div>
        `);
    unitGroup.addLayer(m);
  });

  unitGroup.addTo(map);
  layersRef.current.units = unitGroup;
}, [units]);

// Update Incidents
useEffect(() => {
  const map = mapInstanceRef.current;
  if (!map) return;

  if (layersRef.current.incidents) {
    map.removeLayer(layersRef.current.incidents);
    layersRef.current.incidents = null;
  }

  if (!incidents || incidents.length === 0) return;

  const incGroup = L.layerGroup();
  incidents.forEach(inc => {
    const icon = L.divIcon({
      className: 'custom-incident-icon',
      html: `
          <div class="w-7 h-7 bg-red-600 text-white rounded-full flex items-center justify-center text-xs font-black border-2 border-white shadow-lg animate-bounce">
            !
          </div>
        `,
      iconSize: [28, 28],
      iconAnchor: [14, 14]
    });

    const m = L.marker([inc.lat, inc.lng], { icon })
      .bindPopup(`
          <div class="text-xs p-1">
            <div class="font-extrabold text-red-700 uppercase tracking-wide text-[10px]">Emergency Incident (${inc.type})</div>
            <div class="text-slate-900 font-bold text-sm mt-0.5">${inc.message}</div>
            <div class="text-slate-600 mt-1">Urgency: <span class="text-red-700 font-extrabold">${inc.urgency}/5</span></div>
            <div class="text-slate-600">People Affected: <strong class="text-slate-800">${inc.people}</strong> ${inc.vulnerable ? '(Vulnerable flagged)' : ''}</div>
            <div class="text-slate-400 text-[10px] mt-1.5 font-mono">Source: ${inc.source} | ${new Date(inc.timestamp).toLocaleTimeString()}</div>
          </div>
        `);
    incGroup.addLayer(m);
  });

  incGroup.addTo(map);
  layersRef.current.incidents = incGroup;
}, [incidents]);

// Update Pre-positioning Movement Vectors
useEffect(() => {
  const map = mapInstanceRef.current;
  if (!map) return;

  if (layersRef.current.prepositions) {
    map.removeLayer(layersRef.current.prepositions);
    layersRef.current.prepositions = null;
  }

  if (!prepositionSuggestions || prepositionSuggestions.length === 0) return;

  const prepGroup = L.layerGroup();
  prepositionSuggestions.forEach(p => {
    const line = L.polyline(
      [[p.current_lat, p.current_lng], [p.target_lat, p.target_lng]],
      {
        color: '#4f46e5',
        weight: 3,
        dashArray: '6, 6',
        opacity: 0.85
      }
    ).bindTooltip(`Pre-position ${p.unit_id} to ${p.target_zone_name} (ETA: ${p.eta_minutes}m)`);
    prepGroup.addLayer(line);
  });

  prepGroup.addTo(map);
  layersRef.current.prepositions = prepGroup;
}, [prepositionSuggestions]);

// Update Blocked Roads Layer
useEffect(() => {
  const map = mapInstanceRef.current;
  if (!map) return;

  if (layersRef.current.blockedRoads) {
    map.removeLayer(layersRef.current.blockedRoads);
    layersRef.current.blockedRoads = null;
  }

  if (!blockedRoads || blockedRoads.length === 0) return;

  const roadGroup = L.layerGroup();
  blockedRoads.forEach(road => {
    if (!road.geometry) return;

    const roadLayer = L.geoJSON(
      { type: 'Feature', geometry: road.geometry },
      {
        style: {
          color: '#dc2626',
          weight: 6,
          opacity: 0.9,
          dashArray: '8, 6',
          lineCap: 'round',
          lineJoin: 'round'
        }
      }
    );

    roadLayer.bindPopup(`
        <div class="text-xs p-1">
          <div class="font-extrabold text-red-700 uppercase tracking-wide text-[10px]">⚠ Road Blocked / Diversion</div>
          <div class="text-slate-900 font-bold text-sm mt-0.5">${road.name}</div>
          <div class="text-slate-600 mt-1">Reason: ${road.reason}</div>
          <div class="text-slate-400 text-[10px] mt-1.5 font-mono">
            Reported by: ${road.reported_by} | ${new Date(road.timestamp).toLocaleTimeString()}
          </div>
        </div>
      `);

    const coords = road.geometry.coordinates;
    if (coords && coords.length > 0) {
      const mid = coords[Math.floor(coords.length / 2)];
      const warnIcon = L.divIcon({
        className: 'blocked-road-icon',
        html: `
            <div class="w-6 h-6 bg-red-600 text-white rounded-lg flex items-center justify-center text-xs font-black border border-white shadow-md">
              ✕
            </div>
          `,
        iconSize: [24, 24],
        iconAnchor: [12, 12]
      });
      L.marker([mid[1], mid[0]], { icon: warnIcon })
        .bindTooltip(`BLOCKED: ${road.name}`, { sticky: true })
        .addTo(roadGroup);
    }

    roadGroup.addLayer(roadLayer);
  });

  roadGroup.addTo(map);
  layersRef.current.blockedRoads = roadGroup;
}, [blockedRoads]);

// Update Pin Marker Layer
useEffect(() => {
  const map = mapInstanceRef.current;
  if (!map) return;

  if (layersRef.current.pin) {
    map.removeLayer(layersRef.current.pin);
    layersRef.current.pin = null;
  }

  if (!pinnedLocation || pinnedLocation.lat == null || pinnedLocation.lng == null) return;

  const pinIcon = L.divIcon({
    className: 'custom-pin-marker',
    html: `
        <div style="position: relative; display: flex; align-items: center; justify-content: center; pointer-events: auto;">
          <div style="position: absolute; bottom: 0; left: 50%; transform: translate(-50%, -100%); width: 36px; height: 36px; border-radius: 50% 50% 50% 0; transform-origin: 0% 100%; transform: rotate(-45deg) translate(9px, -9px); background: #09090B; border: 2.5px solid #ffffff; box-shadow: 0 4px 14px rgba(0,0,0,0.4); display: flex; align-items: center; justify-content: center;">
            <div style="transform: rotate(45deg); color: #ffffff; font-size: 16px; line-height: 1;">📍</div>
          </div>
          <div style="width: 12px; height: 12px; background: rgba(9, 9, 11, 0.45); border-radius: 50%; box-shadow: 0 0 8px #09090B;"></div>
        </div>
      `,
    iconSize: [36, 36],
    iconAnchor: [18, 36],
    popupAnchor: [0, -38]
  });

  const marker = L.marker([pinnedLocation.lat, pinnedLocation.lng], {
    icon: pinIcon,
    draggable: true,
    zIndexOffset: 1200
  });

  marker.on('dragend', (e) => {
    const pos = e.target.getLatLng();
    const newCoords = {
      lat: Number(pos.lat.toFixed(6)),
      lng: Number(pos.lng.toFixed(6))
    };
    onPinLocationRef.current?.(newCoords);
  });

  marker.bindPopup(`
      <div style="min-width: 210px; padding: 4px; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;">
        <div style="display: flex; align-items: center; justify-content: space-between; gap: 8px;">
          <div style="font-weight: 700; color: #0F172A; font-size: 13px; display: flex; align-items: center; gap: 4px;">
            <span>📍</span> Pinned Incident Location
          </div>
          <span style="font-size: 10px; color: #09090B; background: #F4F4F5; padding: 1px 6px; border-radius: 4px; font-weight: 600; border: 1px solid #E4E4E7;">Draggable</span>
        </div>
        <div style="font-family: monospace; font-size: 12px; color: #334155; margin-top: 6px; background: #F8FAFC; padding: 5px 8px; border-radius: 4px; border: 1px solid #E2E8F0; display: flex; justify-content: space-between;">
          <span>Lat: <strong>${pinnedLocation.lat.toFixed(6)}</strong></span>
          <span>Lng: <strong>${pinnedLocation.lng.toFixed(6)}</strong></span>
        </div>
        <div style="display: flex; gap: 6px; margin-top: 8px;">
          <button id="btn-log-incident-pin" style="flex: 1; background: #09090B; color: white; border: none; border-radius: 4px; padding: 6px 10px; font-size: 12px; font-weight: 600; cursor: pointer; display: flex; align-items: center; justify-content: center; gap: 4px;">
            🚨 Log Incident
          </button>
          <button id="btn-add-patrol-pin" style="background: #F4F4F5; color: #09090B; border: 1px solid #E4E4E7; border-radius: 4px; padding: 6px 8px; font-size: 11px; font-weight: 600; cursor: pointer;" title="Add as patrol waypoint (snaps to road)">
            🛡️ + Patrol
          </button>
          <button id="btn-clear-pin" title="Remove pin" style="background: #F1F5F9; color: #64748B; border: 1px solid #CBD5E1; border-radius: 4px; padding: 6px 8px; font-size: 12px; cursor: pointer;">
            ✕
          </button>
        </div>
      </div>
    `, { autoClose: false, closeOnClick: false });

  marker.addTo(map);
  layersRef.current.pin = marker;
}, [pinnedLocation]);

// Update Patrol Markers and Snapping Lines Layer
useEffect(() => {
  const map = mapInstanceRef.current;
  if (!map) return;

  if (layersRef.current.patrolMarkers) {
    map.removeLayer(layersRef.current.patrolMarkers);
    layersRef.current.patrolMarkers = null;
  }
  if (layersRef.current.patrolSnapLines) {
    map.removeLayer(layersRef.current.patrolSnapLines);
    layersRef.current.patrolSnapLines = null;
  }

  if (!patrolPoints || patrolPoints.length === 0) return;

  const markerGroup = L.layerGroup();
  const snapGroup = L.layerGroup();

  patrolPoints.forEach((pt, idx) => {
    const isReached = idx < activePointIndex;
    const isActive = idx === activePointIndex && activePointIndex < patrolPoints.length;

    // Dotted line showing snapping from clicked point to nearest road
    if (pt.original_lat && pt.distance_m > 3) {
      const snapLine = L.polyline(
        [[pt.original_lat, pt.original_lng], [pt.lat, pt.lng]],
        {
          color: '#10B981',
          weight: 2,
          dashArray: '3, 4',
          opacity: 0.85
        }
      ).bindTooltip(`Snapped to nearest road (${pt.distance_m}m)`, { sticky: true });
      snapGroup.addLayer(snapLine);

      const dot = L.circleMarker([pt.original_lat, pt.original_lng], {
        radius: 3.5,
        fillColor: '#94A3B8',
        color: '#ffffff',
        weight: 1.5,
        fillOpacity: 0.8
      }).bindTooltip(`Clicked point (off-road)`, { sticky: true });
      snapGroup.addLayer(dot);
    }

    const badgeBg = isReached ? '#16A34A' : isActive ? '#09090B' : '#475569';
    const markerHtml = `
      <div style="position: relative; display: flex; align-items: center; justify-content: center; cursor: pointer;">
        ${isActive ? '<div style="position: absolute; width: 36px; height: 36px; border-radius: 50%; background: rgba(9, 9, 11, 0.3); animation: ping 1.5s cubic-bezier(0, 0, 0.2, 1) infinite;"></div>' : ''}
        <div style="width: 26px; height: 26px; border-radius: 50%; background: ${badgeBg}; border: 2.5px solid #ffffff; box-shadow: 0 3px 8px rgba(0,0,0,0.35); display: flex; align-items: center; justify-content: center; color: white; font-weight: 800; font-size: 11px; z-index: 10;">
          ${isReached ? '✓' : idx + 1}
        </div>
        <div style="position: absolute; bottom: -18px; white-space: nowrap; font-family: -apple-system, sans-serif; font-size: 10px; font-weight: 700; background: rgba(15, 23, 42, 0.85); color: white; padding: 1px 5px; border-radius: 4px; pointer-events: none;">
          Point ${idx + 1}
        </div>
      </div>
    `;

    const icon = L.divIcon({
      className: 'custom-patrol-marker',
      html: markerHtml,
      iconSize: [26, 26],
      iconAnchor: [13, 13],
      popupAnchor: [0, -14]
    });

    const m = L.marker([pt.lat, pt.lng], {
      icon,
      draggable: true,
      zIndexOffset: isActive ? 1500 : 800
    });

    // On drag, re-snap to nearest road!
    m.on('dragend', async (e) => {
      const newPos = e.target.getLatLng();
      const res = await snapPointToRoad(newPos.lat, newPos.lng);
      setPatrolPoints(prev => {
        const updated = [...prev];
        updated[idx] = {
          ...updated[idx],
          lat: res.lat,
          lng: res.lng,
          original_lat: newPos.lat,
          original_lng: newPos.lng,
          distance_m: res.distance_m,
          road_name: res.road_name,
          snapped: res.snapped
        };
        if (updated.length >= 2) {
          fetchPatrolRoute(updated).then(routeData => {
            if (routeData) {
              setPatrolRouteStats({
                distance_meters: routeData.distance_meters,
                duration_seconds: routeData.duration_seconds
              });
              drawPatrolRouteOnMap(routeData.geometry);
            }
          });
        }
        return updated;
      });
    });

    const gmapsLink = `https://www.google.com/maps/dir/?api=1&destination=${pt.lat},${pt.lng}&travelmode=driving`;

    m.bindPopup(`
      <div style="min-width: 210px; font-family: -apple-system, BlinkMacSystemFont, sans-serif; padding: 2px;">
        <div style="display: flex; align-items: center; justify-content: space-between;">
          <div style="font-weight: 800; color: #0F172A; font-size: 13px;">Patrol Point ${idx + 1}</div>
          <span style="font-size: 10px; font-weight: 700; padding: 1px 6px; border-radius: 4px; background: ${isReached ? '#DCFCE7; color: #16A34A;' : isActive ? '#F4F4F5; color: #09090B;' : '#F1F5F9; color: #64748B;'}">
            ${isReached ? 'Reached' : isActive ? 'Active Target' : 'Pending'}
          </span>
        </div>
        ${pt.road_name ? `<div style="font-size: 12px; color: #334155; margin-top: 3px; font-weight: 500;">🛣️ ${pt.road_name}</div>` : ''}
        <div style="font-family: monospace; font-size: 11px; color: #64748B; margin-top: 4px; background: #F8FAFC; padding: 3px 6px; border-radius: 4px; border: 1px solid #E2E8F0;">
          ${pt.lat.toFixed(5)}, ${pt.lng.toFixed(5)}
          ${pt.snapped && pt.distance_m > 0 ? `<br/><span style="color: #059669;">Snapped ${pt.distance_m}m to road</span>` : ''}
        </div>
        <div style="margin-top: 8px; display: flex; flex-direction: column; gap: 5px;">
          <a href="${gmapsLink}" target="_blank" rel="noreferrer" style="background: #1E88E5; color: white; padding: 5px 8px; border-radius: 4px; font-size: 11px; font-weight: 600; text-align: center; text-decoration: none; display: flex; align-items: center; justify-content: center; gap: 4px;">
            Show Point ${idx + 1} on Google Maps ↗
          </a>
          <button id="btn-advance-patrol-${idx}" style="background: #16A34A; color: white; border: none; padding: 5px 8px; border-radius: 4px; font-size: 11px; font-weight: 600; cursor: pointer;">
            ${isReached ? 'Reset to this Point' : `Mark Reached ➔ Next Point`}
          </button>
        </div>
      </div>
    `);

    markerGroup.addLayer(m);
  });

  snapGroup.addTo(map);
  markerGroup.addTo(map);
  layersRef.current.patrolSnapLines = snapGroup;
  layersRef.current.patrolMarkers = markerGroup;
}, [patrolPoints, activePointIndex]);

// Automatic patrol movement simulation
useEffect(() => {
  if (!isSimulatingPatrol) return;
  if (patrolPoints.length < 2) return;

  const interval = setInterval(() => {
    setActivePointIndex(prev => {
      if (prev < patrolPoints.length) {
        return prev + 1;
      } else {
        setIsSimulatingPatrol(false);
        return prev;
      }
    });
  }, 3500);

  return () => clearInterval(interval);
}, [isSimulatingPatrol, patrolPoints.length]);

return (
  <div className="relative w-full h-full">
    <div ref={mapContainerRef} className="w-full h-full" />

    {/* Location Search Bar */}
    <div ref={searchContainerRef} className="absolute top-4 left-14 z-[500] w-72 sm:w-80 md:w-96">
      <div className="relative flex items-center bg-white rounded-[6px] border border-[#CBD5E1] shadow-md hover:border-[#09090B] focus-within:border-[#09090B] focus-within:ring-2 focus-within:ring-[#09090B]/20 transition">
        <div className="pl-3 pr-2 text-[#64748B] flex items-center justify-center">
          {isSearching ? (
            <Loader2 className="w-4 h-4 animate-spin text-[#09090B]" />
          ) : (
            <Search className="w-4 h-4" />
          )}
        </div>
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => {
            setSearchQuery(e.target.value);
            setIsSearchOpen(true);
          }}
          onFocus={() => setIsSearchOpen(true)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && searchResults.length > 0) {
              handleSelectLocation(searchResults[0]);
            }
          }}
          placeholder="Search any street, area, city in India, or lat,lng…"
          className="w-full h-8 text-[13px] text-[#0F172A] placeholder:text-[#94A3B8] outline-none bg-transparent pr-2"
        />
        {searchQuery && (
          <button
            type="button"
            onClick={() => {
              setSearchQuery('');
              setIsSearchOpen(true);
            }}
            className="p-1.5 text-[#94A3B8] hover:text-[#0F172A] transition"
            title="Clear search"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        )}
      </div>

      {/* Dropdown Results */}
      {isSearchOpen && (
        <div className="absolute left-0 right-0 mt-1 bg-white border border-[#CBD5E1] rounded-[6px] shadow-xl max-h-72 overflow-y-auto divide-y divide-[#F1F5F9] z-[600]">
          {!searchQuery.trim() && (
            <div className="px-3 py-1.5 bg-[#F8FAFC] text-[10px] font-semibold uppercase tracking-wider text-[#64748B]">
              Key Pilot Hotspots & Stations
            </div>
          )}

          {searchResults.length > 0 ? (
            searchResults.map((loc) => {
              const cat = loc.category || 'Location';
              const badgeStyle =
                cat === 'Street' ? 'bg-[#EFF6FF] text-[#2563EB] border-[#BFDBFE]' :
                  cat === 'City' ? 'bg-[#FAF5FF] text-[#7E22CE] border-[#E9D5FF]' :
                    cat === 'Hotspot' ? 'bg-[#FEF3C7] text-[#D97706] border-[#FDE68A]' :
                      cat === 'Hospital' ? 'bg-[#DCFCE7] text-[#16A34A] border-[#BBF7D0]' :
                        cat === 'Police' ? 'bg-[#F4F4F5] text-[#09090B] border-[#E4E4E7]' :
                          cat === 'Water Body' ? 'bg-[#E0F2FE] text-[#0284C7] border-[#BAE6FD]' :
                            cat === 'GPS' ? 'bg-[#F3E8FF] text-[#9333EA] border-[#E9D5FF]' :
                              'bg-[#F1F5F9] text-[#475569] border-[#E2E8F0]';

              return (
                <button
                  key={loc.id}
                  type="button"
                  onClick={() => handleSelectLocation(loc)}
                  className="w-full text-left px-3 py-2.5 hover:bg-[#F8FAFC] transition flex items-center justify-between gap-2 group cursor-pointer"
                >
                  <div className="min-w-0 flex-1">
                    <div className="text-[13px] font-medium text-[#0F172A] group-hover:text-[#09090B] truncate flex items-center gap-1.5">
                      <MapPin className="w-3.5 h-3.5 text-[#64748B] group-hover:text-[#09090B] shrink-0" />
                      <span>{loc.name}</span>
                    </div>
                    {loc.subText && (
                      <div className="text-[11px] text-[#64748B] truncate pl-5">
                        {loc.subText}
                      </div>
                    )}
                  </div>
                  <div className="shrink-0 flex items-center">
                    <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-[4px] border ${badgeStyle}`}>
                      {cat}
                    </span>
                  </div>
                </button>
              );
            })
          ) : !isSearching ? (
            <div className="px-3 py-4 text-center text-[12px] text-[#64748B]">
              No matching location found. Enter a nearby area name or exact coordinates (lat, lng).
            </div>
          ) : null}
        </div>
      )}
    </div>

    {/* Top right floating toolbar */}
    <div className="absolute top-4 right-4 z-[400] flex items-center gap-2">
      {pinnedLocation && (
        <div className="h-8 px-2.5 rounded-[6px] border border-[#E4E4E7] bg-[#F4F4F5] text-[#09090B] text-[12px] font-medium shadow-sm flex items-center gap-2 animate-fadeIn">
          <span className="flex items-center gap-1 font-mono text-[11px]">
            📍 {pinnedLocation.lat.toFixed(4)}, {pinnedLocation.lng.toFixed(4)}
          </span>
          <button
            type="button"
            onClick={() => onLogIncidentAtPin?.(pinnedLocation)}
            className="px-2 py-0.5 rounded-[4px] bg-[#09090B] text-white hover:bg-[#27272A] text-[11px] font-medium transition shadow-xs"
          >
            Log Incident
          </button>
          <button
            type="button"
            onClick={() => onPinLocation?.(null)}
            title="Remove pin"
            className="text-[#64748B] hover:text-[#DC2626] font-bold text-[12px] px-1 transition"
          >
            ✕
          </button>
        </div>
      )}

      {onOpenWindy && (
        <button
          type="button"
          onClick={onOpenWindy}
          title="Open live Windy weather radar and overlays"
          className="h-8 px-3 rounded-[6px] border border-[#E2E8F0] bg-white text-[#475569] hover:text-[#09090B] hover:border-[#E4E4E7] text-[12px] font-medium shadow-sm flex items-center gap-1.5 transition"
        >
          <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
          <span>Windy Overlay</span>
        </button>
      )}

      <button
        type="button"
        onClick={() => {
          setIsPatrolMode(prev => !prev);
          setIsPatrolAddMode(prev => !isPatrolMode ? true : prev);
        }}
        aria-pressed={isPatrolMode}
        className={`h-8 px-3 rounded-[6px] border text-[12px] font-medium shadow-sm flex items-center gap-1.5 transition ${
          isPatrolMode
            ? 'bg-[#09090B] text-white border-[#09090B]'
            : 'bg-white text-[#475569] border-[#E2E8F0] hover:text-[#0F172A]'
        }`}
        title="Toggle patrol waypoints mode (auto-snaps to roads)"
      >
        <Shield className="w-3.5 h-3.5" />
        <span>Patrol {patrolPoints.length > 0 ? `(${patrolPoints.length})` : ''}</span>
      </button>

    </div>

    {/* Snapped Road Toast */}
    {snappedToast && (
      <div className="absolute top-16 left-1/2 -translate-x-1/2 z-[600] bg-slate-900/90 text-white border border-emerald-500/50 backdrop-blur-md px-3.5 py-1.5 rounded-[6px] shadow-lg text-[12px] font-medium flex items-center gap-2 animate-fadeIn pointer-events-none">
        <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping" />
        <span>{snappedToast.text}</span>
      </div>
    )}

    {/* Floating Patrol Waypoint Controller */}
    {(isPatrolMode || patrolPoints.length > 0) && (
      <div className="absolute bottom-6 right-6 z-[500] animate-fadeIn">
        <PatrolPanel
          patrolPoints={patrolPoints}
          activePointIndex={activePointIndex}
          onAdvancePoint={handleAdvancePoint}
          onResetPatrol={handleResetPatrol}
          onClearPatrol={handleClearPatrol}
          onRemovePoint={handleRemovePoint}
          isAddMode={isPatrolAddMode}
          onToggleAddMode={() => setIsPatrolAddMode(prev => !prev)}
          routeStats={patrolRouteStats}
          isSimulating={isSimulatingPatrol}
          onToggleSimulation={() => setIsSimulatingPatrol(prev => !prev)}
          onClose={() => {
            setIsPatrolMode(false);
            setIsPatrolAddMode(false);
          }}
        />
      </div>
    )}

    {/* Floating map legend: green/amber/red & Pin guide */}
    <div className="absolute bottom-4 left-4 z-[400] bg-white border border-[#E2E8F0] rounded-[6px] px-3 py-2 text-[12px] shadow-sm flex items-center gap-4">
      <span className="font-medium text-[#0F172A]">Risk:</span>
      <span className="flex items-center gap-1.5 text-[#16A34A]"><span className="w-2 h-2 rounded-full bg-[#16A34A]" /> L1–L2 Nominal</span>
      <span className="flex items-center gap-1.5 text-[#D97706]"><span className="w-2 h-2 rounded-full bg-[#D97706]" /> L3 Watch</span>
      <span className="flex items-center gap-1.5 text-[#DC2626]"><span className="w-2 h-2 rounded-full bg-[#DC2626]" /> L4–L5 Critical</span>
      <span className="text-[#CBD5E1]">|</span>
      <span className="text-[#64748B] flex items-center gap-1">
        <span>📍</span> Click map to drop incident pin
      </span>
    </div>
  </div>
);
}
