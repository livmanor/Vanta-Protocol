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
      case 5: return <span className="px-2.5 py-1 rounded bg-gray-900 text-white border border-white font-bold">LEVEL 5 - CRITICAL</span>;
      case 4: return <span className="px-2.5 py-1 rounded bg-gray-100 text-gray-900 border border-gray-400 font-bold">LEVEL 4 - SEVERE</span>;
      case 3: return <span className="px-2.5 py-1 rounded bg-gray-100/80 text-gray-700 border border-gray-300 font-bold">LEVEL 3 - MODERATE</span>;
      case 2: return <span className="px-2.5 py-1 rounded bg-gray-100/80 text-gray-600 border border-gray-200 font-bold">LEVEL 2 - ELEVATED</span>;
      default: return <span className="px-2.5 py-1 rounded bg-transparent text-gray-500 border border-gray-200 font-bold">LEVEL 1 - LOW</span>;
    }
  };

  return (
    <div className="bg-white/95 backdrop-blur border border-gray-200 rounded-xl p-4 text-xs shadow-2xl flex flex-col gap-3">
      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-xs uppercase tracking-wider text-gray-700 font-semibold">{words[0]}</span>
            <span className="px-1.5 py-0.2 rounded bg-gray-50 text-gray-600 text-[10px]">Model Output</span>
          </div>
          <h2 className="text-base font-bold text-gray-900 mt-0.5">{zone.name}</h2>
        </div>
        <button 
          onClick={onClose} 
          className="text-gray-600 hover:text-gray-900 p-1 rounded-lg hover:bg-gray-50 transition"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      <div className="flex items-center justify-between bg-gray-100/70 p-2.5 rounded-lg border border-gray-200">
        <span className="text-gray-800 font-medium">{words[1]}:</span>
        {getRiskBadge(zone.risk_level)}
      </div>

      <section className="bg-gray-100/60 border border-gray-200 rounded-lg p-3">
        <div className="flex items-center justify-between mb-2">
          <div>
            <div className="text-[10px] uppercase tracking-wider text-gray-600 font-semibold">Open-Meteo Weather</div>
            <div className="font-bold text-gray-900 mt-0.5">{current?.condition || (weather?.status === 'failed' ? 'Weather unavailable' : 'No current reading')}</div>
          </div>
          <span className={`text-[9px] px-1.5 py-0.5 rounded border font-bold ${weather?.status === 'live' ? 'text-gray-700 border-gray-200 bg-gray-100/50' : weather?.status === 'stale' ? 'text-gray-800 border-gray-200 bg-gray-100/50' : 'text-gray-800 border-gray-200 bg-gray-100/50'}`}>
            {(weather?.status || 'failed').toUpperCase()}
          </span>
        </div>
        {current ? (
          <>
            <div className="grid grid-cols-3 gap-3 text-xs">
              <div><div className="text-gray-600">{words[2]}</div><div className="text-gray-900 font-semibold">{show(current.temperature_c, '°C')}</div></div>
              <div><div className="text-gray-600">{words[3]}</div><div className="text-gray-900 font-semibold">{show(current.feels_like_c, '°C')}</div></div>
              <div><div className="text-gray-600">{words[4]}</div><div className="text-gray-900 font-semibold">{show(current.relative_humidity_pct, '%')}</div></div>
              <div><div className="text-gray-600">{words[5]}</div><div className="text-gray-900 font-semibold">{show(current.precipitation_mm, ' mm')}</div></div>
              <div><div className="text-gray-600">{words[6]}</div><div className="text-gray-900 font-semibold">{show(current.wind_speed_kmh, ' km/h')}</div></div>
              <div><div className="text-gray-600">{words[7]}</div><div className="text-gray-900 font-semibold">{show(current.wind_gusts_kmh, ' km/h')}</div></div>
            </div>
            {today && <div className="mt-2 pt-2 border-t border-gray-200 text-xs text-gray-800">
              {words[8]}: {today.condition || '—'} · {show(today.temperature_min_c, '°')}–{show(today.temperature_max_c, '°')} · {language === 'hi' ? 'वर्षा' : language === 'te' ? 'వర్షం' : 'rain'} {show(today.precipitation_sum_mm, ' mm')} ({show(today.precipitation_probability_max_pct, '%')} {language === 'hi' ? 'संभावना' : language === 'te' ? 'అవకాశం' : 'chance'})
            </div>}
          </>
        ) : <p className="text-[10px] text-gray-600">{weather?.error_message || 'Waiting for Open-Meteo data.'}</p>}
        {weather?.last_updated && <div className="text-[9px] text-gray-500 mt-2">Updated {new Date(weather.last_updated).toLocaleString()}</div>}
      </section>

      {/* Live metrics */}
      <div className="grid grid-cols-2 gap-3 text-sm text-gray-700">
        <div className="bg-gray-100/50 p-2 rounded border border-gray-200/60 flex items-center gap-2">
          <CloudRain className="w-4 h-4 text-gray-700" />
          <div>
            <div className="text-xs text-gray-700">{words[9]}</div>
            <div className="font-semibold text-gray-900">{exp.rainfall_24h_mm?.toFixed(1) ?? '0.0'} mm</div>
          </div>
        </div>

        <div className="bg-gray-100/50 p-2 rounded border border-gray-200/60 flex items-center gap-2">
          <Droplets className="w-4 h-4 text-gray-700" />
          <div>
            <div className="text-xs text-gray-700">{words[10]}</div>
            <div className="font-semibold text-gray-900">
              {exp.river_discharge_m3s !== null && exp.river_discharge_m3s !== undefined 
                ? `${exp.river_discharge_m3s.toFixed(1)} m³/s` 
                : 'No river sensor'}
            </div>
          </div>
        </div>

        <div className="bg-gray-100/50 p-2 rounded border border-gray-200/60 flex items-center gap-2">
          <Mountain className="w-4 h-4 text-gray-700" />
          <div>
            <div className="text-xs text-gray-700">{words[11]}</div>
            <div className="font-semibold text-gray-900">
              {exp.mean_elevation_m !== null && exp.mean_elevation_m !== undefined 
                ? `${exp.mean_elevation_m.toFixed(1)} m` 
                : 'SRTM pending'}
            </div>
          </div>
        </div>

        <div className="bg-gray-100/50 p-2 rounded border border-gray-200/60 flex items-center gap-2">
          <History className="w-4 h-4 text-gray-700" />
          <div>
            <div className="text-xs text-gray-700">{words[12]}</div>
            <div className={`font-semibold ${exp.historical_flood_prone ? 'text-gray-700' : 'text-gray-600'}`}>
              {exp.historical_flood_prone ? (language === 'hi' ? 'HTP प्रमुख हॉटस्पॉट · अगस्त 2025' : language === 'te' ? 'HTP ప్రధాన హాట్‌స్పాట్ · ఆగస్టు 2025' : 'HTP major hotspot · Aug 2025') : (language === 'hi' ? 'कोई हॉटस्पॉट मैप नहीं' : language === 'te' ? 'హాట్‌స్పాట్ మ్యాప్‌లో లేదు' : 'No mapped hotspot')}
            </div>
          </div>
        </div>
      </div>

      {/* Why This Explanation */}
      <div className="bg-gray-100/30 border border-gray-200/40 p-2.5 rounded-lg text-gray-800">
        <div className="font-bold text-gray-700 text-[11px] mb-1 flex items-center gap-1.5">
          <ShieldAlert className="w-3.5 h-3.5" />
          {words[13]}
        </div>
        <p className="text-[11px] leading-relaxed text-gray-700">
          {exp.why_this || 'Normal conditions recorded across public weather and elevation telemetry.'}
        </p>
      </div>

      {/* Evacuation Action */}
      <button
        onClick={() => onGenerateRoute(zone)}
        disabled={loadingRoute}
        className="w-full mt-1 bg-gradient-to-r from-gray-200 to-gray-200 hover:from-gray-100 hover:to-gray-100 text-gray-900 font-semibold py-2 px-3 rounded-lg flex items-center justify-center gap-2 transition disabled:opacity-50 shadow-lg shadow-gray-400/40"
      >
        <Navigation className={`w-4 h-4 ${loadingRoute ? 'animate-spin' : ''}`} />
        <span>{loadingRoute ? words[15] : words[14]}</span>
      </button>
    </div>
  );
}

