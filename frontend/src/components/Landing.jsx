import React from 'react';
import { CloudRain, Compass, Siren, ArrowRight, ShieldCheck, Database } from 'lucide-react';
import { useLanguage } from '../i18n.jsx';

/* Landing page: black & white entry into the Vanta Protocol control room. */
export default function Landing({ onEnter }) {
  const { language, setLanguage, t } = useLanguage();

  const agents = [
    { id: 'predict', Icon: CloudRain, title: t('agents'), step: '01 · PREDICT', desc: t('landingPredict') },
    { id: 'prepare', Icon: Compass, title: t('prepare'), step: '02 · PREPARE', desc: t('landingPrepare') },
    { id: 'respond', Icon: Siren, title: t('respond'), step: '03 · RESPOND', desc: t('landingRespond') },
  ];

  return (
    <div className="relative h-screen w-screen overflow-hidden flex flex-col" style={{ background: 'var(--vanta-bg)' }}>
      {/* Subtle grid backdrop */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          backgroundImage:
            'linear-gradient(rgba(0,0,0,0.035) 1px, transparent 1px), linear-gradient(90deg, rgba(0,0,0,0.035) 1px, transparent 1px)',
          backgroundSize: '56px 56px',
          maskImage: 'radial-gradient(ellipse at 50% 30%, black 30%, transparent 75%)',
          WebkitMaskImage: 'radial-gradient(ellipse at 50% 30%, black 30%, transparent 75%)',
        }}
      />

      {/* Top bar */}
      <header className="relative flex items-center justify-between px-6 h-16 border-b shrink-0" style={{ borderColor: 'var(--vanta-border)' }}>
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-gray-900 flex items-center justify-center">
            <Siren className="w-4.5 h-4.5 text-white" />
          </div>
          <div className="font-extrabold tracking-[0.25em] text-gray-900 text-[12px]">VANTA PROTOCOL</div>
        </div>
        <div className="flex items-center gap-3">
          <div
            className="flex items-center gap-0.5 rounded-lg border p-0.5"
            style={{ borderColor: 'var(--vanta-border-hi)' }}
            aria-label={t('langLabel')}
          >
            {[['en', 'EN'], ['hi', 'हिं'], ['te', 'తె']].map(([code, label]) => (
              <button
                key={code}
                onClick={() => setLanguage(code)}
                aria-pressed={language === code}
                className={`rounded-md px-2 py-1 text-[11px] font-bold transition ${
                  language === code ? 'bg-gray-900 text-white' : 'text-gray-600 hover:bg-gray-50'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
      </header>

      {/* Hero */}
      <main className="relative flex-1 overflow-y-auto flex items-center justify-center px-6">
        <div className="w-full max-w-3xl py-10 flex flex-col items-center text-center">
          <div className="v-label mb-5">{t('landingKicker')}</div>
          <h1 className="text-5xl md:text-6xl font-extrabold tracking-tight text-gray-900 leading-[1.05]">
            {t('landingTitle')}
          </h1>
          <p className="mt-5 max-w-xl text-[14px] leading-relaxed" style={{ color: 'var(--vanta-text-dim)' }}>
            {t('landingSub')}
          </p>

          <button
            onClick={onEnter}
            className="group mt-9 inline-flex items-center gap-2.5 rounded-xl bg-gray-900 text-white px-7 py-3.5 text-sm font-extrabold tracking-wide shadow-xl shadow-gray-400/60 hover:bg-gray-50 transition"
          >
            {t('enterApp')}
            <ArrowRight className="w-4 h-4 transition-transform group-hover:translate-x-0.5" />
          </button>

          {/* Trust strip */}
          <div className="mt-8 flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-[11px]" style={{ color: 'var(--vanta-text-faint)' }}>
            <span className="flex items-center gap-1.5"><Database className="w-3.5 h-3.5" />{t('landingLive')}</span>
            <span className="flex items-center gap-1.5"><ShieldCheck className="w-3.5 h-3.5" />{t('landingOfficer')}</span>
          </div>

          {/* Agent loop */}
          <div className="mt-14 w-full grid grid-cols-1 md:grid-cols-3 gap-3 text-left">
            {agents.map(({ id, Icon, step, desc }) => (
              <div key={id} className="v-card v-card-hover p-4 flex flex-col gap-2">
                <div className="flex items-center justify-between">
                  <Icon className="w-4.5 h-4.5 text-gray-900" />
                  <span className="v-mono text-[10px] tracking-widest" style={{ color: 'var(--vanta-text-faint)' }}>{step}</span>
                </div>
                <div className="font-extrabold text-gray-900 text-[13px] uppercase tracking-wider">{t(id)}</div>
                <p className="text-[11px] leading-relaxed" style={{ color: 'var(--vanta-text-dim)' }}>{desc}</p>
              </div>
            ))}
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="relative px-6 h-12 border-t flex items-center justify-between text-[10px] shrink-0" style={{ borderColor: 'var(--vanta-border)', color: 'var(--vanta-text-faint)' }}>
        <span>CIPHERCOP 2026 · TRACK 2 · AI DISASTER RESPONSE</span>
        <span className="v-mono">{t('landingFooter')}</span>
      </footer>
    </div>
  );
}
