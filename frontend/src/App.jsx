import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  Activity, Bot, CheckCircle2, ChevronDown, Compass, Flame, Layers, Map as MapIcon, Plus, Route, Shield,
  ShieldAlert, Siren
} from 'lucide-react';
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
  const [isNewMenuOpen, setIsNewMenuOpen] = useState(false);

  const [view, setView] = useState('agents'); // 'map' | 'agents'
  const [entered, setEntered] = useState(false);
  const [activeTab, setActiveTab] = useState('zones'); // 'zones' | 'preposition' | 'incidents'
  const [clock, setClock] = useState(new Date());

  const newMenuRef = useRef(null);

  // Close dropdown on click outside
  useEffect(() => {
    function handleClickOutside(event) {
      if (newMenuRef.current && !newMenuRef.current.contains(event.target)) {
        setIsNewMenuOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

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
      return result;
    } catch (err) {
      const msg = err.message || 'Agent failed to respond.';
      setAgentErrors(previous => ({ ...previous, [agentId]: msg }));
      return null;
    } finally {
      setLoadingAgent(null);
    }
  };

  useEffect(() => {
    loadData();
    const interval = setInterval(loadData, 45000);
    return () => clearInterval(interval);
  }, [loadData]);

  useEffect(() => {
    const timer = setInterval(() => setClock(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  const handleRegisterUnit = async (unitData) => {
    await registerUnit(unitData);
    await loadData();
  };

  const handleReportIncident = async (incidentData) => {
    await reportIncident(incidentData);
    await loadData();
  };

  const handleReportRoad = async (roadData) => {
    await reportBlockedRoad(roadData);
    await loadData();
  };

  const handleApprovePreposition = async (id, unitId, targetZoneName) => {
    await approvePrepositioning(id, unitId, targetZoneName);
    await loadData();
  };

  const handleGenerateRoute = async (zoneId, targetType = 'shelter') => {
    setLoadingRoute(true);
    try {
      const res = await generateEvacuationRoute(zoneId, targetType);
      setActiveRoute(res);
    } catch (err) {
      alert(`Routing failed: ${err.message}`);
    } finally {
      setLoadingRoute(false);
    }
  };

  const maxRisk = riskZones.reduce((m, z) => Math.max(m, z.risk_level || 0), 0);
  const alertTone =
    maxRisk >= 4 ? { dot: '#DC2626', label: 'Critical' } :
    maxRisk === 3 ? { dot: '#D97706', label: 'Elevated' } :
    { dot: '#16A34A', label: 'Nominal' };

  const pendingApprovals = prepositionSuggestions.length;
  const aiEngineOnline = Boolean(agentStatus?.configured || agentStatus?.groq_configured);

  if (!entered) return <Landing onEnter={() => setEntered(true)} />;

  return (
    <div className="flex flex-col h-screen w-screen overflow-hidden bg-[#F8FAFC] text-[#0F172A]">
      {/* ── Top Bar: Strict 56px height, vertically centered, 16px gaps ── */}
      <header className="flex items-center justify-between px-6 h-[56px] border-b border-[#E2E8F0] bg-white shrink-0 z-[700]">
        <div className="flex items-center gap-4">
          {/* Brand */}
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-[6px] bg-[#4338CA] flex items-center justify-center text-white">
              <Siren className="w-4 h-4 text-white" strokeWidth={1.5} />
            </div>
            <div>
              <div className="font-semibold text-[14px] text-[#0F172A] leading-tight">Vanta Protocol</div>
              <div className="text-[12px] text-[#64748B] leading-tight">{t('area')}</div>
            </div>
          </div>

          <div className="h-4 w-px bg-[#E2E8F0] mx-1" />

          {/* AI Engine Status Text */}
          <div className="hidden sm:flex items-center gap-2 text-[12px] text-[#475569]">
            <span
              className="w-2 h-2 rounded-full"
              style={{ backgroundColor: aiEngineOnline ? '#16A34A' : '#64748B' }}
            />
            <span>AI engine: {aiEngineOnline ? 'online' : 'offline'}</span>
          </div>

          <div className="h-4 w-px bg-[#E2E8F0] mx-1 hidden sm:block" />

          {/* Risk Level */}
          <div className="hidden md:flex items-center gap-2 text-[12px] text-[#475569]">
            <span
              className="w-2 h-2 rounded-full"
              style={{ backgroundColor: alertTone.dot }}
            />
            <span>Risk: {alertTone.label}</span>
          </div>
        </div>

        {/* Right side controls */}
        <div className="flex items-center gap-4">
          {/* Clock */}
          <span className="hidden sm:inline vp-mono text-[12px] text-[#64748B]">
            {clock.toLocaleTimeString('en-IN', { hour12: false })}
          </span>

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
                className={`h-7 px-2.5 rounded-[4px] text-[14px] font-medium transition ${
                  language === code
                    ? 'bg-white text-[#0F172A] shadow-xs font-semibold'
                    : 'text-[#64748B] hover:text-[#0F172A]'
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          {/* Single "New" Primary Action Dropdown */}
          <div className="relative" ref={newMenuRef}>
            <button
              onClick={() => setIsNewMenuOpen(prev => !prev)}
              className="h-[36px] px-3.5 rounded-[6px] bg-[#4338CA] hover:bg-[#3730A3] text-white text-[14px] font-medium inline-flex items-center gap-2 transition"
            >
              <Plus className="w-4 h-4 text-white" strokeWidth={1.5} />
              <span>New</span>
              <ChevronDown className="w-3.5 h-3.5 text-white/80" strokeWidth={1.5} />
            </button>

            {isNewMenuOpen && (
              <div className="absolute right-0 mt-1.5 w-56 rounded-[6px] border border-[#E2E8F0] bg-white py-1 shadow-md z-[800]">
                <button
                  onClick={() => { setIsNewMenuOpen(false); setIsIncidentModalOpen(true); }}
                  className="w-full px-3 py-2 text-left text-[14px] text-[#0F172A] hover:bg-[#F8FAFC] flex items-center justify-between transition"
                >
                  <span className="flex items-center gap-2">
                    <Flame className="w-4 h-4 text-[#475569]" strokeWidth={1.5} />
                    {t('logIncident')}
                  </span>
                  {incidents.length > 0 && (
                    <span className="vp-mono text-[12px] text-[#64748B]">{incidents.length}</span>
                  )}
                </button>
                <button
                  onClick={() => { setIsNewMenuOpen(false); setIsUnitModalOpen(true); }}
                  className="w-full px-3 py-2 text-left text-[14px] text-[#0F172A] hover:bg-[#F8FAFC] flex items-center justify-between transition"
                >
                  <span className="flex items-center gap-2">
                    <Shield className="w-4 h-4 text-[#475569]" strokeWidth={1.5} />
                    {t('registerUnit')}
                  </span>
                  {units.length > 0 && (
                    <span className="vp-mono text-[12px] text-[#64748B]">{units.length}</span>
                  )}
                </button>
                <button
                  onClick={() => { setIsNewMenuOpen(false); setIsRoadModalOpen(true); }}
                  className="w-full px-3 py-2 text-left text-[14px] text-[#0F172A] hover:bg-[#F8FAFC] flex items-center justify-between transition"
                >
                  <span className="flex items-center gap-2">
                    <Route className="w-4 h-4 text-[#475569]" strokeWidth={1.5} />
                    {t('roadBlock')}
                  </span>
                  {blockedRoads.length > 0 && (
                    <span className="vp-mono text-[12px] text-[#64748B]">{blockedRoads.length}</span>
                  )}
                </button>
              </div>
            )}
          </div>
        </div>
      </header>

      {/* ── Main Layout: Sidebar + Viewport ── */}
      <div className="flex-1 flex overflow-hidden">
        {/* Left Nav Rail: Collapses to icon rail below 1024px */}
        <nav className="w-14 lg:w-48 flex flex-col justify-between py-4 border-r border-[#E2E8F0] shrink-0 z-[600] bg-white">
          <div className="flex flex-col gap-1 px-2">
            <div className="px-2 pb-2 text-[12px] font-medium text-[#64748B] hidden lg:block">
              Navigation
            </div>
            {NAV.map(({ id, label, Icon }) => (
              <button
                key={id}
                onClick={() => setView(id)}
                title={label}
                className={`relative h-[36px] rounded-[6px] px-3 flex items-center gap-3 transition text-left ${
                  view === id
                    ? 'bg-[#EEF2FF] text-[#4338CA] font-medium'
                    : 'text-[#475569] hover:bg-[#F8FAFC] hover:text-[#0F172A]'
                }`}
              >
                {view === id && (
                  <span className="absolute left-0 top-1 bottom-1 w-[3px] rounded-r bg-[#4338CA]" />
                )}
                <Icon
                  className={`w-4 h-4 shrink-0 ${view === id ? 'text-[#4338CA]' : 'text-[#64748B]'}`}
                  strokeWidth={1.5}
                />
                <span className="text-[14px] hidden lg:inline">{label}</span>
              </button>
            ))}

            {pendingApprovals > 0 && (
              <button
                onClick={() => { setView('map'); setActiveTab('preposition'); }}
                title={`${pendingApprovals} approvals pending`}
                className="h-[36px] rounded-[6px] px-3 flex items-center gap-3 text-[#D97706] hover:bg-[#FEF3C7]/40 transition text-left mt-1"
              >
                <Compass className="w-4 h-4 text-[#D97706] shrink-0" strokeWidth={1.5} />
                <span className="text-[14px] hidden lg:inline">Prepositioning</span>
                <span className="ml-auto px-1.5 py-0.2 bg-[#FEF3C7] text-[#D97706] text-[11px] font-semibold rounded-[4px] border border-[#FDE68A] hidden lg:inline">
                  {pendingApprovals}
                </span>
              </button>
            )}
          </div>

          <div className="px-3 text-[12px] text-[#64748B] hidden lg:block">
            <span>Control ID #HYD-2026</span>
          </div>
        </nav>

        {/* Main Content Area */}
        <main className="flex-1 relative overflow-hidden bg-[#F8FAFC]">
          {/* MAP VIEW */}
          <div
            className="absolute inset-0 flex"
            style={{
              visibility: view === 'map' ? 'visible' : 'hidden',
              pointerEvents: view === 'map' ? 'auto' : 'none'
            }}
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
                <div className="absolute bottom-6 left-6 z-[500] w-80">
                  <EvacuationPanel
                    route={activeRoute}
                    onClose={() => setActiveRoute(null)}
                    onClearRoute={() => setActiveRoute(null)}
                  />
                </div>
              )}
            </div>

            {/* Tactical Map Right Panel: 360px wide, white, one left hairline border */}
            <aside className="w-[360px] max-w-[45vw] flex flex-col border-l border-[#E2E8F0] z-[400] h-full bg-white">
              {/* Underline tab bar */}
              <div className="flex border-b border-[#E2E8F0] px-4 gap-6 text-[14px] shrink-0">
                {[
                  { id: 'zones', label: t('zones') },
                  { id: 'preposition', label: t('prepare'), badge: prepositionSuggestions.length },
                  { id: 'incidents', label: t('incidents'), badge: incidents.length },
                ].map(({ id, label, badge }) => (
                  <button
                    key={id}
                    onClick={() => setActiveTab(id)}
                    className={`relative py-3 font-medium transition flex items-center gap-1.5 ${
                      activeTab === id
                        ? 'text-[#4338CA] font-semibold'
                        : 'text-[#64748B] hover:text-[#0F172A]'
                    }`}
                  >
                    <span>{label}</span>
                    {badge > 0 && (
                      <span className="text-[12px] px-1.5 py-0.2 rounded-full bg-[#F1F5F9] text-[#475569] font-medium">
                        {badge}
                      </span>
                    )}
                    {activeTab === id && (
                      <span className="absolute bottom-0 left-0 right-0 h-[2px] bg-[#4338CA]" />
                    )}
                  </button>
                ))}
              </div>

              {/* Panel Content */}
              <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-4">
                {activeTab === 'zones' && (
                  <div className="flex flex-col gap-4">
                    {selectedZone ? (
                      <RiskZonePanel
                        zone={selectedZone}
                        weather={zoneWeather.find(item => item.zone_id === selectedZone.id)}
                        onClose={() => setSelectedZone(null)}
                        onGenerateRoute={handleGenerateRoute}
                        loadingRoute={loadingRoute}
                      />
                    ) : (
                      <div className="py-2 text-[12px] text-[#64748B]">
                        {t('inspectMap')}
                      </div>
                    )}

                    <div className="flex items-center justify-between pt-2 border-t border-[#E2E8F0]">
                      <span className="text-[12px] font-medium text-[#64748B]">
                        {t('monitoredWards')} ({riskZones.length})
                      </span>
                    </div>

                    <div className="flex flex-col divide-y divide-[#E2E8F0] border-t border-b border-[#E2E8F0]">
                      {[...riskZones].sort((a, b) => (b.risk_level || 0) - (a.risk_level || 0)).map((z) => (
                        <button
                          key={z.id}
                          onClick={() => setSelectedZone(z)}
                          className={`w-full min-h-[40px] py-2 px-1 text-left flex items-center justify-between transition hover:bg-[#F8FAFC] ${
                            selectedZone?.id === z.id ? 'bg-[#EEF2FF]/60' : ''
                          }`}
                        >
                          <div className="min-w-0 pr-2">
                            <div className="text-[14px] font-medium text-[#0F172A] truncate">{z.name}</div>
                            <div className="vp-mono text-[12px] text-[#64748B]">
                              {t('elevation')} {z.explanation?.mean_elevation_m?.toFixed(1) ?? '–'}m · {t('rain')} {z.explanation?.rainfall_24h_mm?.toFixed(1) ?? '0.0'}mm
                            </div>
                          </div>
                          <span
                            className="shrink-0 px-2 py-0.5 rounded-[4px] text-[12px] font-semibold vp-mono"
                            style={{
                              backgroundColor: z.risk_level >= 4 ? '#FEE2E2' : z.risk_level === 3 ? '#FEF3C7' : '#DCFCE7',
                              color: z.risk_level >= 4 ? '#DC2626' : z.risk_level === 3 ? '#D97706' : '#16A34A',
                            }}
                          >
                            L{z.risk_level}
                          </span>
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {activeTab === 'preposition' && (
                  <PrepositionPanel
                    suggestions={prepositionSuggestions}
                    onApprove={handleApprovePreposition}
                  />
                )}

                {activeTab === 'incidents' && (
                  <div className="flex flex-col gap-4">
                    <div className="flex items-center justify-between">
                      <span className="text-[12px] font-medium text-[#64748B]">
                        {t('loggedIncidents')} ({incidents.length})
                      </span>
                      <button
                        onClick={() => setIsIncidentModalOpen(true)}
                        className="text-[#4338CA] text-[12px] font-medium hover:underline flex items-center gap-1"
                      >
                        <Plus className="w-3.5 h-3.5" strokeWidth={1.5} />
                        <span>{t('addIncident')}</span>
                      </button>
                    </div>

                    {incidents.length === 0 ? (
                      <div className="py-6 text-center text-[12px] text-[#64748B]">
                        No active incidents recorded.
                      </div>
                    ) : (
                      <div className="flex flex-col divide-y divide-[#E2E8F0] border-t border-b border-[#E2E8F0]">
                        {incidents.map((inc) => (
                          <div key={inc.id} className="py-2.5 flex flex-col gap-1">
                            <div className="flex items-center justify-between">
                              <span className="text-[12px] font-medium text-[#0F172A] uppercase">
                                {inc.type} · Urgency {inc.urgency}
                              </span>
                              <span className="vp-mono text-[12px] text-[#64748B]">
                                {new Date(inc.timestamp).toLocaleTimeString()}
                              </span>
                            </div>
                            <div className="text-[14px] text-[#334155]">{inc.message}</div>
                            <div className="text-[12px] flex items-center justify-between text-[#64748B]">
                              <span>{t('people')}: <strong className="text-[#0F172A] font-medium">{inc.people}</strong></span>
                              <span>{inc.source}</span>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}

                    <div className="pt-2 flex items-center justify-between border-t border-[#E2E8F0]">
                      <span className="text-[12px] font-medium text-[#64748B]">
                        {t('registeredUnits')} ({units.length})
                      </span>
                      <button
                        onClick={() => setIsUnitModalOpen(true)}
                        className="text-[#4338CA] text-[12px] font-medium hover:underline flex items-center gap-1"
                      >
                        <Plus className="w-3.5 h-3.5" strokeWidth={1.5} />
                        <span>{t('registerUnit')}</span>
                      </button>
                    </div>

                    {units.length === 0 ? (
                      <div className="py-4 text-center text-[12px] text-[#64748B]">
                        No field units registered.
                      </div>
                    ) : (
                      <div className="flex flex-col divide-y divide-[#E2E8F0] border-t border-b border-[#E2E8F0]">
                        {units.map((u) => (
                          <div key={u.id} className="py-2 flex items-center justify-between">
                            <div>
                              <div className="text-[14px] font-medium text-[#0F172A]">{u.id}</div>
                              <div className="text-[12px] text-[#64748B]">{u.kind.replace('_', ' ')} · {u.station}</div>
                            </div>
                            <span
                              className="text-[12px] px-2 py-0.5 rounded-[4px] font-medium"
                              style={{
                                backgroundColor: u.status === 'available' ? '#DCFCE7' : '#F1F5F9',
                                color: u.status === 'available' ? '#16A34A' : '#64748B',
                              }}
                            >
                              {u.status === 'available' ? t('available') : u.status}
                            </span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            </aside>
          </div>

          {/* AI AGENTS WORKBENCH VIEW */}
          {view === 'agents' && (
            <div className="absolute inset-0 z-[450] overflow-y-auto bg-[#F8FAFC]">
              <div className="max-w-[1200px] mx-auto px-4 sm:px-8 py-8 pb-16 flex flex-col gap-8">
                {/* ONE SLIM PAGE HEADER BAND */}
                <div className="border-b border-[#E2E8F0] pb-4 flex flex-col gap-4">
                  <div className="flex flex-wrap items-center justify-between gap-4">
                    <div>
                      <h1 className="text-[20px] font-semibold text-[#0F172A] tracking-tight">
                        Hyderabad Police Disaster Response
                      </h1>
                      <div className="flex items-center gap-3 mt-1 text-[12px] text-[#64748B]">
                        <span className="flex items-center gap-1.5 text-[#16A34A] font-medium">
                          <span className="w-2 h-2 rounded-full bg-[#16A34A]" />
                          Active system
                        </span>
                        <span>·</span>
                        <span>{alertTone.label} risk · {riskZones.length} hotspots monitored</span>
                      </div>
                    </div>

                    {/* Underline Tab Bar (Clean, no redundant Tactical Map) */}
                    <div className="flex items-center gap-6 text-[14px]">
                      <span className="text-[#4338CA] font-semibold relative py-2">
                        Agent Intelligence
                        <span className="absolute bottom-0 left-0 right-0 h-[2px] bg-[#4338CA]" />
                      </span>
                      <button
                        onClick={() => { setView('map'); setActiveTab('preposition'); }}
                        className="text-[#64748B] hover:text-[#0F172A] py-2 font-medium transition flex items-center gap-1.5"
                      >
                        <span>Prepositioning Queue</span>
                        {prepositionSuggestions.length > 0 && (
                          <span className="text-[12px] px-1.5 py-0.2 rounded-full bg-[#F1F5F9] text-[#475569]">
                            {prepositionSuggestions.length}
                          </span>
                        )}
                      </button>
                      <button
                        onClick={() => { setView('map'); setActiveTab('incidents'); }}
                        className="text-[#64748B] hover:text-[#0F172A] py-2 font-medium transition flex items-center gap-1.5"
                      >
                        <span>Active Incidents</span>
                        {incidents.length > 0 && (
                          <span className="text-[12px] px-1.5 py-0.2 rounded-full bg-[#F1F5F9] text-[#475569]">
                            {incidents.length}
                          </span>
                        )}
                      </button>
                    </div>
                  </div>
                </div>

                {/* Single Primary Surface & Agent Workspace */}
                <AgentPanel
                  status={agentStatus}
                  results={agentResults}
                  errors={agentErrors}
                  loadingAgent={loadingAgent}
                  onRun={handleRunAgent}
                  onReviewPreparation={() => { setView('map'); setActiveTab('preposition'); }}
                  riskZones={riskZones}
                />

                {/* Clean Footer note */}
                <div className="pt-8 border-t border-[#E2E8F0] flex flex-wrap items-center justify-between gap-4 text-[12px] text-[#64748B]">
                  <span>Vanta Protocol · CipherCop 2026 · Hyderabad Police AI Control Room</span>
                  <span>Powered by Groq Qwen & Google Gemini 2.5 · Officer verification required prior to dispatch.</span>
                </div>
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
