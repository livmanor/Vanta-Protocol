import React, { useEffect, useMemo, useState } from 'react';
import { CalendarDays, Check, Download, Printer, X } from 'lucide-react';
import { decideCalendarEvent } from '../api';

const tint = {
  traffic: 'bg-sky-50 border-sky-200 text-sky-900',
  evacuation: 'bg-violet-50 border-violet-200 text-violet-900',
  resources: 'bg-teal-50 border-teal-200 text-teal-900',
  advisory: 'bg-slate-100 border-slate-300 text-slate-800',
};
const notAvailable = value => value?.trim() || 'Not available';

function exportIcs(events) {
  const approved = events.filter(event => event.status === 'approved');
  const dt = value => new Date(value).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
  const escape = value => String(value || '').replace(/\\/g, '\\\\').replace(/\n/g, '\\n').replace(/,/g, '\\,').replace(/;/g, '\\;');
  const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Vanta Protocol//Operations Calendar//EN'];
  for (const event of approved) lines.push('BEGIN:VEVENT', `UID:${escape(event.id)}@vanta`, `DTSTART:${dt(event.start)}`, `DTEND:${dt(event.end)}`, `SUMMARY:${escape(event.title)}`, `LOCATION:${escape(event.location)}`, `DESCRIPTION:${escape(event.details)}`, 'END:VEVENT');
  lines.push('END:VCALENDAR');
  const link = document.createElement('a');
  link.href = URL.createObjectURL(new Blob([lines.join('\r\n')], { type: 'text/calendar' }));
  link.download = 'vanta-approved-operations.ics'; link.click(); URL.revokeObjectURL(link.href);
}

function printApproved(events) {
  const rows = events.filter(event => event.status === 'approved');
  const escape = value => String(value || 'Not available').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
  const popup = window.open('', '_blank', 'width=900,height=700');
  if (!popup) return;
  popup.document.write(`<html><head><title>Approved operations calendar</title><style>body{font:14px Arial,sans-serif;margin:32px;color:#0f172a}h1{font-size:22px}article{border-bottom:1px solid #cbd5e1;padding:12px 0}small{color:#475569}</style></head><body><h1>Approved operations calendar</h1>${rows.map(event => `<article><b>${escape(event.title)}</b><br/><small>${escape(new Date(event.start).toLocaleString())} – ${escape(new Date(event.end).toLocaleString())} · ${escape(event.category)}</small><p>${escape(event.location)} · ${escape(event.details)}</p></article>`).join('') || '<p>No approved events.</p>'}<script>window.print()</script></body></html>`);
  popup.document.close();
}

