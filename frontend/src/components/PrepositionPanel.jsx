import React, { useState } from 'react';
import { Check, ArrowRight } from 'lucide-react';
import { useLanguage } from '../i18n.jsx';

export default function PrepositionPanel({ suggestions, onApprove, loading }) {
  const { language } = useLanguage();
  const words = {
    en: ['Patrol & rescue preparation', 'AI recommendations', 'Matches nearby available units to priority risk zones.', 'Officer approval required before dispatch.', 'Reason:', 'Approve dispatch', 'Authorizing dispatch…', 'No pending recommendations', 'Register field units to assess against active zones.'],
    hi: ['गश्ती एवं बचाव तैयारी', 'एआई सुझाव', 'नज़दीकी उपलब्ध दलों को प्राथमिक जोखिम क्षेत्रों से मिलाता है।', 'रवाना करने से पहले अधिकारी मंज़ूरी आवश्यक।', 'कारण:', 'तैनाती मंज़ूर करें', 'मंज़ूर हो रहा है…', 'कोई सुझाव लंबित नहीं', 'फील्ड दल पंजीकृत करें।'],
    te: ['పెట్రోలింగ్ & రక్షణ సన్నద్ధత', 'ఏఐ సూచనలు', 'సమీపంలోని అందుబాటు బృందాలను ప్రమాద ప్రాంతాలకు సరిపోలుస్తుంది.', 'పంపిణీకి ముందు అధికారి ఆమోదం తప్పనిసరి.', 'కారణం:', 'మోహరింపును ఆమోదించండి', 'ఆమోదిస్తోంది…', 'పెండింగ్ సూచనలు లేవు', 'ఫీల్డ్ బృందాలను నమోదు చేయండి.'],
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
    <div className="flex flex-col gap-4 text-[14px]">
      <div className="border-b border-[#E2E8F0] pb-3">
        <h3 className="text-[16px] font-semibold text-[#0F172A]">{words[0]}</h3>
        <p className="text-[12px] text-[#64748B] mt-0.5">
          {words[2]} {words[3]}
        </p>
      </div>

      {suggestions && suggestions.length > 0 ? (
        <div className="flex flex-col divide-y divide-[#E2E8F0] border-t border-b border-[#E2E8F0]">
          {suggestions.map((s) => (
            <div key={s.id} className="py-3 flex flex-col gap-2">
              <div className="flex items-center justify-between text-[14px]">
                <span className="font-medium text-[#0F172A]">{s.unit_id}</span>
                <span className="vp-mono text-[12px] text-[#64748B]">
                  ETA: <strong className="text-[#0F172A] font-medium">{s.eta_minutes} min</strong> ({s.distance_km} km)
                </span>
              </div>

              <div className="flex items-center gap-2 text-[12px] text-[#475569]">
                <span>{s.station}</span>
                <ArrowRight className="w-3.5 h-3.5 text-[#94A3B8]" strokeWidth={1.5} />
                <span className="font-medium text-[#0F172A]">{s.target_zone_name}</span>
                <span className="ml-auto text-[11px] px-1.5 py-0.2 rounded-[4px] bg-[#FEF3C7] text-[#D97706] font-semibold">
                  L{s.risk_level}
                </span>
              </div>

              <p className="text-[12px] text-[#475569]">
                <strong className="text-[#0F172A] font-medium">{words[4]} </strong>
                {s.why_this}
              </p>

              <button
                onClick={() => handleApprove(s)}
                disabled={approvingId === s.id}
                className="vp-btn vp-btn-primary w-full mt-1"
              >
                <Check className="w-3.5 h-3.5" strokeWidth={1.5} />
                <span>{approvingId === s.id ? words[6] : words[5]}</span>
              </button>
            </div>
          ))}
        </div>
      ) : (
        <div className="py-6 text-center text-[12px] text-[#64748B]">
          {words[7]} · {words[8]}
        </div>
      )}
    </div>
  );
}
