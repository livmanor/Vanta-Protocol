import React from 'react';
import { AlertTriangle, Radar, RefreshCw, ShieldAlert } from 'lucide-react';

const tone = {
  red: 'border-rose-300 bg-rose-50 text-rose-950',
  orange: 'border-amber-300 bg-amber-50 text-amber-950',
  yellow: 'border-yellow-300 bg-yellow-50 text-yellow-950',
  green: 'border-emerald-300 bg-emerald-50 text-emerald-950',
};

function whyFloor(alert) {
  if (alert.floor === 'heavy') {
    return 'Red CAP severity floor raises the operations band to heavy even if Open-Meteo rain is lower.';
  }
  if (alert.floor === 'watch') {
    return 'Orange CAP severity floor raises the operations band to watch even if Open-Meteo rain is lower.';
  }
  return 'Yellow/green CAP alerts are context only and do not raise the operations band.';
}

function matchLabel(match) {
  if (match === 'matched') return 'Greater Hyderabad';
  if (match === 'unmatched_text_only') return 'Text only (unverified)';
  if (match === 'other_district') return 'Other district';
  return match || 'Unknown';
}

function AlertCard({ alert, onOpenRadar, compact = false }) {
  return (
    <div className={`rounded-[6px] border px-3 py-2 text-[12px] ${tone[alert.colour] || tone.yellow}`}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="font-semibold text-[13px]">{alert.headline || alert.event || 'CAP alert'}</div>
          <div className="mt-1 opacity-90">
            {alert.sender || 'Unknown sender'}
            {' · '}
            {(alert.colour || 'unknown').toUpperCase()}
            {' · '}
            {alert.severity || 'severity n/a'}
            {' · '}
            {matchLabel(alert.match)}
          </div>
          <div className="mt-1 opacity-80">
            {alert.effective ? new Date(alert.effective).toLocaleString() : '—'}
            {' – '}
            {alert.expires ? new Date(alert.expires).toLocaleString() : '—'}
            {alert.expired ? ' · expired' : ''}
          </div>
          {!compact && alert.match === 'matched' && (
            <>
              <div className="mt-1 opacity-80">
                Districts matched: {(alert.matched_district_codes || []).join(', ') || '—'}
              </div>
              <div className="mt-1 opacity-80">Why this: {whyFloor(alert)}</div>
            </>
          )}
        </div>
        {onOpenRadar && (
          <button
            type="button"
            onClick={onOpenRadar}
            className="inline-flex items-center gap-1.5 h-8 px-2.5 rounded-[6px] border border-current/20 bg-white/70 text-[12px] font-medium"
          >
            <Radar className="w-3.5 h-3.5" strokeWidth={1.5} />
            Open radar
          </button>
        )}
      </div>
    </div>
  );
}

