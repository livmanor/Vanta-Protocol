import React from 'react';
import { CloudRain, Compass, Siren, ArrowRight, ShieldCheck, Database, Activity } from 'lucide-react';
import { useLanguage } from '../i18n.jsx';

export default function Landing({ onEnter }) {
  const { language, setLanguage, t } = useLanguage();

  const agents = [
    { id: 'predict', Icon: CloudRain, title: t('agents'), step: 'Predict', desc: t('landingPredict') },
    { id: 'prepare', Icon: Compass, title: t('prepare'), step: 'Prepare', desc: t('landingPrepare') },
    { id: 'respond', Icon: Siren, title: t('respond'), step: 'Respond', desc: t('landingRespond') },
  ];

  return (
    <div className="relative h-screen w-screen overflow-hidden flex flex-col bg-[#F8FAFC] text-[#0F172A]">
      {/* Top bar (56px height, vertically centered, 16px gaps) */}
      <header className="flex items-center justify-between px-8 h-[56px] border-b border-[#E2E8F0] bg-white shrink-0 z-10">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-[6px] bg-[#4338CA] flex items-center justify-center text-white">
            <Siren className="w-4 h-4 text-white" strokeWidth={1.5} />
          </div>
          <span className="font-semibold text-[14px] text-[#0F172A] tracking-tight">
            Vanta Protocol
          </span>
          <span className="text-[12px] text-[#64748B] border-l border-[#E2E8F0] pl-3 ml-1">
            Hyderabad Police Control Room
          </span>
        </div>

        <div className="flex items-center gap-3">
          {/* Language Switch: Segmented control 14px */}
          <div
            className="flex items-center rounded-[6px] border border-[#E2E8F0] p-[2px] bg-[#F8FAFC]"
            aria-label={t('langLabel')}
          >
            {[['en', 'EN'], ['hi', 'हिं'], ['te', 'తె']].map(([code, label]) => (
              <button
                key={code}
                onClick={() => setLanguage(code)}
                aria-pressed={language === code}
                className={`h-7 px-3 rounded-[4px] text-[14px] font-medium transition ${
                  language === code
                    ? 'bg-white text-[#0F172A] shadow-xs font-semibold'
                    : 'text-[#64748B] hover:text-[#0F172A]'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
      </header>

      {/* Main hero */}
      <main className="relative flex-1 overflow-y-auto flex items-center justify-center px-8 z-10 pb-8">
        <div className="w-full max-w-[1200px] py-12 flex flex-col items-center text-center">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-[6px] border border-[#E2E8F0] bg-white text-[#475569] text-[12px] font-medium mb-6">
            <Activity className="w-3.5 h-3.5 text-[#4338CA]" strokeWidth={1.5} />
            <span>{t('landingKicker')}</span>
          </div>

          <h1 className="text-[40px] font-semibold text-[#0F172A] tracking-tight leading-[1.2] max-w-3xl">
            {t('landingTitle')}
          </h1>

          <p className="mt-4 max-w-xl text-[14px] text-[#475569] leading-relaxed">
            {t('landingSub')}
          </p>

          <button
            onClick={onEnter}
            className="group mt-8 inline-flex items-center justify-center gap-2 h-[44px] px-6 text-[14px] font-medium bg-[#4338CA] hover:bg-[#3730A3] text-white rounded-[6px] transition-colors"
          >
            <span>{t('enterApp')}</span>
            <ArrowRight className="w-4 h-4 transition-transform group-hover:translate-x-0.5" strokeWidth={1.5} />
          </button>

          {/* Trust line: 14px and darker */}
          <div className="mt-8 flex flex-wrap items-center justify-center gap-8 text-[14px] text-[#334155] font-normal">
            <span className="flex items-center gap-2">
              <Database className="w-4 h-4 text-[#475569]" strokeWidth={1.5} />
              <span>{t('landingLive')}</span>
            </span>
            <span className="flex items-center gap-2">
              <ShieldCheck className="w-4 h-4 text-[#16A34A]" strokeWidth={1.5} />
              <span>{t('landingOfficer')}</span>
            </span>
          </div>

          {/* 3 feature items as a clean three-column row separated by thin vertical dividers, no card boxes */}
          <div className="mt-12 w-full max-w-4xl grid grid-cols-1 md:grid-cols-3 divide-y md:divide-y-0 md:divide-x divide-[#E2E8F0] border-t border-b border-[#E2E8F0] py-8 text-left">
            {agents.map(({ id, Icon, step, desc }) => (
              <div key={id} className="px-6 py-4 md:py-0 flex flex-col gap-2">
                <div className="flex items-center gap-2.5">
                  <Icon className="w-4 h-4 text-[#4338CA]" strokeWidth={1.5} />
                  <span className="text-[12px] font-medium text-[#64748B] uppercase tracking-wider">
                    {step}
                  </span>
                </div>
                <div className="text-[16px] font-semibold text-[#0F172A] mt-1">
                  {t(id)}
                </div>
                <p className="text-[14px] leading-relaxed text-[#475569]">
                  {desc}
                </p>
              </div>
            ))}
          </div>
        </div>
      </main>

      {/* Footer: 12px, #64748B, no monospace */}
      <footer className="px-8 h-[48px] border-t border-[#E2E8F0] bg-white flex items-center justify-between text-[12px] shrink-0 text-[#64748B] z-10">
        <span>CipherCop 2026 · Track 2 · Hyderabad AI Disaster Response</span>
        <span>{t('landingFooter')}</span>
      </footer>
    </div>
  );
}
