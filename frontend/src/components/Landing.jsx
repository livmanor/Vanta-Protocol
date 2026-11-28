import React, { useEffect, useRef, useState } from 'react';
import {
  ArrowRight, Bot, CheckCircle2, Database, Radio, ShieldCheck, Wind, X,
} from 'lucide-react';
import { useLanguage } from '../i18n.jsx';
import { fetchAuthConfig, fetchCurrentOfficer, loginOfficer } from '../api';
import VantaMark from './VantaMark';
import Radar from './Radar.jsx';

const DEMO_SLIDES = [
  {
    id: 'signin',
    label: 'Sign-in',
    caption: 'Officer credentials open the control room — no guest access to live operations.',
    src: null,
    placeholder: 'sign-in',
  },
  {
    id: 'alerts',
    label: 'Alerts',
    caption: 'CAP messages matched to Greater Hyderabad, with feed health visible.',
    src: '/docs-gallery/cap-feed.png',
  },
  {
    id: 'radar',
    label: 'Radar',
    caption: 'Atmospheric radar overlays for cross-check — never folded into a total risk score.',
    src: '/docs-gallery/radar.png',
  },
  {
    id: 'agents',
    label: 'Agents',
    caption: 'Predict, Prepare, and Respond run on demand from the same operational context.',
    src: '/docs-gallery/ai-briefing.png',
  },
  {
    id: 'map',
    label: 'Map',
    caption: 'Tactical map with independent hazard layers, hotspots, and incident context.',
    src: '/docs-gallery/tactical-map.png',
  },
];

function Container({ as: Tag = 'div', className = '', children, ...rest }) {
  return (
    <Tag className={`landing-container ${className}`.trim()} {...rest}>
      {children}
    </Tag>
  );
}

function usePrefersReducedMotion() {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    const update = () => setReduced(mq.matches);
    update();
    mq.addEventListener?.('change', update);
    return () => mq.removeEventListener?.('change', update);
  }, []);
  return reduced;
}

function SignInPlaceholder() {
  return (
    <div className="absolute inset-0 flex items-center justify-center bg-[#F4F4F5] p-6 sm:p-10">
      <div className="w-full max-w-sm rounded-[16px] border border-[#E4E4E7] bg-white p-5 shadow-[0_20px_40px_-24px_rgba(0,0,0,0.25)]">
        <div className="text-[15px] font-semibold text-[#09090B] tracking-tight">Officer sign-in</div>
        <p className="mt-1 text-[13px] text-[#52525B]">Control-room username and password.</p>
        <div className="mt-4 space-y-3">
          <div className="h-10 rounded-lg border border-[#E4E4E7] bg-[#FAFAFA] px-3 flex items-center text-[13px] text-[#71717A]">
            Username
          </div>
          <div className="h-10 rounded-lg border border-[#E4E4E7] bg-[#FAFAFA] px-3 flex items-center text-[13px] text-[#71717A]">
            Password
          </div>
          <div className="h-11 rounded-lg bg-[#09090B] text-white text-[14px] font-medium flex items-center justify-center">
            Sign in
          </div>
        </div>
        <p className="mt-3 text-[11px] text-[#52525B]">Screenshot placeholder · live UI matches this form</p>
      </div>
    </div>
  );
}

