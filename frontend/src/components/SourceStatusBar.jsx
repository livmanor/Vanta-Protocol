import React from 'react';
import { Activity, CheckCircle2, AlertTriangle, XCircle, RefreshCw } from 'lucide-react';
import { useLanguage } from '../i18n.jsx';

export default function SourceStatusBar({ sources, onRefresh, loading }) {
  const { language } = useLanguage();
  const copy = { en: ['Live feed integrity', 'Connecting to live feeds…', 'LIVE', 'STALE', 'UNREACHABLE'], hi: ['लाइव फ़ीड स्थिति', 'लाइव फ़ीड से जुड़ रहे हैं…', 'सक्रिय', 'पुराना', 'पहुंच से बाहर'], te: ['ప్రత్యక్ష ఫీడ్ స్థితి', 'ప్రత్యక్ష ఫీడ్‌లకు అనుసంధానం…', 'ప్రత్యక్షం', 'పాతది', 'అందుబాటులో లేదు'] }[language] || ['Live feed integrity', 'Connecting to live feeds…', 'LIVE', 'STALE', 'UNREACHABLE'];
  const getBadge = (status) => {
    switch (status) {
      case 'live':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-semibold bg-emerald-950/70 text-emerald-400 border border-emerald-800">
            <CheckCircle2 className="w-3 h-3 text-emerald-400" />
            {copy[2]}
          </span>
        );
      case 'stale':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-semibold bg-amber-950/70 text-amber-400 border border-amber-800">
            <AlertTriangle className="w-3 h-3 text-amber-400" />
            {copy[3]}
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-semibold bg-rose-950/70 text-rose-400 border border-rose-800">
            <XCircle className="w-3 h-3 text-rose-400" />
            {copy[4]}
          </span>
        );
    }
  };

  return (
    <header className="bg-[#0c1422] border-b border-slate-700 px-5 py-2.5 flex flex-wrap items-center justify-between gap-3 text-sm">
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-2 font-bold text-cyan-400 tracking-wider">
          <Activity className="w-4 h-4 text-cyan-400 animate-pulse" />
          <span>VANTA PROTOCOL</span>
          <span className="text-gray-400 font-normal">| {copy[0]}</span>
        </div>
      </div>

      <div className="flex items-center gap-2 overflow-x-auto py-1">
        {sources && sources.length > 0 ? (
          sources.map((src, idx) => (
            <div 
              key={idx}
              className="flex items-center gap-1.5 bg-[#1f2937]/60 px-2.5 py-1 rounded border border-gray-800 whitespace-nowrap"
              title={`Endpoint: ${src.endpoint}\nLast Updated: ${src.last_updated || 'Never'}\n${src.error_message ? 'Error: ' + src.error_message : ''}`}
            >
              <span className="text-gray-300 font-medium">{src.name}</span>
              {getBadge(src.status)}
              {src.last_updated && (
                <span className="text-[10px] text-gray-500 ml-1">
                  {new Date(src.last_updated).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                </span>
              )}
            </div>
          ))
        ) : (
          <span className="text-gray-400">{copy[1]}</span>
        )}

        <button
          onClick={onRefresh}
          disabled={loading}
          className="p-1 rounded hover:bg-gray-800 text-gray-400 hover:text-white transition disabled:opacity-50 ml-1"
          title="Refresh Data Feeds"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin text-cyan-400' : ''}`} />
        </button>
      </div>
    </header>
  );
}

