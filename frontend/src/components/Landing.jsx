import React, { useEffect, useRef, useState } from 'react';
import {
  ArrowRight, CloudRain, Compass, Database, Play, Radio, ShieldCheck, Siren, X, Bot,
} from 'lucide-react';
import { useLanguage } from '../i18n.jsx';
import { fetchAuthConfig, fetchCurrentOfficer, loginOfficer } from '../api';
import VantaMark from './VantaMark';
import Radar from './Radar.jsx';

const DEMO_SRC = '/demo-media/Vanta-Protocol-UltraDemo.mp4';

/* Short highlight beats only (~3–4s each) — never streams the full demo. */
const HIGHLIGHTS = [
  { start: 8, end: 11.5, label: 'Sign-in' },
  { start: 38, end: 41.5, label: 'Alerts' },
  { start: 74, end: 77.5, label: 'Radar' },
  { start: 114, end: 117.5, label: 'Agents' },
  { start: 160, end: 163.5, label: 'Map' },
];

function DemoGlimpses() {
  const videoRef = useRef(null);
  const activeRef = useRef(0);
  const advancingRef = useRef(false);
  const [active, setActive] = useState(0);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    activeRef.current = active;
  }, [active]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return undefined;

    const playClip = (index) => {
      const clip = HIGHLIGHTS[index];
      advancingRef.current = false;
      try {
        video.currentTime = clip.start;
      } catch {
        /* ignore seek before metadata */
      }
      const play = () => video.play().catch(() => {});
      if (video.readyState >= 2) play();
      else video.addEventListener('canplay', play, { once: true });
    };

    const goNext = () => {
      if (advancingRef.current) return;
      advancingRef.current = true;
      const next = (activeRef.current + 1) % HIGHLIGHTS.length;
      activeRef.current = next;
      setActive(next);
      playClip(next);
    };

    const onMeta = () => playClip(activeRef.current);
    if (video.readyState >= 1) onMeta();
    else video.addEventListener('loadedmetadata', onMeta, { once: true });

    const onTime = () => {
      const clip = HIGHLIGHTS[activeRef.current];
      if (video.currentTime < clip.start - 0.05) {
        video.currentTime = clip.start;
        return;
      }
      // Jump straight into the next highlight — no pause between clips.
      if (video.currentTime >= clip.end - 0.05) {
        goNext();
      }
    };

    video.addEventListener('timeupdate', onTime);
    video.addEventListener('ended', goNext);
    const poll = window.setInterval(onTime, 100);
    return () => {
      video.removeEventListener('timeupdate', onTime);
      video.removeEventListener('ended', goNext);
      window.clearInterval(poll);
    };
  }, []);

  useEffect(() => {
    const video = videoRef.current;
    if (!video || !ready) return;
    const clip = HIGHLIGHTS[active];
    // Manual chip clicks / state sync — keep playback continuous.
    if (Math.abs(video.currentTime - clip.start) > 0.35 && !advancingRef.current) {
      try {
        video.currentTime = clip.start;
      } catch {
        /* ignore */
      }
    }
    video.play().catch(() => {});
  }, [active, ready]);

  return (
    <div className="landing-product relative mx-auto w-full max-w-5xl">
      <div className="relative rounded-[14px] border border-zinc-200 bg-[#0C0E12] overflow-hidden shadow-[0_30px_60px_-24px_rgba(0,0,0,0.35)]">
        <div className="flex items-center gap-2 border-b border-white/8 px-4 h-10 bg-[#0A0B0E]/95">
          <span className="w-2.5 h-2.5 rounded-full bg-[#3F3F46]" />
          <span className="w-2.5 h-2.5 rounded-full bg-[#3F3F46]" />
          <span className="w-2.5 h-2.5 rounded-full bg-[#3F3F46]" />
          <span className="ml-3 text-[12px] text-[#A1A1AA] tracking-tight">Demo highlights</span>
          <span className="ml-auto flex items-center gap-1.5 text-[11px] text-zinc-300">
            <Play className="w-3 h-3 fill-current" strokeWidth={0} />
            {HIGHLIGHTS[active].label}
          </span>
        </div>

        <div className="relative aspect-[16/9] bg-black">
          {!ready && (
            <div className="absolute inset-0 flex items-center justify-center text-[13px] text-[#71717A]">
              Loading highlights…
            </div>
          )}
          <video
            ref={videoRef}
            className={`absolute inset-0 h-full w-full object-cover transition-opacity duration-500 ${ready ? 'opacity-100' : 'opacity-0'}`}
            src={`${DEMO_SRC}#t=${HIGHLIGHTS[0].start},${HIGHLIGHTS[0].end}`}
            muted
            playsInline
            autoPlay
            preload="metadata"
            controls={false}
            onLoadedData={() => setReady(true)}
            aria-label="Vanta Protocol demo highlights"
          />
          <div className="pointer-events-none absolute inset-x-0 bottom-0 h-24 bg-gradient-to-t from-black/70 to-transparent" />
          <div className="absolute bottom-3 left-3 right-3 flex flex-wrap items-center gap-2">
            {HIGHLIGHTS.map((clip, index) => {
              const on = index === active;
              return (
                <button
                  key={clip.label}
                  type="button"
                  onClick={() => setActive(index)}
                  className={`pointer-events-auto h-7 px-2.5 rounded-md text-[11px] font-medium transition border ${
                    on
                      ? 'bg-zinc-100 border-zinc-100 text-zinc-900'
                      : 'bg-black/50 border-white/15 text-[#E4E4E7] hover:bg-black/70 backdrop-blur-sm'
                  }`}
                >
                  {clip.label}
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

export default function Landing({ onEnter, onAuthenticated, onCitizenPortal, onDocs }) {
  const { t } = useLanguage();
  const [authConfig, setAuthConfig] = useState(null);
  const [officer, setOfficer] = useState(null);
  const [showLogin, setShowLogin] = useState(false);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [bootError, setBootError] = useState('');

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
        if (!cancelled) setBootError(err.message || 'Could not load sign-in status.');
      }
    })();
    return () => { cancelled = true; };
  }, [onAuthenticated]);

  const authRequired = Boolean(authConfig?.required);

  const handleLogin = async (event) => {
    event.preventDefault();
    setBusy(true);
    setError('');
    try {
      const result = await loginOfficer(username.trim(), password);
      setOfficer(result.officer);
      setPassword('');
      setShowLogin(false);
      onAuthenticated?.(result.officer);
    } catch (err) {
      setError(err.message || 'Sign-in failed.');
    } finally {
      setBusy(false);
    }
  };

  const handleEnter = () => {
    if (officer || !authRequired) {
      onEnter();
      return;
    }
    setShowLogin(true);
    setError('Sign in with your officer account to open the control room.');
  };

  const figures = [
    { fig: '01', title: t('landingFigLive'), desc: t('landingFigLiveDesc'), Icon: Database },
    { fig: '02', title: t('landingFigAgents'), desc: t('landingFigAgentsDesc'), Icon: Bot },
    { fig: '03', title: t('landingFigLoop'), desc: t('landingFigLoopDesc'), Icon: ShieldCheck },
  ];

  return (
    <div className="landing-root font-sans fixed inset-0 z-[900] overflow-y-auto">
      <div
        className="pointer-events-none absolute inset-0"
        aria-hidden="true"
        style={{
          backgroundImage:
            'linear-gradient(rgba(24,24,27,0.06) 1px, transparent 1px), linear-gradient(90deg, rgba(24,24,27,0.06) 1px, transparent 1px)',
          backgroundSize: '48px 48px',
        }}
      />

      <header className="sticky top-0 z-20 flex items-center justify-between px-4 sm:px-8 h-14 border-b border-zinc-200/80 bg-[#F4F4F5]/85 backdrop-blur-xl">
        <div className="flex items-center gap-2.5">
          <VantaMark size={28} />
          <span className="landing-display text-[14px] font-semibold text-zinc-950 tracking-[-0.02em]">Vanta Protocol</span>
        </div>

        <div className="flex items-center gap-1 sm:gap-2">
          {officer ? (
            <span className="hidden md:inline text-[13px] text-zinc-500 mr-1">{officer.display_name || officer.username}</span>
          ) : (
            <button
              type="button"
              onClick={() => { setShowLogin(true); setError(''); }}
              className="h-8 px-3 rounded-md text-[13px] font-medium text-zinc-600 hover:text-zinc-950 hover:bg-zinc-900/5 transition"
            >
              Sign in
            </button>
          )}
          <button
            type="button"
            onClick={() => onDocs?.()}
            className="h-8 px-3 rounded-md text-[13px] font-medium text-zinc-600 hover:text-zinc-950 hover:bg-zinc-900/5 transition"
          >
            Docs
          </button>
        </div>
      </header>

      <main>
        <section className="relative px-4 sm:px-8 pt-16 sm:pt-24 pb-10">
          <div className="mx-auto max-w-6xl grid grid-cols-1 lg:grid-cols-2 gap-10 lg:gap-6 items-center">
            <div className="text-left relative z-10">
              <h1 className="landing-rise landing-display max-w-xl text-[40px] sm:text-[56px] font-semibold text-zinc-950 leading-[1.08] tracking-[-0.045em]">
                {t('landingTitle')}
              </h1>
              <p className="landing-rise landing-rise-delay-1 mt-5 max-w-md text-[16px] sm:text-[18px] text-zinc-500 leading-[1.55] tracking-[-0.01em]">
                {t('landingSub')}
              </p>
              <div className="landing-rise landing-rise-delay-2 mt-8 flex flex-col sm:flex-row items-start gap-3">
                <button
                  type="button"
                  onClick={handleEnter}
                  className="group inline-flex items-center justify-center gap-2 h-11 px-5 text-[14px] font-medium bg-zinc-950 text-white rounded-lg hover:bg-zinc-800 transition"
                >
                  <span>{officer || !authRequired ? t('enterApp') : t('landingHeroCta')}</span>
                  <ArrowRight className="w-4 h-4 transition-transform group-hover:translate-x-0.5" strokeWidth={1.5} />
                </button>
                <button
                  type="button"
                  onClick={() => onCitizenPortal?.()}
                  className="inline-flex items-center justify-center h-11 px-5 text-[14px] font-medium border border-zinc-300 bg-white text-zinc-800 rounded-lg hover:bg-zinc-50 transition"
                >
                  {t('landingCitizenCta')}
                </button>
              </div>
              {bootError && <p className="mt-3 text-[12px] text-red-600">{bootError}</p>}
            </div>

            <div className="landing-rise landing-rise-delay-2 relative flex items-center justify-center lg:justify-end min-h-[280px] sm:min-h-[400px]">
              <div className="relative w-full max-w-[440px] aspect-square" aria-hidden="true">
                <Radar
                  color="#9CA3AF"
                  backgroundColor="transparent"
                  lightMode
                  scale={0.92}
                  ringCount={6}
                  spokeCount={12}
                  targets={5}
                  clutter={0.22}
                  glow={0.55}
                  brightness={0.85}
                  gridOpacity={0.9}
                  trail={0.3}
                  speed={1}
                  mouseInteraction={false}
                  className="w-full h-full"
                />
              </div>
            </div>
          </div>

          <div className="landing-rise landing-rise-delay-3 mt-12 sm:mt-14 mx-auto max-w-6xl">
            <DemoGlimpses />
          </div>
        </section>

        <section className="relative px-4 sm:px-8 py-20 border-t border-zinc-200">
          <div className="mx-auto max-w-3xl">
            <p className="landing-display text-[26px] sm:text-[34px] font-semibold text-zinc-950 leading-[1.2] tracking-[-0.04em]">
              {t('landingManifesto')}
            </p>
          </div>
          <div className="mx-auto mt-14 max-w-5xl grid grid-cols-1 md:grid-cols-3 gap-8">
            {figures.map(({ fig, title, desc, Icon }) => (
              <div key={fig} className="text-left rounded-xl border border-zinc-200 bg-white p-5">
                <div className="text-[11px] text-zinc-400 mb-3 tracking-wider">{fig}</div>
                <Icon className="w-5 h-5 text-zinc-900 mb-3" strokeWidth={1.5} />
                <h3 className="landing-display text-[18px] font-semibold text-zinc-950 tracking-[-0.03em]">{title}</h3>
                <p className="mt-2 text-[14px] text-zinc-500 leading-relaxed">{desc}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="relative px-4 sm:px-8 py-20 border-t border-zinc-200">
          <div className="mx-auto max-w-5xl grid grid-cols-1 lg:grid-cols-2 gap-12 items-center">
            <div>
              <div className="text-[12px] font-medium text-zinc-500 mb-3">View</div>
              <h2 className="landing-display text-[28px] sm:text-[36px] font-semibold text-zinc-950 leading-[1.15] tracking-[-0.04em]">
                {t('landingViewTitle')}
              </h2>
              <p className="mt-4 text-[15px] text-zinc-500 leading-relaxed max-w-md">
                {t('landingViewDesc')}
              </p>
            </div>
            <div className="rounded-xl border border-zinc-200 bg-white overflow-hidden min-h-[220px]">
              <div className="flex items-center gap-2 text-[12px] text-zinc-500 px-4 py-3 border-b border-zinc-100">
                <Radio className="w-3.5 h-3.5 text-zinc-900" strokeWidth={1.5} />
                Alerts · Radar
              </div>
              <div className="p-4 space-y-2">
                <div className="h-10 rounded-md bg-zinc-50 border border-zinc-200 flex items-center px-3 text-[13px] text-zinc-800">
                  CAP · Musi basin · Orange floor
                </div>
                <div className="h-10 rounded-md bg-zinc-50 border border-zinc-100 flex items-center px-3 text-[13px] text-zinc-500">
                  Windy · Doppler · Hyderabad Metro
                </div>
                <div className="h-24 rounded-md bg-gradient-to-br from-zinc-100 to-white border border-zinc-100 flex items-end p-3">
                  <span className="text-[11px] text-zinc-500">Cross-check only · not in the risk score</span>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className="relative px-4 sm:px-8 py-20 border-t border-zinc-200">
          <div className="mx-auto max-w-5xl grid grid-cols-1 lg:grid-cols-2 gap-12 items-center">
            <div className="order-2 lg:order-1 rounded-xl border border-zinc-200 bg-white p-5 min-h-[220px]">
              <div className="flex items-center gap-2 text-[12px] text-zinc-500 mb-4">
                <Bot className="w-3.5 h-3.5 text-zinc-900" strokeWidth={1.5} />
                Predict · Prepare · Respond
              </div>
              <div className="grid grid-cols-3 gap-2 mb-3">
                {['Predict', 'Prepare', 'Respond'].map((label) => (
                  <div key={label} className="rounded-md border border-zinc-200 bg-zinc-50 p-3 text-center">
                    <div className="text-[12px] text-zinc-900 font-medium">{label}</div>
                    <div className="text-[10px] text-zinc-400 mt-1">On demand</div>
                  </div>
                ))}
              </div>
              <div className="rounded-md border border-dashed border-zinc-200 px-3 py-2 text-[12px] text-zinc-500">
                Run all 3 agents · officer approval required for dispatch
              </div>
            </div>
            <div className="order-1 lg:order-2">
              <div className="text-[12px] font-medium text-zinc-500 mb-3">Action</div>
              <h2 className="landing-display text-[28px] sm:text-[36px] font-semibold text-zinc-950 leading-[1.15] tracking-[-0.04em]">
                {t('landingActionTitle')}
              </h2>
              <p className="mt-4 text-[15px] text-zinc-500 leading-relaxed max-w-md">
                {t('landingActionDesc')}
              </p>
            </div>
          </div>
        </section>

        <section className="relative px-4 sm:px-8 py-16 border-t border-zinc-200">
          <div className="mx-auto max-w-5xl grid grid-cols-1 md:grid-cols-3 gap-8">
            {[
              { id: 'predict', Icon: CloudRain, label: t('predict'), desc: t('landingPredict') },
              { id: 'prepare', Icon: Compass, label: t('prepare'), desc: t('landingPrepare') },
              { id: 'respond', Icon: Siren, label: t('respond'), desc: t('landingRespond') },
            ].map(({ id, Icon, label, desc }) => (
              <div key={id} className="border-t border-zinc-200 pt-5">
                <div className="flex items-center gap-2 mb-2">
                  <Icon className="w-4 h-4 text-zinc-900" strokeWidth={1.5} />
                  <span className="landing-display text-[16px] font-semibold text-zinc-950 tracking-[-0.03em]">{label}</span>
                </div>
                <p className="text-[14px] text-zinc-500 leading-relaxed">{desc}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="relative px-4 sm:px-8 py-24 border-t border-zinc-200 text-left sm:text-center">
          <h2 className="landing-display mx-auto max-w-3xl text-[28px] sm:text-[42px] font-semibold text-zinc-950 leading-[1.12] tracking-[-0.045em]">
            {t('landingCloseTitle')}
          </h2>
          <p className="mt-3 text-[14px] text-zinc-500">{t('landingCloseSub')}</p>
          <div className="mt-8 flex flex-col sm:flex-row items-start sm:items-center justify-center gap-3">
            <button
              type="button"
              onClick={handleEnter}
              className="group inline-flex items-center gap-2 h-11 px-5 rounded-lg bg-zinc-950 text-white text-[14px] font-medium hover:bg-zinc-800 transition"
            >
              {t('landingHeroCta')}
              <ArrowRight className="w-4 h-4 transition-transform group-hover:translate-x-0.5" strokeWidth={1.5} />
            </button>
            <button
              type="button"
              onClick={() => onCitizenPortal?.()}
              className="h-11 px-5 rounded-lg border border-zinc-300 bg-white text-[14px] font-medium text-zinc-800 hover:bg-zinc-50 transition"
            >
              {t('landingCitizenCta')}
            </button>
          </div>
          <p className="mt-10 text-[11px] tracking-wide text-zinc-400 uppercase">
            {t('landingFooter')}
          </p>
        </section>
      </main>

      {showLogin && (
        <div
          className="fixed inset-0 z-[1200] flex items-center justify-center bg-zinc-950/40 px-4 backdrop-blur-sm"
          onClick={() => setShowLogin(false)}
        >
          <div
            className="w-full max-w-md rounded-xl border border-zinc-200 bg-white p-5 text-left shadow-xl"
            onClick={(event) => event.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-labelledby="officer-login-title"
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 id="officer-login-title" className="landing-display text-[16px] font-semibold text-zinc-950 tracking-[-0.03em]">
                  Officer sign-in
                </h2>
                <p className="mt-1 text-[12px] text-zinc-500">
                  Use your control-room username and password to continue.
                </p>
              </div>
              <button type="button" onClick={() => setShowLogin(false)} aria-label="Close" className="text-zinc-400 hover:text-zinc-700">
                <X className="w-4 h-4" strokeWidth={1.5} />
              </button>
            </div>
            <form onSubmit={handleLogin} className="mt-4 flex flex-col gap-3">
              <label className="text-[12px] font-medium text-zinc-600">
                Username
                <input
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  autoComplete="username"
                  autoFocus
                  className="mt-1 h-10 w-full rounded-lg border border-zinc-200 bg-white px-3 text-[14px] text-zinc-950 focus:outline-none focus:border-zinc-400"
                  required
                />
              </label>
              <label className="text-[12px] font-medium text-zinc-600">
                Password
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete="current-password"
                  className="mt-1 h-10 w-full rounded-lg border border-zinc-200 bg-white px-3 text-[14px] text-zinc-950 focus:outline-none focus:border-zinc-400"
                  required
                />
              </label>
              {error && <div className="text-[12px] text-red-600">{error}</div>}
              <button
                type="submit"
                disabled={busy}
                className="h-11 rounded-lg bg-zinc-950 text-white text-[14px] font-medium hover:bg-zinc-800 disabled:opacity-60 transition"
              >
                {busy ? 'Signing in…' : 'Sign in'}
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
