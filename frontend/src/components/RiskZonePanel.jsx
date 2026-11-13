import React from 'react';
import { ShieldAlert, Navigation, CloudRain, Droplets, Mountain, History, X } from 'lucide-react';
import { useLanguage } from '../i18n.jsx';

export default function RiskZonePanel({ zone, weather, onClose, onGenerateRoute, loadingRoute }) {
  const { language } = useLanguage();
  const words = {
    en: ['Hotspot risk assessment', 'Assessed risk severity', 'Temperature', 'Feels like', 'Humidity', 'Rain now', 'Wind', 'Gusts', 'Today', '24h rainfall', 'River discharge', 'Terrain elevation', 'Mapped vulnerability', 'Why this risk rating?', 'Prepare route', 'Routing via OSRM…'],
    hi: ['हॉटस्पॉट जोखिम आकलन', 'आकलित जोखिम गंभीरता', 'तापमान', 'अनुभूत तापमान', 'आर्द्रता', 'अभी वर्षा', 'हवा', 'झोंके', 'आज', '24 घंटे की वर्षा', 'नदी प्रवाह', 'भूभाग की ऊँचाई', 'मानचित्रित संवेदनशीलता', 'यह जोखिम क्यों?', 'मार्ग तैयार करें', 'मार्ग बनाया जा रहा है…'],
    te: ['హాట్‌స్పాట్ ప్రమాద అంచనా', 'అంచనా ప్రమాద తీవ్రత', 'ఉష్ణోగ్రత', 'అనుభూతి ఉష్ణోగ్రత', 'తేమ', 'ప్రస్తుత వర్షం', 'గాలి', 'గాలి వేగం', 'ఈ రోజు', '24 గంటల వర్షపాతం', 'నది ప్రవాహం', 'భూభాగ ఎత్తు', 'మ్యాప్‌లో గుర్తించిన ముప్పు', 'ఈ ప్రమాద స్థాయి ఎందుకు?', 'మార్గం సిద్ధం చేయండి', 'మార్గం రూపొందుతోంది…'],
  }[language] || [];
  if (!zone) return null;

  const exp = zone.explanation || {};
  const current = weather?.current;
  const today = weather?.today;
  const show = (value, unit = '') => value === null || value === undefined ? '—' : `${value}${unit}`;

  const getRiskBadge = (lvl) => {
    switch (lvl) {
      case 5:
        return <span className="px-2.5 py-1 rounded-full bg-red-100 text-red-800 border border-red-300 font-extrabold text-[11px]">LEVEL 5 · CRITICAL</span>;
      case 4:
        return <span className="px-2.5 py-1 rounded-full bg-red-50 text-red-700 border border-red-200 font-extrabold text-[11px]">LEVEL 4 · SEVERE</span>;
      case 3:
        return <span className="px-2.5 py-1 rounded-full bg-amber-50 text-amber-700 border border-amber-200 font-extrabold text-[11px]">LEVEL 3 · MODERATE</span>;
      case 2:
        return <span className="px-2.5 py-1 rounded-full bg-yellow-50 text-yellow-700 border border-yellow-200 font-extrabold text-[11px]">LEVEL 2 · ELEVATED</span>;
      default:
        return <span className="px-2.5 py-1 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 font-extrabold text-[11px]">LEVEL 1 · LOW</span>;
    }
  };

  return (
    <div className="bg-white border border-slate-200 rounded-2xl p-4 text-xs shadow-md flex flex-col gap-3">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-[11px] uppercase tracking-wider text-slate-500 font-bold">{words[0]}</span>
            <span className="px-1.5 py-0.2 rounded-full bg-slate-100 text-slate-600 text-[10px] font-semibold border border-slate-200">
              Model Output
            </span>
          </div>
          <h2 className="text-base font-extrabold text-slate-900 mt-1">{zone.name}</h2>
        </div>
        <button
          onClick={onClose}
          className="text-slate-400 hover:text-slate-700 p-1.5 rounded-lg hover:bg-slate-100 transition"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Severity pill banner */}
      <div className="flex items-center justify-between bg-slate-50 p-2.5 rounded-xl border border-slate-200">
        <span className="text-slate-700 font-bold text-xs">{words[1]}:</span>
        {getRiskBadge(zone.risk_level)}
      </div>

      {/* Weather telemetry section */}
      <section className="bg-slate-50/80 border border-slate-200 rounded-xl p-3">
        <div className="flex items-center justify-between mb-2">
          <div>
            <div className="text-[10px] uppercase tracking-wider text-slate-400 font-bold">Open-Meteo Weather</div>
            <div className="font-bold text-slate-900 mt-0.5">{current?.condition || (weather?.status === 'failed' ? 'Weather unavailable' : 'No current reading')}</div>
          </div>
          <span className={`text-[10px] px-2 py-0.5 rounded-full border font-bold ${
            weather?.status === 'live'
              ? 'text-emerald-700 border-emerald-200 bg-emerald-50'
              : weather?.status === 'stale'
              ? 'text-amber-700 border-amber-200 bg-amber-50'
              : 'text-slate-600 border-slate-200 bg-slate-100'
          }`}>
            {(weather?.status || 'failed').toUpperCase()}
          </span>
        </div>
        {current ? (
          <>
            <div className="grid grid-cols-3 gap-2.5 text-xs mt-2 pt-2 border-t border-slate-200/80">
              <div><div className="text-slate-400 text-[10px]">{words[2]}</div><div className="text-slate-800 font-bold">{show(current.temperature_c, '°C')}</div></div>
              <div><div className="text-slate-400 text-[10px]">{words[3]}</div><div className="text-slate-800 font-bold">{show(current.feels_like_c, '°C')}</div></div>
              <div><div className="text-slate-400 text-[10px]">{words[4]}</div><div className="text-slate-800 font-bold">{show(current.relative_humidity_pct, '%')}</div></div>
              <div><div className="text-slate-400 text-[10px]">{words[5]}</div><div className="text-slate-800 font-bold">{show(current.precipitation_mm, ' mm')}</div></div>
              <div><div className="text-slate-400 text-[10px]">{words[6]}</div><div className="text-slate-800 font-bold">{show(current.wind_speed_kmh, ' km/h')}</div></div>
              <div><div className="text-slate-400 text-[10px]">{words[7]}</div><div className="text-slate-800 font-bold">{show(current.wind_gusts_kmh, ' km/h')}</div></div>
            </div>
            {today && (
              <div className="mt-2.5 pt-2 border-t border-slate-200 text-xs text-slate-600">
                {words[8]}: <span className="font-semibold text-slate-800">{today.condition || '—'}</span> · {show(today.temperature_min_c, '°')}–{show(today.temperature_max_c, '°')} · {language === 'hi' ? 'वर्षा' : language === 'te' ? 'వర్షం' : 'rain'} {show(today.precipitation_sum_mm, ' mm')} ({show(today.precipitation_probability_max_pct, '%')} {language === 'hi' ? 'संभावना' : language === 'te' ? 'అవకాశం' : 'chance'})
              </div>
            )}
          </>
        ) : (
          <p className="text-[11px] text-slate-400 mt-1">{weather?.error_message || 'Waiting for Open-Meteo data.'}</p>
        )}
        {weather?.last_updated && (
          <div className="text-[10px] text-slate-400 mt-2 font-medium">Updated {new Date(weather.last_updated).toLocaleString()}</div>
        )}
      </section>

      {/* Live metrics cards */}
      <div className="grid grid-cols-2 gap-2.5 text-xs">
        <div className="bg-slate-50 p-2.5 rounded-xl border border-slate-200 flex items-center gap-2.5">
          <div className="w-7 h-7 rounded-lg bg-sky-100 flex items-center justify-center text-sky-600 shrink-0">
            <CloudRain className="w-4 h-4" />
          </div>
          <div className="min-w-0">
            <div className="text-[10px] text-slate-400 font-medium truncate">{words[9]}</div>
            <div className="font-extrabold text-slate-900">{exp.rainfall_24h_mm?.toFixed(1) ?? '0.0'} mm</div>
          </div>
        </div>

        <div className="bg-slate-50 p-2.5 rounded-xl border border-slate-200 flex items-center gap-2.5">
          <div className="w-7 h-7 rounded-lg bg-indigo-100 flex items-center justify-center text-indigo-600 shrink-0">
            <Droplets className="w-4 h-4" />
          </div>
          <div className="min-w-0">
            <div className="text-[10px] text-slate-400 font-medium truncate">{words[10]}</div>
            <div className="font-extrabold text-slate-900 truncate">
              {exp.river_discharge_m3s !== null && exp.river_discharge_m3s !== undefined 
                ? `${exp.river_discharge_m3s.toFixed(1)} m³/s` 
                : 'No sensor'}
            </div>
          </div>
        </div>

        <div className="bg-slate-50 p-2.5 rounded-xl border border-slate-200 flex items-center gap-2.5">
          <div className="w-7 h-7 rounded-lg bg-emerald-100 flex items-center justify-center text-emerald-600 shrink-0">
            <Mountain className="w-4 h-4" />
          </div>
          <div className="min-w-0">
            <div className="text-[10px] text-slate-400 font-medium truncate">{words[11]}</div>
            <div className="font-extrabold text-slate-900">
              {exp.mean_elevation_m !== null && exp.mean_elevation_m !== undefined 
                ? `${exp.mean_elevation_m.toFixed(1)} m` 
                : 'SRTM pending'}
            </div>
          </div>
        </div>

        <div className="bg-slate-50 p-2.5 rounded-xl border border-slate-200 flex items-center gap-2.5">
          <div className="w-7 h-7 rounded-lg bg-amber-100 flex items-center justify-center text-amber-600 shrink-0">
            <History className="w-4 h-4" />
          </div>
          <div className="min-w-0">
            <div className="text-[10px] text-slate-400 font-medium truncate">{words[12]}</div>
            <div className={`font-bold text-[11px] truncate ${exp.historical_flood_prone ? 'text-amber-700' : 'text-slate-400'}`}>
              {exp.historical_flood_prone
                ? (language === 'hi' ? 'HTP प्रमुख हॉटस्पॉट' : language === 'te' ? 'HTP ప్రధాన హాట్‌స్పాట్' : 'HTP Hotspot')
                : 'No hotspot'}
            </div>
          </div>
        </div>
      </div>

      {/* Why This Explanation */}
      <div className="bg-indigo-50/70 border border-indigo-100 p-3 rounded-xl text-slate-800">
        <div className="font-bold text-indigo-900 text-[11px] mb-1 flex items-center gap-1.5">
          <ShieldAlert className="w-3.5 h-3.5 text-indigo-600" />
          {words[13]}
        </div>
        <p className="text-[11px] leading-relaxed text-slate-700">
          {exp.why_this || 'Normal conditions recorded across public weather and elevation telemetry.'}
        </p>
      </div>

      {/* Evacuation Action */}
      <button
        onClick={() => onGenerateRoute(zone)}
        disabled={loadingRoute}
        className="w-full mt-1 bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-2.5 px-4 rounded-xl flex items-center justify-center gap-2 transition disabled:opacity-50 shadow-sm"
      >
        <Navigation className={`w-4 h-4 ${loadingRoute ? 'animate-spin' : ''}`} />
        <span>{loadingRoute ? words[15] : words[14]}</span>
      </button>
    </div>
  );
}
