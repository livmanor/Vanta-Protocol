import React, { useState, useMemo } from 'react';
import {
  Wind, CloudRain, Radio, Thermometer,
  ExternalLink, RefreshCw, Compass, Maximize2, Cloud
} from 'lucide-react';

const OVERLAYS = [
  { id: 'radar', label: 'Radar', icon: Radio, desc: 'Live precipitation & storm cell tracking' },
  { id: 'rain', label: 'Rain', icon: CloudRain, desc: 'Rainfall accumulation & thunderstorm intensity' },
  { id: 'wind', label: 'Wind', icon: Wind, desc: 'Wind speed vectors & gust corridors' },
  { id: 'clouds', label: 'Clouds', icon: Cloud, desc: 'Visible & infrared satellite imagery' },
  { id: 'temp', label: 'Temp', icon: Thermometer, desc: 'Surface thermal gradients' },
  { id: 'pressure', label: 'Pressure', icon: Compass, desc: 'Barometric low-pressure systems & depressions' },
];

const LOCATIONS = [
  { id: 'hyd_metro', name: 'Hyderabad Metro', lat: 17.3850, lon: 78.4867, zoom: 11 },
  { id: 'musi_basin', name: 'Musi River Basin', lat: 17.3600, lon: 78.4736, zoom: 12 },
  { id: 'telangana', name: 'Telangana Region', lat: 17.8000, lon: 79.0000, zoom: 8 },
  { id: 'south_india', name: 'Bay of Bengal', lat: 15.5000, lon: 80.5000, zoom: 6 },
];

const MODELS = [
  { id: 'ecmwf', label: 'ECMWF 9km', desc: 'European Centre - Gold standard' },
  { id: 'gfs', label: 'GFS 22km', desc: 'NOAA Global Forecast System' },
  { id: 'icon', label: 'ICON 13km', desc: 'DWD High resolution' },
];

const selectClass =
  'h-7 max-w-[160px] rounded-[4px] border border-[#E2E8F0] bg-white px-2 text-[12px] text-[#0F172A] focus:outline-none focus:border-[#4338CA]';

