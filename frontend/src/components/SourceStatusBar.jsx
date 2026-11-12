import React from 'react';
import { RefreshCw, AlertTriangle, CheckCircle2, XCircle } from 'lucide-react';

/* Compact live-feed integrity strip: source pills with LIVE/STALE/UNREACHABLE. */
function Pill({ source }) {
  const status = (source.status || '').toLowerCase();
  const map = {
    live:        { cls: 'text-emerald-300 border-emerald-800/70 bg-emerald-950/40', Icon: CheckCircle2 },
    stale:       { cls: 'text-amber-300 border-amber-800/70 bg-amber-950/40', Icon: AlertTriangle },
    unreachable: { cls: 'text-rose-300 border-rose-900/70 bg-rose-950/40', Icon: XCircle },
  }[status] || { cls: 'text-slate-400 border-slate-700 bg-slate-900/40', Icon: XCircle };

  return (
    <div className={`flex items-center gap-1.5 pl-2 pr-2.5 py-1 rounded-md border text-[10.5px] font-semibold whitespace-nowrap ${map.cls}`}>
      <map.Icon className="w-3 h-3 shrink-0" />
      <span className="text-slate-200 font-medium">{source.name}</span>
      <span className="uppercase tracking-wider">{source.status}</span>
      {source.updated_at && (
        <span className="v-mono font-normal opacity-60">
          {new Date(source.updated_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
        </span>
      )}
    </div>
  );
}

export default function SourceStatusBar({ sources = [], onRefresh, loading }) {
  const live = sources.filter((s) => (s.status || '').toLowerCase() === 'live').length;
  const allOk = sources.length > 0 && live === sources.length;

  return (
    <div className="v-scanbar border-b flex items-center gap-3 px-3 h-9 overflow-x-auto">
      {/* Summary chip */}
      <div className="flex items-center gap-2 shrink-0">
        <span
          className={`w-2 h-2 rounded-full ${allOk ? 'bg-emerald-400 v-dot' : 'bg-amber-400'}`}
          style={allOk ? { color: '#34d399' } : { color: '#f5a524' }}
        />
        <span className="text-[11px] font-bold tracking-widest text-slate-200">FEED INTEGRITY</span>
        <span className="v-mono text-[10.5px]" style={{ color: 'var(--vanta-text-faint)' }}>
          {live}/{sources.length || '–'} LIVE
        </span>
      </div>

      <div className="h-4 w-px bg-slate-800 shrink-0" />

      {sources.length === 0 && (
        <span className="text-[11px] text-slate-500">No sources reported yet…</span>
      )}
      {sources.map((s, i) => <Pill key={s.name || i} source={s} />)}

      <button
        onClick={onRefresh}
        disabled={loading}
        className="ml-auto shrink-0 flex items-center gap-1.5 text-[11px] text-cyan-400 hover:text-cyan-300 transition disabled:opacity-40"
      >
        <RefreshCw className={`w-3 h-3 ${loading ? 'animate-spin' : ''}`} />
        Refresh
      </button>
    </div>
  );
}
