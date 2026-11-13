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
      attributionControl: false
    });

    // Dark-mode OSM TileLayer
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19
    }).addTo(map);

    L.control.attribution({ position: 'bottomright' })
      .addAttribution('&copy; <a href="https://openstreetmap.org" class="text-neutral-300">OpenStreetMap</a> contributors | OSRM | GloFAS')
      .addTo(map);

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

    const getRiskColor = (level) => {
      switch (level) {
        case 5: return '#ffffff'; // White (critical)
        case 4: return '#d4d4d4'; // Light gray
        case 3: return '#a3a3a3'; // Mid gray
        case 2: return '#525252'; // Dark gray
        default: return '#262626'; // Near black (Level 1)
      }
    };

    const zoneLayer = L.geoJSON(riskZones.map(z => ({
      type: "Feature",
      geometry: z.polygon,
      properties: { ...z }
    })), {
      pointToLayer: (feature, latlng) => L.circleMarker(latlng, {
        radius: 9,
        fillColor: getRiskColor(feature.properties.risk_level),
        color: '#f8fafc',
        weight: 2,
        opacity: 1,
        fillOpacity: 0.9,
      }),
      style: (feature) => {
        const isSelected = selectedZone && selectedZone.id === feature.properties.id;
        const color = getRiskColor(feature.properties.risk_level);
        return {
          fillColor: color,
          weight: isSelected ? 3 : 1.5,
          opacity: 1,
          color: isSelected ? '#ffffff' : color,
          fillOpacity: isSelected ? 0.45 : 0.25,
          dashArray: isSelected ? '' : '3'
        };
      },
      onEachFeature: (feature, layer) => {
        const z = feature.properties;
        layer.on({
          click: () => onSelectZone(z),
          mouseover: () => layer.setStyle({ fillOpacity: 0.5 }),
          mouseout: () => {
            const isSelected = selectedZone && selectedZone.id === z.id;
            layer.setStyle({ fillOpacity: isSelected ? 0.45 : 0.25 });
          }
        });
        layer.bindTooltip(`
          <div class="font-sans text-xs">
            <div class="font-bold text-gray-100">${z.name}</div>
            <div class="text-neutral-300 font-semibold">Risk Level: ${z.risk_level} / 5</div>
            <div class="text-[10px] text-gray-300 mt-1 max-w-[200px]">${z.explanation?.why_this || ''}</div>
          </div>
        `, { sticky: true, className: 'leaflet-tooltip-dark' });
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

    // Draw route LineString
    const routeLayer = L.geoJSON({
      type: "Feature",
      geometry: activeRoute.geometry
    }, {
      style: {
        color: '#ffffff',
        weight: 5,
        opacity: 0.9,
        lineCap: 'round',
        lineJoin: 'round'
      }
    }).addTo(map);

    // Shelter marker
    const shelterIcon = L.divIcon({
      className: 'custom-shelter-marker',
      html: `
        <div class="relative flex items-center justify-center">
          <div class="absolute w-8 h-8 bg-white/30 rounded-full animate-ping"></div>
          <div class="w-7 h-7 bg-white border-2 border-neutral-900 rounded-full flex items-center justify-center text-neutral-900 text-xs font-bold shadow-lg">
            S
          </div>
        </div>
      `,
      iconSize: [28, 28],
      iconAnchor: [14, 14]
    });

    const shelterMarker = L.marker([activeRoute.shelter_lat, activeRoute.shelter_lng], { icon: shelterIcon })
      .bindPopup(`
        <div class="text-xs">
          <div class="font-bold text-neutral-300">Designated Relief Shelter</div>
          <div class="text-white font-medium">${activeRoute.shelter_name}</div>
          <div class="text-gray-400 mt-1">Route Distance: ${(activeRoute.distance_meters / 1000).toFixed(1)} km</div>
          <div class="text-gray-400">Est. Travel Time: ${(activeRoute.duration_seconds / 60).toFixed(0)} mins</div>
        </div>
      `)
      .addTo(map);

    layersRef.current.route = routeLayer;
    layersRef.current.shelter = shelterMarker;

    // Fit map bounds to show route
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
      const bgColor = 'bg-neutral-800';
      const label = isBoat ? '⛵' : isAmbulance ? '🚑' : '🚔';

      const unitIcon = L.divIcon({
        className: 'custom-unit-icon',
        html: `
          <div class="w-7 h-7 ${bgColor} border border-white rounded-lg flex items-center justify-center shadow-md text-xs">
            ${label}
          </div>
        `,
        iconSize: [28, 28],
        iconAnchor: [14, 14]
      });

      const m = L.marker([u.lat, u.lng], { icon: unitIcon })
        .bindPopup(`
          <div class="text-xs">
            <div class="font-bold text-neutral-300 uppercase tracking-wide">${u.kind.replace('_', ' ')}</div>
            <div class="text-white font-semibold">ID: ${u.id}</div>
            <div class="text-gray-300">Station: ${u.station}</div>
            <div class="text-gray-300">Status: <span class="capitalize text-neutral-300">${u.status}</span></div>
            <div class="text-gray-400 text-[10px] mt-1">Updated: ${new Date(u.position_updated_at).toLocaleTimeString()}</div>
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
          <div class="w-6 h-6 bg-white text-black rounded-full flex items-center justify-center text-xs font-bold border-2 border-neutral-400 animate-bounce shadow">
            !
          </div>
        `,
        iconSize: [24, 24],
        iconAnchor: [12, 12]
      });

      const m = L.marker([inc.lat, inc.lng], { icon })
        .bindPopup(`
          <div class="text-xs">
            <div class="font-bold text-neutral-300 uppercase">Emergency Incident (${inc.type})</div>
            <div class="text-white font-medium mt-0.5">${inc.message}</div>
            <div class="text-gray-300 mt-1">Urgency: <span class="text-neutral-200 font-bold">${inc.urgency}/5</span></div>
            <div class="text-gray-300">People: ${inc.people} ${inc.vulnerable ? '(Vulnerable present)' : ''}</div>
            <div class="text-gray-400 text-[10px] mt-1">Source: ${inc.source} | ${new Date(inc.timestamp).toLocaleTimeString()}</div>
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
      // Draw dashed vector line from unit position to target zone
      const line = L.polyline(
        [[p.current_lat, p.current_lng], [p.target_lat, p.target_lng]],
        {
          color: '#a3a3a3',
          weight: 2.5,
          dashArray: '6, 6',
          opacity: 0.8
        }
      ).bindTooltip(`Pre-position ${p.unit_id} to ${p.target_zone_name} (ETA: ${p.eta_minutes}m)`);
      prepGroup.addLayer(line);
    });

    prepGroup.addTo(map);
    layersRef.current.prepositions = prepGroup;
  }, [prepositionSuggestions]);

  // Update Blocked Roads Layer (officer-drawn road blockages / diversions)
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

      // Draw the blocked road LineString as a thick red-orange dashed line
      const roadLayer = L.geoJSON(
        { type: 'Feature', geometry: road.geometry },
        {
          style: {
            color: '#ffffff',
            weight: 6,
            opacity: 0.9,
            dashArray: '8, 6',
            lineCap: 'round',
            lineJoin: 'round'
          }
        }
      );

      roadLayer.bindPopup(`
        <div class="text-xs">
          <div class="font-bold text-neutral-300 uppercase tracking-wide">⚠ Road Blocked / Diversion</div>
          <div class="text-white font-semibold mt-0.5">${road.name}</div>
          <div class="text-gray-300 mt-1">Reason: ${road.reason}</div>
          <div class="text-gray-400 text-[10px] mt-1">
            Reported by: ${road.reported_by} | ${new Date(road.timestamp).toLocaleTimeString()}
          </div>
        </div>
      `);

      // Add a warning icon marker at the midpoint of the LineString
      const coords = road.geometry.coordinates;
      if (coords && coords.length > 0) {
        const mid = coords[Math.floor(coords.length / 2)];
        const warnIcon = L.divIcon({
          className: 'blocked-road-icon',
          html: `
            <div class="w-6 h-6 bg-white text-black rounded flex items-center justify-center text-xs font-black border border-neutral-400 shadow-lg">
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
    </div>
  );
}

