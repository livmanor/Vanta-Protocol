import React, { useState, useMemo } from 'react';
import {
  Wind, CloudRain, Radio, Layers, Thermometer,
  ExternalLink, RefreshCw, Compass, Maximize2, Cloud
} from 'lucide-react';

const OVERLAYS = [
  { id: 'radar', label: 'Doppler Radar', icon: Radio, desc: 'Live precipitation & storm cell tracking' },
  { id: 'rain', label: 'Rain & Thunder', icon: CloudRain, desc: 'Rainfall accumulation & thunderstorm intensity' },
  { id: 'wind', label: 'Wind Streamlines', icon: Wind, desc: 'Wind speed vectors & gust corridors' },
  { id: 'clouds', label: 'Satellite / Clouds', icon: Cloud, desc: 'Visible & infrared satellite imagery' },
  { id: 'temp', label: 'Temperature', icon: Thermometer, desc: 'Surface thermal gradients' },
  { id: 'pressure', label: 'Pressure & Isobars', icon: Compass, desc: 'Barometric low-pressure systems & depressions' }
];

const LOCATIONS = [
  { id: 'hyd_metro', name: 'Hyderabad Metro', lat: 17.3850, lon: 78.4867, zoom: 11 },
  { id: 'musi_basin', name: 'Musi River Basin', lat: 17.3600, lon: 78.4736, zoom: 12 },
  { id: 'telangana', name: 'Telangana Region', lat: 17.8000, lon: 79.0000, zoom: 8 },
  { id: 'south_india', name: 'Cyclone Tracking (Bay of Bengal)', lat: 15.5000, lon: 80.5000, zoom: 6 }
];

const MODELS = [
  { id: 'ecmwf', label: 'ECMWF 9km', desc: 'European Centre - Gold standard' },
  { id: 'gfs', label: 'GFS 22km', desc: 'NOAA Global Forecast System' },
  { id: 'icon', label: 'ICON 13km', desc: 'DWD High resolution' }
];