function DemoHighlights() {
  const reducedMotion = usePrefersReducedMotion();
  const [active, setActive] = useState(0);
  const [paused, setPaused] = useState(false);
  const [progressKey, setProgressKey] = useState(0);
  const slide = DEMO_SLIDES[active];

  useEffect(() => {
    if (reducedMotion || paused) return undefined;
    const id = window.setInterval(() => {
      setActive((prev) => (prev + 1) % DEMO_SLIDES.length);
      setProgressKey((k) => k + 1);
    }, 5000);
    return () => window.clearInterval(id);
  }, [reducedMotion, paused, active]);

  const select = (index) => {
    setActive(index);
    setProgressKey((k) => k + 1);
  };

  return (
    <div
      className="w-full"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
    >
      <div
        className="inline-flex flex-wrap items-center gap-1 rounded-[10px] border border-[#E4E4E7] bg-white p-1 mb-4"
        role="tablist"
        aria-label="Demo highlights"
      >
        {DEMO_SLIDES.map((item, index) => {
          const on = index === active;
          return (
            <button
              key={item.id}
              type="button"
              role="tab"
              aria-selected={on}
              onClick={() => select(index)}
              className={`landing-focus min-h-11 px-3 sm:px-4 rounded-[8px] text-[13px] sm:text-[14px] font-medium transition ${
                on ? 'bg-[#09090B] text-white' : 'text-[#52525B] hover:text-[#09090B] hover:bg-[#F4F4F5]'
              }`}
            >
              {item.label}
            </button>
          );
        })}
      </div>

      <div className="relative w-full aspect-[16/9] rounded-[16px] border border-[#E4E4E7] bg-white overflow-hidden shadow-[0_24px_48px_-28px_rgba(0,0,0,0.35)]">
        {slide.src ? (
          <img
            src={slide.src}
            alt={slide.caption}
            className="absolute inset-0 h-full w-full object-cover object-top"
          />
        ) : (
          <SignInPlaceholder />
        )}
        {!reducedMotion && (
          <div className="absolute left-0 right-0 bottom-0 h-[3px] bg-zinc-200/80">
            <div
              key={progressKey}
              className={`h-full bg-[#4338CA] landing-demo-progress ${paused ? '[animation-play-state:paused]' : ''}`}
              style={{ animationPlayState: paused ? 'paused' : 'running' }}
            />
          </div>
        )}
      </div>

      <p className="mt-3 text-[14px] text-[#52525B] leading-relaxed max-w-[60ch]">
        {slide.caption}
      </p>
    </div>
  );
}

function ViewPreview() {
  return (
    <div className="aspect-[4/3] rounded-[16px] border border-[#E4E4E7] bg-white overflow-hidden shadow-[0_16px_40px_-28px_rgba(0,0,0,0.3)]">
      <div className="flex items-center gap-2 px-4 h-11 border-b border-[#E4E4E7] bg-[#FAFAFA]">
        <Radio className="w-4 h-4 text-[#09090B]" strokeWidth={1.5} />
        <span className="text-[13px] font-medium text-[#09090B]">Alerts</span>
        <span className="text-[12px] text-[#52525B]">· Radar cross-check</span>
      </div>
      <div className="grid grid-rows-2 h-[calc(100%-44px)]">
        <img
          src="/docs-gallery/cap-feed.png"
          alt="CAP alert feed for Greater Hyderabad"
          className="w-full h-full object-cover object-top border-b border-[#E4E4E7]"
        />
        <img
          src="/docs-gallery/radar.png"
          alt="Atmospheric radar overlay"
          className="w-full h-full object-cover object-center"
        />
      </div>
    </div>
  );
}

