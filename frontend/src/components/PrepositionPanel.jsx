import React, { useState } from 'react';
import { Compass, Check, AlertCircle, Shield, ArrowRight } from 'lucide-react';

export default function PrepositionPanel({ suggestions, onApprove, loading }) {
  const [approvingId, setApprovingId] = useState(null);

  const handleApprove = async (s) => {
    setApprovingId(s.id);
    try {
      await onApprove(s.id, s.unit_id, s.target_zone_name);
    } finally {
      setApprovingId(null);
    }
  };

  return (
    <div className="bg-[#111827]/95 backdrop-blur border border-gray-800 rounded-xl p-4 text-xs shadow-2xl flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Compass className="w-4 h-4 text-amber-400" />
          <span className="font-bold text-white text-sm">Patrol & Rescue Pre-Positioning</span>
        </div>
        <span className="px-1.5 py-0.5 rounded bg-amber-950/80 text-amber-400 border border-amber-800 text-[10px] font-semibold">
          AI Recommendations
        </span>
      </div>

      <div className="text-gray-400 text-[11px] leading-relaxed">
        Algorithm matches closest available units to priority risk zones. <strong className="text-gray-200">Officer approval required</strong> before dispatch orders are executed.
      </div>

      {suggestions && suggestions.length > 0 ? (
        <div className="flex flex-col gap-2.5 max-h-[300px] overflow-y-auto pr-1">
          {suggestions.map((s) => (
            <div 
              key={s.id}
              className="bg-gray-900/80 border border-gray-800 rounded-lg p-3 flex flex-col gap-2 hover:border-gray-700 transition"
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5">
                  <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                    s.unit_kind === 'rescue_boat' 
                      ? 'bg-cyan-950 text-cyan-400 border border-cyan-800' 
                      : s.unit_kind === 'ambulance'
                      ? 'bg-rose-950 text-rose-400 border border-rose-800'
                      : 'bg-blue-950 text-blue-400 border border-blue-800'
                  }`}>
                    {s.unit_kind.replace('_', ' ')}
                  </span>
                  <span className="font-bold text-white text-xs">{s.unit_id}</span>
                </div>
                <div className="text-[10px] text-gray-400 font-mono">
                  ETA: <span className="text-amber-400 font-bold">{s.eta_minutes} min</span> ({s.distance_km} km)
                </div>
              </div>

              <div className="flex items-center gap-2 text-gray-300">
                <span className="text-gray-400">{s.station}</span>
                <ArrowRight className="w-3.5 h-3.5 text-gray-500" />
                <span className="font-semibold text-white">{s.target_zone_name}</span>
                <span className="ml-auto text-amber-400 font-bold">Lvl {s.risk_level}</span>
              </div>

              <div className="bg-gray-950/50 p-2 rounded text-[10px] text-gray-400">
                <span className="text-gray-300 font-semibold">Why this? </span>
                {s.why_this}
              </div>

              <button
                onClick={() => handleApprove(s)}
                disabled={approvingId === s.id}
                className="w-full mt-1 bg-emerald-600 hover:bg-emerald-500 text-white font-semibold py-1.5 px-3 rounded flex items-center justify-center gap-1.5 transition disabled:opacity-50"
              >
                <Check className="w-3.5 h-3.5" />
                <span>{approvingId === s.id ? 'Authorizing Dispatch...' : 'Approve Pre-Positioning'}</span>
              </button>
            </div>
          ))}
        </div>
      ) : (
        <div className="bg-gray-900/50 border border-gray-800/80 rounded-lg p-4 text-center">
          <AlertCircle className="w-6 h-6 text-gray-500 mx-auto mb-1.5" />
          <div className="text-gray-300 font-medium">No Pending Recommendations</div>
          <p className="text-[10px] text-gray-500 mt-1 max-w-[240px] mx-auto">
            Units must be registered via "Register Unit" and assessed against active high-risk zones.
          </p>
        </div>
      )}
    </div>
  );
}
