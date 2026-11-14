import React, { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, Upload, Send, RefreshCw } from 'lucide-react';
import { createContact, fetchContacts, fetchSosLogs, importContacts, sendSos } from '../api';

const gsm7 = new Set(Array.from("@£$¥èéùìòÇ\nØø\rÅåΔ_ΦΓΛΩΠΨΣΘΞÆæßÉ !\"#¤%&'()*+,-./0123456789:;<=>?¡ABCDEFGHIJKLMNOPQRSTUVWXYZÄÖÑÜ§¿abcdefghijklmnopqrstuvwxyzäöñüà^{}\\[~]|€"));
const segmentCount = message => {
  if (!message) return 0;
  const characters = Array.from(message);
  const gsm = characters.every(character => gsm7.has(character));
  const single = gsm ? 160 : 70;
  const multipart = gsm ? 153 : 67;
  return characters.length <= single ? 1 : Math.ceil(characters.length / multipart);
};

export default function RespondSmsPanel({ draft, testMode = true, model, sender }) {
  const [contacts, setContacts] = useState([]);
  const [form, setForm] = useState({ name: '', phone: '', area: '', group: 'public' });
  const [group, setGroup] = useState('all');
  const [area, setArea] = useState('all');
  const [language, setLanguage] = useState('en');
  const [selected, setSelected] = useState([]);
  const [dialog, setDialog] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState(null);
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const message = draft?.[language] || '';

  const refresh = async () => { setLoading(true); try { const [items, history] = await Promise.all([fetchContacts(), fetchSosLogs()]); setContacts(items); setLogs(history); } catch (err) { setError(err.message); } finally { setLoading(false); } };
  useEffect(() => { refresh(); }, []);
  const areas = useMemo(() => [...new Set(contacts.map(item => item.area))].sort(), [contacts]);
  const eligible = contacts.filter(item => (group === 'all' || item.group === group) && (area === 'all' || item.area === area));
  const toggle = id => setSelected(ids => ids.includes(id) ? ids.filter(item => item !== id) : [...ids, id]);
  const addContact = async event => { event.preventDefault(); setError(''); try { await createContact(form); setForm({ name: '', phone: '', area: '', group: 'public' }); await refresh(); } catch (err) { setError(err.message); } };
  const uploadCsv = async event => {
    const file = event.target.files?.[0]; if (!file) return;
    setError('');
    try {
      const text = await file.text();
      const [header, ...lines] = text.trim().split(/\r?\n/);
      const columns = header.split(',').map(value => value.trim().toLowerCase());
      const idx = key => columns.indexOf(key);
      if (['name','phone','area','group'].some(key => idx(key) < 0)) throw new Error('CSV headers must be name, phone, area, group.');
      const rows = lines.filter(Boolean).map(line => { const values = line.split(',').map(value => value.trim()); return { name: values[idx('name')], phone: values[idx('phone')], area: values[idx('area')], group: values[idx('group')] }; });
      const imported = await importContacts(rows);
      setError(`${imported.created.length} contacts imported; ${imported.duplicates.length} duplicate phone numbers skipped.`);
      await refresh();
    } catch (err) { setError(err.message); }
    event.target.value = '';
  };
  const confirmSend = async () => { setSending(true); setError(''); try { const sent = await sendSos(selected, message); setResult(sent); setLogs(items => [sent, ...items.filter(item => item.id !== sent.id)]); setDialog(false); } catch (err) { setError(err.message); } finally { setSending(false); } };
  const retryFailed = async log => {
    const failed = log?.recipients?.filter(item => item.status === 'Failed').map(item => item.contact_id) || [];
    if (!failed.length) return;
    setSending(true); try { const retried = await sendSos(failed, log.message, log.id); setResult(retried); setLogs(items => [retried, ...items.filter(item => item.id !== retried.id)]); } catch (err) { setError(err.message); } finally { setSending(false); }
  };
  return <section className="flex flex-col gap-5 border-t border-[#E2E8F0] pt-5">
    <p className="text-[12px] font-medium text-[#B45309]">Drafted by AI, requires officer approval. No message is sent until you confirm.</p>
    {testMode && <p className="text-[12px] text-[#4338CA]">Test mode: no SMS actually sent. Requests are recorded as queued for demonstration.</p>}
    <h4 className="font-semibold text-[#0F172A]">SOS message preview</h4>
    <div className="flex gap-2">{[['en','English'],['hi','हिन्दी'],['te','తెలుగు']].map(([id,label]) => <button key={id} onClick={() => setLanguage(id)} className={`vp-btn ${language === id ? 'vp-btn-primary' : 'vp-btn-secondary'}`}>{label}</button>)}</div>
    <p className="whitespace-pre-wrap border-y border-[#E2E8F0] py-3 text-[14px] text-[#0F172A]">{message || 'No SMS draft was returned. Retry Respond to generate one.'}</p>
    <div className="flex justify-between text-[12px] text-[#64748B]"><span>{message.length} characters · estimated {segmentCount(message)} segment(s) per recipient</span><span>Model: {model || 'Not available'}</span></div>

    <div className="flex flex-wrap items-end gap-3 border-t border-[#E2E8F0] pt-4">
      <label className="flex flex-col gap-1 text-[12px] text-[#475569]">Recipient group<select value={group} onChange={e => setGroup(e.target.value)} className="vp-input"><option value="all">All groups</option><option value="public">Public</option><option value="volunteers">Volunteers</option><option value="units">Units</option></select></label>
      <label className="flex flex-col gap-1 text-[12px] text-[#475569]">Area<select value={area} onChange={e => setArea(e.target.value)} className="vp-input"><option value="all">All areas</option>{areas.map(item => <option key={item}>{item}</option>)}</select></label>
      <label className="vp-btn vp-btn-secondary cursor-pointer"><Upload className="h-4 w-4"/>Import CSV<input type="file" accept=".csv,text/csv" onChange={uploadCsv} className="hidden"/></label>
      <span className="text-[12px] text-[#64748B]">{selected.length} selected / {eligible.length} shown</span>
    </div>
    <div className="max-h-48 overflow-auto divide-y divide-[#E2E8F0] border-y border-[#E2E8F0]">
      {loading ? <p className="py-3 text-[12px] text-[#64748B]">Loading registered contacts…</p> : eligible.map(contact => <label key={contact.id} className="flex items-center gap-3 py-2 text-[12px] text-[#334155]"><input type="checkbox" checked={selected.includes(contact.id)} onChange={() => toggle(contact.id)}/><span className="flex-1">{contact.name} · {contact.area} · {contact.group}</span><span className="font-mono">{contact.phone}</span></label>)}
      {!loading && !eligible.length && <p className="py-3 text-[12px] text-[#64748B]">No registered contacts match this group and area.</p>}
    </div>
    <form onSubmit={addContact} className="grid gap-2 border-b border-[#E2E8F0] pb-4 md:grid-cols-5">
      <input required value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="Contact name" className="vp-input"/>
      <input required value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })} placeholder="+919876543210" className="vp-input"/>
      <input required value={form.area} onChange={e => setForm({ ...form, area: e.target.value })} placeholder="Area" className="vp-input"/>
      <select value={form.group} onChange={e => setForm({ ...form, group: e.target.value })} className="vp-input"><option value="public">Public</option><option value="volunteers">Volunteers</option><option value="units">Units</option></select>
      <button className="vp-btn vp-btn-secondary">Register contact</button>
    </form>
    {error && <p role="alert" className="text-[12px] text-[#DC2626]">{error}</p>}
    <button onClick={() => setDialog(true)} disabled={!message || selected.length === 0 || sending} className="vp-btn vp-btn-primary self-start"><Send className="h-4 w-4"/>Review and send</button>
    {result && <div className="flex flex-col gap-2 border-t border-[#E2E8F0] pt-4"><b className="text-[13px]">Delivery status · {result.status}</b>{result.test_mode && <span className="text-[12px] text-[#4338CA]">Test mode: no SMS actually sent</span>}{result.recipients.map(item => <div key={item.contact_id} className="flex justify-between text-[12px]"><span>{item.name} · {item.phone}</span><span>{item.status}{item.error ? ` · ${item.error}` : ''}</span></div>)}</div>}
    <div className="flex flex-col gap-2 border-t border-[#E2E8F0] pt-4"><b className="text-[13px]">Recent send log</b>{logs.slice(0, 10).map(log => <div key={log.id} className="border-b border-[#E2E8F0] py-2"><div className="flex justify-between gap-3 text-[12px]"><span>{new Date(log.sent_at).toLocaleString()} · {log.officer_id} · {log.recipients.length} recipients</span><b>{log.status}</b></div>{log.test_mode && <div className="text-[11px] text-[#4338CA]">Test mode: no SMS actually sent</div>}{log.recipients.map(item => <div key={`${log.id}-${item.contact_id}`} className="flex justify-between py-0.5 text-[11px] text-[#475569]"><span>{item.name} · {item.phone}</span><span>{item.status}</span></div>)}{log.recipients.some(item => item.status === 'Failed') && <button onClick={() => retryFailed(log)} disabled={sending} className="mt-1 text-[11px] font-medium text-[#4338CA] underline">Retry failed recipients</button>}</div>)}</div>
    {dialog && <div className="fixed inset-0 z-[1600] flex items-center justify-center bg-slate-900/30 p-4"><div role="dialog" aria-modal="true" className="w-full max-w-xl bg-white p-6 shadow-xl"><h4 className="font-semibold">Confirm SOS send</h4><p className="mt-2 text-[12px] text-[#64748B]">Final message · {selected.length} recipient(s) · Sender: {testMode ? 'Test mode — no SMS sent' : sender || 'Not configured'}</p><p className="my-4 whitespace-pre-wrap border-y border-[#E2E8F0] py-3 text-[14px]">{message}</p><p className="text-[12px] text-[#475569]">This action is logged. Officer approval is required and sending is not automatic.</p><div className="mt-5 flex justify-end gap-2"><button onClick={() => setDialog(false)} className="vp-btn vp-btn-secondary">Cancel</button><button onClick={confirmSend} disabled={sending} className="vp-btn vp-btn-primary">{sending ? <RefreshCw className="h-4 w-4 animate-spin"/> : <AlertTriangle className="h-4 w-4"/>}Send SOS to {selected.length} contacts</button></div></div></div>}
  </section>;
}
