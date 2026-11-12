import React, { useState } from 'react';
import { Activity, AlertTriangle, ArrowRight, Brain, CheckCircle2, RefreshCw, ShieldCheck, Sparkles } from 'lucide-react';

export default function AgentPanel({ status, result, error, loading, onRun, onReviewPreparation, riskZones }) {
  const [confirmGoogleProcessing, setConfirmGoogleProcessing] = useState(false);
  const configured = status?.configured === true;
  const zoneName = (id) => riskZones.find(zone => zone.id === id)?.name || id;
  const notes = result?.prepare?.zone_notes || [];
  const focusZones = result?.predict?.focus_zones || [];

  return (
    <div className="flex flex-col gap-3 text-xs">
      <section className="bg-[#111827]/95 border border-gray-800 rounded-xl p-4 flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Brain className="w-4 h-4 text-violet-400" />
            <span className="font-bold text-white text-sm">Predict + Prepare Agents</span>
          </div>
          <span className={`px-2 py-0.5 rounded border text-[10px] font-bold ${configured ? 'text-emerald-400 border-emerald-800 bg-emerald-950/50' : 'text-amber-300 border-amber-800 bg-amber-950/50'}`}>
            {configured ? 'GEMINI READY' : 'NEEDS API KEY'}
          </span>
        </div>
        <p className="text-gray-400 leading-relaxed">
          Predict reviews the live risk model output. Prepare reviews the existing unit-positioning recommendations. Calculations stay deterministic; Gemini adds a grounded summary and officer checks. Nothing is dispatched automatically.
        </p>

        {!configured && (
          <div className="rounded-lg border border-amber-900/80 bg-amber-950/30 p-3 text-amber-100">
            <div className="font-semibold flex items-center gap-1.5"><AlertTriangle className="w-3.5 h-3.5" /> Gemini is not configured</div>
            <div className="text-[10px] text-amber-200/80 mt-1">Add your key as GEMINI_API_KEY in the backend .env file, then restart the backend. The key stays on the server.</div>
          </div>
        )}
        {error && <div className="rounded-lg border border-rose-900 bg-rose-950/40 p-3 text-rose-200">{error}</div>}

        {configured && <label className="rounded-lg border border-gray-700 bg-gray-900/60 p-3 flex gap-2.5 cursor-pointer">
          <input
            type="checkbox"
            checked={confirmGoogleProcessing}
            onChange={event => setConfirmGoogleProcessing(event.target.checked)}
            className="mt-0.5 accent-violet-500"
          />
          <span className="text-[10px] text-gray-300 leading-relaxed">
            For this run, allow the app to send zone names, computed risk metrics and source freshness, plus summarized asset types, target zones, estimated distances and ETAs to Google Gemini. Unit IDs, station names, exact unit coordinates and incident reports are excluded.
          </span>
        </label>}

        <button onClick={() => onRun(confirmGoogleProcessing)} disabled={!configured || !confirmGoogleProcessing || loading} className="w-full bg-violet-600 hover:bg-violet-500 text-white font-semibold py-2 rounded-lg flex items-center justify-center gap-2 disabled:opacity-50">
          {loading ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
          {loading ? 'Running Predict, then Prepare…' : 'Run Predict + Prepare'}
        </button>
        {status?.model && <div className="text-[10px] text-gray-500">Provider: Google Gemini · Model: {status.model}</div>}
      </section>

      {result && <>
        <section className="bg-[#111827]/95 border border-cyan-900/60 rounded-xl p-4 flex flex-col gap-2">
          <div className="flex items-center gap-2 text-cyan-300 font-bold"><Activity className="w-4 h-4" /> Predict</div>
          <p className="text-gray-200 leading-relaxed">{result.predict.summary}</p>
          {focusZones.length > 0 && <div className="flex flex-col gap-2 mt-1">
            {focusZones.map((item, index) => <div key={`${item.zone_id}-${index}`} className="bg-gray-900/70 rounded-lg p-2.5 border border-gray-800">
              <div className="font-semibold text-white">{zoneName(item.zone_id)}</div>
              <div className="text-gray-300 mt-1">{item.observation}</div>
              <div className="text-[10px] text-cyan-200/80 mt-1">Officer check: {item.officer_check}</div>
            </div>)}
          </div>}
          {result.predict.data_gaps?.length > 0 && <div className="text-[10px] text-amber-200">Data gaps: {result.predict.data_gaps.join(' · ')}</div>}
          {focusZones.length === 0 && <div className="text-[10px] text-gray-500">No focus zones returned for this run.</div>}
        </section>

        <section className="bg-[#111827]/95 border border-amber-900/60 rounded-xl p-4 flex flex-col gap-2">
          <div className="flex items-center gap-2 text-amber-300 font-bold"><ShieldCheck className="w-4 h-4" /> Prepare</div>
          <p className="text-gray-200 leading-relaxed">{result.prepare.summary}</p>
          {notes.map((item, index) => <div key={`${item.zone_id}-${index}`} className="bg-gray-900/70 rounded-lg p-2.5 border border-gray-800">
            <div className="font-semibold text-white">{zoneName(item.zone_id)}</div>
            <div className="text-gray-300 mt-1">{item.note}</div>
            <div className="text-[10px] text-amber-200/80 mt-1">Officer check: {item.officer_check}</div>
          </div>)}
          {result.prepare.readiness_gaps?.length > 0 && <div className="text-[10px] text-amber-200">Readiness gaps: {result.prepare.readiness_gaps.join(' · ')}</div>}
          <button onClick={onReviewPreparation} className="mt-1 text-amber-300 hover:text-white text-[11px] font-semibold flex items-center gap-1 self-start">
            Review unit recommendations <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </section>
        <div className="text-[10px] text-gray-500 text-right">Gemini analysis generated {new Date(result.generated_at).toLocaleString()} · Verify against live source data before acting.</div>
      </>}
    </div>
  );
}
