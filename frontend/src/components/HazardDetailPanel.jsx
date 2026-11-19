import React, { useState, useEffect } from 'react';
import {
  Activity, AlertTriangle, CheckCircle2, ChevronRight, Clock, Database, Eye,
  Flame, Info, Layers, RefreshCw, Shield, ShieldAlert, Sparkles, Wind, X, Zap
} from 'lucide-react';
import { fetchUnifiedHazards, fetchHazardModules, approveHazardAction, rejectHazardAction } from '../api';

const HAZARD_COLORS = {
  earthquake: { bg: '#FEF3C7', border: '#D97706', text: '#92400E', dot: '#D97706', label: 'Earthquake (USGS)' },
  cyclone: { bg: '#F3E8FF', border: '#9333EA', text: '#6B21A8', dot: '#9333EA', label: 'Cyclone (IBTrACS)' },
  wildfire: { bg: '#FEE2E2', border: '#DC2626', text: '#991B1B', dot: '#DC2626', label: 'Wildfire (NASA FIRMS)' },
  urban_flood: { bg: '#DBEAFE', border: '#2563EB', text: '#1E40AF', dot: '#2563EB', label: 'Urban Flood (HTP)' },
  heat: { bg: '#FFEDD5', border: '#EA580C', text: '#9A3412', dot: '#EA580C', label: 'Heat Screening' },
};

