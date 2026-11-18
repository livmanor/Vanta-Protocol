import React from 'react';
import { AlertTriangle, Radio, ShieldCheck } from 'lucide-react';
import AlertsBanner from './AlertsBanner.jsx';

function SummaryCard({ label, value, hint, icon: Icon, tone = 'slate' }) {
  const colors = {
    slate: 'bg-slate-50 text-slate-700',
    indigo: 'bg-indigo-50 text-indigo-700',
    amber: 'bg-amber-50 text-amber-800',
  };

  return (
    <div className="rounded-[8px] border border-[#E2E8F0] bg-white p-4">
      <div className="flex items-center justify-between gap-3">
        <span className="text-[12px] font-medium text-[#64748B]">{label}</span>
        <span className={`flex h-8 w-8 items-center justify-center rounded-[6px] ${colors[tone]}`}>
          <Icon className="h-4 w-4" strokeWidth={1.6} />
        </span>
      </div>
      <div className="mt-2 text-[24px] font-semibold leading-none text-[#0F172A]">{value}</div>
      <div className="mt-2 text-[12px] text-[#64748B]">{hint}</div>
    </div>
  );
}

export default function CapFeedPage({ alertsPayload, onRefresh, loading, onOpenRadar }) {
  const source = alertsPayload?.source || {};
  const status = (source.status || (alertsPayload ? 'failed' : 'loading')).toLowerCase();
  const matched = alertsPayload?.alerts || [];
  const unmatched = alertsPayload?.unmatched || [];
  const recent = alertsPayload?.recent || [];
  const counts = alertsPayload?.counts || {};
  const activeCount = matched.filter(alert => !alert.expired).length;

  return (
    <section className="absolute inset-0 z-[450] overflow-y-auto bg-[#F8FAFC]">
      <div className="mx-auto flex w-full max-w-[1200px] flex-col gap-6 px-4 py-6 sm:px-8 sm:py-8">
        <header className="flex flex-wrap items-start justify-between gap-4 border-b border-[#E2E8F0] pb-5">
          <div>
            <div className="flex items-center gap-2 text-[12px] font-semibold uppercase tracking-[0.12em] text-[#4338CA]">
              <Radio className="h-4 w-4" strokeWidth={1.6} />
              Official alert feed
            </div>
            <h1 className="mt-2 text-[24px] font-semibold tracking-tight text-[#0F172A] sm:text-[28px]">CAP Feed</h1>
            <p className="mt-1 max-w-2xl text-[14px] leading-6 text-[#475569]">
              Common Alerting Protocol messages, district matching, and feed health for Greater Hyderabad.
            </p>
          </div>
          <div className={`inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-[12px] font-semibold uppercase tracking-wide ${status === 'failed' ? 'border-rose-200 bg-rose-50 text-rose-800' : status === 'stale' ? 'border-amber-200 bg-amber-50 text-amber-800' : 'border-emerald-200 bg-emerald-50 text-emerald-800'}`}>
            {status === 'failed' || status === 'stale' ? <AlertTriangle className="h-3.5 w-3.5" /> : <ShieldCheck className="h-3.5 w-3.5" />}
            {status}
          </div>
        </header>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <SummaryCard label="Active district matches" value={activeCount} hint="Verified Greater Hyderabad alerts" icon={ShieldCheck} tone="indigo" />
          <SummaryCard label="Unverified messages" value={unmatched.length} hint="Text-only area matches; do not raise the floor" icon={AlertTriangle} tone="amber" />
          <SummaryCard label="Recent API messages" value={recent.length} hint={`${counts.items_parsed ?? source.items_parsed ?? 0} parsed · ${counts.items_seen ?? source.items_seen ?? 0} seen`} icon={Radio} />
        </div>

        <AlertsBanner
          alertsPayload={alertsPayload}
          onOpenRadar={onOpenRadar}
          onRefresh={onRefresh}
          loading={loading}
          fullPage
        />
      </div>
    </section>
  );
}