function ActionPreview() {
  return (
    <div className="aspect-[4/3] rounded-[16px] border border-[#E4E4E7] bg-white overflow-hidden shadow-[0_16px_40px_-28px_rgba(0,0,0,0.3)] flex flex-col">
      <div className="flex items-center gap-2 px-4 h-11 border-b border-[#E4E4E7] bg-[#FAFAFA] shrink-0">
        <Bot className="w-4 h-4 text-[#09090B]" strokeWidth={1.5} />
        <span className="text-[13px] font-medium text-[#09090B]">AI Briefing</span>
      </div>
      <div className="relative flex-1 min-h-0">
        <img
          src="/docs-gallery/ai-briefing.png"
          alt="AI briefing with Predict, Prepare, and Respond"
          className="absolute inset-0 w-full h-full object-cover object-top"
        />
      </div>
      <div className="shrink-0 border-t border-[#E4E4E7] px-4 py-3 bg-white flex items-center justify-between gap-3">
        <div className="flex flex-wrap gap-1.5">
          {['Predict', 'Prepare', 'Respond'].map((label) => (
            <span
              key={label}
              className="inline-flex items-center gap-1 h-7 px-2 rounded-md border border-[#E4E4E7] bg-[#FAFAFA] text-[12px] text-[#3F3F46]"
            >
              <CheckCircle2 className="w-3 h-3 text-[#16A34A]" strokeWidth={2} />
              {label}
            </span>
          ))}
        </div>
        <span className="shrink-0 h-9 px-3 rounded-lg bg-[#4338CA] text-white text-[12px] font-medium inline-flex items-center">
          Approve dispatch
        </span>
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
  const howRef = useRef(null);

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

  const scrollHow = () => {
    howRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  const howCards = [
    {
      title: t('landingFigLive'),
      desc: t('landingFigLiveDesc'),
      Icon: Database,
      steps: null,
    },
    {
      title: t('landingFigAgents'),
      desc: t('landingFigAgentsDesc'),
      Icon: Bot,
      steps: [t('predict'), t('prepare'), t('respond')],
    },
    {
      title: t('landingFigLoop'),
      desc: t('landingFigLoopDesc'),
      Icon: ShieldCheck,
      steps: null,
    },
  ];

  return (
    <div className="landing-root font-sans fixed inset-0 z-[900] overflow-y-auto overflow-x-hidden">
      <header className="sticky top-0 z-30 h-16 border-b border-[#E4E4E7]/80 bg-[#F4F4F5]/85 backdrop-blur-xl">
        <Container className="h-full flex items-center justify-between">
          <div className="flex items-center gap-2.5 min-w-0">
            <VantaMark size={28} />
            <span className="landing-display text-[14px] font-semibold text-[#09090B] tracking-[-0.02em] truncate">
              Vanta Protocol
            </span>
          </div>
          <nav className="flex items-center gap-1 sm:gap-2" aria-label="Primary">
            <button
              type="button"
              onClick={() => onDocs?.()}
              className="landing-focus min-h-11 px-3 rounded-md text-[14px] font-medium text-[#52525B] hover:text-[#09090B] transition"
            >
              Docs
            </button>
            {officer ? (
              <span className="hidden md:inline text-[13px] text-[#52525B] px-2">
                {officer.display_name || officer.username}
              </span>
            ) : (
              <button
                type="button"
                onClick={() => { setShowLogin(true); setError(''); }}
                className="landing-focus min-h-11 px-3 rounded-md text-[14px] font-medium text-[#52525B] hover:text-[#09090B] transition"
              >
                Sign in
              </button>
            )}
            <button
              type="button"
              onClick={handleEnter}
              className="landing-focus ml-1 min-h-11 px-3.5 rounded-lg bg-[#09090B] text-white text-[13px] font-medium hover:bg-[#27272A] transition"
            >
              {t('landingHeroCta')}
            </button>
          </nav>
        </Container>
      </header>

      <main>
        {/* Hero */}
        <section className="relative">
          <div className="landing-hero-grid-bg pointer-events-none absolute inset-0" aria-hidden="true" />
          <Container
            className="relative flex flex-col justify-center py-12 md:py-16"
            style={{ minHeight: 'min(820px, calc(100svh - 64px))' }}
          >
            <div className="grid grid-cols-1 min-[900px]:grid-cols-[55fr_45fr] gap-10 min-[900px]:gap-12 items-center">
              <div className="relative z-10">
                <span className="landing-rise inline-flex items-center min-h-8 px-3 rounded-full border border-[#E4E4E7] bg-white text-[12px] font-medium text-[#52525B]">
                  Hyderabad hotspot pilot · CipherCop 2026
                </span>
                <h1 className="landing-rise landing-rise-delay-1 landing-h1 landing-display mt-5 text-[#09090B] max-w-[16ch]">
                  {t('landingTitle')}
                </h1>
                <p className="landing-rise landing-rise-delay-2 mt-5 landing-body max-w-[52ch]">
                  {t('landingSub')}
                </p>
                <div className="landing-rise landing-rise-delay-2 mt-8 flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
                  <button
                    type="button"
                    onClick={handleEnter}
                    className="landing-focus group inline-flex items-center justify-center gap-2 min-h-11 px-5 text-[14px] font-medium bg-[#09090B] text-white rounded-lg hover:bg-[#27272A] transition"
                  >
                    <span>{officer || !authRequired ? t('enterApp') : t('landingHeroCta')}</span>
                    <ArrowRight className="w-4 h-4 transition-transform group-hover:translate-x-0.5" strokeWidth={1.5} />
                  </button>
                  <button
                    type="button"
                    onClick={() => onCitizenPortal?.()}
                    className="landing-focus inline-flex items-center justify-center min-h-11 px-5 text-[14px] font-medium border border-[#D4D4D8] bg-white text-[#3F3F46] rounded-lg hover:bg-[#FAFAFA] transition"
                  >
                    {t('landingCitizenCta')}
                  </button>
                </div>
                {bootError && <p className="mt-3 text-[13px] text-red-600">{bootError}</p>}
                <ul className="landing-rise landing-rise-delay-3 mt-8 flex flex-wrap gap-x-4 gap-y-2 text-[13px] text-[#52525B]">
                  {['Live CAP alerts', 'Public weather feeds', 'Officer approval required'].map((chip) => (
                    <li key={chip} className="inline-flex items-center gap-1.5">
                      <span className="w-1.5 h-1.5 rounded-full bg-[#4338CA]" aria-hidden="true" />
                      {chip}
                    </li>
                  ))}
                </ul>
              </div>

              <div className="landing-rise landing-rise-delay-2 relative flex items-center justify-center min-[900px]:justify-end">
                <div
                  className="relative w-full max-w-[360px] min-[900px]:max-w-[520px] aspect-square mx-auto min-[900px]:mx-0"
                  aria-hidden="true"
                >
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
          </Container>
        </section>

        {/* Demo — overlaps hero bottom */}
        <section className="relative z-10 -mt-12 pb-12 md:pb-16" aria-labelledby="demo-heading">
          <Container>
            <h2 id="demo-heading" className="sr-only">Demo highlights</h2>
            <DemoHighlights />
          </Container>
        </section>

        {/* How it works */}
        <section ref={howRef} className="landing-section border-t border-[#E4E4E7]" aria-labelledby="how-heading">
          <Container>
            <div className="max-w-[60ch]">
              <h2 id="how-heading" className="landing-h2 landing-display">
                {t('landingHowTitle')}
              </h2>
              <p className="mt-4 text-[18px] leading-relaxed text-[#3F3F46]">
                {t('landingHowSub')}
              </p>
            </div>
            <div className="mt-12 grid grid-cols-1 md:grid-cols-3 gap-6 items-stretch">
              {howCards.map(({ title, desc, Icon, steps }) => (
                <article
                  key={title}
                  className="flex flex-col h-full rounded-[16px] border border-[#E4E4E7] bg-white p-6"
                >
                  <div className="w-12 h-12 rounded-[12px] bg-[#EEF2FF] text-[#4338CA] flex items-center justify-center mb-5">
                    <Icon className="w-5 h-5" strokeWidth={1.5} />
                  </div>
                  <h3 className="landing-display text-[18px] font-semibold text-[#09090B] tracking-[-0.03em]">
                    {title}
                  </h3>
                  <p className="mt-2 text-[15px] leading-relaxed text-[#3F3F46] flex-1">{desc}</p>
                  {steps && (
                    <ol className="mt-4 flex flex-wrap items-center gap-1.5 text-[13px] text-[#52525B]">
                      {steps.map((step, i) => (
                        <React.Fragment key={step}>
                          {i > 0 && <span className="text-[#A1A1AA]" aria-hidden="true">→</span>}
                          <li className="inline-flex h-7 px-2.5 items-center rounded-md border border-[#E4E4E7] bg-[#FAFAFA] list-none">
                            {step}
                          </li>
                        </React.Fragment>
                      ))}
                    </ol>
                  )}
                </article>
              ))}
            </div>
          </Container>
        </section>

        {/* View */}
        <section className="landing-section border-t border-[#E4E4E7]" aria-labelledby="view-heading">
          <Container>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 lg:gap-16 items-center">
              <div className="max-w-[460px]">
                <div className="text-[13px] font-medium text-[#4338CA] mb-3">View</div>
                <h2 id="view-heading" className="landing-h2 landing-display">
                  {t('landingViewTitle')}
                </h2>
                <p className="mt-4 text-[18px] leading-relaxed text-[#3F3F46]">
                  {t('landingViewDesc')}
                </p>
                <button
                  type="button"
                  onClick={scrollHow}
                  className="landing-focus mt-6 inline-flex items-center gap-1.5 min-h-11 text-[14px] font-medium text-[#09090B] hover:text-[#4338CA] transition"
                >
                  Learn more <ArrowRight className="w-4 h-4" strokeWidth={1.5} />
                </button>
              </div>
              <ViewPreview />
            </div>
          </Container>
        </section>

        {/* Action */}
        <section className="landing-section border-t border-[#E4E4E7]" aria-labelledby="action-heading">
          <Container>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 lg:gap-16 items-center">
              <div className="order-2 lg:order-1">
                <ActionPreview />
              </div>
              <div className="order-1 lg:order-2 max-w-[460px] lg:justify-self-end">
                <div className="text-[13px] font-medium text-[#4338CA] mb-3">Action</div>
                <h2 id="action-heading" className="landing-h2 landing-display">
                  {t('landingActionTitle')}
                </h2>
                <p className="mt-4 text-[18px] leading-relaxed text-[#3F3F46]">
                  {t('landingActionDesc')}
                </p>
                <button
                  type="button"
                  onClick={() => onDocs?.()}
                  className="landing-focus mt-6 inline-flex items-center gap-1.5 min-h-11 text-[14px] font-medium text-[#09090B] hover:text-[#4338CA] transition"
                >
                  Learn more <ArrowRight className="w-4 h-4" strokeWidth={1.5} />
                </button>
              </div>
            </div>
          </Container>
        </section>

        {/* Data sources */}
        <section className="py-12 border-t border-[#E4E4E7]" aria-label="Data sources">
          <Container>
            <div className="flex flex-col sm:flex-row sm:items-center gap-4 sm:gap-8">
              <span className="text-[13px] font-medium text-[#52525B] shrink-0">Live sources</span>
              <ul className="flex flex-wrap gap-x-6 gap-y-2 text-[14px] text-[#3F3F46]">
                <li className="inline-flex items-center gap-2">
                  <Radio className="w-4 h-4 text-[#4338CA]" strokeWidth={1.5} />
                  CAP / SACHET alerts
                </li>
                <li className="inline-flex items-center gap-2">
                  <Wind className="w-4 h-4 text-[#4338CA]" strokeWidth={1.5} />
                  Windy / Doppler radar
                </li>
                <li className="inline-flex items-center gap-2">
                  <Database className="w-4 h-4 text-[#4338CA]" strokeWidth={1.5} />
                  Public weather feeds
                </li>
              </ul>
            </div>
          </Container>
        </section>

        {/* Final CTA */}
        <section className="landing-section border-t border-[#E4E4E7]" aria-labelledby="cta-heading">
          <Container>
            <div className="rounded-[24px] bg-[#0A0A0A] px-6 py-12 sm:px-12 sm:py-16 text-center">
              <h2 id="cta-heading" className="landing-h2 landing-on-dark tracking-tight">
                {t('landingCtaTitle')}
              </h2>
              <p className="mt-4 mx-auto max-w-[48ch] text-[16px] leading-relaxed text-zinc-300">
                {t('landingCtaSub')}
              </p>
              <div className="mt-8 flex flex-col sm:flex-row items-stretch sm:items-center justify-center gap-3">
                <button
                  type="button"
                  onClick={handleEnter}
                  className="landing-focus inline-flex items-center justify-center gap-2 min-h-11 px-5 rounded-lg bg-white text-[#0A0A0A] text-[14px] font-medium hover:bg-zinc-100 transition"
                >
                  {t('landingHeroCta')}
                  <ArrowRight className="w-4 h-4" strokeWidth={1.5} />
                </button>
                <button
                  type="button"
                  onClick={() => onCitizenPortal?.()}
                  className="landing-focus inline-flex items-center justify-center min-h-11 px-5 rounded-lg border border-white/30 text-white text-[14px] font-medium hover:bg-white/10 transition"
                >
                  {t('landingCitizenCta')}
                </button>
              </div>
            </div>
          </Container>
        </section>
      </main>

      <footer className="border-t border-[#E4E4E7] py-12 md:py-16">
        <Container>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-10">
            <div>
              <div className="flex items-center gap-2.5">
                <VantaMark size={24} />
                <span className="text-[14px] font-semibold text-[#09090B]">Vanta Protocol</span>
              </div>
              <p className="mt-3 text-[14px] leading-relaxed text-[#52525B] max-w-[36ch]">
                Decision-support control room for Greater Hyderabad — live feeds, agent briefings, officer approval.
              </p>
              <p className="mt-4 text-[14px] font-medium text-[#3F3F46]">
                {t('landingFooterReadable')}
              </p>
            </div>
            <div>
              <div className="text-[13px] font-semibold text-[#09090B] mb-3">Product</div>
              <ul className="space-y-2">
                <li>
                  <button type="button" onClick={handleEnter} className="landing-focus text-[14px] text-[#52525B] hover:text-[#09090B] min-h-11 inline-flex items-center">
                    Control room
                  </button>
                </li>
                <li>
                  <button type="button" onClick={() => onCitizenPortal?.()} className="landing-focus text-[14px] text-[#52525B] hover:text-[#09090B] min-h-11 inline-flex items-center">
                    Citizen field report
                  </button>
                </li>
                <li>
                  <button type="button" onClick={() => onDocs?.()} className="landing-focus text-[14px] text-[#52525B] hover:text-[#09090B] min-h-11 inline-flex items-center">
                    Docs
                  </button>
                </li>
              </ul>
            </div>
            <div className="md:text-right">
              <p className="text-[14px] text-[#52525B] leading-relaxed">
                CipherCop 2026 · Track 2 · Hyderabad pilot
              </p>
            </div>
          </div>
        </Container>
      </footer>

      {showLogin && (
        <div
          className="fixed inset-0 z-[1200] flex items-center justify-center bg-zinc-950/40 px-4 backdrop-blur-sm"
          onClick={() => setShowLogin(false)}
        >
          <div
            className="w-full max-w-md rounded-[16px] border border-[#E4E4E7] bg-white p-5 text-left shadow-xl"
            onClick={(event) => event.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-labelledby="officer-login-title"
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 id="officer-login-title" className="landing-display text-[16px] font-semibold text-[#09090B] tracking-[-0.03em]">
                  Officer sign-in
                </h2>
                <p className="mt-1 text-[13px] text-[#52525B]">
                  Use your control-room username and password to continue.
                </p>
              </div>
              <button type="button" onClick={() => setShowLogin(false)} aria-label="Close" className="landing-focus min-h-11 min-w-11 inline-flex items-center justify-center text-[#52525B] hover:text-[#09090B]">
                <X className="w-4 h-4" strokeWidth={1.5} />
              </button>
            </div>
            <form onSubmit={handleLogin} className="mt-4 flex flex-col gap-3">
              <label className="text-[13px] font-medium text-[#3F3F46]">
                Username
                <input
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  autoComplete="username"
                  autoFocus
                  className="landing-focus mt-1 h-11 w-full rounded-lg border border-[#E4E4E7] bg-white px-3 text-[14px] text-[#09090B]"
                  required
                />
              </label>
              <label className="text-[13px] font-medium text-[#3F3F46]">
                Password
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete="current-password"
                  className="landing-focus mt-1 h-11 w-full rounded-lg border border-[#E4E4E7] bg-white px-3 text-[14px] text-[#09090B]"
                  required
                />
              </label>
              {error && <div className="text-[13px] text-red-600">{error}</div>}
              <button
                type="submit"
                disabled={busy}
                className="landing-focus min-h-11 rounded-lg bg-[#09090B] text-white text-[14px] font-medium hover:bg-[#27272A] disabled:opacity-60 transition"
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
