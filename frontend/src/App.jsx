import React, { useState, useEffect, useCallback } from 'react';
import {
  Bot, CheckCircle2, Compass, Flame, Layers, Map as MapIcon, Plus, Route, Shield,
  ShieldAlert, Siren
} from 'lucide-react';
import SourceStatusBar from './components/SourceStatusBar';
import Map from './components/Map';
import AgentPanel from './components/AgentPanel';
import RiskZonePanel from './components/RiskZonePanel';
import EvacuationPanel from './components/EvacuationPanel';
import PrepositionPanel from './components/PrepositionPanel';
import UnitRegisterModal from './components/UnitRegisterModal';
import IncidentIntakeModal from './components/IncidentIntakeModal';
import BlockedRoadModal from './components/BlockedRoadModal';
import { useLanguage } from './i18n.jsx';
import {
  fetchSources, fetchRiskZones, fetchUnits, registerUnit,
  fetchIncidents, reportIncident, fetchPrepositionSuggestions,
  approvePrepositioning, generateEvacuationRoute, fetchBlockedRoads,
  reportBlockedRoad, fetchZoneWeather, fetchAgentStatus, runAgent
} from './api';

/* Left-rail navigation items */
const NAV = [
  { id: 'map', label: 'Tactical Map', Icon: MapIcon },
  { id: 'agents', label: 'Agent Command', Icon: Bot },
];

