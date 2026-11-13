import React, { useState } from 'react';
import { Compass, Check, AlertCircle, Shield, ArrowRight } from 'lucide-react';
import { useLanguage } from '../i18n.jsx';

export default function PrepositionPanel({ suggestions, onApprove, loading }) {
  const { language } = useLanguage();
  const words = {
    en: ['Patrol & Rescue Preparation', 'AI recommendations', 'The system matches nearby available units to priority risk zones.', 'Officer approval is required before dispatch.', 'Why this?', 'Approve dispatch', 'Authorizing dispatch…', 'No pending recommendations', 'Register field units and assess them against active high-risk zones.'],
    hi: ['गश्ती एवं बचाव तैयारी', 'एआई सुझाव', 'प्रणाली नज़दीकी उपलब्ध दलों को प्राथमिक जोखिम क्षेत्रों से मिलाती है।', 'रवाना करने से पहले अधिकारी की मंज़ूरी आवश्यक है।', 'कारण:', 'तैनाती मंज़ूर करें', 'तैनाती मंज़ूर हो रही है…', 'कोई सुझाव लंबित नहीं', 'फील्ड दल पंजीकृत करें और सक्रिय उच्च जोखिम क्षेत्रों का आकलन करें।'],
    te: ['పెట్రోలింగ్ & రక్షణ సన్నద్ధత', 'ఏఐ సూచనలు', 'ప్రాధాన్య ప్రమాద ప్రాంతాలకు సమీపంలోని అందుబాటు బృందాలను వ్యవస్థ సరిపోలుస్తుంది.', 'పంపిణీకి ముందు అధికారి ఆమోదం తప్పనిసరి.', 'కారణం:', 'మోహరింపును ఆమోదించండి', 'మోహరింపు ఆమోదిస్తోంది…', 'పెండింగ్ సూచనలు లేవు', 'ఫీల్డ్ బృందాలను నమోదు చేసి, అధిక ప్రమాద ప్రాంతాలను అంచనా వేయండి.'],
  }[language] || [];
  const [approvingId, setApprovingId] = useState(null);

  const handleApprove = async (s) => {
    setApprovingId(s.id);
    try {
      await onApprove(s.id, s.unit_id, s.target_zone_name);
    } finally {
      setApprovingId(null);
    }
  };

  return (
    <div className="bg-white border border-slate-200 rounded-2xl p-4 text-xs shadow-md flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg bg-amber-50 flex items-center justify-center text-amber-600">
            <Compass className="w-4 h-4" />
          </div>
          <span className="font-extrabold text-slate-900 text-sm">{words[0]}</span>
        </div>
        <span className="px-2 py-0.5 rounded-full bg-indigo-50 text-indigo-700 border border-indigo-200 text-[10px] font-bold">
          {words[1]}
        </span>
      </div>

      <div className="text-slate-500 text-[11px] leading-relaxed">
        {words[2]} <strong className="text-slate-700">{words[3]}</strong>
      </div>

      {suggestions && suggestions.length > 0 ? (
        <div className="flex flex-col gap-2.5 max-h-[340px] overflow-y-auto pr-1">
          {suggestions.map((s) => (
            <div
              key={s.id}
              className="bg-slate-50 border border-slate-200 rounded-xl p-3 flex flex-col gap-2 hover:border-slate-300 transition shadow-sm"
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5">
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-bold uppercase bg-white border border-slate-200 text-slate-700 shadow-xs">
                    {s.unit_kind.replace('_', ' ')}
                  </span>
                  <span className="font-extrabold text-slate-900 text-xs">{s.unit_id}</span>
                </div>
                <div className="text-[11px] text-slate-500 vp-mono">
                  ETA: <span className="text-indigo-600 font-extrabold">{s.eta_minutes} min</span> ({s.distance_km} km)
                </div>
              </div>

              <div className="flex items-center gap-2 text-slate-600 text-xs">
                <span className="text-slate-500">{s.station}</span>
                <ArrowRight className="w-3.5 h-3.5 text-slate-400" />
                <span className="font-bold text-slate-900">{s.target_zone_name}</span>
                <span className="ml-auto px-1.5 py-0.5 rounded-md bg-amber-100 text-amber-800 font-bold text-[10px]">
                  Lvl {s.risk_level}
                </span>
              </div>

              <div className="bg-white p-2.5 rounded-lg border border-slate-200/80 text-[11px] text-slate-600">
                <span className="text-slate-900 font-bold">{words[4]} </span>
                {s.why_this}
              </div>

              <button
                onClick={() => handleApprove(s)}
                disabled={approvingId === s.id}
                className="w-full mt-1 bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-2 px-3 rounded-xl flex items-center justify-center gap-1.5 transition disabled:opacity-50 shadow-sm"
              >
                <Check className="w-3.5 h-3.5" />
                <span>{approvingId === s.id ? words[6] : words[5]}</span>
              </button>
            </div>
          ))}
        </div>
      ) : (
        <div className="bg-slate-50 border border-dashed border-slate-300 rounded-xl p-5 text-center">
          <AlertCircle className="w-6 h-6 text-slate-400 mx-auto mb-1.5" />
          <div className="text-slate-700 font-bold text-xs">{words[7]}</div>
          <p className="text-[11px] text-slate-400 mt-1 max-w-[240px] mx-auto">
            {words[8]}
          </p>
        </div>
      )}
    </div>
  );
}