export default function OperationsCalendar({ calendar, model }) {
  const [events, setEvents] = useState(calendar?.events || []);
  const [view, setView] = useState('day');
  const [day, setDay] = useState(new Date().toDateString());
  const [active, setActive] = useState(null);
  const [error, setError] = useState('');
  useEffect(() => { setEvents(calendar?.events || []); if (calendar?.events?.length) setDay(new Date(calendar.events[0].start).toDateString()); }, [calendar]);
  const visible = useMemo(() => events.filter(event => view === 'week' || new Date(event.start).toDateString() === day), [events, view, day]);
  const groups = visible.reduce((out, event) => { const day = new Date(event.start).toLocaleDateString(); (out[day] ||= []).push(event); return out; }, {});
  const decide = async (event, status) => {
    try { const updated = await decideCalendarEvent(event.id, status); setEvents(items => items.map(item => item.id === event.id ? updated : item)); setActive(updated); setError(''); }
    catch (err) { setError(err.message); }
  };
  return <section className="flex flex-col gap-4 border-t border-[#E2E8F0] pt-5">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <h4 className="font-semibold text-[#0F172A] flex items-center gap-2"><CalendarDays className="h-4 w-4"/> Operations calendar</h4>
      <div className="flex items-center gap-2">
        <button onClick={() => setView('day')} className={`vp-btn ${view === 'day' ? 'vp-btn-primary' : 'vp-btn-secondary'}`}>Day</button>
        <button onClick={() => setView('week')} className={`vp-btn ${view === 'week' ? 'vp-btn-primary' : 'vp-btn-secondary'}`}>Week</button>
        <button onClick={() => exportIcs(events)} className="vp-btn vp-btn-secondary"><Download className="h-4 w-4"/>Export .ics</button>
        <button onClick={() => printApproved(events)} className="vp-btn vp-btn-secondary"><Printer className="h-4 w-4"/>Print PDF</button>
      </div>
    </div>
    {view === 'day' && <div className="flex items-center gap-3 text-[12px] text-[#475569]"><button onClick={() => setDay(value => { const date = new Date(value); date.setDate(date.getDate() - 1); return date.toDateString(); })} className="underline">Previous day</button><span>{day}</span><button onClick={() => setDay(value => { const date = new Date(value); date.setDate(date.getDate() + 1); return date.toDateString(); })} className="underline">Next day</button></div>}
    <p className="text-[12px] text-[#64748B]">Drafted by AI, requires officer approval · {new Date(calendar?.valid_from || Date.now()).toLocaleString()} – {new Date(calendar?.valid_until || Date.now()).toLocaleString()}</p>
    {error && <p role="alert" className="text-[12px] text-[#DC2626]">{error}</p>}
    {Object.entries(groups).map(([day, items]) => <div key={day} className="grid grid-cols-[120px_minmax(0,1fr)] gap-4 border-t border-[#E2E8F0] py-3">
      <h5 className="text-[12px] font-medium text-[#475569]">{day}</h5>
      <div className="flex flex-col divide-y divide-[#E2E8F0]">
        {items.sort((a,b) => new Date(a.start)-new Date(b.start)).map(event => <button key={event.id} onClick={() => setActive(event)} className={`my-1 border-l-2 px-3 py-2 text-left ${tint[event.category] || tint.advisory}`}>
          <span className="text-[12px] font-semibold">{new Date(event.start).toLocaleTimeString([], { hour:'2-digit', minute:'2-digit' })}–{new Date(event.end).toLocaleTimeString([], { hour:'2-digit', minute:'2-digit' })} · {event.title}</span>
          <span className="ml-2 text-[11px] opacity-80">{event.category} · {event.status}</span>
        </button>)}
      </div>
    </div>)}
    {!events.length && <p className="border-y border-[#E2E8F0] py-5 text-[13px] text-[#64748B]">No calendar events were returned. Retry Prepare to generate a draft.</p>}
    <div className="text-[11px] text-[#64748B]">Model: {model || 'Not available'} · Only approved events are exported.</div>
    {active && <div className="fixed inset-0 z-[1500] flex justify-end bg-slate-900/20" onClick={() => setActive(null)}><aside className="h-full w-full max-w-md overflow-y-auto bg-white p-6 shadow-xl" onClick={event => event.stopPropagation()}>
      <div className="flex justify-between"><h4 className="text-[16px] font-semibold">{active.title}</h4><button onClick={() => setActive(null)} aria-label="Close"><X className="h-4 w-4"/></button></div>
      <dl className="mt-5 flex flex-col gap-3 text-[13px]"><dt className="text-[#64748B]">Time window</dt><dd>{new Date(active.start).toLocaleString()} – {new Date(active.end).toLocaleString()}</dd><dt className="text-[#64748B]">Location</dt><dd>{notAvailable(active.location)}</dd><dt className="text-[#64748B]">Category / status</dt><dd>{active.category} · {active.status}</dd><dt className="text-[#64748B]">Details</dt><dd className="whitespace-pre-wrap">{notAvailable(active.details)}</dd><dt className="text-[#64748B]">Assigned unit</dt><dd>{notAvailable(active.assigned_unit)}</dd></dl>
      {active.status === 'planned' && <div className="mt-6 flex gap-2"><button onClick={() => decide(active, 'approved')} className="vp-btn vp-btn-primary"><Check className="h-4 w-4"/>Approve</button><button onClick={() => decide(active, 'rejected')} className="vp-btn vp-btn-secondary"><X className="h-4 w-4"/>Reject</button></div>}
    </aside></div>}
  </section>;
}
