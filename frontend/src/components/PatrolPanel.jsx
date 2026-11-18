import React from 'react';
import {
  Shield, CheckCircle2, ChevronRight, Navigation, ExternalLink,
  Plus, Trash2, RotateCcw, Play, Pause, AlertTriangle, MapPin
} from 'lucide-react';

export default function PatrolPanel({
  patrolPoints = [],
  activePointIndex = 0,
  onAdvancePoint,
  onResetPatrol,
  onClearPatrol,
  onRemovePoint,
  isAddMode = false,
  onToggleAddMode,
  routeStats = null,
  isSimulating = false,
  onToggleSimulation,
  onClose
}) {
  if (patrolPoints.length === 0 && !isAddMode) {
    return (
      <div className="bg-white border border-[#E2E8F0] rounded-[6px] p-3 text-[13px] shadow-md flex items-center justify-between gap-3 animate-fadeIn">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-[4px] bg-[#EEF2FF] flex items-center justify-center text-[#4338CA]">
            <Shield className="w-4 h-4" />
          </div>
          <div>
            <div className="font-semibold text-[#0F172A]">Patrol Waypoint Planner</div>
            <div className="text-[11px] text-[#64748B]">Click map to set patrol route (auto-snaps to roads)</div>
          </div>
        </div>
        <button
          onClick={onToggleAddMode}
          className="h-7 px-3 rounded-[4px] bg-[#4338CA] hover:bg-[#3730A3] text-white text-[12px] font-medium flex items-center gap-1.5 transition shadow-xs"
        >
          <Plus className="w-3.5 h-3.5" />
          <span>Start Patrol Plan</span>
        </button>
      </div>
    );
  }

  const allCompleted = patrolPoints.length > 0 && activePointIndex >= patrolPoints.length;
  const currentTarget = !allCompleted && patrolPoints[activePointIndex] ? patrolPoints[activePointIndex] : null;
  const prevPoint = activePointIndex > 0 ? patrolPoints[activePointIndex - 1] : null;

  // Google Maps navigation URL for the CURRENT active target point
  const currentGoogleMapsUrl = currentTarget
    ? prevPoint
      ? `https://www.google.com/maps/dir/?api=1&origin=${prevPoint.lat},${prevPoint.lng}&destination=${currentTarget.lat},${currentTarget.lng}&travelmode=driving`
      : `https://www.google.com/maps/dir/?api=1&destination=${currentTarget.lat},${currentTarget.lng}&travelmode=driving`
    : null;

  // Google Maps URL for the FULL multi-stop patrol route
  const fullGoogleMapsUrl = patrolPoints.length >= 2
    ? (() => {
        const origin = `${patrolPoints[0].lat},${patrolPoints[0].lng}`;
        const destination = `${patrolPoints[patrolPoints.length - 1].lat},${patrolPoints[patrolPoints.length - 1].lng}`;
        const waypoints = patrolPoints
          .slice(1, -1)
          .map(p => `${p.lat},${p.lng}`)
          .join('|');
        return `https://www.google.com/maps/dir/?api=1&origin=${origin}&destination=${destination}${waypoints ? `&waypoints=${encodeURIComponent(waypoints)}` : ''}&travelmode=driving`;
      })()
    : null;

  return (
    <div className="bg-white border border-[#CBD5E1] rounded-[8px] p-4 text-[13px] shadow-xl flex flex-col gap-3.5 w-80 sm:w-96 max-h-[85vh] overflow-y-auto">
      {/* ── Header ── */}
      <div className="flex items-center justify-between border-b border-[#E2E8F0] pb-2.5">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-[4px] bg-[#EEF2FF] border border-[#C7D2FE] flex items-center justify-center text-[#4338CA]">
            <Shield className="w-4 h-4" />
          </div>
          <div>
            <div className="font-semibold text-[#0F172A] text-[14px] flex items-center gap-1.5">
              <span>Road Patrol Navigation</span>
              <span className="text-[10px] px-1.5 py-0.2 rounded bg-[#EEF2FF] text-[#4338CA] font-bold">
                {patrolPoints.length} {patrolPoints.length === 1 ? 'Point' : 'Points'}
              </span>
            </div>
            <div className="text-[11px] text-[#64748B]">Auto-snaps off-road clicks to nearest roads</div>
          </div>
        </div>
        {onClose && (
          <button
            onClick={onClose}
            className="text-[#64748B] hover:text-[#0F172A] p-1 rounded hover:bg-[#F1F5F9] transition"
            title="Close patrol panel"
          >
            ✕
          </button>
        )}
      </div>

      {/* ── Active Target Card & Google Maps Actions ── */}
      {patrolPoints.length > 0 && (
        <div className="flex flex-col gap-2.5 bg-[#F8FAFC] border border-[#E2E8F0] rounded-[6px] p-3">
          <div className="flex items-center justify-between text-[11px]">
            <span className="font-semibold uppercase tracking-wider text-[#475569]">
              {allCompleted ? 'Patrol Status' : `Current Objective: Point ${activePointIndex + 1}`}
            </span>
            {!allCompleted && (
              <span className="px-2 py-0.5 rounded-[4px] bg-[#EEF2FF] text-[#4338CA] font-bold flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-[#4338CA] animate-ping" />
                Active Target
              </span>
            )}
          </div>

          {!allCompleted && currentTarget ? (
            <div>
              <div className="text-[14px] font-bold text-[#0F172A] flex items-center gap-1.5">
                <MapPin className="w-4 h-4 text-[#4338CA] shrink-0" />
                <span>Point {activePointIndex + 1}</span>
                {currentTarget.road_name && (
                  <span className="text-[12px] font-normal text-[#64748B] truncate">
                    ({currentTarget.road_name})
                  </span>
                )}
              </div>
              <div className="font-mono text-[11px] text-[#64748B] mt-0.5 pl-5">
                {currentTarget.lat.toFixed(5)}, {currentTarget.lng.toFixed(5)}
                {currentTarget.snapped && currentTarget.distance_m > 0 && (
                  <span className="text-[#059669] ml-1.5 font-sans font-medium">
                    (snapped {currentTarget.distance_m}m to road)
                  </span>
                )}
              </div>
            </div>
          ) : (
            <div className="text-center py-2 text-[#16A34A] font-semibold flex items-center justify-center gap-2">
              <CheckCircle2 className="w-5 h-5 text-[#16A34A]" />
              <span>All Patrol Waypoints Reached & Cleared!</span>
            </div>
          )}

          {/* ── Primary Action: Google Maps Button ── */}
          {!allCompleted && currentGoogleMapsUrl && (
            <div className="flex flex-col gap-2 pt-1 border-t border-[#E2E8F0]">
              <a
                href={currentGoogleMapsUrl}
                target="_blank"
                rel="noreferrer"
                className="w-full h-9 rounded-[6px] bg-[#1E88E5] hover:bg-[#1565C0] text-white text-[13px] font-semibold flex items-center justify-center gap-2 transition shadow-xs cursor-pointer select-none"
                title={`Open navigation to Point ${activePointIndex + 1} in Google Maps`}
              >
                <Navigation className="w-4 h-4 text-white fill-white" />
                <span>Show Point {activePointIndex + 1} on Google Maps</span>
                <ExternalLink className="w-3.5 h-3.5 text-white/80" />
              </a>

              {/* Progress to next point button */}
              <button
                onClick={onAdvancePoint}
                className="w-full h-8 rounded-[6px] bg-[#16A34A] hover:bg-[#15803D] text-white text-[12px] font-semibold flex items-center justify-center gap-1.5 transition shadow-xs cursor-pointer"
              >
                <CheckCircle2 className="w-3.5 h-3.5" />
                <span>
                  Patrol Reached Point {activePointIndex + 1} ➔ Update to Point {activePointIndex + 2 <= patrolPoints.length ? activePointIndex + 2 : 'Finish'}
                </span>
              </button>
            </div>
          )}

          {allCompleted && (
            <button
              onClick={onResetPatrol}
              className="w-full h-8 rounded-[6px] bg-[#4338CA] hover:bg-[#3730A3] text-white text-[12px] font-semibold flex items-center justify-center gap-1.5 transition shadow-xs"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>Restart Patrol from Point 1</span>
            </button>
          )}
        </div>
      )}

      {/* ── Route Statistics (OSRM Road Network) ── */}
      {routeStats && patrolPoints.length >= 2 && (
        <div className="grid grid-cols-2 gap-2 p-2 bg-[#F1F5F9] rounded-[6px] text-[12px]">
          <div>
            <span className="text-[#64748B]">Road Distance:</span>
            <div className="font-bold text-[#0F172A] vp-mono">
              {(routeStats.distance_meters / 1000).toFixed(2)} km
            </div>
          </div>
          <div>
            <span className="text-[#64748B]">Est. Transit:</span>
            <div className="font-bold text-[#0F172A] vp-mono">
              {Math.ceil(routeStats.duration_seconds / 60)} mins
            </div>
          </div>
        </div>
      )}

      {/* ── Waypoints Sequence List ── */}
      <div className="flex flex-col gap-1.5">
        <div className="flex items-center justify-between text-[11px] font-semibold text-[#64748B] uppercase tracking-wider">
          <span>Patrol Waypoint Sequence</span>
          {fullGoogleMapsUrl && (
            <a
              href={fullGoogleMapsUrl}
              target="_blank"
              rel="noreferrer"
              className="text-[#1E88E5] hover:underline flex items-center gap-1 font-medium capitalize"
              title="Open full multi-point route in Google Maps"
            >
              <span>Full Multi-stop</span>
              <ExternalLink className="w-3 h-3" />
            </a>
          )}
        </div>

        {patrolPoints.length === 0 ? (
          <div className="py-4 text-center text-[#64748B] text-[12px] border border-dashed border-[#CBD5E1] rounded-[6px] bg-[#F8FAFC]">
            Click anywhere on the map to add patrol points. Points automatically snap to the nearest road!
          </div>
        ) : (
          <div className="flex flex-col gap-1 max-h-40 overflow-y-auto divide-y divide-[#F1F5F9] border border-[#E2E8F0] rounded-[6px]">
            {patrolPoints.map((pt, idx) => {
              const isReached = idx < activePointIndex;
              const isActive = idx === activePointIndex && !allCompleted;
              return (
                <div
                  key={pt.id}
                  className={`px-3 py-2 flex items-center justify-between gap-2 transition ${
                    isActive ? 'bg-[#EEF2FF]' : isReached ? 'bg-[#F0FDF4]' : 'bg-white'
                  }`}
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <span
                      className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold shrink-0 ${
                        isReached
                          ? 'bg-[#16A34A] text-white'
                          : isActive
                          ? 'bg-[#4338CA] text-white ring-2 ring-[#C7D2FE]'
                          : 'bg-[#E2E8F0] text-[#475569]'
                      }`}
                    >
                      {isReached ? '✓' : idx + 1}
                    </span>
                    <div className="min-w-0">
                      <div className="text-[12px] font-medium text-[#0F172A] truncate flex items-center gap-1">
                        <span>Point {idx + 1}</span>
                        {pt.road_name && <span className="text-[11px] text-[#64748B]">· {pt.road_name}</span>}
                      </div>
                      <div className="font-mono text-[10px] text-[#64748B] truncate">
                        {pt.lat.toFixed(4)}, {pt.lng.toFixed(4)}
                        {pt.snapped && pt.distance_m > 0 && ` (${pt.distance_m}m snapped)`}
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-1 shrink-0">
                    {isActive && (
                      <span className="text-[10px] font-semibold text-[#4338CA] bg-[#C7D2FE]/40 px-1.5 py-0.5 rounded">
                        Target
                      </span>
                    )}
                    {isReached && (
                      <span className="text-[10px] font-semibold text-[#16A34A] bg-[#DCFCE7] px-1.5 py-0.5 rounded">
                        Done
                      </span>
                    )}
                    <button
                      onClick={() => onRemovePoint?.(pt.id)}
                      className="p-1 text-[#94A3B8] hover:text-[#DC2626] transition"
                      title="Remove point"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* ── Controls Strip: Add Point Mode, Simulation, Clear ── */}
      <div className="flex items-center justify-between gap-2 pt-2 border-t border-[#E2E8F0]">
        <button
          onClick={onToggleAddMode}
          className={`h-7 px-2.5 rounded-[4px] text-[12px] font-medium transition border flex items-center gap-1.5 ${
            isAddMode
              ? 'bg-[#4338CA] text-white border-[#4338CA] shadow-xs'
              : 'bg-white text-[#475569] border-[#CBD5E1] hover:text-[#0F172A]'
          }`}
          title="Click on the map to add more patrol points"
        >
          <Plus className="w-3.5 h-3.5" />
          <span>{isAddMode ? 'Adding Active…' : 'Add Point'}</span>
        </button>

        {patrolPoints.length >= 2 && onToggleSimulation && (
          <button
            onClick={onToggleSimulation}
            className={`h-7 px-2.5 rounded-[4px] text-[12px] font-medium transition border flex items-center gap-1.5 ${
              isSimulating
                ? 'bg-[#16A34A] text-white border-[#16A34A]'
                : 'bg-white text-[#475569] border-[#CBD5E1] hover:text-[#0F172A]'
            }`}
            title="Simulate patrol car moving along points and updating Google Maps"
          >
            {isSimulating ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
            <span>{isSimulating ? 'Simulating…' : 'Simulate'}</span>
          </button>
        )}

        {patrolPoints.length > 0 && (
          <button
            onClick={onClearPatrol}
            className="h-7 px-2.5 rounded-[4px] text-[12px] text-[#DC2626] hover:bg-[#FEE2E2] transition border border-[#FCA5A5] flex items-center gap-1"
            title="Clear all patrol points"
          >
            <Trash2 className="w-3 h-3" />
            <span>Clear</span>
          </button>
        )}
      </div>
    </div>
  );
}