export default function WindyOverlay({ compact = false, onExpand = null }) {
  const [selectedOverlay, setSelectedOverlay] = useState('radar');
  const [selectedLocation, setSelectedLocation] = useState(LOCATIONS[0]);
  const [selectedModel, setSelectedModel] = useState('ecmwf');
  const [showPressure, setShowPressure] = useState(true);
  const [refreshKey, setRefreshKey] = useState(0);

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
      radarRange: '-1',
    });
    return `https://embed.windy.com/embed2.html?${params.toString()}`;
  }, [selectedLocation, selectedOverlay, selectedModel, showPressure, refreshKey]);

  const externalUrl = `https://www.windy.com/?${selectedLocation.lat},${selectedLocation.lon},${selectedLocation.zoom},m:${selectedOverlay}`;

  const handleLocationChange = (event) => {
    const next = LOCATIONS.find((loc) => loc.id === event.target.value);
    if (next) setSelectedLocation(next);
  };

  const overlayButtons = (
    <div
      className={`flex items-center rounded-[6px] border border-[#E2E8F0] p-[2px] bg-[#F8FAFC] ${
        compact ? 'overflow-x-auto max-w-full' : 'overflow-x-auto'
      }`}
      role="group"
      aria-label="Weather overlays"
    >
      {OVERLAYS.map(({ id, label, icon: Icon, desc }) => {
        const active = selectedOverlay === id;
        return (
          <button
            key={id}
            type="button"
            onClick={() => setSelectedOverlay(id)}
            title={desc}
            className={`h-7 px-2 rounded-[4px] text-[12px] font-medium transition flex items-center gap-1 shrink-0 ${
              active
                ? 'bg-white text-[#0F172A] shadow-xs font-semibold'
                : 'text-[#64748B] hover:text-[#0F172A]'
            }`}
          >
            <Icon className={`w-3.5 h-3.5 ${active ? 'text-[#4338CA]' : 'text-[#64748B]'}`} strokeWidth={1.5} />
            <span className={compact ? 'hidden sm:inline' : ''}>{label}</span>
          </button>
        );
      })}
    </div>
  );

  const rightControls = (
    <div className="flex items-center gap-2 shrink-0">
      <select
        aria-label="Focus location"
        value={selectedLocation.id}
        onChange={handleLocationChange}
        className={selectClass}
        title="Focus location"
      >
        {LOCATIONS.map((loc) => (
          <option key={loc.id} value={loc.id}>{loc.name}</option>
        ))}
      </select>

      {selectedOverlay !== 'radar' && (
        <select
          aria-label="Forecast model"
          value={selectedModel}
          onChange={(e) => setSelectedModel(e.target.value)}
          className={selectClass}
          title="Forecast model"
        >
          {MODELS.map((m) => (
            <option key={m.id} value={m.id}>{m.label}</option>
          ))}
        </select>
      )}

      <label className="hidden sm:flex items-center gap-1.5 text-[12px] text-[#475569] cursor-pointer select-none whitespace-nowrap">
        <input
          type="checkbox"
          checked={showPressure}
          onChange={(e) => setShowPressure(e.target.checked)}
          className="rounded border-[#CBD5E1] text-[#4338CA] focus:ring-[#4338CA] w-3.5 h-3.5"
        />
        <span>Isobars</span>
      </label>

      <button
        type="button"
        onClick={() => setRefreshKey((prev) => prev + 1)}
        title="Refresh radar stream"
        className="h-7 w-7 rounded-[4px] border border-[#E2E8F0] text-[#64748B] hover:text-[#0F172A] hover:bg-[#F8FAFC] flex items-center justify-center transition"
      >
        <RefreshCw className="w-3.5 h-3.5" strokeWidth={1.5} />
      </button>

      {compact && onExpand && (
        <button
          type="button"
          onClick={onExpand}
          title="Open full tab view"
          className="h-7 w-7 rounded-[4px] border border-[#E2E8F0] text-[#64748B] hover:text-[#0F172A] hover:bg-[#F8FAFC] flex items-center justify-center transition"
        >
          <Maximize2 className="w-3.5 h-3.5" strokeWidth={1.5} />
        </button>
      )}

      <a
        href={externalUrl}
        target="_blank"
        rel="noreferrer"
        title="Open in Windy.com"
        className="h-7 w-7 rounded-[4px] bg-[#4338CA] text-white hover:bg-[#3730A3] flex items-center justify-center transition"
      >
        <ExternalLink className="w-3.5 h-3.5" strokeWidth={1.5} />
      </a>
    </div>
  );

  return (
    <div className={`flex flex-col h-full w-full overflow-hidden ${compact ? 'bg-white rounded-lg border border-[#E2E8F0]' : 'bg-[#F8FAFC]'}`}>
      <div className="h-12 shrink-0 bg-white border-b border-[#E2E8F0] px-3 flex items-center gap-3">
        <div className="flex items-center gap-2 shrink-0" title="Cross-check only. Not an input to the risk score.">
          <span className="w-2 h-2 rounded-full bg-[#16A34A] animate-pulse" />
          <span className="font-semibold text-[13px] text-[#0F172A]">Radar</span>
          {!compact && (
            <span className="hidden lg:inline text-[11px] text-[#94A3B8] font-normal whitespace-nowrap">
              Cross-check only
            </span>
          )}
        </div>

        <div className="flex-1 min-w-0 flex justify-center">
          {overlayButtons}
        </div>

        {rightControls}
      </div>

      <div className={`flex-1 w-full min-h-0 relative bg-slate-900 ${compact ? 'min-h-[300px]' : ''}`}>
        <iframe
          key={`${embedUrl}-${refreshKey}`}
          title="Windy Live Radar and Weather Overlay"
          src={embedUrl}
          className="w-full h-full border-0 absolute inset-0"
          loading={compact ? 'lazy' : 'eager'}
          allow="geolocation; fullscreen"
        />
      </div>
    </div>
  );
}
