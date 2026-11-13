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
    <div className="bg-white/95 backdrop-blur border border-gray-200 rounded-xl p-4 text-xs shadow-2xl flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Compass className="w-4 h-4 text-gray-700" />
          <span className="font-bold text-gray-900 text-sm">{words[0]}</span>
        </div>
        <span className="px-1.5 py-0.5 rounded bg-gray-100/80 text-gray-700 border border-gray-200 text-[10px] font-semibold">
          {words[1]}
        </span>
      </div>

      <div className="text-gray-600 text-[11px] leading-relaxed">
        {words[2]} <strong className="text-gray-800">{words[3]}</strong>
      </div>

      {suggestions && suggestions.length > 0 ? (
        <div className="flex flex-col gap-2.5 max-h-[300px] overflow-y-auto pr-1">
          {suggestions.map((s) => (
            <div 
              key={s.id}
              className="bg-gray-100/80 border border-gray-200 rounded-lg p-3 flex flex-col gap-2 hover:border-gray-200 transition"
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5">
                  <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                    s.unit_kind === 'rescue_boat' 
                      ? 'bg-gray-100 text-gray-700 border border-gray-200' 
                      : s.unit_kind === 'ambulance'
                      ? 'bg-gray-100 text-gray-700 border border-gray-200'
                      : 'bg-gray-100 text-gray-700 border border-gray-200'
                  }`}>
                    {s.unit_kind.replace('_', ' ')}
                  </span>
                  <span className="font-bold text-gray-900 text-xs">{s.unit_id}</span>
                </div>
                <div className="text-[10px] text-gray-600 font-mono">
                  ETA: <span className="text-gray-700 font-bold">{s.eta_minutes} min</span> ({s.distance_km} km)
                </div>
              </div>

              <div className="flex items-center gap-2 text-gray-700">
                <span className="text-gray-600">{s.station}</span>
                <ArrowRight className="w-3.5 h-3.5 text-gray-500" />
                <span className="font-semibold text-gray-900">{s.target_zone_name}</span>
                <span className="ml-auto text-gray-700 font-bold">Lvl {s.risk_level}</span>
              </div>

              <div className="bg-gray-100/50 p-2 rounded text-[10px] text-gray-600">
                <span className="text-gray-800 font-semibold">{words[4]} </span>
                {s.why_this}
              </div>

              <button
                onClick={() => handleApprove(s)}
                disabled={approvingId === s.id}
                className="w-full mt-1 bg-gray-900 text-white hover:bg-gray-50 font-semibold py-1.5 px-3 rounded flex items-center justify-center gap-1.5 transition disabled:opacity-50"
              >
                <Check className="w-3.5 h-3.5" />
                <span>{approvingId === s.id ? words[6] : words[5]}</span>
              </button>
            </div>
          ))}
        </div>
      ) : (
        <div className="bg-gray-100/50 border border-gray-200/80 rounded-lg p-4 text-center">
          <AlertCircle className="w-6 h-6 text-gray-500 mx-auto mb-1.5" />
          <div className="text-gray-800 font-medium">{words[7]}</div>
          <p className="text-[10px] text-gray-500 mt-1 max-w-[240px] mx-auto">
            {words[8]}
          </p>
        </div>
      )}
    </div>
  );
}

