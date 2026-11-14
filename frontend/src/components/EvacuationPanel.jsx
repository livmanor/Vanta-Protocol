import React from 'react';
import { Route, Clock, MapPin, X } from 'lucide-react';

export default function EvacuationPanel({ route, onClose, onClearRoute }) {
  if (!route) return null;

  return (
    <div className="bg-white border border-[#E2E8F0] rounded-[6px] p-4 text-[14px] shadow-sm flex flex-col gap-3">
      <div className="flex items-start justify-between border-b border-[#E2E8F0] pb-2">
        <div className="flex items-center gap-2">
          <Route className="w-4 h-4 text-[#4338CA]" strokeWidth={1.5} />
          <span className="font-semibold text-[#0F172A] text-[14px]">Evacuation Corridor</span>
          <span className="text-[12px] text-[#16A34A] font-medium ml-1">OSRM Live</span>
        </div>
        <button
          onClick={onClose}
          className="text-[#64748B] hover:text-[#0F172A] p-1 rounded-[4px] hover:bg-[#F1F5F9] transition"
        >
          <X className="w-4 h-4" strokeWidth={1.5} />
        </button>
      </div>

      <div className="flex flex-col gap-1 py-1">
        <div className="text-[12px] text-[#64748B]">Origin Hotspot</div>
        <div className="font-medium text-[#0F172A]">{route.zone_name}</div>
        <div className="text-[12px] text-[#64748B] mt-1">Destination Safe Shelter</div>
        <div className="font-medium text-[#4338CA]">{route.shelter_name}</div>
      </div>

      <div className="grid grid-cols-2 gap-4 py-2 border-t border-b border-[#E2E8F0] text-[12px]">
        <div>
          <span className="text-[#64748B]">Distance</span>
          <div className="font-medium text-[#0F172A] text-[14px] vp-mono">
            {(route.distance_meters / 1000).toFixed(1)} km
          </div>
        </div>
        <div>
          <span className="text-[#64748B]">Est. Transit Time</span>
          <div className="font-medium text-[#0F172A] text-[14px] vp-mono">
            {(route.duration_seconds / 60).toFixed(0)} mins
          </div>
        </div>
      </div>

      <p className="text-[12px] text-[#475569] leading-relaxed">
        {route.why_this}
      </p>

      <button
        onClick={onClearRoute}
        className="vp-btn vp-btn-secondary w-full"
      >
        Clear Route
      </button>
    </div>
  );
}
