import React, { useState, useEffect, useCallback } from 'react';
import { 
  ShieldAlert, Compass, Plus, AlertCircle, Shield, Route, Brain,
  MapPin, CheckCircle2, ChevronRight, Layers, Flame, RefreshCw 
} from 'lucide-react';
import SourceStatusBar from './components/SourceStatusBar';
import Map from './components/Map';
import RiskZonePanel from './components/RiskZonePanel';
import EvacuationPanel from './components/EvacuationPanel';
import PrepositionPanel from './components/PrepositionPanel';
import UnitRegisterModal from './components/UnitRegisterModal';
import IncidentIntakeModal from './components/IncidentIntakeModal';
import BlockedRoadModal from './components/BlockedRoadModal';
import AgentPanel from './components/AgentPanel';
import { useLanguage } from './i18n.jsx';
import { 
  fetchSources, fetchRiskZones, fetchUnits, registerUnit, 
  fetchIncidents, reportIncident, fetchPrepositionSuggestions, 
  approvePrepositioning, generateEvacuationRoute, fetchBlockedRoads, reportBlockedRoad,
  fetchZoneWeather, fetchAgentStatus, runPredictPrepareAgents
} from './api';

export default function App() {
  const { language, setLanguage, t } = useLanguage();
  const [sources, setSources] = useState([]);
  const [riskZones, setRiskZones] = useState([]);
  const [zoneWeather, setZoneWeather] = useState([]);
  const [agentStatus, setAgentStatus] = useState(null);
  const [agentRun, setAgentRun] = useState(null);
  const [agentError, setAgentError] = useState('');
  const [loadingAgents, setLoadingAgents] = useState(false);
  const [units, setUnits] = useState([]);
  const [incidents, setIncidents] = useState([]);
  const [blockedRoads, setBlockedRoads] = useState([]);
  const [prepositionSuggestions, setPrepositionSuggestions] = useState([]);

  const [selectedZone, setSelectedZone] = useState(null);
  const [activeRoute, setActiveRoute] = useState(null);

  const [loadingSources, setLoadingSources] = useState(false);
  const [loadingRisk, setLoadingRisk] = useState(false);
  const [loadingRoute, setLoadingRoute] = useState(false);

  // Modals
  const [isUnitModalOpen, setIsUnitModalOpen] = useState(false);
  const [isIncidentModalOpen, setIsIncidentModalOpen] = useState(false);
  const [isRoadModalOpen, setIsRoadModalOpen] = useState(false);

  // Active Tab in Sidebar: 'zones' | 'preposition' | 'incidents'
  const [activeTab, setActiveTab] = useState('zones');

  // Load all initial state
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

  const handleRunAgents = async (confirmGoogleProcessing) => {
    setLoadingAgents(true);
    setAgentError('');
    try {
      const result = await runPredictPrepareAgents(confirmGoogleProcessing);
      setAgentRun(result);
      setPrepositionSuggestions(result.positioning_recommendations || []);
    } catch (err) {
      setAgentError(err.message);
    } finally {
      setLoadingAgents(false);
    }
  };

  useEffect(() => {
    loadData();
    // Auto-refresh sources periodically (every 60s)
    const interval = setInterval(loadData, 60000);
    return () => clearInterval(interval);
  }, [loadData]);

  // Handle Generate Evacuation Route
  const handleGenerateRoute = async (zone) => {
    setLoadingRoute(true);
    try {
      // Zone center coordinate from polygon
      const coords = zone.polygon.coordinates[0];
      const avgLng = coords.reduce((a, b) => a + b[0], 0) / coords.length;
      const avgLat = coords.reduce((a, b) => a + b[1], 0) / coords.length;

      const route = await generateEvacuationRoute(zone.id, zone.name, avgLat, avgLng);
      setActiveRoute(route);
    } catch (err) {
      alert(`Could not calculate route: ${err.message}`);
    } finally {
      setLoadingRoute(false);
    }
  };

  // Handle Unit Registration
  const handleRegisterUnit = async (unitData) => {
    const created = await registerUnit(unitData);
    setUnits(prev => [created, ...prev]);
    // Refresh prepositioning suggestions with the new unit
    const prep = await fetchPrepositionSuggestions().catch(() => []);
    setPrepositionSuggestions(prep);
  };

  // Handle Incident Report
  const handleReportIncident = async (incData) => {
    const created = await reportIncident(incData);
    setIncidents(prev => [created, ...prev]);
  };

  // Handle Blocked Road
  const handleReportRoad = async (roadData) => {
    const created = await reportBlockedRoad(roadData);
    setBlockedRoads(prev => [created, ...prev]);
  };

  // Handle Preposition Approval
  const handleApprovePreposition = async (suggestionId, unitId, targetZoneName) => {
    await approvePrepositioning(suggestionId, unitId, targetZoneName);
    // Refresh units and suggestions
    const [uList, prep] = await Promise.all([
      fetchUnits(),
      fetchPrepositionSuggestions()
    ]);
    setUnits(uList);
    setPrepositionSuggestions(prep);
  };

  return (
    <div className="flex flex-col h-screen w-screen bg-[#080d17] text-gray-100 overflow-hidden text-sm">
      {/* 1. Data Source Freshness Status Bar */}
      <SourceStatusBar 
        sources={sources} 
        onRefresh={loadData} 
        loading={loadingSources} 
      />

      {/* 2. Command Ribbon */}
      <div className="bg-[#111c2d] border-b border-slate-700 px-5 py-3 flex items-center justify-between gap-4 shadow-lg">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <div className="w-2.5 h-2.5 rounded-full bg-cyan-400 animate-pulse"></div>
            <span className="font-extrabold tracking-wide text-white text-base">{t('controlRoom')}</span>
            <span className="text-sm text-gray-300">{t('area')}</span>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1 rounded-lg border border-slate-600 bg-slate-950/80 p-1" aria-label={t('langLabel')}>
            {[['en', 'English'], ['hi', 'हिन्दी'], ['te', 'తెలుగు']].map(([code, label]) => (
              <button key={code} onClick={() => setLanguage(code)} aria-pressed={language === code}
                className={`rounded-md px-2.5 py-1.5 text-xs font-bold transition ${language === code ? 'bg-cyan-500 text-slate-950' : 'text-slate-300 hover:bg-slate-800'}`}>
                {label}
              </button>
            ))}
          </div>
          <button
            onClick={() => setIsIncidentModalOpen(true)}
            className="bg-rose-600 hover:bg-rose-500 text-white text-sm font-bold px-3.5 py-2 rounded-lg flex items-center gap-2 transition shadow"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>{t('logIncident')} ({incidents.length})</span>
          </button>

          <button
            onClick={() => setIsUnitModalOpen(true)}
            className="bg-cyan-600 hover:bg-cyan-500 text-white text-sm font-bold px-3.5 py-2 rounded-lg flex items-center gap-2 transition shadow"
          >
            <Shield className="w-3.5 h-3.5" />
            <span>{t('registerUnit')} ({units.length})</span>
          </button>

          <button
            onClick={() => setIsRoadModalOpen(true)}
            className="bg-amber-600 hover:bg-amber-500 text-white text-sm font-bold px-3.5 py-2 rounded-lg flex items-center gap-2 transition shadow"
          >
            <Route className="w-3.5 h-3.5" />
            <span>{t('roadBlock')} ({blockedRoads.length})</span>
          </button>
        </div>
      </div>

      {/* 3. Main Workspace */}
      <div className="flex-1 flex overflow-hidden relative">
        {/* Map View */}
        <div className="flex-1 h-full relative">
          <Map
            riskZones={riskZones}
            selectedZone={selectedZone}
            onSelectZone={(zone) => {
              setSelectedZone(zone);
              setActiveTab('zones');
            }}
            activeRoute={activeRoute}
            units={units}
            incidents={incidents}
            blockedRoads={blockedRoads}
            prepositionSuggestions={prepositionSuggestions}
          />

          {/* Floating Active Evacuation Corridor Card if open */}
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

        {/* Tactical Control Sidebar */}
        <div className="w-[27rem] max-w-[48vw] bg-[#111827] border-l border-slate-700 flex flex-col z-[400] h-full shadow-2xl">
          {/* Tabs */}
          <div className="flex border-b border-gray-800 bg-gray-900/60 p-1.5 gap-1 text-xs">
            <button
              onClick={() => setActiveTab('zones')}
              className={`flex-1 py-1.5 rounded font-semibold transition flex items-center justify-center gap-1.5 ${
                activeTab === 'zones'
                  ? 'bg-cyan-600 text-white shadow'
                  : 'text-gray-400 hover:text-white hover:bg-gray-800'
              }`}
            >
              <ShieldAlert className="w-3.5 h-3.5" />
              <span>{t('zones')}</span>
            </button>

            <button
              onClick={() => setActiveTab('preposition')}
              className={`flex-1 py-1.5 rounded font-semibold transition flex items-center justify-center gap-1.5 ${
                activeTab === 'preposition'
                  ? 'bg-amber-600 text-white shadow'
                  : 'text-gray-400 hover:text-white hover:bg-gray-800'
              }`}
            >
              <Compass className="w-3.5 h-3.5" />
              <span>{t('prepare')}</span>
              {prepositionSuggestions.length > 0 && (
                <span className="w-4 h-4 bg-amber-400 text-black text-[10px] font-extrabold rounded-full flex items-center justify-center">
                  {prepositionSuggestions.length}
                </span>
              )}
            </button>

            <button
              onClick={() => setActiveTab('agents')}
              className={`flex-1 py-1.5 rounded font-semibold transition flex items-center justify-center gap-1 ${
                activeTab === 'agents'
                  ? 'bg-violet-600 text-white shadow'
                  : 'text-gray-400 hover:text-white hover:bg-gray-800'
              }`}
            >
              <Brain className="w-3.5 h-3.5" />
              <span>{t('agents')}</span>
            </button>

            <button
              onClick={() => setActiveTab('incidents')}
              className={`flex-1 py-1.5 rounded font-semibold transition flex items-center justify-center gap-1.5 ${
                activeTab === 'incidents'
                  ? 'bg-rose-600 text-white shadow'
                  : 'text-gray-400 hover:text-white hover:bg-gray-800'
              }`}
            >
              <Flame className="w-3.5 h-3.5" />
              <span>{t('incidents')}</span>
            </button>
          </div>

          {/* Tab Content */}
          <div className="flex-1 overflow-y-auto p-3 flex flex-col gap-3">
            {activeTab === 'zones' && (
              <div className="flex flex-col gap-3">
                {selectedZone ? (
                  <RiskZonePanel
                    zone={selectedZone}
                    weather={zoneWeather.find(item => item.zone_id === selectedZone.id)}
                    onClose={() => setSelectedZone(null)}
                    onGenerateRoute={handleGenerateRoute}
                    loadingRoute={loadingRoute}
                  />
                ) : (
                  <div className="bg-gray-900/50 border border-gray-800 p-3 rounded-lg text-xs text-gray-400 text-center">
                    {t('inspectMap')}
                  </div>
                )}

                <div className="text-xs font-bold text-gray-300 uppercase tracking-wider flex items-center justify-between">
                  <span>{t('monitoredWards')} ({riskZones.length})</span>
                  <button 
                    onClick={loadData}
                    disabled={loadingRisk}
                    className="text-cyan-400 hover:underline flex items-center gap-1 text-[11px]"
                  >
                    <RefreshCw className={`w-3 h-3 ${loadingRisk ? 'animate-spin' : ''}`} />
                    {t('refresh')}
                  </button>
                </div>

                <div className="flex flex-col gap-2">
                  {riskZones.map((z) => (
                    <div
                      key={z.id}
                      onClick={() => setSelectedZone(z)}
                      className={`p-2.5 rounded-lg border cursor-pointer transition text-xs flex items-center justify-between ${
                        selectedZone && selectedZone.id === z.id
                          ? 'bg-cyan-950/40 border-cyan-500'
                          : 'bg-gray-900/70 border-gray-800 hover:border-gray-700'
                      }`}
                    >
                      <div>
                        <div className="font-bold text-white">{z.name}</div>
                        <div className="text-[10px] text-gray-400 mt-0.5">
                          {t('elevation')}: {z.explanation?.mean_elevation_m?.toFixed(1) || 'N/A'}m | {t('rain')}: {z.explanation?.rainfall_24h_mm?.toFixed(1) || '0.0'}mm
                        </div>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                          z.risk_level >= 4 ? 'bg-red-950 text-red-400 border border-red-800' :
                          z.risk_level === 3 ? 'bg-amber-950 text-amber-400 border border-amber-800' :
                          z.risk_level === 2 ? 'bg-cyan-950 text-cyan-400 border border-cyan-800' :
                          'bg-emerald-950 text-emerald-400 border border-emerald-800'
                        }`}>
                          {t('lvl')} {z.risk_level}
                        </span>
                        <ChevronRight className="w-3.5 h-3.5 text-gray-500" />
                      </div>
                    </div>
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

            {activeTab === 'agents' && (
              <AgentPanel
                status={agentStatus}
                result={agentRun}
                error={agentError}
                loading={loadingAgents}
                onRun={handleRunAgents}
                onReviewPreparation={() => setActiveTab('preposition')}
                riskZones={riskZones}
              />
            )}

            {activeTab === 'incidents' && (
              <div className="flex flex-col gap-3">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-white text-sm">{t('loggedIncidents')} ({incidents.length})</span>
                  <button
                    onClick={() => setIsIncidentModalOpen(true)}
                    className="text-rose-400 text-xs hover:underline flex items-center gap-1"
                  >
                    <Plus className="w-3.5 h-3.5" /> {t('addIncident')}
                  </button>
                </div>

                {incidents.length === 0 ? (
                  <div className="bg-gray-900/50 border border-gray-800 rounded-lg p-4 text-center text-xs text-gray-400">
                    <CheckCircle2 className="w-6 h-6 text-emerald-500 mx-auto mb-1.5" />
                    <div>{t('noIncidents')}</div>
                    <div className="text-xs text-gray-400 mt-1">{t('noIncidentsHint')}</div>
                  </div>
                ) : (
                  incidents.map(inc => (
                    <div key={inc.id} className="bg-gray-900/80 border border-gray-800 rounded-lg p-2.5 text-xs flex flex-col gap-1">
                      <div className="flex items-center justify-between">
                        <span className="font-bold text-rose-400 uppercase tracking-wide text-[10px]">
                          {inc.type} (Urgency {inc.urgency}/5)
                        </span>
                        <span className="text-[10px] text-gray-500">
                          {new Date(inc.timestamp).toLocaleTimeString()}
                        </span>
                      </div>
                      <div className="text-white font-medium">{inc.message}</div>
                      <div className="text-[10px] text-gray-400 flex items-center justify-between mt-1">
                        <span>{t('people')}: {inc.people}</span>
                        <span className="text-gray-500">{inc.source}</span>
                      </div>
                    </div>
                  ))
                )}

                <div className="mt-4 pt-3 border-t border-gray-800 flex items-center justify-between">
                  <span className="font-bold text-white text-sm">{t('registeredUnits')} ({units.length})</span>
                  <button
                    onClick={() => setIsUnitModalOpen(true)}
                    className="text-cyan-400 text-xs hover:underline flex items-center gap-1"
                  >
                    <Plus className="w-3.5 h-3.5" /> {t('registerUnit')}
                  </button>
                </div>

                {units.length === 0 ? (
                  <div className="bg-gray-900/50 border border-gray-800 rounded-lg p-4 text-center text-xs text-gray-400">
                    <Shield className="w-6 h-6 text-gray-500 mx-auto mb-1.5" />
                    <div>{t('noUnits')}</div>
                    <div className="text-xs text-gray-400 mt-1">{t('unitsHint')}</div>
                  </div>
                ) : (
                  units.map(u => (
                    <div key={u.id} className="bg-gray-900/80 border border-gray-800 rounded-lg p-2.5 text-xs flex items-center justify-between">
                      <div>
                        <div className="font-bold text-white flex items-center gap-1.5">
                          <span>{u.kind === 'rescue_boat' ? '⛵' : u.kind === 'ambulance' ? '🚑' : '🚔'}</span>
                          <span>{u.id}</span>
                          <span className="text-[10px] px-1.5 py-0.2 rounded bg-gray-800 text-gray-400 capitalize">{u.kind.replace('_', ' ')}</span>
                        </div>
                        <div className="text-[10px] text-gray-400 mt-0.5">{u.station}</div>
                      </div>
                      <span className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded ${
                        u.status === 'available' ? 'bg-emerald-950 text-emerald-400 border border-emerald-800' : 'bg-gray-800 text-gray-400'
                      }`}>
                        {u.status}
                      </span>
                    </div>
                  ))
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Modals */}
      <UnitRegisterModal
        isOpen={isUnitModalOpen}
        onClose={() => setIsUnitModalOpen(false)}
        onRegister={handleRegisterUnit}
      />

      <IncidentIntakeModal
        isOpen={isIncidentModalOpen}
        onClose={() => setIsIncidentModalOpen(false)}
        onReport={handleReportIncident}
      />

      <BlockedRoadModal
        isOpen={isRoadModalOpen}
        onClose={() => setIsRoadModalOpen(false)}
        onReport={handleReportRoad}
      />
    </div>
  );
}