export default function App() {
  const { language, setLanguage, t } = useLanguage();
  const [sources, setSources] = useState([]);
  const [riskZones, setRiskZones] = useState([]);
  const [zoneWeather, setZoneWeather] = useState([]);
  const [agentStatus, setAgentStatus] = useState(null);
  const [agentResults, setAgentResults] = useState({});
  const [agentErrors, setAgentErrors] = useState({});
  const [loadingAgent, setLoadingAgent] = useState(null);
  const [units, setUnits] = useState([]);
  const [incidents, setIncidents] = useState([]);
  const [blockedRoads, setBlockedRoads] = useState([]);
  const [prepositionSuggestions, setPrepositionSuggestions] = useState([]);

  const [selectedZone, setSelectedZone] = useState(null);
  const [activeRoute, setActiveRoute] = useState(null);

  const [loadingSources, setLoadingSources] = useState(false);
  const [loadingRisk, setLoadingRisk] = useState(false);
  const [loadingRoute, setLoadingRoute] = useState(false);

  const [isUnitModalOpen, setIsUnitModalOpen] = useState(false);
  const [isIncidentModalOpen, setIsIncidentModalOpen] = useState(false);
  const [isRoadModalOpen, setIsRoadModalOpen] = useState(false);

  const [view, setView] = useState('agents'); // 'map' | 'agents' — agents is the landing screen
  const [activeTab, setActiveTab] = useState('zones'); // 'zones' | 'preposition' | 'incidents'
  const [clock, setClock] = useState(new Date());

  const loadData = useCallback(async () => {
    setLoadingSources(true);
    setLoadingRisk(true);
    try {
      const [srcs, rZones, weather, aStatus, uList, incList, roads] = await Promise.all([
        fetchSources().catch(e => { console.error(e); return []; }),
        fetchRiskZones().catch(e => { console.error(e); return []; }),
        fetchZoneWeather().catch(e => { console.error(e); return []; }),
        fetchAgentStatus().catch(e => { console.error(e); return null; }),
        fetchUnits().catch(e => { console.error(e); return []; }),
        fetchIncidents().catch(e => { console.error(e); return []; }),
        fetchBlockedRoads().catch(e => { console.error(e); return []; })
      ]);
      setSources(srcs);
      setRiskZones(rZones);
      setZoneWeather(weather);
      setAgentStatus(aStatus);
      setUnits(uList);
      setIncidents(incList);
      setBlockedRoads(roads);

      if (uList && uList.length > 0) {
        const prep = await fetchPrepositionSuggestions().catch(() => []);
        setPrepositionSuggestions(prep);
      } else {
        setPrepositionSuggestions([]);
      }
    } finally {
      setLoadingSources(false);
      setLoadingRisk(false);
    }
  }, []);

  const handleRunAgent = async (agentId, confirmGoogleProcessing, runLanguage, inputs = {}) => {
    setLoadingAgent(agentId);
    setAgentErrors(previous => ({ ...previous, [agentId]: '' }));
    try {
      const result = await runAgent(agentId, confirmGoogleProcessing, runLanguage || language, inputs);
      setAgentResults(previous => ({ ...previous, [agentId]: result }));
      if (agentId === 'prepare') setPrepositionSuggestions(result.positioning_recommendations || []);
    } catch (err) {
      setAgentErrors(previous => ({ ...previous, [agentId]: err.message }));
    } finally {
      setLoadingAgent(null);
    }
  };

  useEffect(() => {
    loadData();
    const interval = setInterval(loadData, 60000);
    const t = setInterval(() => setClock(new Date()), 1000);
    return () => { clearInterval(interval); clearInterval(t); };
  }, [loadData]);

  // Nudge Leaflet when the map becomes visible again after switching views
  useEffect(() => {
    if (view === 'map') window.dispatchEvent(new Event('resize'));
  }, [view]);

  const handleGenerateRoute = async (zone) => {
    setLoadingRoute(true);
    try {
      // A hotspot is already a target point; polygon zones use their ring centroid.
      const geometry = zone.polygon || {};
      const coords = geometry.coordinates || [];
      const ring = coords[0] || [];
      const avgLng = geometry.type === 'Point' ? coords[0] : ring.reduce((sum, point) => sum + point[0], 0) / (ring.length || 1);
      const avgLat = geometry.type === 'Point' ? coords[1] : ring.reduce((sum, point) => sum + point[1], 0) / (ring.length || 1);
      const route = await generateEvacuationRoute(zone.id, zone.name, avgLat, avgLng);
      setActiveRoute(route);
    } catch (err) {
      alert(`Could not calculate route: ${err.message}`);
    } finally {
      setLoadingRoute(false);
    }
  };

  const handleRegisterUnit = async (unitData) => {
    const created = await registerUnit(unitData);
    setUnits(prev => [created, ...prev]);
    const prep = await fetchPrepositionSuggestions().catch(() => []);
    setPrepositionSuggestions(prep);
  };

  const handleReportIncident = async (incData) => {
    const created = await reportIncident(incData);
    setIncidents(prev => [created, ...prev]);
  };

  const handleReportRoad = async (roadData) => {
    const created = await reportBlockedRoad(roadData);
    setBlockedRoads(prev => [created, ...prev]);
  };

  const handleApprovePreposition = async (suggestionId, unitId, targetZoneName) => {
    await approvePrepositioning(suggestionId, unitId, targetZoneName);
    const [uList, prep] = await Promise.all([fetchUnits(), fetchPrepositionSuggestions()]);
    setUnits(uList);
    setPrepositionSuggestions(prep);
  };

  /* Highest risk zone drives the header alert state */
  const maxRisk = riskZones.reduce((m, z) => Math.max(m, z.risk_level || 0), 0);
  const alertTone =
    maxRisk >= 4 ? { dot: 'bg-rose-500', text: 'text-rose-300', label: 'CRITICAL' } :
    maxRisk === 3 ? { dot: 'bg-amber-400', text: 'text-amber-300', label: 'ELEVATED' } :
    { dot: 'bg-emerald-400', text: 'text-emerald-300', label: 'NOMINAL' };

  const pendingApprovals = prepositionSuggestions.length;

  return (
    <div className="flex flex-col h-screen w-screen overflow-hidden" style={{ background: 'var(--vanta-bg)' }}>
      {/* ── Command bar ─────────────────────────────────── */}
      <header
        className="flex items-center gap-4 px-4 h-14 border-b shrink-0 z-[700]"
        style={{ borderColor: 'var(--vanta-border)', background: 'var(--vanta-panel)' }}
      >
        {/* Brand */}
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-cyan-500 to-blue-700 flex items-center justify-center shadow-lg shadow-cyan-900/40">
            <Siren className="w-4.5 h-4.5 text-white" />
          </div>
          <div className="leading-tight">
            <div className="font-extrabold tracking-widest text-white text-[13px]">{t('controlRoom')}</div>
            <div className="text-[10px]" style={{ color: 'var(--vanta-text-faint)' }}>{t('area')}</div>
          </div>
        </div>

        <div className="h-6 w-px" style={{ background: 'var(--vanta-border)' }} />

        {/* Threat level */}
        <div className="hidden md:flex items-center gap-2">
          <span className={`w-2 h-2 rounded-full ${alertTone.dot} ${maxRisk >= 4 ? 'v-dot' : ''}`} style={maxRisk >= 4 ? { color: '#f87171' } : {}} />
          <span className="text-[11px] font-bold tracking-wider">THREAT</span>
          <span className={`text-[11px] font-extrabold ${alertTone.text}`}>{alertTone.label}</span>
        </div>

        <div className="ml-auto flex items-center gap-2">
          {/* Clock */}
          <span className="hidden lg:inline v-mono text-[12px] px-2.5 py-1 rounded-md v-panel" style={{ color: 'var(--vanta-text-dim)' }}>
            {clock.toLocaleTimeString('en-IN', { hour12: false })}
          </span>

          {/* Language switcher */}
          <div
            className="flex items-center gap-0.5 rounded-lg border p-0.5"
            style={{ borderColor: 'var(--vanta-border-hi)', background: 'rgba(8,13,23,0.8)' }}
            aria-label={t('langLabel')}
          >
            {[['en', 'EN'], ['hi', 'हिं'], ['te', 'తె']].map(([code, label]) => (
              <button
                key={code}
                onClick={() => setLanguage(code)}
                aria-pressed={language === code}
                className={`rounded-md px-2 py-1 text-[11px] font-bold transition ${
                  language === code ? 'bg-cyan-500 text-slate-950' : 'text-slate-300 hover:bg-slate-800'
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          <button
            onClick={() => setIsIncidentModalOpen(true)}
            className="flex items-center gap-1.5 text-[11px] font-semibold px-3 py-1.5 rounded-lg border border-rose-900/70 bg-rose-950/40 text-rose-300 hover:bg-rose-900/50 hover:text-rose-200 transition"
          >
            <Plus className="w-3.5 h-3.5" /> {t('logIncident')} <span className="v-mono opacity-70">{incidents.length}</span>
          </button>
          <button
            onClick={() => setIsUnitModalOpen(true)}
            className="hidden sm:flex items-center gap-1.5 text-[11px] font-semibold px-3 py-1.5 rounded-lg border border-cyan-900/70 bg-cyan-950/40 text-cyan-300 hover:bg-cyan-900/50 hover:text-cyan-200 transition"
          >
            <Shield className="w-3.5 h-3.5" /> {t('registerUnit')} <span className="v-mono opacity-70">{units.length}</span>
          </button>
          <button
            onClick={() => setIsRoadModalOpen(true)}
            className="hidden md:flex items-center gap-1.5 text-[11px] font-semibold px-3 py-1.5 rounded-lg border border-amber-900/70 bg-amber-950/40 text-amber-300 hover:bg-amber-900/50 hover:text-amber-200 transition"
          >
            <Route className="w-3.5 h-3.5" /> {t('roadBlock')} <span className="v-mono opacity-70">{blockedRoads.length}</span>
          </button>
        </div>
      </header>

      {/* ── Feed integrity strip ────────────────────────── */}
      <SourceStatusBar sources={sources} onRefresh={loadData} loading={loadingSources} />

      {/* ── Body: rail + main ───────────────────────────── */}
      <div className="flex-1 flex overflow-hidden">
        {/* Left nav rail */}
        <nav
          className="w-16 flex flex-col items-center gap-1 py-3 border-r shrink-0 z-[600]"
          style={{ borderColor: 'var(--vanta-border)', background: 'var(--vanta-panel)' }}
        >
          {NAV.map(({ id, label, Icon }) => (
            <button
              key={id}
              onClick={() => setView(id)}
              title={label}
              className={`relative w-11 h-11 rounded-xl flex items-center justify-center transition ${
                view === id ? 'bg-cyan-400/10 text-cyan-300' : 'hover:bg-white/5'
              }`}
              style={view !== id ? { color: 'var(--vanta-text-dim)' } : {}}
            >
              {view === id && <span className="absolute left-0 top-2 bottom-2 w-[2px] rounded-full bg-cyan-400" />}
              <Icon className="w-5 h-5" />
            </button>
          ))}

          {/* Pending approvals badge */}
          {pendingApprovals > 0 && (
            <button
              onClick={() => { setView('map'); setActiveTab('preposition'); }}
              title={`${pendingApprovals} approvals pending`}
              className="mt-1 w-11 h-11 rounded-xl flex items-center justify-center relative text-amber-300 hover:bg-amber-500/10 transition"
            >
              <span
                className="absolute top-1.5 right-1.5 w-4 h-4 bg-amber-400 text-black text-[9px] font-extrabold rounded-full flex items-center justify-center border-2"
                style={{ borderColor: 'var(--vanta-panel)' }}
              >
                {pendingApprovals}
              </span>
              <Compass className="w-5 h-5" />
            </button>
          )}
        </nav>

        {/* Main area */}
        <main className="flex-1 relative overflow-hidden">
          {/* MAP VIEW (kept mounted so Leaflet state survives) */}
          <div
            className="absolute inset-0 flex"
            style={{ visibility: view === 'map' ? 'visible' : 'hidden', pointerEvents: view === 'map' ? 'auto' : 'none' }}
          >
            <div className="flex-1 h-full relative">
              <Map
                riskZones={riskZones}
                selectedZone={selectedZone}
                onSelectZone={(zone) => { setSelectedZone(zone); setView('map'); setActiveTab('zones'); }}
                activeRoute={activeRoute}
                units={units}
                incidents={incidents}
                blockedRoads={blockedRoads}
                prepositionSuggestions={prepositionSuggestions}
              />

              {activeRoute && (
                <div className="absolute bottom-5 left-5 z-[500] w-80">
                  <EvacuationPanel
                    route={activeRoute}
                    onClose={() => setActiveRoute(null)}
                    onClearRoute={() => setActiveRoute(null)}
                  />
                </div>
              )}
            </div>

            {/* Right dock */}
            <aside
              className="w-[22rem] max-w-[45vw] flex flex-col border-l z-[400] h-full shadow-2xl"
              style={{ borderColor: 'var(--vanta-border)', background: 'var(--vanta-panel)' }}
            >
              <div className="flex border-b p-1.5 gap-1 text-[11px] shrink-0" style={{ borderColor: 'var(--vanta-border)' }}>
                {[
                  { id: 'zones', label: t('zones'), Icon: ShieldAlert, active: 'bg-cyan-600/90' },
                  { id: 'preposition', label: t('prepare'), Icon: Compass, active: 'bg-amber-600/90' },
                  { id: 'incidents', label: t('incidents'), Icon: Flame, active: 'bg-rose-600/90' },
                ].map(({ id, label, Icon, active }) => (
                  <button
                    key={id}
                    onClick={() => setActiveTab(id)}
                    className={`relative flex-1 py-2 rounded-lg font-semibold transition flex items-center justify-center gap-1.5 ${
                      activeTab === id ? `${active} text-white shadow` : 'text-slate-400 hover:text-white hover:bg-white/5'
                    }`}
                  >
                    <Icon className="w-3.5 h-3.5" />
                    {label}
                    {id === 'preposition' && prepositionSuggestions.length > 0 && (
                      <span
                        className="absolute -top-1 -right-1 w-4 h-4 bg-amber-400 text-black text-[9px] font-extrabold rounded-full flex items-center justify-center border-2"
                        style={{ borderColor: 'var(--vanta-panel)' }}
                      >
                        {prepositionSuggestions.length}
                      </span>
                    )}
                  </button>
                ))}
              </div>

              <div className="flex-1 overflow-y-auto p-3 flex flex-col gap-3">
                {activeTab === 'zones' && (
                  <div className="flex flex-col gap-3 v-view-enter">
                    {selectedZone ? (
                      <RiskZonePanel
                        zone={selectedZone}
                        weather={zoneWeather.find(item => item.zone_id === selectedZone.id)}
                        onClose={() => setSelectedZone(null)}
                        onGenerateRoute={handleGenerateRoute}
                        loadingRoute={loadingRoute}
                      />
                    ) : (
                      <div className="v-panel p-3 text-[11px] text-center" style={{ color: 'var(--vanta-text-dim)' }}>
                        {t('inspectMap')}
                      </div>
                    )}

                    <div className="flex items-center justify-between mt-1">
                      <span className="v-label">
                        {t('monitoredWards')} ({riskZones.length})
                      </span>
                      <Layers className="w-3 h-3" style={{ color: 'var(--vanta-text-faint)' }} />
                    </div>

                    <div className="flex flex-col gap-1.5">
                      {[...riskZones].sort((a, b) => (b.risk_level || 0) - (a.risk_level || 0)).map((z) => (
                        <button
                          key={z.id}
                          onClick={() => setSelectedZone(z)}
                          className={`v-card v-card-hover p-2.5 text-left transition flex items-center justify-between ${
                            selectedZone?.id === z.id ? 'ring-1 ring-cyan-500/70' : ''
                          }`}
                        >
                          <div className="min-w-0">
                            <div className="font-bold text-white text-[12px] truncate">{z.name}</div>
                            <div className="v-mono text-[10px] mt-0.5" style={{ color: 'var(--vanta-text-faint)' }}>
                              {t('elevation')} {z.explanation?.mean_elevation_m?.toFixed(1) ?? '–'}m · {t('rain')} {z.explanation?.rainfall_24h_mm?.toFixed(1) ?? '0.0'}mm
                            </div>
                          </div>
                          <span
                            className={`shrink-0 ml-2 w-7 h-7 rounded-md flex items-center justify-center v-mono text-[11px] font-extrabold ${
                              z.risk_level >= 4 ? 'bg-rose-950 text-rose-400 border border-rose-800' :
                              z.risk_level === 3 ? 'bg-amber-950 text-amber-400 border border-amber-800' :
                              z.risk_level === 2 ? 'bg-cyan-950 text-cyan-400 border border-cyan-800' :
                              'bg-emerald-950 text-emerald-400 border border-emerald-800'
                            }`}
                          >
                            {z.risk_level}
                          </span>
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {activeTab === 'preposition' && (
                  <div className="v-view-enter">
                    <PrepositionPanel
                      suggestions={prepositionSuggestions}
                      onApprove={handleApprovePreposition}
                    />
                  </div>
                )}

                {activeTab === 'incidents' && (
                  <div className="flex flex-col gap-3 v-view-enter">
                    <div className="flex items-center justify-between">
                      <span className="v-label">{t('loggedIncidents')} ({incidents.length})</span>
                      <button
                        onClick={() => setIsIncidentModalOpen(true)}
                        className="text-rose-400 text-[11px] hover:underline flex items-center gap-1"
                      >
                        <Plus className="w-3 h-3" /> {t('addIncident')}
                      </button>
                    </div>

                    {incidents.length === 0 ? (
                      <div className="v-panel p-4 text-center text-[11px]" style={{ color: 'var(--vanta-text-dim)' }}>
                        <CheckCircle2 className="w-6 h-6 text-emerald-500 mx-auto mb-1.5" />
                        <div className="text-white font-semibold">{t('noIncidents')}</div>
                        <div className="text-[10px] mt-1" style={{ color: 'var(--vanta-text-faint)' }}>{t('noIncidentsHint')}</div>
                      </div>
                    ) : (
                      incidents.map((inc) => (
                        <div key={inc.id} className="v-card p-2.5 text-[11px] flex flex-col gap-1">
                          <div className="flex items-center justify-between">
                            <span className="font-bold text-rose-400 uppercase tracking-wide text-[10px]">
                              {inc.type} · U{inc.urgency}
                            </span>
                            <span className="v-mono text-[10px]" style={{ color: 'var(--vanta-text-faint)' }}>
                              {new Date(inc.timestamp).toLocaleTimeString()}
                            </span>
                          </div>
                          <div className="text-white font-medium leading-snug">{inc.message}</div>
                          <div className="text-[10px] flex items-center justify-between" style={{ color: 'var(--vanta-text-dim)' }}>
                            <span>{t('people')}: {inc.people}</span>
                            <span style={{ color: 'var(--vanta-text-faint)' }}>{inc.source}</span>
                          </div>
                        </div>
                      ))
                    )}

                    <div className="mt-2 pt-3 border-t flex items-center justify-between" style={{ borderColor: 'var(--vanta-border)' }}>
                      <span className="v-label">{t('registeredUnits')} ({units.length})</span>
                      <button
                        onClick={() => setIsUnitModalOpen(true)}
                        className="text-cyan-400 text-[11px] hover:underline flex items-center gap-1"
                      >
                        <Plus className="w-3 h-3" /> {t('registerUnit')}
                      </button>
                    </div>

                    {units.length === 0 ? (
                      <div className="v-panel p-4 text-center text-[11px]" style={{ color: 'var(--vanta-text-dim)' }}>
                        <Shield className="w-6 h-6 mx-auto mb-1.5" style={{ color: 'var(--vanta-text-faint)' }} />
                        <div className="text-white font-semibold">{t('noUnits')}</div>
                        <div className="text-[10px] mt-1" style={{ color: 'var(--vanta-text-faint)' }}>{t('unitsHint')}</div>
                      </div>
                    ) : (
                      units.map((u) => (
                        <div key={u.id} className="v-card p-2.5 text-[11px] flex items-center justify-between">
                          <div className="min-w-0">
                            <div className="font-bold text-white flex items-center gap-1.5">
                              <span>{u.kind === 'rescue_boat' ? '⛵' : u.kind === 'ambulance' ? '🚑' : '🚔'}</span>
                              <span className="truncate">{u.id}</span>
                              <span className="text-[9px] px-1.5 py-0.5 rounded bg-slate-800 text-slate-400 capitalize shrink-0">
                                {u.kind.replace('_', ' ')}
                              </span>
                            </div>
                            <div className="text-[10px] mt-0.5" style={{ color: 'var(--vanta-text-faint)' }}>{u.station}</div>
                          </div>
                          <span className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded shrink-0 ${
                            u.status === 'available' ? 'bg-emerald-950 text-emerald-400 border border-emerald-800' : 'bg-slate-800 text-slate-400'
                          }`}>
                            {u.status === 'available' ? t('available') : u.status === 'en_route' ? t('enRoute') : u.status}
                          </span>
                        </div>
                      ))
                    )}
                  </div>
                )}
              </div>
            </aside>
          </div>

          {/* AGENT COMMAND VIEW — real Gemini agent workbench */}
          {view === 'agents' && (
            <div className="absolute inset-0 z-[450] overflow-y-auto" style={{ background: 'var(--vanta-bg)' }}>
              <div className="max-w-5xl mx-auto p-6">
                <AgentPanel
                  status={agentStatus}
                  results={agentResults}
                  errors={agentErrors}
                  loadingAgent={loadingAgent}
                  onRun={handleRunAgent}
                  onReviewPreparation={() => { setView('map'); setActiveTab('preposition'); }}
                  riskZones={riskZones}
                />
              </div>
            </div>
          )}
        </main>
      </div>

      {/* Modals */}
      <UnitRegisterModal isOpen={isUnitModalOpen} onClose={() => setIsUnitModalOpen(false)} onRegister={handleRegisterUnit} />
      <IncidentIntakeModal isOpen={isIncidentModalOpen} onClose={() => setIsIncidentModalOpen(false)} onReport={handleReportIncident} />
      <BlockedRoadModal isOpen={isRoadModalOpen} onClose={() => setIsRoadModalOpen(false)} onReport={handleReportRoad} />
    </div>
  );
}