export default function HazardDetailPanel({
  selectedHazard,
  onClose,
  onSelectHazard,
  activeFilters,
  onToggleFilter,
  onRefresh,
}) {
  const [modules, setModules] = useState({});
  const [showTierBModal, setShowTierBModal] = useState(false);
  const [actionLoading, setActionLoading] = useState({});
  const [actionStatusMsg, setActionStatusMsg] = useState('');

  useEffect(() => {
    fetchHazardModules().then(setModules).catch(console.error);
  }, []);

  const handleApprove = async (actionId) => {
    setActionLoading((prev) => ({ ...prev, [actionId]: true }));
    try {
      await approveHazardAction(actionId);
      setActionStatusMsg(`Action ${actionId} approved by Watch Officer.`);
      if (onRefresh) onRefresh();
    } catch (err) {
      alert(`Approval failed: ${err.message}`);
    } finally {
      setActionLoading((prev) => ({ ...prev, [actionId]: false }));
    }
  };

  const handleReject = async (actionId) => {
    setActionLoading((prev) => ({ ...prev, [actionId]: true }));
    try {
      await rejectHazardAction(actionId);
      setActionStatusMsg(`Action ${actionId} rejected.`);
      if (onRefresh) onRefresh();
    } catch (err) {
      alert(`Rejection failed: ${err.message}`);
    } finally {
      setActionLoading((prev) => ({ ...prev, [actionId]: false }));
    }
  };

  return (
    <div className="flex flex-col gap-4">
      {/* DISCLAIMER BANNER */}
      <div className="p-3 bg-[#F8FAFC] border border-[#CBD5E1] rounded-[6px] flex items-start gap-2.5">
        <Info className="w-4 h-4 text-[#475569] shrink-0 mt-0.5" />
        <div className="text-[11px] leading-tight text-[#475569]">
          <strong className="text-[#0F172A] font-semibold">Strict Independent Hazard Scoring:</strong> No combined &quot;total risk&quot; score is computed. Risk colors represent screening thresholds only and never imply a confirmed disaster without officer verification.
        </div>
      </div>

      {/* HAZARD LAYER FILTERS BAR */}
      <div className="bg-white border border-[#E2E8F0] rounded-[6px] p-3 shadow-xs">
        <div className="flex items-center justify-between mb-2">
          <span className="text-[12px] font-semibold text-[#0F172A] uppercase tracking-wider flex items-center gap-1.5">
            <Layers className="w-3.5 h-3.5 text-[#4338CA]" />
            <span>Hazard Layers</span>
          </span>
          <button
            onClick={() => setShowTierBModal(true)}
            className="text-[11px] text-[#4338CA] hover:underline font-medium"
          >
            Tier B Status (7 modules)
          </button>
        </div>

        <div className="flex flex-wrap gap-2">
          {Object.entries(HAZARD_COLORS).map(([hid, meta]) => {
            const active = activeFilters[hid] !== false;
            return (
              <button
                key={hid}
                onClick={() => onToggleFilter(hid)}
                className="px-2.5 py-1 rounded-[4px] text-[11px] font-medium border flex items-center gap-1.5 transition-all"
                style={{
                  backgroundColor: active ? meta.bg : '#F1F5F9',
                  borderColor: active ? meta.border : '#CBD5E1',
                  color: active ? meta.text : '#64748B',
                  opacity: active ? 1 : 0.6,
                }}
              >
                <span className="w-2 h-2 rounded-full" style={{ backgroundColor: active ? meta.dot : '#94A3B8' }} />
                <span>{meta.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* ACTION STATUS ALERT */}
      {actionStatusMsg && (
        <div className="p-2.5 bg-[#DCFCE7] border border-[#86EFAC] rounded-[6px] text-[12px] text-[#166534] flex items-center justify-between">
          <span>{actionStatusMsg}</span>
          <button onClick={() => setActionStatusMsg('')} className="text-[#166534] hover:opacity-70">
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* SELECTED HAZARD DETAIL CARD */}
      {selectedHazard ? (
        <div className="bg-white border-2 rounded-[8px] p-4 shadow-sm flex flex-col gap-3 relative animate-in fade-in" style={{ borderColor: HAZARD_COLORS[selectedHazard.hazard_id]?.border || '#4338CA' }}>
          <div className="flex items-start justify-between gap-2">
            <div>
              <div className="flex items-center gap-2 mb-1">
                {/* OBSERVED VS PREDICTED BADGE */}
                {selectedHazard.is_observed ? (
                  <span className="px-2 py-0.5 bg-[#DCFCE7] text-[#15803D] border border-[#86EFAC] rounded-[4px] text-[10px] font-bold uppercase tracking-wider flex items-center gap-1">
                    <Eye className="w-3 h-3" />
                    <span>[Observed Event]</span>
                  </span>
                ) : (
                  <span className="px-2 py-0.5 bg-[#EEF2FF] text-[#4338CA] border border-[#C7D2FE] rounded-[4px] text-[10px] font-bold uppercase tracking-wider flex items-center gap-1">
                    <Sparkles className="w-3 h-3" />
                    <span>[Predicted Risk Screen]</span>
                  </span>
                )}

                {/* METHOD BADGE */}
                <span className="px-2 py-0.5 bg-[#F1F5F9] text-[#475569] rounded-[4px] text-[10px] font-mono font-medium">
                  Method: {selectedHazard.method.toUpperCase()}
                </span>
              </div>
              <h3 className="text-[15px] font-bold text-[#0F172A] leading-snug">{selectedHazard.name}</h3>
            </div>
            {onClose && (
              <button onClick={onClose} className="text-[#94A3B8] hover:text-[#0F172A] p-1">
                <X className="w-4 h-4" />
              </button>
            )}
          </div>

          {/* TIMESTAMPS & MODEL METADATA */}
          <div className="grid grid-cols-2 gap-2 p-2.5 bg-[#F8FAFC] border border-[#E2E8F0] rounded-[6px] text-[11px]">
            <div>
              <span className="text-[#64748B] block">Observation / Event Time:</span>
              <strong className="text-[#0F172A] font-mono">{new Date(selectedHazard.event_time).toLocaleString()}</strong>
            </div>
            <div>
              <span className="text-[#64748B] block">Forecast Window:</span>
              <strong className="text-[#0F172A] font-mono">{selectedHazard.forecast_window_h === 0 ? '0h (Live fix)' : `${selectedHazard.forecast_window_h} hours`}</strong>
            </div>
            <div>
              <span className="text-[#64748B] block">Model / Version:</span>
              <strong className="text-[#0F172A] font-mono">{selectedHazard.model_version}</strong>
            </div>
            <div>
              <span className="text-[#64748B] block">Probability:</span>
              <strong className="text-[#0F172A] font-mono">{selectedHazard.probability === null ? 'None (Uncalibrated/Observed)' : `${(selectedHazard.probability * 100).toFixed(1)}%`}</strong>
            </div>
          </div>

          {/* DATA FRESHNESS */}
          {selectedHazard.data_freshness && selectedHazard.data_freshness.length > 0 && (
            <div className="flex flex-col gap-1 text-[11px]">
              <span className="font-semibold text-[#475569] flex items-center gap-1">
                <Clock className="w-3.5 h-3.5 text-[#64748B]" />
                <span>Data Freshness:</span>
              </span>
              {selectedHazard.data_freshness.map((df, i) => (
                <div key={i} className="flex items-center justify-between text-[#334155] pl-4">
                  <span>{df.source}</span>
                  <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium uppercase ${df.status === 'live' ? 'bg-[#DCFCE7] text-[#166534]' : 'bg-[#FEF3C7] text-[#92400E]'}`}>
                    {df.status} · {df.fetched_at ? new Date(df.fetched_at).toLocaleTimeString() : 'N/A'}
                  </span>
                </div>
              ))}
            </div>
          )}

          {/* CONTRIBUTING FACTORS */}
          {selectedHazard.contributing_factors && selectedHazard.contributing_factors.length > 0 && (
            <div className="flex flex-col gap-1.5">
              <span className="text-[12px] font-semibold text-[#0F172A]">Contributing Factors:</span>
              <div className="divide-y divide-[#E2E8F0] border border-[#E2E8F0] rounded-[6px] overflow-hidden text-[11px]">
                {selectedHazard.contributing_factors.map((f, i) => (
                  <div key={i} className="flex items-center justify-between px-3 py-1.5 bg-white">
                    <span className="text-[#475569] capitalize">{f.name.replace(/_/g, ' ')}</span>
                    <span className="font-mono font-medium text-[#0F172A]">
                      {f.value !== null && f.value !== undefined ? `${f.value} ${f.unit || ''}` : f.note || '–'}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* SUMMARY RATIONALE */}
          <div className="text-[12px] text-[#334155] leading-relaxed p-2.5 bg-[#F8FAFC] border border-[#E2E8F0] rounded-[6px]">
            <strong className="text-[#0F172A] block mb-0.5">Rationale:</strong>
            {selectedHazard.summary}
          </div>

          {/* WARNINGS */}
          {selectedHazard.warnings && selectedHazard.warnings.length > 0 && (
            <div className="flex flex-col gap-1">
              {selectedHazard.warnings.map((w, i) => (
                <div key={i} className="text-[11px] text-[#991B1B] bg-[#FEF2F2] border border-[#FCA5A5] p-2 rounded-[4px] flex items-start gap-1.5">
                  <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5 text-[#DC2626]" />
                  <span>{w}</span>
                </div>
              ))}
            </div>
          )}

          {/* SUGGESTED ACTIONS REQUIRING APPROVAL */}
          {selectedHazard.recommended_actions && selectedHazard.recommended_actions.length > 0 && (
            <div className="flex flex-col gap-2 mt-1 pt-2 border-t border-[#E2E8F0]">
              <div className="flex items-center justify-between">
                <span className="text-[12px] font-bold text-[#0F172A] flex items-center gap-1.5">
                  <ShieldAlert className="w-4 h-4 text-[#4338CA]" />
                  <span>Officer Response Recommendations:</span>
                </span>
                <span className="text-[10px] text-[#94A3B8] font-mono">Requires Approval</span>
              </div>

              <div className="flex flex-col gap-2">
                {selectedHazard.recommended_actions.map((act) => (
                  <div key={act.id} className="p-2.5 bg-[#F8FAFC] border border-[#CBD5E1] rounded-[6px] flex flex-col gap-1.5">
                    <div className="flex items-center justify-between">
                      <span className="text-[11px] font-semibold text-[#0F172A] uppercase">
                        {act.action_type.replace(/_/g, ' ')} · Priority: {act.priority}
                      </span>
                      <span className={`text-[10px] px-2 py-0.5 rounded font-bold uppercase ${act.status === 'approved' ? 'bg-[#DCFCE7] text-[#166534]' : act.status === 'rejected' ? 'bg-[#FEE2E2] text-[#991B1B]' : 'bg-[#FEF3C7] text-[#92400E]'}`}>
                        {act.status}
                      </span>
                    </div>
                    <p className="text-[11px] text-[#334155] leading-normal">{act.description}</p>
                    {act.status === 'suggested' ? (
                      <div className="flex items-center gap-2 pt-1">
                        <button
                          onClick={() => handleApprove(act.id)}
                          disabled={actionLoading[act.id]}
                          className="px-2.5 py-1 bg-[#16A34A] hover:bg-[#15803D] text-white rounded-[4px] text-[11px] font-semibold flex items-center gap-1 transition-colors"
                        >
                          <CheckCircle2 className="w-3 h-3" />
                          <span>Approve Action</span>
                        </button>
                        <button
                          onClick={() => handleReject(act.id)}
                          disabled={actionLoading[act.id]}
                          className="px-2.5 py-1 bg-[#F1F5F9] hover:bg-[#E2E8F0] text-[#64748B] rounded-[4px] text-[11px] font-semibold transition-colors"
                        >
                          Reject
                        </button>
                      </div>
                    ) : (
                      <div className="text-[10px] text-[#64748B] font-mono">
                        {act.status === 'approved' ? `Approved by ${act.approved_by || 'Officer'} at ${new Date(act.approved_at).toLocaleTimeString()}` : `Rejected by ${act.approved_by || 'Officer'}`}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      ) : (
        <div className="p-4 bg-white border border-[#E2E8F0] rounded-[6px] text-center text-[#64748B] text-[12px]">
          <p>Click any hazard marker on the map to inspect full observation metadata, data freshness, and response recommendations.</p>
        </div>
      )}

      {/* TIER B MODAL / DRAWER */}
      {showTierBModal && (
        <div className="fixed inset-0 z-[1000] bg-black/40 flex items-center justify-center p-4">
          <div className="bg-white rounded-[8px] max-w-[650px] w-full max-h-[85vh] flex flex-col overflow-hidden shadow-xl border border-[#CBD5E1]">
            <div className="p-4 border-b border-[#E2E8F0] flex items-center justify-between bg-[#F8FAFC]">
              <div>
                <h3 className="text-[16px] font-bold text-[#0F172A]">Tier B Hazard Modules (Unimplemented)</h3>
                <p className="text-[12px] text-[#64748B]">Explicit sensor deficits documented under scientific integrity standards.</p>
              </div>
              <button onClick={() => setShowTierBModal(false)} className="text-[#64748B] hover:text-[#0F172A] p-1">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-4 overflow-y-auto flex flex-col gap-3">
              {Object.values(modules)
                .filter((m) => m.tier === 'B')
                .map((m) => (
                  <div key={m.hazard_id} className="p-3 border border-[#E2E8F0] rounded-[6px] bg-white flex flex-col gap-1.5">
                    <div className="flex items-center justify-between">
                      <span className="font-semibold text-[13px] text-[#0F172A]">{m.name}</span>
                      <span className="px-2 py-0.5 bg-[#F1F5F9] text-[#64748B] rounded text-[10px] font-mono uppercase font-bold">
                        {m.status}
                      </span>
                    </div>
                    <div className="text-[11px] text-[#4338CA] font-medium">Required telemetry: {m.data_source}</div>
                    <div className="text-[11px] text-[#991B1B] bg-[#FEF2F2] p-2 rounded-[4px] border border-[#FCA5A5] leading-normal">
                      <strong>Deficit Note:</strong> {m.message}
                    </div>
                  </div>
                ))}
            </div>

            <div className="p-3 border-t border-[#E2E8F0] bg-[#F8FAFC] flex justify-end">
              <button onClick={() => setShowTierBModal(false)} className="vp-btn vp-btn-primary">
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
