import React from 'react';
import { AlertTriangle, Radar, ShieldAlert } from 'lucide-react';

const tone = {
  red: 'border-rose-300 bg-rose-50 text-rose-950',
  orange: 'border-amber-300 bg-amber-50 text-amber-950',
  yellow: 'border-yellow-300 bg-yellow-50 text-yellow-950',
  green: 'border-emerald-300 bg-emerald-50 text-emerald-950',
};

function whyFloor(alert) {
  if (alert.floor === 'heavy') {
    return `Red CAP severity floor raises the operations band to heavy even if Open-Meteo rain is lower.`;
  }
  if (alert.floor === 'watch') {
    return `Orange CAP severity floor raises the operations band to watch even if Open-Meteo rain is lower.`;
  }
  return `Yellow/green CAP alerts are context only and do not raise the operations band.`;
}

export default function AlertsBanner({ alertsPayload, onOpenRadar }) {
  const source = alertsPayload?.source || {};
  const status = (source.status || 'failed').toLowerCase();
  const matched = alertsPayload?.alerts || [];
  const unmatched = alertsPayload?.unmatched || [];

  if (status === 'failed') {
    return (
      <div className="border-b border-rose-200 bg-rose-50 px-4 py-2 text-[12px] text-rose-900 flex items-start gap-2">
        <ShieldAlert className="w-4 h-4 mt-0.5 shrink-0" strokeWidth={1.5} />
        <div>
          <b>CAP alert feed failed.</b> Do not treat this as “no alerts”.
          {source.error_message ? ` ${source.error_message}` : ''}
        </div>
      </div>
    );
  }

  if (status === 'stale') {
    return (
      <div className="border-b border-amber-200 bg-amber-50 px-4 py-2 text-[12px] text-amber-950 flex items-start gap-2">
        <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" strokeWidth={1.5} />
        <div>
          <b>CAP alert feed is stale.</b> Last success {source.last_success_at ? new Date(source.last_success_at).toLocaleString() : 'unknown'}.
          Unexpired matched alerts still apply their floor.
          {matched.length === 0 && unmatched.length === 0 ? ' No cached Greater Hyderabad alerts are active.' : ''}
        </div>
      </div>
    );
  }

  if (alertsPayload?.none_active) {
    return (
      <div className="border-b border-emerald-200 bg-emerald-50 px-4 py-2 text-[12px] text-emerald-950">
        <b>No active CAP alerts</b> for Greater Hyderabad (feed read successfully).
      </div>
    );
  }

  if (!matched.length && unmatched.length) {
    return (
      <div className="border-b border-slate-200 bg-slate-50 px-4 py-2 text-[12px] text-slate-800">
        <b>Possible CAP alerts (unverified).</b> {unmatched.length} message(s) have text areas only and no LGD district code, so they do not raise the operations floor.
      </div>
    );
  }

  return (
    <div className="border-b border-[#E2E8F0] bg-white px-4 py-2 flex flex-col gap-2">
      {matched.map((alert) => (
        <div
          key={alert.identifier}
          className={`rounded-[6px] border px-3 py-2 text-[12px] ${tone[alert.colour] || tone.yellow}`}
        >
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div className="min-w-0">
              <div className="font-semibold text-[13px]">{alert.headline || alert.event || 'CAP alert'}</div>
              <div className="mt-1 opacity-90">
                {alert.sender || 'Unknown sender'} · {(alert.colour || 'unknown').toUpperCase()} · {alert.severity || 'severity n/a'}
                {' · '}
                {alert.effective ? new Date(alert.effective).toLocaleString() : '—'}
                {' – '}
                {alert.expires ? new Date(alert.expires).toLocaleString() : '—'}
              </div>
              <div className="mt-1 opacity-80">
                Districts matched: {(alert.matched_district_codes || []).join(', ') || '—'}
              </div>
              <div className="mt-1 opacity-80">Why this: {whyFloor(alert)}</div>
            </div>
            <button
              type="button"
              onClick={onOpenRadar}
              className="inline-flex items-center gap-1.5 h-8 px-2.5 rounded-[6px] border border-current/20 bg-white/70 text-[12px] font-medium"
            >
              <Radar className="w-3.5 h-3.5" strokeWidth={1.5} />
              Open radar
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}
