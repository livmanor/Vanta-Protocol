import React, { useEffect, useState } from 'react';
import { CloudRain, Compass, Siren, ArrowRight, ShieldCheck, Database } from 'lucide-react';
import { useLanguage } from '../i18n.jsx';
import { fetchAuthConfig, fetchCurrentOfficer, loginOfficer } from '../api';
import Radar from './Radar.jsx';

export default function Landing({ onEnter, onAuthenticated }) {
  const { language, setLanguage, t } = useLanguage();
  const [authConfig, setAuthConfig] = useState(null);
  const [officer, setOfficer] = useState(null);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const config = await fetchAuthConfig();
        if (cancelled) return;
        setAuthConfig(config);
        const me = await fetchCurrentOfficer();
        if (cancelled) return;
        if (me) {
          setOfficer(me);
          onAuthenticated?.(me);
        }
      } catch (err) {
        if (!cancelled) setError(err.message || 'Could not load sign-in status.');
      }
    })();
    return () => { cancelled = true; };
  }, [onAuthenticated]);

  const agents = [
    { id: 'predict', Icon: CloudRain, title: t('agents'), step: 'Predict', desc: t('landingPredict') },
    { id: 'prepare', Icon: Compass, title: t('prepare'), step: 'Prepare', desc: t('landingPrepare') },
    { id: 'respond', Icon: Siren, title: t('respond'), step: 'Respond', desc: t('landingRespond') },
  ];

  const authRequired = Boolean(authConfig?.required);
  const canEnter = Boolean(officer) || !authRequired;

  const handleLogin = async (event) => {
    event.preventDefault();
    setBusy(true);
    setError('');
    try {
      const result = await loginOfficer(username.trim(), password);
      setOfficer(result.officer);
      setPassword('');
      onAuthenticated?.(result.officer);
    } catch (err) {
      setError(err.message || 'Sign-in failed.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="relative isolate min-h-screen w-full overflow-hidden flex flex-col bg-[#F8FAFC] text-[#0F172A]">
      <div className="absolute inset-0 z-0 pointer-events-none" aria-hidden="true">
        <Radar
          className="opacity-40"
          color="#4338CA"
          lightMode
          backgroundColor="transparent"
          scale={0.82}
          ringCount={6}
          spokeCount={8}
          targets={4}
          clutter={0.18}
          brightness={0.65}
          glow={0.65}
          gridOpacity={0.8}
          grain={0.012}
          mouseInteraction={false}
        />
      </div>
      <header className="relative z-10 flex items-center justify-between px-4 sm:px-8 h-[56px] border-b border-[#E2E8F0]/80 bg-white/85 backdrop-blur-sm shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-[6px] bg-[#4338CA] flex items-center justify-center text-white">
            <Siren className="w-4 h-4 text-white" strokeWidth={1.5} />
          </div>
          <span className="font-semibold text-[14px] text-[#0F172A] tracking-tight">
            Vanta Protocol
          </span>
        </div>

        <div className="flex items-center gap-3">
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

      <main className="relative z-10 flex-1 overflow-y-auto flex items-center justify-center px-4 sm:px-8 pb-8">
        <div className="w-full max-w-[1200px] py-12 flex flex-col items-center text-center">
          <h1 className="text-[40px] font-semibold text-[#0F172A] tracking-tight leading-[1.2] max-w-3xl">
            {t('landingTitle')}
          </h1>

          <p className="mt-4 max-w-xl text-[14px] text-[#475569] leading-relaxed">
            {t('landingSub')}
          </p>

          <div className="mt-8 w-full max-w-md text-left rounded-[6px] border border-[#E2E8F0] bg-white p-5">
            <div className="text-[14px] font-semibold text-[#0F172A]">Control-room sign-in</div>
            <p className="mt-1 text-[12px] text-[#64748B]">
              {authRequired
                ? 'Officer username and password are required before the map and agents open.'
                : 'Authentication is optional on this server. Set AUTH_REQUIRED=true for production.'}
            </p>
            {officer ? (
              <div className="mt-4 flex flex-col gap-3">
                <div className="text-[13px] text-[#334155]">
                  Signed in as <span className="font-medium text-[#0F172A]">{officer.display_name || officer.username}</span>
                </div>
                <button
                  onClick={onEnter}
                  className="group inline-flex items-center justify-center gap-2 h-[44px] px-6 text-[14px] font-medium bg-[#4338CA] hover:bg-[#3730A3] text-white rounded-[6px] transition-colors"
                >
                  <span>{t('enterApp')}</span>
                  <ArrowRight className="w-4 h-4 transition-transform group-hover:translate-x-0.5" strokeWidth={1.5} />
                </button>
              </div>
            ) : (
              <form onSubmit={handleLogin} className="mt-4 flex flex-col gap-3">
                <label className="text-[12px] font-medium text-[#475569]">
                  Username
                  <input
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    autoComplete="username"
                    className="mt-1 h-10 w-full rounded-[6px] border border-[#E2E8F0] px-3 text-[14px] text-[#0F172A]"
                    required
                  />
                </label>
                <label className="text-[12px] font-medium text-[#475569]">
                  Password
                  <input
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    autoComplete="current-password"
                    className="mt-1 h-10 w-full rounded-[6px] border border-[#E2E8F0] px-3 text-[14px] text-[#0F172A]"
                    required
                  />
                </label>
                {error && <div className="text-[12px] text-[#DC2626]">{error}</div>}
                <button
                  type="submit"
                  disabled={busy}
                  className="h-[44px] rounded-[6px] bg-[#4338CA] hover:bg-[#3730A3] text-white text-[14px] font-medium disabled:opacity-60"
                >
                  {busy ? 'Signing in…' : 'Sign in'}
                </button>
                {!authRequired && (
                  <button
                    type="button"
                    onClick={onEnter}
                    className="h-[40px] rounded-[6px] border border-[#E2E8F0] text-[13px] text-[#334155] hover:bg-[#F8FAFC]"
                  >
                    Continue without signing in
                  </button>
                )}
              </form>
            )}
            {!canEnter && !officer && authRequired && (
              <p className="mt-3 text-[12px] text-[#64748B]">
                Create the first account with BOOTSTRAP_OFFICER_USERNAME and BOOTSTRAP_OFFICER_PASSWORD in `.env`, then restart the backend.
              </p>
            )}
          </div>

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
    </div>
  );
}
