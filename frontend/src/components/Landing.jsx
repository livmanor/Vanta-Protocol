import React from 'react';
import { CloudRain, Compass, Siren, ArrowRight, ShieldCheck, Database, Activity } from 'lucide-react';
import { useLanguage } from '../i18n.jsx';

/* Landing page styled to the clean light admin aesthetic. */
export default function Landing({ onEnter }) {
  const { language, setLanguage, t } = useLanguage();

  const agents = [
    { id: 'predict', Icon: CloudRain, title: t('agents'), step: '01 · PREDICT', desc: t('landingPredict') },
    { id: 'prepare', Icon: Compass, title: t('prepare'), step: '02 · PREPARE', desc: t('landingPrepare') },
    { id: 'respond', Icon: Siren, title: t('respond'), step: '03 · RESPOND', desc: t('landingRespond') },
  ];

  return (
    <div className="relative h-screen w-screen overflow-hidden flex flex-col bg-[#f5f6f8]">
      {/* Subtle grid backdrop */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          backgroundImage:
            'linear-gradient(rgba(99, 102, 241, 0.04) 1px, transparent 1px), linear-gradient(90deg, rgba(99, 102, 241, 0.04) 1px, transparent 1px)',
          backgroundSize: '48px 48px',
          maskImage: 'radial-gradient(ellipse at 50% 35%, black 40%, transparent 80%)',
          WebkitMaskImage: 'radial-gradient(ellipse at 50% 35%, black 40%, transparent 80%)',
        }}
      />

      {/* Top bar */}
      <header className="relative flex items-center justify-between px-6 h-16 border-b border-slate-200 bg-white shrink-0 z-10 shadow-sm">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-indigo-600 flex items-center justify-center shadow-sm">
            <Siren className="w-4.5 h-4.5 text-white" />
          </div>
          <div className="font-extrabold tracking-[0.2em] text-slate-900 text-[13px]">
            VANTA PROTOCOL
          </div>
          <span className="ml-2 px-2 py-0.5 rounded-full text-[10px] font-bold bg-indigo-50 text-indigo-700 border border-indigo-200">
            HYDERABAD COP 2026
          </span>
        </div>

        <div className="flex items-center gap-3">
          <div
            className="flex items-center gap-0.5 rounded-lg border border-slate-200 p-0.5 bg-slate-50"
            aria-label={t('langLabel')}
          >
            {[['en', 'EN'], ['hi', 'हिं'], ['te', 'తె']].map(([code, label]) => (
              <button
                key={code}
                onClick={() => setLanguage(code)}
                aria-pressed={language === code}
                className={`rounded-md px-2 py-1 text-[11px] font-bold transition ${
                  language === code
                    ? 'bg-indigo-600 text-white shadow-sm'
                    : 'text-slate-600 hover:bg-slate-200/60'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
      </header>

      {/* Hero */}
      <main className="relative flex-1 overflow-y-auto flex items-center justify-center px-6 z-10">
        <div className="w-full max-w-3xl py-8 flex flex-col items-center text-center">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-indigo-50 border border-indigo-200 text-indigo-700 text-[11px] font-bold tracking-wide uppercase mb-5 shadow-sm">
            <Activity className="w-3.5 h-3.5 text-indigo-600" />
            {t('landingKicker')}
          </div>

          <h1 className="text-4xl md:text-5xl font-extrabold tracking-tight text-slate-900 leading-[1.1]">
            {t('landingTitle')}
          </h1>

          <p className="mt-4 max-w-xl text-[14px] leading-relaxed text-slate-600">
            {t('landingSub')}
          </p>

          <button
            onClick={onEnter}
            className="group mt-8 inline-flex items-center gap-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white px-7 py-3.5 text-sm font-bold tracking-wide shadow-md hover:shadow-lg transition-all"
          >
            {t('enterApp')}
            <ArrowRight className="w-4 h-4 transition-transform group-hover:translate-x-1" />
          </button>

          {/* Trust strip */}
          <div className="mt-7 flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-[12px] font-medium text-slate-500">
            <span className="flex items-center gap-1.5">
              <Database className="w-4 h-4 text-indigo-600" />
              {t('landingLive')}
            </span>
            <span className="flex items-center gap-1.5">
              <ShieldCheck className="w-4 h-4 text-emerald-600" />
              {t('landingOfficer')}
            </span>
          </div>

          {/* Agent loop */}
          <div className="mt-10 w-full grid grid-cols-1 md:grid-cols-3 gap-3.5 text-left">
            {agents.map(({ id, Icon, step, desc }) => (
              <div
                key={id}
                className="rounded-2xl border border-slate-200 bg-white p-5 flex flex-col gap-2.5 shadow-sm hover:shadow-md hover:border-slate-300 transition-all"
              >
                <div className="flex items-center justify-between">
                  <div className="w-8 h-8 rounded-lg bg-indigo-50 flex items-center justify-center text-indigo-600">
                    <Icon className="w-4.5 h-4.5" />
                  </div>
                  <span className="vp-mono text-[10px] tracking-wider font-semibold text-slate-400">
                    {step}
                  </span>
                </div>
                <div className="font-bold text-slate-900 text-[14px]">
                  {t(id)}
                </div>
                <p className="text-[12px] leading-relaxed text-slate-500">
                  {desc}
                </p>
              </div>
            ))}
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="relative px-6 h-12 border-t border-slate-200 bg-white flex items-center justify-between text-[11px] shrink-0 text-slate-500 z-10">
        <span className="font-medium">CIPHERCOP 2026 · TRACK 2 · HYDERABAD AI DISASTER RESPONSE</span>
        <span className="vp-mono">{t('landingFooter')}</span>
      </footer>
    </div>
  );
}
