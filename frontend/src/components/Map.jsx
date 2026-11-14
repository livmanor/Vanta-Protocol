import React, { useEffect, useRef } from 'react';
import L from 'leaflet';

export default function Map({
  riskZones,
  selectedZone,
  onSelectZone,
  activeRoute,
  units,
  incidents,
  blockedRoads,
  prepositionSuggestions
}) {
  const mapContainerRef = useRef(null);
  const mapInstanceRef = useRef(null);
  const layersRef = useRef({
    zones: null,
    route: null,
    shelter: null,
    units: null,
    incidents: null,
    blockedRoads: null,
    prepositions: null
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
    const getRiskColor = (level) => {
      switch (level) {
        case 5: return '#dc2626'; // Red (Level 5 Critical)
        case 4: return '#ea580c'; // Deep Orange (Level 4 Severe)
        case 3: return '#d97706'; // Amber (Level 3 Moderate)
        case 2: return '#2563eb'; // Blue (Level 2 Elevated)
        default: return '#059669'; // Emerald (Level 1 Low)
      }
    };

    const zoneLayer = L.geoJSON(riskZones.map(z => ({
      type: "Feature",
      geometry: z.polygon,
      properties: { ...z }
    })), {
      pointToLayer: (feature, latlng) => L.circleMarker(latlng, {
        radius: 10,
        fillColor: getRiskColor(feature.properties.risk_level),
        color: '#ffffff',
        weight: 2.5,
        opacity: 1,
        fillOpacity: 0.95,
      }),
      style: (feature) => {
        const isSelected = selectedZone && selectedZone.id === feature.properties.id;
        const color = getRiskColor(feature.properties.risk_level);
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
          click: () => onSelectZone(z),
          mouseover: () => layer.setStyle({ fillOpacity: 0.6 }),
          mouseout: () => {
            const isSelected = selectedZone && selectedZone.id === z.id;
            layer.setStyle({ fillOpacity: isSelected ? 0.45 : 0.25 });
          }
        });
        layer.bindTooltip(`
          <div class="font-sans text-xs p-1">
            <div class="font-extrabold text-slate-900">${z.name}</div>
            <div class="text-indigo-700 font-bold mt-0.5">Risk Level: ${z.risk_level} / 5</div>
            <div class="text-[11px] text-slate-500 mt-1 max-w-[210px]">${z.explanation?.why_this || ''}</div>
          </div>
        `, { sticky: true, className: 'leaflet-tooltip-light' });
      }
    }).addTo(map);

    layersRef.current.zones = zoneLayer;
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

  return (
    <div className="relative w-full h-full">
      <div ref={mapContainerRef} className="w-full h-full" />

      {/* Floating map legend: green/amber/red */}
      <div className="absolute bottom-4 left-4 z-[400] bg-white border border-[#E2E8F0] rounded-[6px] px-3 py-2 text-[12px] shadow-sm flex items-center gap-4">
        <span className="font-medium text-[#0F172A]">Risk:</span>
        <span className="flex items-center gap-1.5 text-[#16A34A]"><span className="w-2 h-2 rounded-full bg-[#16A34A]" /> L1–L2 Nominal</span>
        <span className="flex items-center gap-1.5 text-[#D97706]"><span className="w-2 h-2 rounded-full bg-[#D97706]" /> L3 Watch</span>
        <span className="flex items-center gap-1.5 text-[#DC2626]"><span className="w-2 h-2 rounded-full bg-[#DC2626]" /> L4–L5 Critical</span>
      </div>
    </div>
  );
}
