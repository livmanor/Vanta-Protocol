import React, { useState, useEffect, useCallback } from 'react';
import {
  Bot, CheckCircle2, Compass, Flame, Layers, Map as MapIcon, Plus, Route, Search, Shield,
  ShieldAlert, Siren
} from 'lucide-react';
import SourceStatusBar from './components/SourceStatusBar';
import Landing from './components/Landing';
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
  const [entered, setEntered] = useState(false); // landing page gate
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
      // #region agent log
      fetch('http://127.0.0.1:7369/ingest/b6948bf1-0c84-4082-aca8-dc71a9b2d020',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'715d98'},body:JSON.stringify({sessionId:'715d98',hypothesisId:'C',location:'App.jsx:handleRunAgent',message:'agent run requested',data:{agentId,inputs},timestamp:Date.now()})}).catch(()=>{});
      // #endregion
      const result = await runAgent(agentId, confirmGoogleProcessing, runLanguage || language, inputs);
      // #region agent log
      fetch('http://127.0.0.1:7369/ingest/b6948bf1-0c84-4082-aca8-dc71a9b2d020',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'715d98'},body:JSON.stringify({sessionId:'715d98',hypothesisId:'E',location:'App.jsx:handleRunAgent',message:'agent run succeeded',data:{agentId,status:result.status,window:[result.recent_rain_impacts?.window_start,result.recent_rain_impacts?.window_end],historyStatus:result.recent_rain_impacts?.status,hasSummary:Boolean(result.predict?.summary||result.prepare?.summary||result.respond?.summary)},timestamp:Date.now()})}).catch(()=>{});
      // #endregion
      setAgentResults(previous => ({ ...previous, [agentId]: result }));
      if (agentId === 'prepare') setPrepositionSuggestions(result.positioning_recommendations || []);
    } catch (err) {
      // #region agent log
      fetch('http://127.0.0.1:7369/ingest/b6948bf1-0c84-4082-aca8-dc71a9b2d020',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'715d98'},body:JSON.stringify({sessionId:'715d98',hypothesisId:'C',location:'App.jsx:handleRunAgent',message:'agent run failed',data:{agentId,error:err.message,inputs},timestamp:Date.now()})}).catch(()=>{});
      // #endregion
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
    maxRisk >= 4 ? { dot: 'bg-gray-900', text: 'text-gray-900', label: 'CRITICAL' } :
    maxRisk === 3 ? { dot: 'bg-gray-50', text: 'text-gray-700', label: 'ELEVATED' } :
    { dot: 'bg-gray-300', text: 'text-gray-600', label: 'NOMINAL' };

  const pendingApprovals = prepositionSuggestions.length;

  if (!entered) return <Landing onEnter={() => setEntered(true)} />;

  return (
    <div className="flex flex-col h-screen w-screen overflow-hidden" style={{ background: 'var(--vanta-bg)' }}>
      {/* ── Command bar ─────────────────────────────────── */}
      <header
        className="flex items-center gap-4 px-4 h-14 border-b shrink-0 z-[700]"
        style={{ borderColor: 'var(--vanta-border)', background: 'var(--vanta-panel)' }}
      >
        {/* Search / command */}
        <div className="flex items-center gap-2 flex-1 max-w-md">
          <div className="flex items-center gap-2 w-full h-9 px-3 rounded-lg border bg-white" style={{ borderColor: 'var(--vanta-border)' }}>
            <Search className="w-3.5 h-3.5" style={{ color: 'var(--vanta-text-faint)' }} />
            <span className="text-[12px]" style={{ color: 'var(--vanta-text-faint)' }}>{t('controlRoom')}</span>
          </div>
        </div>

        <div className="h-6 w-px" style={{ background: 'var(--vanta-border)' }} />

        {/* Threat level */}
        <div className="hidden md:flex items-center gap-2">
          <span className={`w-2 h-2 rounded-full ${alertTone.dot} ${maxRisk >= 4 ? 'v-dot' : ''}`} style={maxRisk >= 4 ? { color: '#111111' } : {}} />
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
            style={{ borderColor: 'var(--vanta-border-hi)', background: 'rgba(0,0,0,0.8)' }}
            aria-label={t('langLabel')}
          >
            {[['en', 'EN'], ['hi', 'हिं'], ['te', 'తె']].map(([code, label]) => (
              <button
                key={code}
                onClick={() => setLanguage(code)}
                aria-pressed={language === code}
                className={`rounded-md px-2 py-1 text-[11px] font-bold transition ${
                  language === code ? 'bg-gray-900 text-white' : 'text-gray-700 hover:bg-gray-50'
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          <button
            onClick={() => setIsIncidentModalOpen(true)}
            className="flex items-center gap-1.5 text-[11px] font-semibold px-3 py-1.5 rounded-lg border border-gray-200/70 bg-gray-100/40 text-gray-800 hover:bg-gray-50/50 hover:text-gray-800 transition"
          >
            <Plus className="w-3.5 h-3.5" /> {t('logIncident')} <span className="v-mono opacity-70">{incidents.length}</span>
          </button>
          <button
            onClick={() => setIsUnitModalOpen(true)}
            className="hidden sm:flex items-center gap-1.5 text-[11px] font-semibold px-3 py-1.5 rounded-lg border border-gray-200/70 bg-gray-100/40 text-gray-800 hover:bg-gray-50/50 hover:text-gray-800 transition"
          >
            <Shield className="w-3.5 h-3.5" /> {t('registerUnit')} <span className="v-mono opacity-70">{units.length}</span>
          </button>
          <button
            onClick={() => setIsRoadModalOpen(true)}
            className="hidden md:flex items-center gap-1.5 text-[11px] font-semibold px-3 py-1.5 rounded-lg border border-gray-200/70 bg-gray-100/40 text-gray-800 hover:bg-gray-50/50 hover:text-gray-800 transition"
          >
            <Route className="w-3.5 h-3.5" /> {t('roadBlock')} <span className="v-mono opacity-70">{blockedRoads.length}</span>
          </button>
        </div>
      </header>

      {/* ── Feed integrity strip ────────────────────────── */}
      <SourceStatusBar sources={sources} onRefresh={loadData} loading={loadingSources} />

      {/* ── Body: rail + main ───────────────────────────── */}
      <div className="flex-1 flex overflow-hidden">
        {/* Left sidebar (labeled navigation) */}
        <nav
          className="w-56 flex flex-col py-4 px-3 border-r shrink-0 z-[600] gap-1"
          style={{ borderColor: 'var(--vanta-border)', background: 'var(--vanta-panel)' }}
        >
          <div className="flex items-center gap-2.5 px-2 pb-4">
            <div className="w-8 h-8 rounded-lg bg-gray-900 flex items-center justify-center shrink-0">
              <Siren className="w-4 h-4 text-white" />
            </div>
            <div className="leading-tight min-w-0">
              <div className="font-extrabold tracking-widest text-gray-900 text-[12px]">VANTA</div>
              <div className="text-[10px] truncate" style={{ color: 'var(--vanta-text-faint)' }}>{t('area')}</div>
            </div>
          </div>

          <div className="v-label px-2 pb-1">Operations</div>
          {NAV.map(({ id, label, Icon }) => (
            <button
              key={id}
              onClick={() => setView(id)}
              className={`relative flex items-center gap-3 h-10 px-3 rounded-lg text-[13px] font-semibold transition ${
                view === id ? 'bg-gray-900 text-white shadow-md shadow-gray-400/40' : 'hover:bg-gray-100'
              }`}
              style={view !== id ? { color: 'var(--vanta-text-dim)' } : {}}
            >
              <Icon className="w-4.5 h-4.5 shrink-0" />
              {label}
            </button>
          ))}

          {/* Pending approvals badge */}
          {pendingApprovals > 0 && (
            <button
              onClick={() => { setView('map'); setActiveTab('preposition'); }}
              className="flex items-center gap-3 h-10 px-3 rounded-lg text-[13px] font-semibold text-gray-800 hover:bg-gray-100 transition"
            >
              <Compass className="w-4.5 h-4.5 shrink-0" />
              <span className="flex-1 text-left">Approvals</span>
              <span
                className="w-5 h-5 bg-gray-900 text-white text-[10px] font-extrabold rounded-full flex items-center justify-center"
              >
                {pendingApprovals}
              </span>
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
                  { id: 'zones', label: t('zones'), Icon: ShieldAlert, active: 'bg-gray-900 text-white' },
                  { id: 'preposition', label: t('prepare'), Icon: Compass, active: 'bg-gray-900 text-white' },
                  { id: 'incidents', label: t('incidents'), Icon: Flame, active: 'bg-gray-900 text-white' },
                ].map(({ id, label, Icon, active }) => (
                  <button
                    key={id}
                    onClick={() => setActiveTab(id)}
                    className={`relative flex-1 py-2 rounded-lg font-semibold transition flex items-center justify-center gap-1.5 ${
                      activeTab === id ? `${active} shadow` : 'text-gray-600 hover:text-gray-900 hover:bg-gray-100'
                    }`}
                  >
                    <Icon className="w-3.5 h-3.5" />
                    {label}
                    {id === 'preposition' && prepositionSuggestions.length > 0 && (
                      <span
                        className="absolute -top-1 -right-1 w-4 h-4 bg-gray-900 text-white text-[9px] font-extrabold rounded-full flex items-center justify-center border-2"
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
                            selectedZone?.id === z.id ? 'ring-1 ring-gray-300/70' : ''
                          }`}
                        >
                          <div className="min-w-0">
                            <div className="font-bold text-gray-900 text-[12px] truncate">{z.name}</div>
                            <div className="v-mono text-[10px] mt-0.5" style={{ color: 'var(--vanta-text-faint)' }}>
                              {t('elevation')} {z.explanation?.mean_elevation_m?.toFixed(1) ?? '–'}m · {t('rain')} {z.explanation?.rainfall_24h_mm?.toFixed(1) ?? '0.0'}mm
                            </div>
                          </div>
                          <span
                            className={`shrink-0 ml-2 w-7 h-7 rounded-md flex items-center justify-center v-mono text-[11px] font-extrabold ${
                              z.risk_level >= 4 ? 'bg-gray-100 text-gray-900 border border-gray-200' :
                              z.risk_level === 3 ? 'bg-gray-50 text-gray-900 border border-gray-300' :
                              z.risk_level === 2 ? 'bg-gray-100 text-gray-700 border border-gray-200' :
                              'bg-gray-100 text-gray-500 border border-gray-200'
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
                        className="text-gray-700 text-[11px] hover:underline flex items-center gap-1"
                      >
                        <Plus className="w-3 h-3" /> {t('addIncident')}
                      </button>
                    </div>

                    {incidents.length === 0 ? (
                      <div className="v-panel p-4 text-center text-[11px]" style={{ color: 'var(--vanta-text-dim)' }}>
                        <CheckCircle2 className="w-6 h-6 text-gray-600 mx-auto mb-1.5" />
                        <div className="text-gray-900 font-semibold">{t('noIncidents')}</div>
                        <div className="text-[10px] mt-1" style={{ color: 'var(--vanta-text-faint)' }}>{t('noIncidentsHint')}</div>
                      </div>
                    ) : (
                      incidents.map((inc) => (
                        <div key={inc.id} className="v-card p-2.5 text-[11px] flex flex-col gap-1">
                          <div className="flex items-center justify-between">
                            <span className="font-bold text-gray-700 uppercase tracking-wide text-[10px]">
                              {inc.type} · U{inc.urgency}
                            </span>
                            <span className="v-mono text-[10px]" style={{ color: 'var(--vanta-text-faint)' }}>
                              {new Date(inc.timestamp).toLocaleTimeString()}
                            </span>
                          </div>
                          <div className="text-gray-900 font-medium leading-snug">{inc.message}</div>
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
                        className="text-gray-700 text-[11px] hover:underline flex items-center gap-1"
                      >
                        <Plus className="w-3 h-3" /> {t('registerUnit')}
                      </button>
                    </div>

                    {units.length === 0 ? (
                      <div className="v-panel p-4 text-center text-[11px]" style={{ color: 'var(--vanta-text-dim)' }}>
                        <Shield className="w-6 h-6 mx-auto mb-1.5" style={{ color: 'var(--vanta-text-faint)' }} />
                        <div className="text-gray-900 font-semibold">{t('noUnits')}</div>
                        <div className="text-[10px] mt-1" style={{ color: 'var(--vanta-text-faint)' }}>{t('unitsHint')}</div>
                      </div>
                    ) : (
                      units.map((u) => (
                        <div key={u.id} className="v-card p-2.5 text-[11px] flex items-center justify-between">
                          <div className="min-w-0">
                            <div className="font-bold text-gray-900 flex items-center gap-1.5">
                              <span>{u.kind === 'rescue_boat' ? '⛵' : u.kind === 'ambulance' ? '🚑' : '🚔'}</span>
                              <span className="truncate">{u.id}</span>
                              <span className="text-[9px] px-1.5 py-0.5 rounded bg-gray-50 text-gray-600 capitalize shrink-0">
                                {u.kind.replace('_', ' ')}
                              </span>
                            </div>
                            <div className="text-[10px] mt-0.5" style={{ color: 'var(--vanta-text-faint)' }}>{u.station}</div>
                          </div>
                          <span className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded shrink-0 ${
                            u.status === 'available' ? 'bg-gray-100 text-gray-700 border border-gray-200' : 'bg-gray-50 text-gray-600'
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
