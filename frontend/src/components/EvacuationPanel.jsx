import React from 'react';
import { Route, Clock, MapPin, X, CheckCircle, AlertOctagon } from 'lucide-react';

export default function EvacuationPanel({ route, onClose, onClearRoute }) {
  if (!route) return null;

  return (
    <div className="bg-white/95 backdrop-blur border border-gray-200/60 rounded-xl p-4 text-xs shadow-2xl flex flex-col gap-3">
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-2">
          <Route className="w-4 h-4 text-gray-700" />
          <span className="font-bold text-gray-900 text-sm">Evacuation Corridor</span>
          <span className="px-1.5 py-0.5 rounded bg-gray-100 text-gray-700 text-[10px] font-semibold">OSRM Active</span>
        </div>
        <button 
          onClick={onClose} 
          className="text-gray-600 hover:text-gray-900 p-1 rounded-lg hover:bg-gray-50 transition"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      <div className="bg-gray-100/80 p-3 rounded-lg border border-gray-200">
        <div className="text-gray-600 text-[10px] uppercase tracking-wide">Origin Ward</div>
        <div className="text-gray-900 font-semibold text-sm">{route.zone_name}</div>
        
        <div className="mt-2 text-gray-600 text-[10px] uppercase tracking-wide flex items-center gap-1">
          <MapPin className="w-3 h-3 text-gray-700" />
          Destination Safe Shelter
        </div>
        <div className="text-gray-700 font-bold text-sm">{route.shelter_name}</div>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <div className="bg-gray-100/50 p-2.5 rounded-lg border border-gray-200 flex items-center gap-2">
          <Route className="w-4 h-4 text-gray-700" />
          <div>
            <div className="text-[10px] text-gray-600">Total Distance</div>
            <div className="font-bold text-gray-900 text-sm">{(route.distance_meters / 1000).toFixed(1)} km</div>
          </div>
        </div>

        <div className="bg-gray-100/50 p-2.5 rounded-lg border border-gray-200 flex items-center gap-2">
          <Clock className="w-4 h-4 text-gray-700" />
          <div>
            <div className="text-[10px] text-gray-600">Est. Transit Time</div>
            <div className="font-bold text-gray-900 text-sm">{(route.duration_seconds / 60).toFixed(0)} mins</div>
          </div>
        </div>
      </div>

      <div className="bg-gray-100/40 p-2.5 rounded-lg border border-gray-200">
        <div className="font-bold text-gray-700 text-[10px] uppercase tracking-wider mb-1">
          Why this route?
        </div>
        <p className="text-[11px] text-gray-600 leading-relaxed">
          {route.why_this}
        </p>
      </div>

      <div className="flex gap-2 mt-1">
        <button
          onClick={onClearRoute}
          className="flex-1 bg-gray-50 hover:bg-gray-200 text-gray-800 py-2 px-3 rounded-lg font-medium transition"
        >
          Clear Route
        </button>
      </div>
    </div>
  );
}