export default function AlertsBanner({ alertsPayload, onOpenRadar, onRefresh, loading, fullPage = false }) {
  if (!alertsPayload) {
    return (
      <div className={`${fullPage ? 'rounded-[8px] border border-[#E2E8F0] bg-white px-4 py-5' : 'border-b border-[#E2E8F0] bg-white px-4 py-2'} text-[12px] text-[#64748B]`}>
        Loading CAP alert feed…
      </div>
    );
  }

  const source = alertsPayload.source || {};
  const status = (source.status || 'failed').toLowerCase();
  const matched = alertsPayload.alerts || [];
  const unmatched = alertsPayload.unmatched || [];
  const recent = alertsPayload.recent || [];
  const counts = alertsPayload.counts || {};

  return (
    <div className={`${fullPage ? 'rounded-[8px] border border-[#E2E8F0] bg-white p-4 sm:p-5' : 'border-b border-[#E2E8F0] bg-white px-4 py-3 max-h-[42vh] overflow-y-auto'} flex flex-col gap-3`}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="text-[12px] text-[#334155]">
          <b className="text-[#0F172A]">CAP alert feed</b>
          {' · '}
          <span className="uppercase font-semibold tracking-wide">{status}</span>
          {' · '}
          seen {counts.items_seen ?? source.items_seen ?? 0}
          {' / parsed '}
          {counts.items_parsed ?? source.items_parsed ?? 0}
          {(counts.items_failed || source.items_failed) ? ` / failed ${counts.items_failed ?? source.items_failed}` : ''}
          {alertsPayload.last_polled_at && (
            <> · polled {new Date(alertsPayload.last_polled_at).toLocaleString()}</>
          )}
        </div>
        {onRefresh && (
          <button
            type="button"
            onClick={onRefresh}
            disabled={loading}
            className="inline-flex items-center gap-1.5 h-8 px-2.5 rounded-[6px] border border-[#E2E8F0] text-[12px] font-medium text-[#334155] hover:bg-[#F8FAFC] disabled:opacity-50"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} strokeWidth={1.5} />
            Refresh feed
          </button>
        )}
      </div>

      {status === 'failed' && (
        <div className="rounded-[6px] border border-rose-200 bg-rose-50 px-3 py-2 text-[12px] text-rose-900 flex items-start gap-2">
          <ShieldAlert className="w-4 h-4 mt-0.5 shrink-0" strokeWidth={1.5} />
          <div>
            <b>CAP alert feed failed.</b> Do not treat this as “no alerts”.
            {source.error_message ? ` ${source.error_message}` : ''}
          </div>
        </div>
      )}

      {status === 'stale' && (
        <div className="rounded-[6px] border border-amber-200 bg-amber-50 px-3 py-2 text-[12px] text-amber-950 flex items-start gap-2">
          <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" strokeWidth={1.5} />
          <div>
            <b>CAP alert feed is stale.</b> Last success{' '}
            {source.last_success_at ? new Date(source.last_success_at).toLocaleString() : 'unknown'}.
            Unexpired matched alerts still apply their floor.
          </div>
        </div>
      )}

      <div>
        <div className="text-[11px] font-semibold uppercase tracking-wide text-[#64748B] mb-1.5">
          Greater Hyderabad
        </div>
        {matched.length > 0 ? (
          <div className="flex flex-col gap-2">
            {matched.map((alert) => (
              <AlertCard key={alert.identifier} alert={alert} onOpenRadar={onOpenRadar} />
            ))}
          </div>
        ) : unmatched.length > 0 ? (
          <div className="rounded-[6px] border border-slate-200 bg-slate-50 px-3 py-2 text-[12px] text-slate-800">
            <b>Possible alerts (unverified).</b> {unmatched.length} message(s) have text areas only and no LGD district code, so they do not raise the operations floor.
            <div className="mt-2 flex flex-col gap-2">
              {unmatched.slice(0, 5).map((alert) => (
                <AlertCard key={alert.identifier} alert={alert} compact />
              ))}
            </div>
          </div>
        ) : alertsPayload.none_active ? (
          <div className="rounded-[6px] border border-emerald-200 bg-emerald-50 px-3 py-2 text-[12px] text-emerald-950">
            <b>No active CAP alerts</b> for Greater Hyderabad (feed read successfully).
          </div>
        ) : status !== 'failed' ? (
          <div className="rounded-[6px] border border-slate-200 bg-slate-50 px-3 py-2 text-[12px] text-slate-700">
            No Greater Hyderabad match in the current CAP window.
          </div>
        ) : null}
      </div>

      <div>
        <div className="text-[11px] font-semibold uppercase tracking-wide text-[#64748B] mb-1.5">
          Recent CAP messages from API ({recent.length})
        </div>
        {recent.length === 0 ? (
          <div className="rounded-[6px] border border-slate-200 bg-slate-50 px-3 py-2 text-[12px] text-slate-700">
            No CAP messages stored yet. Use Refresh feed after the poller runs.
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            {recent.map((alert) => (
              <AlertCard key={`recent-${alert.identifier}`} alert={alert} compact />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
