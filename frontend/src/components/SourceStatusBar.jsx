import React from 'react';
import { RefreshCw, AlertTriangle, CheckCircle2, XCircle } from 'lucide-react';
import { useLanguage } from '../i18n.jsx';

/* Compact live-feed integrity strip styled for the clean light admin theme. */
export default function SourceStatusBar({ sources = [], onRefresh, loading }) {
  const { language } = useLanguage();
  const copy = {
    en: ['Live feed integrity', 'Connecting to live feeds…', 'LIVE', 'STALE', 'UNREACHABLE'],
    hi: ['लाइव फ़ीड स्थिति', 'लाइव फ़ीड से जुड़ रहे हैं…', 'सक्रिय', 'पुराना', 'पहुंच से बाहर'],
    te: ['ప్రత్యక్ష ఫీడ్ స్థితి', 'ప్రత్యక్ష ఫీడ్‌లకు అనుసంధానం…', 'ప్రత్యక్షం', 'పాతది', 'అందుబాటులో లేదు'],
  }[language] || ['Live feed integrity', 'Connecting to live feeds…', 'LIVE', 'STALE', 'UNREACHABLE'];

  const live = sources.filter((s) => (s.status || '').toLowerCase() === 'live').length;
  const allOk = sources.length > 0 && live === sources.length;

  const pillFor = (source) => {
    const status = (source.status || '').toLowerCase();
    const map = {
      live: {
        cls: 'bg-emerald-50 text-emerald-700 border-emerald-200',
        dot: 'bg-emerald-500',
        Icon: CheckCircle2,
        label: copy[2],
      },
      stale: {
        cls: 'bg-amber-50 text-amber-700 border-amber-200',
        dot: 'bg-amber-500',
        Icon: AlertTriangle,
        label: copy[3],
      },
      unreachable: {
        cls: 'bg-rose-50 text-rose-700 border-rose-200',
        dot: 'bg-rose-500',
        Icon: XCircle,
        label: copy[4],
      },
    }[status] || {
      cls: 'bg-slate-50 text-slate-600 border-slate-200',
      dot: 'bg-slate-400',
      Icon: XCircle,
      label: status || copy[3],
    };

    return (
      <div
        key={source.name}
        className={`flex items-center gap-1.5 pl-2 pr-2.5 py-1 rounded-lg border text-[11px] font-semibold whitespace-nowrap shadow-sm ${map.cls}`}
      >
        <span className={`w-1.5 h-1.5 rounded-full ${map.dot}`} />
        <span className="text-slate-800 font-medium">{source.name}</span>
        <span className="uppercase text-[9.5px] font-extrabold tracking-wider">{map.label}</span>
        {source.updated_at && (
          <span className="vp-mono text-[10px] text-slate-400 font-normal">
            {new Date(source.updated_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
          </span>
        )}
      </div>
    );
  };

  return (
    <div className="border-b border-slate-200 bg-white flex items-center gap-3 px-4 h-9 overflow-x-auto shrink-0 shadow-sm">
      {/* Summary chip */}
      <div className="flex items-center gap-2 shrink-0">
        <span
          className={`w-2 h-2 rounded-full ${allOk ? 'bg-emerald-500' : 'bg-amber-500'}`}
        />
        <span className="text-[11px] font-bold tracking-wider text-slate-700 uppercase">
          {copy[0]}
        </span>
        <span className="vp-mono text-[11px] text-slate-400 font-medium">
          {live}/{sources.length || '–'} {copy[2]}
        </span>
      </div>

      <div className="h-4 w-px bg-slate-200 shrink-0" />

      {sources.length === 0 && <span className="text-[11px] text-slate-400">{copy[1]}</span>}
      {sources.map((s) => pillFor(s))}

      <button
        onClick={onRefresh}
        disabled={loading}
        className="ml-auto shrink-0 flex items-center gap-1.5 text-[11px] font-semibold text-slate-500 hover:text-indigo-600 transition disabled:opacity-40"
      >
        <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin text-indigo-600' : ''}`} />
        <span>Refresh Feeds</span>
      </button>
    </div>
  );
}
