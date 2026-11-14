import React from 'react';
import { ShieldAlert, Navigation, X } from 'lucide-react';
import { useLanguage } from '../i18n.jsx';

export default function RiskZonePanel({ zone, weather, onClose, onGenerateRoute, loadingRoute }) {
  const { language } = useLanguage();
  const words = {
    en: ['Hotspot assessment', 'Assessed risk severity', 'Temperature', 'Feels like', 'Humidity', 'Rain now', 'Wind', 'Gusts', 'Today', '24h rainfall', 'River discharge', 'Terrain elevation', 'Mapped vulnerability', 'Assessment reason', 'Prepare evacuation route', 'Routing via OSRM…'],
    hi: ['हॉटस्पॉट जोखिम आकलन', 'आकलित जोखिम गंभीरता', 'तापमान', 'अनुभूत तापमान', 'आर्द्रता', 'अभी वर्षा', 'हवा', 'झोंके', 'आज', '24 घंटे की वर्षा', 'नदी प्रवाह', 'भूभाग की ऊँचाई', 'मानचित्रित संवेदनशीलता', 'आकलन कारण', 'निकासी मार्ग तैयार करें', 'मार्ग बनाया जा रहा है…'],
    te: ['హాట్‌స్పాట్ ప్రమాద అంచనా', 'అంచనా ప్రమాద తీవ్రత', 'ఉష్ణోగ్రత', 'అనుభూతి ఉష్ణోగ్రత', 'తేమ', 'ప్రస్తుత వర్షం', 'గాలి', 'గాలి వేగం', 'ఈ రోజు', '24 గంటల వర్షపాతం', 'నది ప్రవాహం', 'భూభాగ ఎత్తు', 'ముప్పు వివరణ', 'అంచనా కారణం', 'తరలింపు మార్గం సిద్ధం చేయండి', 'మార్గం రూపొందుతోంది…'],
  }[language] || [];
  if (!zone) return null;

  const exp = zone.explanation || {};
  const current = weather?.current;
  const today = weather?.today;
  const show = (value, unit = '') => value === null || value === undefined ? '—' : `${value}${unit}`;

  const getRiskColor = (lvl) => {
    switch (lvl) {
      case 5:
      case 4:
        return { bg: '#FEE2E2', text: '#DC2626', label: `Level ${lvl} · Critical` };
      case 3:
        return { bg: '#FEF3C7', text: '#D97706', label: `Level 3 · Watch` };
      default:
        return { bg: '#DCFCE7', text: '#16A34A', label: `Level ${lvl} · Nominal` };
    }
  };

  const riskBadge = getRiskColor(zone.risk_level);

  return (
    <div className="flex flex-col gap-4 text-[14px]">
      {/* Header */}
      <div className="flex items-start justify-between border-b border-[#E2E8F0] pb-3">
        <div>
          <div className="text-[12px] font-medium text-[#64748B] uppercase tracking-wider">{words[0]}</div>
          <h2 className="text-[16px] font-semibold text-[#0F172A] mt-0.5">{zone.name}</h2>
        </div>
        <button
          onClick={onClose}
          className="text-[#64748B] hover:text-[#0F172A] p-1 rounded-[4px] hover:bg-[#F1F5F9] transition"
        >
          <X className="w-4 h-4" strokeWidth={1.5} />
        </button>
      </div>

      {/* Severity pill row */}
      <div className="flex items-center justify-between py-1">
        <span className="text-[14px] text-[#475569]">{words[1]}:</span>
        <span
          className="px-2 py-0.5 rounded-[4px] text-[12px] font-semibold"
          style={{ backgroundColor: riskBadge.bg, color: riskBadge.text }}
        >
          {riskBadge.label}
        </span>
      </div>

      {/* Weather telemetry section: Row hairlines only */}
      <div className="flex flex-col border-t border-[#E2E8F0] pt-3">
        <div className="flex items-center justify-between mb-2">
          <span className="text-[12px] font-medium text-[#64748B] uppercase tracking-wider">Open-Meteo Weather</span>
          <span className="text-[12px] text-[#64748B]">
            {current?.condition || (weather?.status === 'failed' ? 'Unavailable' : 'Live')}
          </span>
        </div>

        {current ? (
          <div className="grid grid-cols-2 gap-y-2 gap-x-4 text-[12px] py-2 border-t border-b border-[#E2E8F0]">
            <div className="flex justify-between py-1 border-b border-[#E2E8F0]">
              <span className="text-[#64748B]">{words[2]}</span>
              <span className="font-medium text-[#0F172A]">{show(current.temperature_c, '°C')}</span>
            </div>
            <div className="flex justify-between py-1 border-b border-[#E2E8F0]">
              <span className="text-[#64748B]">{words[3]}</span>
              <span className="font-medium text-[#0F172A]">{show(current.feels_like_c, '°C')}</span>
            </div>
            <div className="flex justify-between py-1 border-b border-[#E2E8F0]">
              <span className="text-[#64748B]">{words[4]}</span>
              <span className="font-medium text-[#0F172A]">{show(current.relative_humidity_pct, '%')}</span>
            </div>
            <div className="flex justify-between py-1 border-b border-[#E2E8F0]">
              <span className="text-[#64748B]">{words[5]}</span>
              <span className="font-medium text-[#0F172A]">{show(current.precipitation_mm, ' mm')}</span>
            </div>
            <div className="flex justify-between py-1">
              <span className="text-[#64748B]">{words[6]}</span>
              <span className="font-medium text-[#0F172A]">{show(current.wind_speed_kmh, ' km/h')}</span>
            </div>
            <div className="flex justify-between py-1">
              <span className="text-[#64748B]">{words[7]}</span>
              <span className="font-medium text-[#0F172A]">{show(current.wind_gusts_kmh, ' km/h')}</span>
            </div>
          </div>
        ) : (
          <p className="text-[12px] text-[#64748B] py-2">{weather?.error_message || 'Waiting for Open-Meteo data.'}</p>
        )}
      </div>

      {/* Environmental Metrics (Row hairlines only, 40px row height) */}
      <div className="flex flex-col divide-y divide-[#E2E8F0] border-t border-b border-[#E2E8F0]">
        <div className="min-h-[40px] flex items-center justify-between text-[14px]">
          <span className="text-[#64748B]">{words[9]}</span>
          <span className="font-medium text-[#0F172A] vp-mono">{exp.rainfall_24h_mm?.toFixed(1) ?? '0.0'} mm</span>
        </div>
        <div className="min-h-[40px] flex items-center justify-between text-[14px]">
          <span className="text-[#64748B]">{words[10]}</span>
          <span className="font-medium text-[#0F172A] vp-mono">
            {exp.river_discharge_m3s !== null && exp.river_discharge_m3s !== undefined
              ? `${exp.river_discharge_m3s.toFixed(1)} m³/s`
              : 'No sensor'}
          </span>
        </div>
        <div className="min-h-[40px] flex items-center justify-between text-[14px]">
          <span className="text-[#64748B]">{words[11]}</span>
          <span className="font-medium text-[#0F172A] vp-mono">
            {exp.mean_elevation_m !== null && exp.mean_elevation_m !== undefined
              ? `${exp.mean_elevation_m.toFixed(1)} m`
              : 'SRTM pending'}
          </span>
        </div>
        <div className="min-h-[40px] flex items-center justify-between text-[14px]">
          <span className="text-[#64748B]">{words[12]}</span>
          <span className="font-medium text-[#0F172A]">
            {exp.historical_flood_prone ? 'HTP Hotspot' : 'None'}
          </span>
        </div>
      </div>

      {/* Assessment Reason */}
      <div className="flex flex-col gap-1">
        <div className="text-[12px] font-medium text-[#475569]">{words[13]}</div>
        <p className="text-[14px] text-[#475569] leading-relaxed">
          {exp.why_this || 'Normal conditions recorded across public weather and elevation telemetry.'}
        </p>
      </div>

      {/* Evacuation Route Action */}
      <button
        onClick={() => onGenerateRoute(zone)}
        disabled={loadingRoute}
        className="vp-btn vp-btn-primary w-full"
      >
        <Navigation className={`w-4 h-4 ${loadingRoute ? 'animate-spin' : ''}`} strokeWidth={1.5} />
        <span>{loadingRoute ? words[15] : words[14]}</span>
      </button>
    </div>
  );
}
