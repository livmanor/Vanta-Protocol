import React from 'react';
import { Route, Clock, MapPin, X, CheckCircle, AlertOctagon } from 'lucide-react';

export default function EvacuationPanel({ route, onClose, onClearRoute }) {
  if (!route) return null;

  return (
    <div className="bg-white border border-slate-200 rounded-2xl p-4 text-xs shadow-xl flex flex-col gap-3">
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg bg-indigo-50 flex items-center justify-center text-indigo-600">
            <Route className="w-4 h-4" />
          </div>
          <span className="font-extrabold text-slate-900 text-sm">Evacuation Corridor</span>
          <span className="px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 text-[10px] font-bold">
            OSRM Live
          </span>
        </div>
        <button 
          onClick={onClose} 
          className="text-slate-400 hover:text-slate-700 p-1.5 rounded-lg hover:bg-slate-100 transition"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      <div className="bg-slate-50 p-3 rounded-xl border border-slate-200">
        <div className="text-slate-400 text-[10px] uppercase tracking-wide font-bold">Origin Hotspot</div>
        <div className="text-slate-900 font-bold text-sm mt-0.5">{route.zone_name}</div>
        
        <div className="mt-2.5 pt-2 border-t border-slate-200">
          <div className="text-slate-400 text-[10px] uppercase tracking-wide font-bold flex items-center gap-1">
            <MapPin className="w-3.5 h-3.5 text-indigo-600" />
            Destination Safe Shelter
          </div>
          <div className="text-indigo-700 font-extrabold text-sm mt-0.5">{route.shelter_name}</div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <div className="bg-slate-50 p-2.5 rounded-xl border border-slate-200 flex items-center gap-2">
          <Route className="w-4 h-4 text-slate-400" />
          <div>
            <div className="text-[10px] text-slate-400 font-medium">Total Distance</div>
            <div className="font-extrabold text-slate-900 text-sm">{(route.distance_meters / 1000).toFixed(1)} km</div>
          </div>
        </div>

        <div className="bg-slate-50 p-2.5 rounded-xl border border-slate-200 flex items-center gap-2">
          <Clock className="w-4 h-4 text-slate-400" />
          <div>
            <div className="text-[10px] text-slate-400 font-medium">Est. Transit Time</div>
            <div className="font-extrabold text-slate-900 text-sm">{(route.duration_seconds / 60).toFixed(0)} mins</div>
          </div>
        </div>
      </div>

      <div className="bg-indigo-50/70 p-3 rounded-xl border border-indigo-100">
        <div className="font-bold text-indigo-900 text-[10px] uppercase tracking-wider mb-1">
          Why this route?
        </div>
        <p className="text-[11px] text-slate-700 leading-relaxed">
          {route.why_this}
        </p>
      </div>

      <div className="flex gap-2 mt-1">
        <button
          onClick={onClearRoute}
          className="flex-1 bg-slate-100 hover:bg-slate-200 text-slate-700 py-2 px-3 rounded-xl font-bold border border-slate-200 transition text-center"
        >
          Clear Route
        </button>
      </div>
    </div>
  );
}
