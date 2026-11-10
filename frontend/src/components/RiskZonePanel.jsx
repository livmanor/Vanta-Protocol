import React from 'react';
import { ShieldAlert, Navigation, CloudRain, Droplets, Mountain, History, X } from 'lucide-react';

export default function RiskZonePanel({ zone, onClose, onGenerateRoute, loadingRoute }) {
  if (!zone) return null;

  const exp = zone.explanation || {};

  const getRiskBadge = (lvl) => {
    switch (lvl) {
      case 5: return <span className="px-2.5 py-1 rounded bg-red-950/80 text-red-400 border border-red-700 font-bold">LEVEL 5 — CRITICAL</span>;
      case 4: return <span className="px-2.5 py-1 rounded bg-orange-950/80 text-orange-400 border border-orange-700 font-bold">LEVEL 4 — SEVERE</span>;
      case 3: return <span className="px-2.5 py-1 rounded bg-amber-950/80 text-amber-400 border border-amber-700 font-bold">LEVEL 3 — MODERATE</span>;
      case 2: return <span className="px-2.5 py-1 rounded bg-cyan-950/80 text-cyan-400 border border-cyan-700 font-bold">LEVEL 2 — ELEVATED</span>;
      default: return <span className="px-2.5 py-1 rounded bg-emerald-950/80 text-emerald-400 border border-emerald-700 font-bold">LEVEL 1 — LOW</span>;
    }
  };

  return (
    <div className="bg-[#111827]/95 backdrop-blur border border-gray-800 rounded-xl p-4 text-xs shadow-2xl flex flex-col gap-3">
      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-[10px] uppercase tracking-wider text-gray-400 font-semibold">Municipal Ward Risk</span>
            <span className="px-1.5 py-0.2 rounded bg-gray-800 text-gray-400 text-[10px]">Model Output</span>
          </div>
          <h2 className="text-base font-bold text-white mt-0.5">{zone.name}</h2>
        </div>
        <button 
          onClick={onClose} 
          className="text-gray-400 hover:text-white p-1 rounded-lg hover:bg-gray-800 transition"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      <div className="flex items-center justify-between bg-gray-900/70 p-2.5 rounded-lg border border-gray-800">
        <span className="text-gray-300 font-medium">Assessed Risk Severity:</span>
        {getRiskBadge(zone.risk_level)}
      </div>

      {/* Live metrics */}
      <div className="grid grid-cols-2 gap-2 text-gray-300">
        <div className="bg-gray-900/50 p-2 rounded border border-gray-800/60 flex items-center gap-2">
          <CloudRain className="w-4 h-4 text-cyan-400" />
          <div>
            <div className="text-[10px] text-gray-400">24h Rainfall</div>
            <div className="font-semibold text-white">{exp.rainfall_24h_mm?.toFixed(1) ?? '0.0'} mm</div>
          </div>
        </div>

        <div className="bg-gray-900/50 p-2 rounded border border-gray-800/60 flex items-center gap-2">
          <Droplets className="w-4 h-4 text-blue-400" />
          <div>
            <div className="text-[10px] text-gray-400">River Discharge</div>
            <div className="font-semibold text-white">
              {exp.river_discharge_m3s !== null && exp.river_discharge_m3s !== undefined 
                ? `${exp.river_discharge_m3s.toFixed(1)} m³/s` 
                : 'No river sensor'}
            </div>
          </div>
        </div>

        <div className="bg-gray-900/50 p-2 rounded border border-gray-800/60 flex items-center gap-2">
          <Mountain className="w-4 h-4 text-emerald-400" />
          <div>
            <div className="text-[10px] text-gray-400">Terrain Elevation</div>
            <div className="font-semibold text-white">
              {exp.mean_elevation_m !== null && exp.mean_elevation_m !== undefined 
                ? `${exp.mean_elevation_m.toFixed(1)} m` 
                : 'SRTM pending'}
            </div>
          </div>
        </div>

        <div className="bg-gray-900/50 p-2 rounded border border-gray-800/60 flex items-center gap-2">
          <History className="w-4 h-4 text-amber-400" />
          <div>
            <div className="text-[10px] text-gray-400">Historical Flood</div>
            <div className={`font-semibold ${exp.historical_flood_prone ? 'text-amber-400' : 'text-gray-400'}`}>
              {exp.historical_flood_prone ? 'Yes (Adyar/Cooum)' : 'None'}
            </div>
          </div>
        </div>
      </div>

      {/* Why This Explanation */}
      <div className="bg-cyan-950/30 border border-cyan-800/40 p-2.5 rounded-lg text-cyan-200">
        <div className="font-bold text-cyan-400 text-[11px] mb-1 flex items-center gap-1.5">
          <ShieldAlert className="w-3.5 h-3.5" />
          Why this risk rating?
        </div>
        <p className="text-[11px] leading-relaxed text-gray-300">
          {exp.why_this || 'Normal conditions recorded across public weather and elevation telemetry.'}
        </p>
      </div>

      {/* Evacuation Action */}
      <button
        onClick={() => onGenerateRoute(zone)}
        disabled={loadingRoute}
        className="w-full mt-1 bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 text-white font-semibold py-2 px-3 rounded-lg flex items-center justify-center gap-2 transition disabled:opacity-50 shadow-lg shadow-cyan-900/20"
      >
        <Navigation className={`w-4 h-4 ${loadingRoute ? 'animate-spin' : ''}`} />
        <span>{loadingRoute ? 'Routing via OSRM...' : 'Prepare Evacuation Route'}</span>
      </button>
    </div>
  );
}
