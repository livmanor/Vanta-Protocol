import React, { useState, useEffect, useCallback } from 'react';
import {
  Activity, Bot, CheckCircle2, Compass, Flame, Layers, Map as MapIcon, Plus, Route, Shield,
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
  { id: 'agents', label: 'AI Agents', Icon: Bot },
  { id: 'map', label: 'Tactical Map', Icon: MapIcon },
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
    maxRisk >= 4 ? { dot: 'bg-white', text: 'text-white', label: 'CRITICAL' } :
    maxRisk === 3 ? { dot: 'bg-neutral-300', text: 'text-neutral-300', label: 'ELEVATED' } :
    { dot: 'bg-neutral-600', text: 'text-neutral-400', label: 'NOMINAL' };

  const pendingApprovals = prepositionSuggestions.length;

  if (!entered) return <Landing onEnter={() => setEntered(true)} />;

  return (
    <div className="flex flex-col h-screen w-screen overflow-hidden" style={{ background: 'var(--vp-bg)' }}>
      {/* ── Top Header Bar ──────────────────────────────── */}
      <header
        className="flex items-center gap-4 px-5 h-[64px] border-b shrink-0 z-[700] bg-white border-slate-200"
      >
        {/* Brand */}
        <div className="flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-xl bg-indigo-600 flex items-center justify-center shadow-sm">
            <Siren className="w-5 h-5 text-white" />
          </div>
          <div className="leading-tight">
            <div className="font-extrabold tracking-tight text-slate-900 text-[14px]">Vanta Protocol</div>
            <div className="text-[11px] text-slate-500 font-medium">{t('area')}</div>
          </div>
        </div>

        <div className="h-6 w-px bg-slate-200 mx-1" />

        {/* Threat level indicator */}
        <div className="hidden md:flex items-center gap-2">
          <span className={`w-2 h-2 rounded-full ${maxRisk >= 4 ? 'bg-red-500 vp-dot' : maxRisk === 3 ? 'bg-amber-500' : 'bg-emerald-500'}`} style={maxRisk >= 4 ? { color: '#ef4444' } : {}} />
          <span className="text-[11px] font-bold tracking-wider text-slate-500 uppercase">Threat</span>
          <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full ${
            maxRisk >= 4 ? 'bg-red-50 text-red-700 border border-red-200' :
            maxRisk === 3 ? 'bg-amber-50 text-amber-700 border border-amber-200' :
            'bg-emerald-50 text-emerald-700 border border-emerald-200'
          }`}>{alertTone.label}</span>
        </div>

        {/* Central Search / Quick Status */}
        <div className="hidden lg:flex items-center flex-1 max-w-md mx-4">
          <div className="relative w-full">
            <span className="absolute inset-y-0 left-0 flex items-center pl-3 pointer-events-none text-slate-400">
              <Activity className="w-4 h-4" />
            </span>
            <input
              type="text"
              readOnly
              value={`Hyderabad Ops · ${riskZones.length} hotspots monitored · ${units.length} units registered`}
              className="w-full pl-9 pr-3 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-lg text-slate-600 focus:outline-none cursor-default"
            />
          </div>
        </div>

        <div className="ml-auto flex items-center gap-2">
          {/* Clock */}
          <span className="hidden sm:inline vp-mono text-[12px] px-2.5 py-1 rounded-lg border border-slate-200 bg-slate-50 text-slate-600 font-medium">
            {clock.toLocaleTimeString('en-IN', { hour12: false })}
          </span>

          {/* Language switcher */}
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
                  language === code ? 'bg-indigo-600 text-white shadow-sm' : 'text-slate-600 hover:bg-slate-200/60'
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          <button
            onClick={() => setIsIncidentModalOpen(true)}
            className="flex items-center gap-1.5 text-[12px] font-semibold px-3 py-1.5 rounded-lg border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 hover:border-slate-300 shadow-sm transition"
          >
            <Plus className="w-3.5 h-3.5 text-indigo-600" /> {t('logIncident')} <span className="vp-mono text-slate-400 font-normal">{incidents.length}</span>
          </button>
          <button
            onClick={() => setIsUnitModalOpen(true)}
            className="hidden sm:flex items-center gap-1.5 text-[12px] font-semibold px-3 py-1.5 rounded-lg border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 hover:border-slate-300 shadow-sm transition"
          >
            <Shield className="w-3.5 h-3.5 text-indigo-600" /> {t('registerUnit')} <span className="vp-mono text-slate-400 font-normal">{units.length}</span>
          </button>
          <button
            onClick={() => setIsRoadModalOpen(true)}
            className="hidden md:flex items-center gap-1.5 text-[12px] font-semibold px-3 py-1.5 rounded-lg border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 hover:border-slate-300 shadow-sm transition"
          >
            <Route className="w-3.5 h-3.5 text-indigo-600" /> {t('roadBlock')} <span className="vp-mono text-slate-400 font-normal">{blockedRoads.length}</span>
          </button>
        </div>
      </header>

      {/* ── Feed integrity strip ────────────────────────── */}
      <SourceStatusBar sources={sources} onRefresh={loadData} loading={loadingSources} />

      {/* ── Body: rail + main ───────────────────────────── */}
      <div className="flex-1 flex overflow-hidden">
        {/* Left nav rail */}
        <nav
          className="w-[210px] flex flex-col justify-between px-3 py-4 border-r shrink-0 z-[600] bg-white border-slate-200"
        >
          <div className="flex flex-col gap-1">
            <div className="px-3 pb-2 text-[10px] font-bold uppercase tracking-[.16em] text-slate-400">Operations</div>
            {NAV.map(({ id, label, Icon }) => (
              <button
                key={id}
                onClick={() => setView(id)}
                title={label}
                className={`relative w-full h-10 rounded-xl px-3 flex items-center gap-3 transition text-left ${
                  view === id
                    ? 'bg-indigo-50 text-indigo-700 font-bold shadow-sm'
                    : 'text-slate-600 hover:bg-slate-50 font-medium'
                }`}
              >
                {view === id && <span className="absolute left-1 top-2.5 bottom-2.5 w-1 rounded-full bg-indigo-600" />}
                <Icon className={`w-[18px] h-[18px] ${view === id ? 'text-indigo-600' : 'text-slate-400'}`} />
                <span className="text-[13px]">{label}</span>
              </button>
            ))}

            {/* Pending approvals badge */}
            {pendingApprovals > 0 && (
              <button
                onClick={() => { setView('map'); setActiveTab('preposition'); }}
                title={`${pendingApprovals} approvals pending`}
                className="mt-1 w-full h-10 rounded-xl flex items-center gap-3 px-3 relative text-amber-700 hover:bg-amber-50 font-medium transition"
              >
                <Compass className="w-[18px] h-[18px] text-amber-600" />
                <span className="text-[13px]">Prepositioning</span>
                <span className="ml-auto px-1.5 py-0.5 bg-amber-100 text-amber-800 text-[10px] font-extrabold rounded-full border border-amber-200">
                  {pendingApprovals}
                </span>
              </button>
            )}
          </div>

          {/* Bottom Card - matching the Shopster reference callout card */}
          <div className="rounded-xl border border-indigo-100 bg-gradient-to-b from-indigo-50/70 to-white p-3 shadow-sm">
            <div className="flex items-center gap-2 mb-1.5">
              <div className="w-6 h-6 rounded-lg bg-indigo-600 flex items-center justify-center text-white">
                <ShieldAlert className="w-3.5 h-3.5" />
              </div>
              <span className="text-[11px] font-bold text-slate-800">Hyderabad Control</span>
            </div>
            <p className="text-[10px] text-slate-500 leading-relaxed mb-2">
              Advisory engine live. Officer authorization required before deployment.
            </p>
            <button
              onClick={() => { setView('map'); setActiveTab('zones'); }}
              className="w-full py-1.5 text-[11px] font-bold rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white shadow-sm transition text-center"
            >
              Inspect Hotspots
            </button>
          </div>
        </nav>

        {/* Main area */}
        <main className="flex-1 relative overflow-hidden bg-[#f5f6f8]">
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
              className="w-[23rem] max-w-[45vw] flex flex-col border-l z-[400] h-full shadow-lg bg-white border-slate-200"
            >
              {/* Tab Navigation matching reference tab style */}
              <div className="flex border-b border-slate-200 px-2 pt-2 gap-1 text-[12px] shrink-0 bg-white">
                {[
                  { id: 'zones', label: t('zones'), Icon: ShieldAlert },
                  { id: 'preposition', label: t('prepare'), Icon: Compass },
                  { id: 'incidents', label: t('incidents'), Icon: Flame },
                ].map(({ id, label, Icon }) => (
                  <button
                    key={id}
                    onClick={() => setActiveTab(id)}
                    className={`relative flex-1 pb-2.5 pt-1 font-semibold transition flex items-center justify-center gap-1.5 border-b-2 ${
                      activeTab === id
                        ? 'border-indigo-600 text-indigo-700'
                        : 'border-transparent text-slate-500 hover:text-slate-800'
                    }`}
                  >
                    <Icon className={`w-3.5 h-3.5 ${activeTab === id ? 'text-indigo-600' : 'text-slate-400'}`} />
                    {label}
                    {id === 'preposition' && prepositionSuggestions.length > 0 && (
                      <span className="ml-1 px-1.5 py-0.2 bg-amber-100 text-amber-800 text-[10px] font-bold rounded-full border border-amber-200">
                        {prepositionSuggestions.length}
                      </span>
                    )}
                  </button>
                ))}
              </div>

              <div className="flex-1 overflow-y-auto p-3.5 flex flex-col gap-3 bg-[#f8fafc]">
                {activeTab === 'zones' && (
                  <div className="flex flex-col gap-3 vp-enter">
                    {selectedZone ? (
                      <RiskZonePanel
                        zone={selectedZone}
                        weather={zoneWeather.find(item => item.zone_id === selectedZone.id)}
                        onClose={() => setSelectedZone(null)}
                        onGenerateRoute={handleGenerateRoute}
                        loadingRoute={loadingRoute}
                      />
                    ) : (
                      <div className="rounded-xl border border-dashed border-slate-300 bg-white p-3.5 text-[12px] text-center text-slate-500 shadow-sm">
                        {t('inspectMap')}
                      </div>
                    )}

                    <div className="flex items-center justify-between mt-1">
                      <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
                        {t('monitoredWards')} ({riskZones.length})
                      </span>
                      <Layers className="w-3.5 h-3.5 text-slate-400" />
                    </div>

                    <div className="flex flex-col gap-2">
                      {[...riskZones].sort((a, b) => (b.risk_level || 0) - (a.risk_level || 0)).map((z) => (
                        <button
                          key={z.id}
                          onClick={() => setSelectedZone(z)}
                          className={`w-full p-3 text-left transition flex items-center justify-between rounded-xl border bg-white shadow-sm hover:shadow hover:border-slate-300 ${
                            selectedZone?.id === z.id
                              ? 'border-indigo-500 ring-2 ring-indigo-100'
                              : 'border-slate-200'
                          }`}
                        >
                          <div className="min-w-0 pr-2">
                            <div className="font-bold text-slate-900 text-[13px] truncate">{z.name}</div>
                            <div className="vp-mono text-[10px] text-slate-500 mt-0.5">
                              {t('elevation')} {z.explanation?.mean_elevation_m?.toFixed(1) ?? '–'}m · {t('rain')} {z.explanation?.rainfall_24h_mm?.toFixed(1) ?? '0.0'}mm
                            </div>
                          </div>
                          <span
                            className={`shrink-0 w-8 h-8 rounded-lg flex items-center justify-center vp-mono text-[12px] font-extrabold ${
                              z.risk_level >= 4 ? 'bg-red-50 text-red-700 border border-red-200' :
                              z.risk_level === 3 ? 'bg-amber-50 text-amber-700 border border-amber-200' :
                              z.risk_level === 2 ? 'bg-yellow-50 text-yellow-700 border border-yellow-200' :
                              'bg-emerald-50 text-emerald-700 border border-emerald-200'
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
                  <div className="vp-enter">
                    <PrepositionPanel
                      suggestions={prepositionSuggestions}
                      onApprove={handleApprovePreposition}
                    />
                  </div>
                )}

                {activeTab === 'incidents' && (
                  <div className="flex flex-col gap-3 vp-enter">
                    <div className="flex items-center justify-between">
                      <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500">{t('loggedIncidents')} ({incidents.length})</span>
                      <button
                        onClick={() => setIsIncidentModalOpen(true)}
                        className="text-indigo-600 text-[11px] hover:underline flex items-center gap-1 font-semibold"
                      >
                        <Plus className="w-3 h-3" /> {t('addIncident')}
                      </button>
                    </div>

                    {incidents.length === 0 ? (
                      <div className="rounded-xl border border-slate-200 bg-white p-5 text-center text-[12px] text-slate-500 shadow-sm">
                        <CheckCircle2 className="w-6 h-6 text-emerald-500 mx-auto mb-1.5" />
                        <div className="text-slate-800 font-semibold">{t('noIncidents')}</div>
                        <div className="text-[11px] mt-1 text-slate-400">{t('noIncidentsHint')}</div>
                      </div>
                    ) : (
                      incidents.map((inc) => (
                        <div key={inc.id} className="rounded-xl border border-slate-200 bg-white p-3 text-[12px] flex flex-col gap-1.5 shadow-sm">
                          <div className="flex items-center justify-between">
                            <span className="font-bold text-slate-800 uppercase tracking-wide text-[10px] px-2 py-0.5 rounded-full bg-slate-100 border border-slate-200">
                              {inc.type} · U{inc.urgency}
                            </span>
                            <span className="vp-mono text-[10px] text-slate-400">
                              {new Date(inc.timestamp).toLocaleTimeString()}
                            </span>
                          </div>
                          <div className="text-slate-800 font-medium leading-snug">{inc.message}</div>
                          <div className="text-[11px] flex items-center justify-between text-slate-500 pt-1 border-t border-slate-100">
                            <span>{t('people')}: <strong className="text-slate-700">{inc.people}</strong></span>
                            <span className="text-slate-400">{inc.source}</span>
                          </div>
                        </div>
                      ))
                    )}

                    <div className="mt-2 pt-3 border-t border-slate-200 flex items-center justify-between">
                      <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500">{t('registeredUnits')} ({units.length})</span>
                      <button
                        onClick={() => setIsUnitModalOpen(true)}
                        className="text-indigo-600 text-[11px] hover:underline flex items-center gap-1 font-semibold"
                      >
                        <Plus className="w-3 h-3" /> {t('registerUnit')}
                      </button>
                    </div>

                    {units.length === 0 ? (
                      <div className="rounded-xl border border-slate-200 bg-white p-5 text-center text-[12px] text-slate-500 shadow-sm">
                        <Shield className="w-6 h-6 mx-auto mb-1.5 text-slate-300" />
                        <div className="text-slate-800 font-semibold">{t('noUnits')}</div>
                        <div className="text-[11px] mt-1 text-slate-400">{t('unitsHint')}</div>
                      </div>
                    ) : (
                      units.map((u) => (
                        <div key={u.id} className="rounded-xl border border-slate-200 bg-white p-3 text-[12px] flex items-center justify-between shadow-sm">
                          <div className="min-w-0">
                            <div className="font-bold text-slate-800 flex items-center gap-1.5">
                              <span>{u.kind === 'rescue_boat' ? '⛵' : u.kind === 'ambulance' ? '🚑' : '🚔'}</span>
                              <span className="truncate">{u.id}</span>
                              <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-slate-100 text-slate-600 capitalize shrink-0 border border-slate-200">
                                {u.kind.replace('_', ' ')}
                              </span>
                            </div>
                            <div className="text-[10px] mt-0.5 text-slate-400">{u.station}</div>
                          </div>
                          <span className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded-full shrink-0 border ${
                            u.status === 'available'
                              ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                              : 'bg-slate-100 text-slate-500 border-slate-200'
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
            <div className="absolute inset-0 z-[450] overflow-y-auto bg-[#f5f6f8]">
              <div className="max-w-[1420px] mx-auto p-6 lg:p-8">
                {/* Header Card matching the Shopster user profile card */}
                <div className="mb-6 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
                  <div className="flex flex-wrap items-center justify-between gap-4">
                    <div className="flex items-center gap-4">
                      <div className="w-14 h-14 rounded-2xl bg-indigo-600 flex items-center justify-center text-white shadow-md">
                        <Siren className="w-7 h-7" />
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <h1 className="text-xl font-extrabold tracking-tight text-slate-900">
                            Hyderabad Police Disaster Response
                          </h1>
                          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" /> Active System
                          </span>
                          <span className="text-xs text-slate-400 font-mono">Control ID: #HYD-2026</span>
                        </div>
                        <p className="mt-0.5 text-xs text-slate-500">
                          Multi-Agent Flood & Disaster Decision Support · Powered by Groq Llama/Qwen & Google Gemini 2.5
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      <div className="flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-semibold text-slate-600">
                        <span className={`h-2.5 w-2.5 rounded-full ${maxRisk >= 4 ? 'bg-red-500' : maxRisk === 3 ? 'bg-amber-500' : 'bg-emerald-500'}`}/>
                        {alertTone.label} Risk · {riskZones.length} Hotspots
                      </div>
                    </div>
                  </div>

                  {/* Clean Tab Bar matching reference */}
                  <div className="mt-6 pt-4 border-t border-slate-100 flex items-center gap-6 text-xs font-semibold text-slate-500">
                    <span className="text-indigo-600 border-b-2 border-indigo-600 pb-2 -mb-[17px] font-bold">
                      Agent Intelligence
                    </span>
                    <button onClick={() => setView('map')} className="hover:text-slate-900 transition">
                      Tactical Spatial Map
                    </button>
                    <button onClick={() => { setView('map'); setActiveTab('preposition'); }} className="hover:text-slate-900 transition">
                      Prepositioning Queue ({prepositionSuggestions.length})
                    </button>
                    <button onClick={() => { setView('map'); setActiveTab('incidents'); }} className="hover:text-slate-900 transition">
                      Active Incidents ({incidents.length})
                    </button>
                  </div>
                </div>

                {/* Banner Callout matching the Shopster blue banner */}
                <div className="mb-6 rounded-2xl border border-sky-100 bg-gradient-to-r from-sky-50 to-indigo-50/50 p-4 shadow-sm flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-xl bg-sky-500 flex items-center justify-center text-white shrink-0 shadow-sm">
                      <Activity className="w-5 h-5" />
                    </div>
                    <div>
                      <div className="font-bold text-slate-900 text-sm">Autonomous Advisory Intelligence Online</div>
                      <div className="text-xs text-slate-600">
                        Live telemetry ingestion across 6 Hyderabad Traffic Police waterlogging points via Open-Meteo & GloFAS river discharge.
                      </div>
                    </div>
                  </div>
                  <div className="text-right hidden sm:block">
                    <span className="text-[11px] font-semibold text-slate-500">Citywide Status</span>
                    <div className="text-xs font-extrabold text-indigo-700">Advisory Mode (Human-in-the-Loop)</div>
                  </div>
                </div>

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