export default function WindyOverlay({ compact = false, onExpand = null }) {
  const [selectedOverlay, setSelectedOverlay] = useState('radar');
  const [selectedLocation, setSelectedLocation] = useState(LOCATIONS[0]);
  const [selectedModel, setSelectedModel] = useState('ecmwf');
  const [showPressure, setShowPressure] = useState(true);
  const [refreshKey, setRefreshKey] = useState(0);

  // Construct official embed URL for Windy.com
  const embedUrl = useMemo(() => {
    const params = new URLSearchParams({
      lat: selectedLocation.lat.toString(),
      lon: selectedLocation.lon.toString(),
      detailLat: selectedLocation.lat.toString(),
      detailLon: selectedLocation.lon.toString(),
      width: '100%',
      height: '100%',
      zoom: selectedLocation.zoom.toString(),
      level: 'surface',
      overlay: selectedOverlay,
      product: selectedOverlay === 'radar' ? 'radar' : selectedModel,
      menu: '',
      message: 'true',
      marker: 'true',
      calendar: 'now',
      pressure: showPressure ? 'true' : '',
      type: 'map',
      location: 'coordinates',
      metricWind: 'km/h',
      metricTemp: '°C',
      radarRange: '-1'
    });
    return `https://embed.windy.com/embed2.html?${params.toString()}`;
  }, [selectedLocation, selectedOverlay, selectedModel, showPressure, refreshKey]);

  const externalUrl = `https://www.windy.com/?${selectedLocation.lat},${selectedLocation.lon},${selectedLocation.zoom},m:${selectedOverlay}`;

  if (compact) {
    return (
      <div className="flex flex-col h-full bg-white rounded-lg border border-[#E2E8F0] overflow-hidden">
        {/* Compact header */}
        <div className="px-3 py-2 bg-[#F8FAFC] border-b border-[#E2E8F0] flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Radio className="w-4 h-4 text-[#4338CA] animate-pulse" />
            <span className="font-semibold text-[13px] text-[#0F172A]">Windy Radar</span>
          </div>
          <div className="flex items-center gap-1.5">
            {onExpand && (
              <button
                onClick={onExpand}
                title="Open full tab view"
                className="p-1 rounded hover:bg-[#E2E8F0] text-[#475569] hover:text-[#0F172A] transition"
              >
                <Maximize2 className="w-3.5 h-3.5" />
              </button>
            )}
            <a
              href={externalUrl}
              target="_blank"
              rel="noreferrer"
              title="Open full window in Windy.com"
              className="p-1 rounded hover:bg-[#E2E8F0] text-[#475569] hover:text-[#0F172A] transition"
            >
              <ExternalLink className="w-3.5 h-3.5" />
            </a>
          </div>
        </div>

        {/* Compact overlay selector pills */}
        <div className="flex items-center gap-1 p-2 bg-white border-b border-[#E2E8F0] overflow-x-auto text-[11px]">
          {OVERLAYS.slice(0, 4).map(({ id, label }) => (
            <button
              key={id}
              onClick={() => setSelectedOverlay(id)}
              className={`px-2 py-1 rounded-[4px] whitespace-nowrap font-medium transition ${
                selectedOverlay === id
                  ? 'bg-[#4338CA] text-white shadow-xs'
                  : 'bg-[#F1F5F9] text-[#475569] hover:text-[#0F172A]'
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        {/* Iframe */}
        <div className="flex-1 w-full h-full min-h-[300px] relative bg-slate-900">
          <iframe
            key={embedUrl}
            title="Windy Weather Overlay"
            src={embedUrl}
            className="w-full h-full border-0 absolute inset-0"
            loading="lazy"
            allow="geolocation"
          />
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full w-full bg-[#F8FAFC] overflow-hidden">
      {/* ── Top Control & Overlay Strip ── */}
      <div className="bg-white border-b border-[#E2E8F0] px-4 py-3 shrink-0 flex flex-col gap-3">
        {/* Row 1: Title, Feed indicator, Location Presets & Actions */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-[6px] bg-[#EEF2FF] border border-[#C7D2FE] flex items-center justify-center text-[#4338CA]">
              <Radio className="w-4 h-4 text-[#4338CA] animate-pulse" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-semibold text-[15px] text-[#0F172A]">Windy Atmospheric Radar & Overlays</span>
                <span className="px-2 py-0.5 rounded-[4px] bg-[#DCFCE7] text-[#16A34A] text-[11px] font-semibold flex items-center gap-1.5 border border-[#BBF7D0]">
                  <span className="w-1.5 h-1.5 rounded-full bg-[#16A34A] animate-ping" />
                  LIVE DOPPLER FEED
                </span>
              </div>
              <p className="text-[12px] text-[#64748B] mt-0.5">
                Real-time high-resolution radar, precipitation reflectivity, wind velocity vectors, and cloud systems for Hyderabad Control Room.
              </p>
            </div>
          </div>

          {/* Quick jump locations */}
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="text-[11px] font-medium text-[#64748B] uppercase tracking-wider mr-1">Focus:</span>
            {LOCATIONS.map((loc) => (
              <button
                key={loc.id}
                onClick={() => setSelectedLocation(loc)}
                className={`h-7 px-2.5 rounded-[4px] text-[12px] font-medium transition border ${
                  selectedLocation.id === loc.id
                    ? 'bg-[#EEF2FF] text-[#4338CA] border-[#C7D2FE] font-semibold'
                    : 'bg-white text-[#475569] border-[#E2E8F0] hover:text-[#0F172A] hover:bg-[#F8FAFC]'
                }`}
              >
                {loc.name}
              </button>
            ))}

            <div className="h-4 w-px bg-[#E2E8F0] mx-1" />

            <button
              onClick={() => setRefreshKey(prev => prev + 1)}
              title="Refresh radar stream"
              className="h-7 px-2 rounded-[4px] border border-[#E2E8F0] text-[#64748B] hover:text-[#0F172A] hover:bg-[#F8FAFC] flex items-center gap-1 text-[12px] transition"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              <span>Refresh</span>
            </button>

            <a
              href={externalUrl}
              target="_blank"
              rel="noreferrer"
              title="Open full interactive station in new tab"
              className="h-7 px-2.5 rounded-[4px] bg-[#4338CA] text-white hover:bg-[#3730A3] flex items-center gap-1.5 text-[12px] font-medium transition shadow-xs"
            >
              <ExternalLink className="w-3.5 h-3.5" />
              <span>Full Screen Window</span>
            </a>
          </div>
        </div>

        {/* Row 2: Overlays Selector & Numerical Model Selection */}
        <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-[#F1F5F9]">
          {/* Weather Overlay Selector */}
          <div className="flex items-center gap-1 overflow-x-auto">
            <span className="text-[11px] font-medium text-[#64748B] uppercase tracking-wider mr-1 flex items-center gap-1">
              <Layers className="w-3.5 h-3.5" />
              Overlays:
            </span>
            {OVERLAYS.map(({ id, label, icon: Icon, desc }) => {
              const active = selectedOverlay === id;
              return (
                <button
                  key={id}
                  onClick={() => setSelectedOverlay(id)}
                  title={desc}
                  className={`h-7 px-2.5 rounded-[4px] text-[12px] font-medium transition flex items-center gap-1.5 border ${
                    active
                      ? 'bg-[#4338CA] text-white border-[#4338CA] shadow-xs'
                      : 'bg-white text-[#475569] border-[#E2E8F0] hover:text-[#0F172A] hover:bg-[#F8FAFC]'
                  }`}
                >
                  <Icon className={`w-3.5 h-3.5 ${active ? 'text-white' : 'text-[#64748B]'}`} />
                  <span>{label}</span>
                </button>
              );
            })}
          </div>

          {/* Forecast Model & Layer Options */}
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1 text-[12px]">
              <span className="text-[11px] font-medium text-[#64748B] uppercase tracking-wider mr-1">Model:</span>
              {MODELS.map((m) => (
                <button
                  key={m.id}
                  onClick={() => setSelectedModel(m.id)}
                  title={m.desc}
                  className={`px-2 py-0.5 rounded-[4px] text-[12px] font-medium transition ${
                    selectedModel === m.id
                      ? 'bg-[#F1F5F9] text-[#0F172A] font-semibold border border-[#CBD5E1]'
                      : 'text-[#64748B] hover:text-[#0F172A]'
                  }`}
                >
                  {m.label}
                </button>
              ))}
            </div>

            <label className="flex items-center gap-1.5 text-[12px] text-[#475569] cursor-pointer hover:text-[#0F172A] select-none">
              <input
                type="checkbox"
                checked={showPressure}
                onChange={(e) => setShowPressure(e.target.checked)}
                className="rounded border-[#CBD5E1] text-[#4338CA] focus:ring-[#4338CA] w-3.5 h-3.5"
              />
              <span>Isobars</span>
            </label>
          </div>
        </div>
      </div>

      {/* ── Main Interactive Windy Embed Map ── */}
      <div className="flex-1 w-full h-full relative bg-slate-900">
        <iframe
          key={embedUrl}
          title="Windy Live Radar and Weather Overlay"
          src={embedUrl}
          className="w-full h-full border-0 absolute inset-0"
          loading="eager"
          allow="geolocation; fullscreen"
        />

        {/* Floating tactical badge */}
        <div className="absolute bottom-4 left-4 z-20 pointer-events-none bg-slate-900/85 backdrop-blur-sm border border-slate-700/60 rounded-[6px] px-3 py-1.5 text-[11px] text-slate-300 shadow-lg flex items-center gap-2">
          <div className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
          <span>Active Layer: <strong className="text-white capitalize">{selectedOverlay}</strong></span>
          <span className="text-slate-500">|</span>
          <span>Center: <strong className="text-white">{selectedLocation.name}</strong></span>
          <span className="text-slate-500">|</span>
          <span>Model: <strong className="text-white uppercase">{selectedOverlay === 'radar' ? 'Doppler Radar' : selectedModel}</strong></span>
        </div>
      </div>
    </div>
  );
}

