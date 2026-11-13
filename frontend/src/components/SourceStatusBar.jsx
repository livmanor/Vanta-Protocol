import React from 'react';
import { RefreshCw, AlertTriangle, CheckCircle2, XCircle } from 'lucide-react';
import { useLanguage } from '../i18n.jsx';

/* Compact live-feed integrity strip: source pills with LIVE/STALE/UNREACHABLE. */
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
      live: { cls: 'bg-gray-100 text-gray-900 border-gray-200 font-bold', Icon: CheckCircle2, label: copy[2] },
      stale: { cls: 'text-gray-800 border border-gray-300 border-dashed bg-transparent', Icon: AlertTriangle, label: copy[3] },
      unreachable: { cls: 'text-gray-600 border border-gray-200 bg-transparent line-through decoration-gray-400', Icon: XCircle, label: copy[4] },
    }[status] || { cls: 'text-gray-600 border-gray-200 bg-gray-100/40', Icon: XCircle, label: status || copy[3] };

    return (
      <div key={source.name} className={`flex items-center gap-1.5 pl-2 pr-2.5 py-1 rounded-md border text-[10.5px] font-semibold whitespace-nowrap ${map.cls}`}>
        <map.Icon className="w-3 h-3 shrink-0" />
        <span className="text-gray-800 font-medium">{source.name}</span>
        <span className="uppercase tracking-wider">{map.label}</span>
        {source.updated_at && (
          <span className="v-mono font-normal opacity-60">
            {new Date(source.updated_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
          </span>
        )}
      </div>
    );
  };

  return (
    <div className="v-scanbar border-b flex items-center gap-3 px-3 h-9 overflow-x-auto shrink-0" style={{ borderColor: 'var(--vanta-border)' }}>
      {/* Summary chip */}
      <div className="flex items-center gap-2 shrink-0">
        <span
          className={`w-2 h-2 rounded-full ${allOk ? 'bg-gray-50 v-dot' : 'bg-gray-50'}`}
          style={allOk ? { color: '#ffffff' } : { color: '#a3a3a3' }}
        />
        <span className="text-[11px] font-bold tracking-widest text-gray-800">{copy[0].toUpperCase()}</span>
        <span className="v-mono text-[10.5px]" style={{ color: 'var(--vanta-text-faint)' }}>
          {live}/{sources.length || '–'} {copy[2]}
        </span>
      </div>

      <div className="h-4 w-px bg-gray-50 shrink-0" />

      {sources.length === 0 && <span className="text-[11px] text-gray-500">{copy[1]}</span>}
      {sources.map((s) => pillFor(s))}

      <button
        onClick={onRefresh}
        disabled={loading}
        className="ml-auto shrink-0 flex items-center gap-1.5 text-[11px] text-gray-700 hover:text-gray-800 transition disabled:opacity-40"
      >
        <RefreshCw className={`w-3 h-3 ${loading ? 'animate-spin' : ''}`} />
        Refresh
      </button>
    </div>
  );
}
