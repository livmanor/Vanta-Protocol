import React from 'react';
import { Route, Clock, MapPin, X, CheckCircle, AlertOctagon } from 'lucide-react';

export default function EvacuationPanel({ route, onClose, onClearRoute }) {
  if (!route) return null;

  return (
    <div className="bg-[#111827]/95 backdrop-blur border border-cyan-800/60 rounded-xl p-4 text-xs shadow-2xl flex flex-col gap-3">
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-2">
          <Route className="w-4 h-4 text-cyan-400" />
          <span className="font-bold text-white text-sm">Evacuation Corridor</span>
          <span className="px-1.5 py-0.5 rounded bg-cyan-950 text-cyan-400 text-[10px] font-semibold">OSRM Active</span>
        </div>
        <button 
          onClick={onClose} 
          className="text-gray-400 hover:text-white p-1 rounded-lg hover:bg-gray-800 transition"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      <div className="bg-gray-900/80 p-3 rounded-lg border border-gray-800">
        <div className="text-gray-400 text-[10px] uppercase tracking-wide">Origin Ward</div>
        <div className="text-white font-semibold text-sm">{route.zone_name}</div>
        
        <div className="mt-2 text-gray-400 text-[10px] uppercase tracking-wide flex items-center gap-1">
          <MapPin className="w-3 h-3 text-emerald-400" />
          Destination Safe Shelter
        </div>
        <div className="text-emerald-400 font-bold text-sm">{route.shelter_name}</div>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <div className="bg-gray-900/50 p-2.5 rounded-lg border border-gray-800 flex items-center gap-2">
          <Route className="w-4 h-4 text-cyan-400" />
          <div>
            <div className="text-[10px] text-gray-400">Total Distance</div>
            <div className="font-bold text-white text-sm">{(route.distance_meters / 1000).toFixed(1)} km</div>
          </div>
        </div>

        <div className="bg-gray-900/50 p-2.5 rounded-lg border border-gray-800 flex items-center gap-2">
          <Clock className="w-4 h-4 text-blue-400" />
          <div>
            <div className="text-[10px] text-gray-400">Est. Transit Time</div>
            <div className="font-bold text-white text-sm">{(route.duration_seconds / 60).toFixed(0)} mins</div>
          </div>
        </div>
      </div>

      <div className="bg-gray-900/40 p-2.5 rounded-lg border border-gray-800">
        <div className="font-bold text-gray-300 text-[10px] uppercase tracking-wider mb-1">
          Why this route?
        </div>
        <p className="text-[11px] text-gray-400 leading-relaxed">
          {route.why_this}
        </p>
      </div>

      <div className="flex gap-2 mt-1">
        <button
          onClick={onClearRoute}
          className="flex-1 bg-gray-800 hover:bg-gray-700 text-gray-200 py-2 px-3 rounded-lg font-medium transition"
        >
          Clear Route
        </button>
      </div>
    </div>
  );
}

