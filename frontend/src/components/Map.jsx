import React, { useEffect, useRef } from 'react';
import L from 'leaflet';

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
  onLogIncidentAtPin
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

  const layersRef = useRef({
    zones: null,
    route: null,
    shelter: null,
    units: null,
    incidents: null,
    blockedRoads: null,
    prepositions: null,
    pin: null
  });

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

    // Drop pin on map click
    map.on('click', (e) => {
      const coords = {
        lat: Number(e.latlng.lat.toFixed(6)),
        lng: Number(e.latlng.lng.toFixed(6))
      };
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
      const clearBtn = popupEl.querySelector('#btn-clear-pin');
      if (clearBtn) {
        clearBtn.onclick = () => {
          onPinLocationRef.current?.(null);
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
            <div class="text-indigo-700 font-bold mt-0.5">${z.risk_level == null ? 'Data unavailable · verify conditions' : 'Risk Level: ' + z.risk_level + ' / 5'}</div>
            <div class="text-[11px] text-slate-500">Weather feed: ${z.explanation?.weather_status || 'unknown'}</div>
            <div class="text-[11px] text-slate-500 mt-1 max-w-[210px]">${z.explanation?.why_this || ''}</div>
          </div>
        `, { sticky: true, className: 'leaflet-tooltip-light' });
      }
    }).addTo(map);

    layersRef.current.zones = zoneLayer;
    zoneLayer.bringToFront();
  }, [riskZones, selectedZone, onSelectZone]);

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
          <div class="absolute w-8 h-8 bg-indigo-500/20 rounded-full animate-ping"></div>
          <div class="w-8 h-8 bg-indigo-600 border-2 border-white rounded-xl flex items-center justify-center text-white text-xs font-black shadow-lg">
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
          <div class="font-extrabold text-indigo-700 uppercase tracking-wide text-[10px]">Designated Relief Shelter</div>
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
          <div class="w-8 h-8 bg-white border-2 border-slate-300 hover:border-indigo-600 rounded-xl flex items-center justify-center shadow-md text-sm transition">
            ${label}
          </div>
        `,
        iconSize: [32, 32],
        iconAnchor: [16, 16]
      });

      const m = L.marker([u.lat, u.lng], { icon: unitIcon })
        .bindPopup(`
          <div class="text-xs p-1">
            <div class="font-extrabold text-indigo-700 uppercase tracking-wide text-[10px]">${u.kind.replace('_', ' ')}</div>
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
          <div style="position: absolute; bottom: 0; left: 50%; transform: translate(-50%, -100%); width: 36px; height: 36px; border-radius: 50% 50% 50% 0; transform-origin: 0% 100%; transform: rotate(-45deg) translate(9px, -9px); background: #4338CA; border: 2.5px solid #ffffff; box-shadow: 0 4px 14px rgba(0,0,0,0.4); display: flex; align-items: center; justify-content: center;">
            <div style="transform: rotate(45deg); color: #ffffff; font-size: 16px; line-height: 1;">📍</div>
          </div>
          <div style="width: 12px; height: 12px; background: rgba(67, 56, 202, 0.45); border-radius: 50%; box-shadow: 0 0 8px #4338CA;"></div>
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
          <span style="font-size: 10px; color: #4338CA; background: #EEF2FF; padding: 1px 6px; border-radius: 4px; font-weight: 600; border: 1px solid #C7D2FE;">Draggable</span>
        </div>
        <div style="font-family: monospace; font-size: 12px; color: #334155; margin-top: 6px; background: #F8FAFC; padding: 5px 8px; border-radius: 4px; border: 1px solid #E2E8F0; display: flex; justify-content: space-between;">
          <span>Lat: <strong>${pinnedLocation.lat.toFixed(6)}</strong></span>
          <span>Lng: <strong>${pinnedLocation.lng.toFixed(6)}</strong></span>
        </div>
        <div style="display: flex; gap: 6px; margin-top: 8px;">
          <button id="btn-log-incident-pin" style="flex: 1; background: #4338CA; color: white; border: none; border-radius: 4px; padding: 6px 10px; font-size: 12px; font-weight: 600; cursor: pointer; display: flex; align-items: center; justify-content: center; gap: 4px;">
            🚨 Log Incident Here
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

  return (
    <div className="relative w-full h-full">
      <div ref={mapContainerRef} className="w-full h-full" />
      {/* Top right floating toolbar */}
      <div className="absolute top-4 right-4 z-[400] flex items-center gap-2">
        {pinnedLocation && (
          <div className="h-8 px-2.5 rounded-[6px] border border-[#C7D2FE] bg-[#EEF2FF] text-[#4338CA] text-[12px] font-medium shadow-sm flex items-center gap-2 animate-fadeIn">
            <span className="flex items-center gap-1 font-mono text-[11px]">
              📍 {pinnedLocation.lat.toFixed(4)}, {pinnedLocation.lng.toFixed(4)}
            </span>
            <button
              type="button"
              onClick={() => onLogIncidentAtPin?.(pinnedLocation)}
              className="px-2 py-0.5 rounded-[4px] bg-[#4338CA] text-white hover:bg-[#3730A3] text-[11px] font-medium transition shadow-xs"
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
            className="h-8 px-3 rounded-[6px] border border-[#E2E8F0] bg-white text-[#475569] hover:text-[#4338CA] hover:border-[#C7D2FE] text-[12px] font-medium shadow-sm flex items-center gap-1.5 transition"
          >
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
            <span>Windy Overlay</span>
          </button>
        )}

      </div>

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
