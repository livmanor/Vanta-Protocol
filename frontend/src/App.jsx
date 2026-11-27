import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  Activity, Bot, CheckCircle2, ChevronDown, Compass, Flame, Layers, Map as MapIcon, Plus, Route, Shield,
  ShieldAlert, Siren, Trash2, Wind, Radio
} from 'lucide-react';
import Landing from './components/Landing';
import Map from './components/Map';
import AgentPanel from './components/AgentPanel';
import WindyOverlay from './components/WindyOverlay';
import OperationsCalendar from './components/OperationsCalendar';
import RiskZonePanel from './components/RiskZonePanel';
import EvacuationPanel from './components/EvacuationPanel';
import PrepositionPanel from './components/PrepositionPanel';
import UnitRegisterModal from './components/UnitRegisterModal';
import IncidentIntakeModal from './components/IncidentIntakeModal';
import BlockedRoadModal from './components/BlockedRoadModal';
import CapFeedPage from './components/CapFeedPage';
import HazardDetailPanel from './components/HazardDetailPanel';
import CitizenPortal from './components/CitizenPortal';
import { useLanguage } from './i18n.jsx';
import {
  fetchRiskZones, fetchUnits, registerUnit, updateUnitStatus, deleteUnit,
  fetchIncidents, fetchIncidentTriage, reportIncident, updateIncidentStatus, deleteIncident,
  fetchPrepositionSuggestions,
  approvePrepositioning, generateEvacuationRoute, fetchBlockedRoads,
  reportBlockedRoad, fetchZoneWeather, fetchAgentStatus, runAgent,
  refreshOperationsPlan, logoutOfficer, fetchCapAlerts, fetchReplay,
  fetchUnifiedHazards, fetchCitizenReports, reviewCitizenReport,
  fetchRainPrediction
} from './api';

const NAV = [
  { id: 'cap', label: 'Alerts', Icon: Radio },
  { id: 'map', label: 'Tactical Map', Icon: MapIcon },
  { id: 'windy', label: 'Radar', Icon: Wind },
  { id: 'agents', label: 'AI Briefing', Icon: Bot },
];

export default function App() {
  const { language, setLanguage, t } = useLanguage();
  const [riskZones, setRiskZones] = useState([]);
  const [riskZonesError, setRiskZonesError] = useState('');
  const [zoneWeather, setZoneWeather] = useState([]);
  const [agentStatus, setAgentStatus] = useState(null);
  const [agentResults, setAgentResults] = useState({});
  const [agentErrors, setAgentErrors] = useState({});
  const [loadingAgent, setLoadingAgent] = useState(null);
  const [units, setUnits] = useState([]);
  const [incidents, setIncidents] = useState([]);
  const [triageById, setTriageById] = useState({});
  const [blockedRoads, setBlockedRoads] = useState([]);
  const [prepositionSuggestions, setPrepositionSuggestions] = useState([]);
  const [operationsPlan, setOperationsPlan] = useState(null);
  const [sourcesLoading, setSourcesLoading] = useState(false);
  const [capAlerts, setCapAlerts] = useState(null);
  const [rainPrediction, setRainPrediction] = useState(null);
  const [portal, setPortal] = useState('landing'); // landing | citizen | officer
  const [citizenReports, setCitizenReports] = useState([]);
  const [selectedCitizenReport, setSelectedCitizenReport] = useState(null);

  const [selectedZone, setSelectedZone] = useState(null);
  const [unifiedHazards, setUnifiedHazards] = useState([]);
  const [selectedHazard, setSelectedHazard] = useState(null);
  const [hazardFilters, setHazardFilters] = useState({
    earthquake: true,
    cyclone: true,
    wildfire: true,
    urban_flood: true,
    heat: true,
  });
  const [activeRoute, setActiveRoute] = useState(null);
  const [routeNotice, setRouteNotice] = useState(null);
  const [pinnedLocation, setPinnedLocation] = useState(null);

  const [loadingRisk, setLoadingRisk] = useState(false);
  const [loadingRoute, setLoadingRoute] = useState(false);

  const [isUnitModalOpen, setIsUnitModalOpen] = useState(false);
  const [isIncidentModalOpen, setIsIncidentModalOpen] = useState(false);
  const [isRoadModalOpen, setIsRoadModalOpen] = useState(false);
  const [isNewMenuOpen, setIsNewMenuOpen] = useState(false);

  const [view, setView] = useState('cap'); // 'cap' | 'map' | 'windy' | 'agents'
  const [entered, setEntered] = useState(false);
  const [officer, setOfficer] = useState(null);
  const [activeTab, setActiveTab] = useState('zones'); // 'zones' | 'preposition' | 'incidents'
  const [replayMode, setReplayMode] = useState(false);
  const [replayDate, setReplayDate] = useState('2024-09-01');
  const [replayBanner, setReplayBanner] = useState('');
  const [replayPlaying, setReplayPlaying] = useState(false);
  const [lastUpdated, setLastUpdated] = useState(null);

  const newMenuRef = useRef(null);
  const replayAbortRef = useRef(null);
  const yesterdayStr = new Date(Date.now() - 86400000).toISOString().slice(0, 10);

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
    setLoadingRisk(true);
    try {
      if (replayMode) {
        if (replayAbortRef.current) replayAbortRef.current.abort();
        const controller = new AbortController();
        replayAbortRef.current = controller;
        try {
          const replay = await fetchReplay(replayDate, controller.signal);
          setReplayBanner(replay.banner || 'REPLAY — historical data, not live');
          setRiskZones(Array.isArray(replay.zones) ? replay.zones : []);
          setRiskZonesError('');
          setOperationsPlan(replay.operations_plan || null);
          setZoneWeather([]);
          setPrepositionSuggestions([]);
        } catch (err) {
          if (err.name === 'AbortError') return;
          console.error(err);
          setRiskZonesError(err.message || 'Replay failed');
          setReplayBanner('REPLAY — historical data, not live');
        }
        return;
      }

      setReplayBanner('');
      // CAP alerts can load without waiting on weather or zone scoring.
      fetchCapAlerts().then(setCapAlerts).catch(err => console.error(err));
      // ML rain prediction (cached 1 h server-side; 503 → null = not trained).
      fetchRainPrediction().then(setRainPrediction).catch(err => console.error(err));

      const loadZones = async () => {
        try {
          return await fetchRiskZones();
        } catch (firstError) {
          // First paint often races login/session; one retry avoids a permanent "0 hotspots" state.
          await new Promise(resolve => setTimeout(resolve, 800));
          try {
            return await fetchRiskZones();
          } catch (secondError) {
            console.error(firstError, secondError);
            return { error: secondError.message || firstError.message };
          }
        }
      };
      const [rZones, weather, aStatus, uList, incList, triage, roads, uHazards, cReports] = await Promise.all([
        loadZones(),
        fetchZoneWeather().catch(e => { console.error(e); return []; }),
        fetchAgentStatus().catch(e => { console.error(e); return null; }),
        fetchUnits().catch(e => { console.error(e); return []; }),
        fetchIncidents().catch(e => { console.error(e); return []; }),
        fetchIncidentTriage().catch(e => { console.error(e); return { items: [] }; }),
        fetchBlockedRoads().catch(e => { console.error(e); return []; }),
        fetchUnifiedHazards().catch(e => { console.error(e); return { features: [] }; }),
        fetchCitizenReports().catch(e => { console.error(e); return []; }),
      ]);
      setUnifiedHazards(Array.isArray(uHazards?.features) ? uHazards.features : []);
      setCitizenReports(Array.isArray(cReports) ? cReports : []);
      const normalizedZones = Array.isArray(rZones) ? rZones : Array.isArray(rZones?.zones) ? rZones.zones : null;
      if (normalizedZones) {
        setRiskZones(normalizedZones);
        setRiskZonesError(normalizedZones.length === 0 ? 'HTP catalog returned no geocoded points.' : '');
      } else {
        setRiskZonesError(rZones?.error || 'Unexpected response from the risk-zones API.');
      }
      setZoneWeather(weather);
      setAgentStatus(aStatus);
      setUnits(uList);
      setIncidents(incList);
      const triageItems = Array.isArray(triage?.items) ? triage.items : [];
      setTriageById(Object.fromEntries(triageItems.map(item => [item.incident_id, item])));
      setBlockedRoads(roads);

      if (uList && uList.length > 0) {
        const prep = await fetchPrepositionSuggestions().catch(() => []);
        setPrepositionSuggestions(prep);
      } else {
        setPrepositionSuggestions([]);
      }
      refreshOperationsPlan().then(setOperationsPlan).catch(err => console.error(err));
      setLastUpdated(new Date());
    } finally {
      setLoadingRisk(false);
    }
  }, [replayMode, replayDate]);

  const handleRefreshCapFeed = async () => {
    setSourcesLoading(true);
    try {
      const alerts = await fetchCapAlerts(true);
      setCapAlerts(alerts);
    } catch (err) {
      console.error(err);
      try {
        setCapAlerts(await fetchCapAlerts());
      } catch (inner) {
        console.error(inner);
      }
    } finally {
      setSourcesLoading(false);
    }
  };

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
    if (!entered) return undefined;
    loadData();
    if (replayMode) return undefined;

    let intervalId = null;
    const startPolling = () => {
      if (intervalId) clearInterval(intervalId);
      intervalId = setInterval(() => {
        if (!document.hidden) loadData();
      }, 300000); // 5-minute polling in Live mode
    };
    const handleVisibility = () => {
      if (document.hidden) {
        if (intervalId) {
          clearInterval(intervalId);
          intervalId = null;
        }
      } else {
        loadData();
        startPolling();
      }
    };
    if (!document.hidden) startPolling();
    document.addEventListener('visibilitychange', handleVisibility);
    return () => {
      if (intervalId) clearInterval(intervalId);
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, [entered, replayMode, loadData]);

  // Replay Play/Pause: step 1 day every 3 seconds
  useEffect(() => {
    if (!replayMode || !replayPlaying) return undefined;
    const timer = setInterval(() => {
      setReplayDate((prev) => {
        const next = new Date(`${prev}T00:00:00Z`);
        next.setUTCDate(next.getUTCDate() + 1);
        const nextStr = next.toISOString().slice(0, 10);
        if (nextStr > yesterdayStr) {
          setReplayPlaying(false);
          return prev;
        }
        return nextStr;
      });
    }, 3000);
    return () => clearInterval(timer);
  }, [replayMode, replayPlaying, yesterdayStr]);

  const handleRegisterUnit = async (unitData) => {
    await registerUnit(unitData);
    await loadData();
  };

  const handleCompleteUnitTask = async (unitId) => {
    try {
      await updateUnitStatus(unitId, 'available');
      setUnits(prev => prev.map(u => (u.id === unitId ? { ...u, status: 'available' } : u)));
      const prep = await fetchPrepositionSuggestions().catch(() => []);
      setPrepositionSuggestions(prep);
    } catch (err) {
      console.error(err);
      window.alert(err.message || 'Could not mark unit task complete.');
    }
  };

  const handleDeleteUnit = async (unitId) => {
    if (!window.confirm(`Remove unit ${unitId} from the roster?`)) return;
    try {
      await deleteUnit(unitId);
      setUnits(prev => prev.filter(u => u.id !== unitId));
      const prep = await fetchPrepositionSuggestions().catch(() => []);
      setPrepositionSuggestions(prep);
    } catch (err) {
      console.error(err);
      window.alert(err.message || 'Could not delete unit.');
    }
  };

  const refreshIncidentTriage = async () => {
    const triage = await fetchIncidentTriage().catch(() => ({ items: [] }));
    const triageItems = Array.isArray(triage?.items) ? triage.items : [];
    setTriageById(Object.fromEntries(triageItems.map(item => [item.incident_id, item])));
  };

  const handleCompleteIncident = async (incidentId) => {
    try {
      await updateIncidentStatus(incidentId, 'resolved');
      setIncidents(prev => prev.map(inc => (
        inc.id === incidentId ? { ...inc, status: 'resolved' } : inc
      )));
      await refreshIncidentTriage();
    } catch (err) {
      console.error(err);
      window.alert(err.message || 'Could not mark incident complete.');
    }
  };

  const handleDeleteIncident = async (incidentId) => {
    if (!window.confirm(`Remove incident ${incidentId} from the log?`)) return;
    try {
      await deleteIncident(incidentId);
      setIncidents(prev => prev.filter(inc => inc.id !== incidentId));
      setTriageById(prev => {
        const next = { ...prev };
        delete next[incidentId];
        return next;
      });
      await refreshIncidentTriage();
    } catch (err) {
      console.error(err);
      window.alert(err.message || 'Could not delete incident.');
    }
  };

  const handleReportIncident = async (incidentData) => {
    await reportIncident(incidentData);
    setPinnedLocation(null);
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

  const handleGenerateRoute = async (zone) => {
    const coordinates = zone?.polygon?.coordinates;
    const lat = zone?.lat ?? coordinates?.[1];
    const lng = zone?.lng ?? zone?.lon ?? coordinates?.[0];
    if (!zone?.id || lat == null || lng == null) {
      setRouteNotice('This location has no coordinates, so a route cannot be calculated.');
      return;
    }
    setLoadingRoute(true);
    setRouteNotice(null);
    try {
      const res = await generateEvacuationRoute(zone.id, zone.name || zone.id, lat, lng);
      setActiveRoute(res);
    } catch (err) {
      setActiveRoute(null);
      setRouteNotice(err.message);
    } finally {
      setLoadingRoute(false);
    }
  };

  const assessedRisks = riskZones.map(z => z.risk_level).filter(level => Number.isFinite(level));
  const maxRisk = assessedRisks.length ? Math.max(...assessedRisks) : null;
  const allWeatherLive = riskZones.length > 0 && riskZones.every(zone => zone.explanation?.weather_status === 'live');
  const alertTone = maxRisk === null ? { dot: '#D97706', label: 'Data unavailable' } :
    maxRisk >= 4 ? { dot: '#DC2626', label: 'Critical' } :
      maxRisk === 3 ? { dot: '#D97706', label: 'Elevated' } :
        { dot: '#16A34A', label: 'Nominal' };

  const pendingApprovals = prepositionSuggestions.length;
  const aiEngineOnline = Boolean(agentStatus?.configured || agentStatus?.groq_configured);

  const handleLogout = async () => {
    try {
      await logoutOfficer();
    } catch (err) {
      console.error(err);
    }
    setOfficer(null);
    setEntered(false);
    setPortal('landing');
  };

  const handleReviewCitizenReport = async (reportId, decision) => {
    try {
      const updated = await reviewCitizenReport(reportId, decision, decision === 'accepted');
      setCitizenReports(prev => prev.map(r => (r.id === reportId ? updated : r)));
      setSelectedCitizenReport(updated);
      if (decision === 'accepted') {
        const [incList, triage] = await Promise.all([
          fetchIncidents().catch(() => null),
          fetchIncidentTriage().catch(() => null),
        ]);
        if (Array.isArray(incList)) setIncidents(incList);
        if (triage?.items) {
          setTriageById(Object.fromEntries(triage.items.map(item => [item.incident_id, item])));
        }
      }
    } catch (err) {
      console.error(err);
      window.alert(err.message || 'Could not review citizen report.');
    }
  };

  if (portal === 'citizen') {
    return <CitizenPortal onExit={() => setPortal('landing')} />;
  }

  if (!entered) {
    return (
      <Landing
        onEnter={() => { setPortal('officer'); setEntered(true); }}
        onAuthenticated={setOfficer}
        onCitizenPortal={() => setPortal('citizen')}
      />
    );
  }

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
              <div className="vp-mono text-[12px] text-[#475569] leading-tight whitespace-nowrap">{t('area')}</div>
            </div>
          </div>
        </div>

        {/* Right side controls */}
        <div className="flex items-center gap-4">
          {officer && (
            <div className="hidden sm:flex items-center gap-2 text-[13px] text-[#475569]">
              <span className="font-medium text-[#0F172A]">{officer.display_name || officer.username}</span>
              <button
                onClick={handleLogout}
                className="h-[32px] px-2.5 rounded-[6px] border border-[#E2E8F0] text-[12px] hover:bg-[#F8FAFC]"
              >
                Sign out
              </button>
            </div>
          )}
          <div className="hidden md:flex items-center gap-2">
            <div className="flex items-center rounded-[6px] border border-[#E2E8F0] p-[2px] bg-[#F8FAFC]">
              <button
                type="button"
                onClick={() => { setReplayPlaying(false); setReplayMode(false); }}
                aria-pressed={!replayMode}
                className={`h-7 px-2.5 rounded-[4px] text-[12px] font-medium transition ${
                  !replayMode ? 'bg-white text-[#0F172A] shadow-xs font-semibold' : 'text-[#64748B] hover:text-[#0F172A]'
                }`}
              >
                Live
              </button>
              <button
                type="button"
                onClick={() => setReplayMode(true)}
                aria-pressed={replayMode}
                className={`h-7 px-2.5 rounded-[4px] text-[12px] font-medium transition ${
                  replayMode ? 'bg-white text-[#92400E] shadow-xs font-semibold' : 'text-[#64748B] hover:text-[#0F172A]'
                }`}
              >
                Replay
              </button>
            </div>
            {replayMode && (
              <>
                <input
                  type="date"
                  value={replayDate}
                  max={yesterdayStr}
                  onChange={(event) => {
                    setReplayPlaying(false);
                    setReplayDate(event.target.value);
                  }}
                  className="h-[32px] rounded-[6px] border border-[#E2E8F0] bg-white px-2 text-[12px] text-[#0F172A]"
                />
                <button
                  type="button"
                  onClick={() => setReplayPlaying((prev) => !prev)}
                  className="h-[32px] px-2.5 rounded-[6px] border border-[#E2E8F0] bg-white text-[12px] font-medium text-[#0F172A] hover:bg-[#F8FAFC]"
                >
                  {replayPlaying ? 'Pause' : 'Play'}
                </button>
              </>
            )}
          </div>

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
                className={`h-7 px-2.5 rounded-[4px] text-[14px] font-medium transition ${language === code
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
      {replayMode ? (
        <div className="shrink-0 border-b border-[#F59E0B] bg-[#FFFBEB] px-4 py-1.5 flex items-center justify-between text-[12px] font-semibold tracking-wide text-[#92400E]">
          <span>{replayBanner || 'REPLAY — historical data, not live'} · {replayDate}</span>
          <button
            type="button"
            onClick={() => { setReplayPlaying(false); setReplayMode(false); }}
            className="px-2.5 py-1 rounded-[4px] bg-white border border-[#F59E0B] text-[#92400E] hover:bg-[#FEF3C7] text-[12px] font-medium"
          >
            Back to Live
          </button>
        </div>
      ) : (
        <div className="shrink-0 border-b border-[#E2E8F0] bg-[#F8FAFC] px-4 py-1 text-[11px] font-medium text-[#475569] flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-[#16A34A]" />
          <span>
            LIVE, updated {lastUpdated ? lastUpdated.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false }) : '—'}
          </span>
        </div>
      )}
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
                className={`relative h-[36px] rounded-[6px] px-3 flex items-center gap-3 transition text-left ${view === id
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
                onOpenWindy={() => setView('windy')}
                pinnedLocation={pinnedLocation}
                onPinLocation={setPinnedLocation}
                onLogIncidentAtPin={(coords) => {
                  setPinnedLocation(coords);
                  setIsIncidentModalOpen(true);
                }}
                hazards={unifiedHazards}
                activeHazardFilters={hazardFilters}
                selectedHazard={selectedHazard}
                onSelectHazard={(h) => {
                  setSelectedHazard(h);
                  setActiveTab('hazards');
                  setView('map');
                }}
                citizenReports={citizenReports}
                selectedCitizenReport={selectedCitizenReport}
                onSelectCitizenReport={(report) => {
                  setSelectedCitizenReport(report);
                  setActiveTab('incidents');
                  setView('map');
                }}
              />

              {routeNotice && (
                <div className="absolute bottom-6 left-6 z-[500] w-80 bg-white border border-[#E2E8F0] rounded-[8px] shadow-sm p-3">
                  <div className="text-[12px] font-semibold text-[#0F172A]">Route</div>
                  <p className="mt-1 text-[12px] leading-5 text-[#475569]">{routeNotice}</p>
                  <button type="button" onClick={() => setRouteNotice(null)} className="mt-2 text-[12px] font-medium text-[#4338CA]">Dismiss</button>
                </div>
              )}
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
              <div className="flex border-b border-[#E2E8F0] px-4 gap-5 text-[13px] shrink-0 overflow-x-auto">
                {[
                  { id: 'hazards', label: 'Hazards', badge: unifiedHazards.length },
                  { id: 'zones', label: t('zones') },
                  { id: 'preposition', label: t('prepare'), badge: prepositionSuggestions.length },
                  { id: 'incidents', label: t('incidents'), badge: incidents.length },
                ].map(({ id, label, badge }) => (
                  <button
                    key={id}
                    onClick={() => setActiveTab(id)}
                    className={`relative py-3 font-medium transition flex items-center gap-1.5 shrink-0 ${activeTab === id
                        ? 'text-[#4338CA] font-semibold'
                        : 'text-[#64748B] hover:text-[#0F172A]'
                      }`}
                  >
                    <span>{label}</span>
                    {badge > 0 && (
                      <span className="text-[11px] px-1.5 py-0.2 rounded-full bg-[#F1F5F9] text-[#475569] font-medium">
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
                {activeTab === 'hazards' && (
                  <HazardDetailPanel
                    selectedHazard={selectedHazard}
                    onClose={() => setSelectedHazard(null)}
                    onSelectHazard={setSelectedHazard}
                    activeFilters={hazardFilters}
                    onToggleFilter={(hid) => setHazardFilters(prev => ({ ...prev, [hid]: !prev[hid] }))}
                    onRefresh={loadData}
                  />
                )}

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
                        {t('monitoredWards')} ({riskZonesError && riskZones.length === 0 ? '—' : riskZones.length})
                      </span>
                    </div>

                    <div className="flex flex-col divide-y divide-[#E2E8F0] border-t border-b border-[#E2E8F0]">
                      {[...riskZones].sort((a, b) => (b.risk_level || 0) - (a.risk_level || 0)).map((z) => (
                        <button
                          key={z.id}
                          onClick={() => setSelectedZone(z)}
                          className={`w-full min-h-[40px] py-2 px-1 text-left flex items-center justify-between transition hover:bg-[#F8FAFC] ${selectedZone?.id === z.id ? 'bg-[#EEF2FF]/60' : ''
                            }`}
                        >
                          <div className="min-w-0 pr-2">
                            <div className="text-[14px] font-medium text-[#0F172A] truncate">{z.name}</div>
                            <div className="vp-mono text-[12px] text-[#64748B]">
                              {t('elevation')} {z.explanation?.mean_elevation_m?.toFixed(1) ?? '–'}m · 48h est. {zoneWeather.find(item => item.zone_id === z.id)?.rainfall_48h_mm?.toFixed(1) ?? '—'}mm
                            </div>
                          </div>
                          <span
                            className="shrink-0 px-2 py-0.5 rounded-[4px] text-[12px] font-semibold vp-mono"
                            style={{
                              backgroundColor: z.risk_level == null ? '#F1F5F9' : z.risk_level >= 4 ? '#FEE2E2' : z.risk_level === 3 ? '#FEF3C7' : '#DCFCE7',
                              color: z.risk_level == null ? '#64748B' : z.risk_level >= 4 ? '#DC2626' : z.risk_level === 3 ? '#D97706' : '#16A34A',
                            }}
                          >
                            {z.risk_level == null ? 'N/A' : `L${z.risk_level}`}
                          </span>
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {activeTab === 'preposition' && (
                  <div className="flex flex-col gap-6">
                    <OperationsCalendar calendar={operationsPlan} model="Rainfall plan" />
                    <PrepositionPanel
                      suggestions={prepositionSuggestions}
                      onApprove={handleApprovePreposition}
                      onRegisterUnit={() => setIsUnitModalOpen(true)}
                    />
                  </div>
                )}

                {activeTab === 'incidents' && (
                  <div className="flex flex-col gap-4">
                    <div className="flex flex-col gap-2 border border-[#FED7AA] bg-[#FFF7ED] rounded-[6px] p-3">
                      <div className="flex items-center justify-between">
                        <span className="text-[12px] font-semibold text-[#9A3412]">
                          Citizen photo reports ({citizenReports.filter(r => r.status === 'pending').length} pending)
                        </span>
                      </div>
                      {citizenReports.length === 0 ? (
                        <p className="text-[12px] text-[#9A3412]/80">No citizen field reports yet.</p>
                      ) : (
                        <div className="flex flex-col gap-2 max-h-56 overflow-y-auto">
                          {citizenReports.map((report) => (
                            <button
                              key={report.id}
                              type="button"
                              onClick={() => setSelectedCitizenReport(report)}
                              className={`text-left rounded-[6px] border px-2.5 py-2 ${selectedCitizenReport?.id === report.id ? 'border-[#EA580C] bg-white' : 'border-[#FDBA74] bg-white/70'
                                }`}
                            >
                              <div className="flex items-center justify-between gap-2 text-[11px]">
                                <span className="font-semibold uppercase text-[#9A3412]">{report.phase}</span>
                                <span className="text-[#64748B]">{report.status}</span>
                              </div>
                              <div className="text-[12px] text-[#0F172A] mt-0.5 line-clamp-2">{report.message}</div>
                              <div className="text-[11px] text-[#64748B] mt-0.5">
                                {report.citizen_display_name || report.citizen_username} · {new Date(report.created_at).toLocaleString()}
                              </div>
                            </button>
                          ))}
                        </div>
                      )}
                      {selectedCitizenReport && (
                        <div className="mt-1 rounded-[6px] border border-[#FDBA74] bg-white p-2.5 flex flex-col gap-2">
                          <img
                            src={`/api/citizen-reports/${selectedCitizenReport.id}/photo`}
                            alt="Citizen field photo"
                            className="w-full max-h-40 object-cover rounded-[4px] border border-[#E2E8F0]"
                          />
                          <p className="text-[12px] text-[#334155]">{selectedCitizenReport.message}</p>
                          {selectedCitizenReport.status === 'pending' && (
                            <div className="flex gap-2">
                              <button
                                type="button"
                                onClick={() => handleReviewCitizenReport(selectedCitizenReport.id, 'accepted')}
                                className="flex-1 h-8 rounded-[4px] bg-[#047857] text-white text-[12px] font-medium"
                              >
                                Accept → incident
                              </button>
                              <button
                                type="button"
                                onClick={() => handleReviewCitizenReport(selectedCitizenReport.id, 'rejected')}
                                className="flex-1 h-8 rounded-[4px] bg-[#FEF2F2] text-[#B91C1C] text-[12px] font-medium border border-[#FECACA]"
                              >
                                Reject
                              </button>
                            </div>
                          )}
                        </div>
                      )}
                    </div>

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
                      <div className="py-6 text-center text-[12px] text-[#64748B] flex flex-col items-center gap-3">
                        <p>No incidents reported</p>
                        <button type="button" onClick={() => setIsIncidentModalOpen(true)} className="vp-btn vp-btn-primary">Log an incident</button>
                      </div>
                    ) : (
                      <div className="flex flex-col divide-y divide-[#E2E8F0] border-t border-b border-[#E2E8F0]">
                        {[...incidents].sort((a, b) => (triageById[a.id]?.rank ?? 9999) - (triageById[b.id]?.rank ?? 9999)).map((inc) => (
                          <div key={inc.id} className="py-2.5 flex flex-col gap-1.5">
                            <div className="flex items-center justify-between gap-2">
                              <span className="text-[12px] font-medium text-[#0F172A] uppercase min-w-0 truncate">
                                {triageById[inc.id] ? `Rank ${triageById[inc.id].rank} · ` : ''}{inc.type} · Urgency {inc.urgency}
                              </span>
                              <span className="vp-mono text-[12px] text-[#64748B] shrink-0">
                                {new Date(inc.timestamp).toLocaleTimeString()}
                              </span>
                            </div>
                            {triageById[inc.id] && (
                              <p className="text-[12px] leading-relaxed text-[#475569]">
                                {triageById[inc.id].why_this}
                              </p>
                            )}
                            <div className="text-[14px] text-[#334155]">{inc.message}</div>
                            <div className="text-[12px] flex items-center justify-between gap-2 text-[#64748B]">
                              <span>{t('people')}: <strong className="text-[#0F172A] font-medium">{inc.people}</strong></span>
                              <span className="truncate">{inc.source}</span>
                            </div>
                            <div className="flex items-center justify-between gap-2">
                              <span
                                className="text-[12px] px-2 py-0.5 rounded-[4px] font-medium"
                                style={{
                                  backgroundColor: inc.status === 'resolved' ? '#F1F5F9' : inc.status === 'assigned' ? '#DBEAFE' : '#FEF3C7',
                                  color: inc.status === 'resolved' ? '#64748B' : inc.status === 'assigned' ? '#1D4ED8' : '#B45309',
                                }}
                              >
                                {inc.status || 'new'}
                              </span>
                              <div className="flex items-center gap-1.5 shrink-0">
                                {inc.status !== 'resolved' && (
                                  <button
                                    type="button"
                                    title="Mark incident resolved"
                                    onClick={() => handleCompleteIncident(inc.id)}
                                    className="text-[11px] px-2 py-0.5 rounded-[4px] font-medium bg-[#ECFDF5] text-[#047857] hover:bg-[#D1FAE5] flex items-center gap-1"
                                  >
                                    <CheckCircle2 className="w-3 h-3" strokeWidth={2} />
                                    Complete
                                  </button>
                                )}
                                <button
                                  type="button"
                                  title="Remove incident from log"
                                  onClick={() => handleDeleteIncident(inc.id)}
                                  className="text-[11px] px-2 py-0.5 rounded-[4px] font-medium bg-[#FEF2F2] text-[#B91C1C] hover:bg-[#FEE2E2] flex items-center gap-1"
                                >
                                  <Trash2 className="w-3 h-3" strokeWidth={2} />
                                  Delete
                                </button>
                              </div>
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
                      <div className="py-4 text-center text-[12px] text-[#64748B] flex flex-col items-center gap-3">
                        <p>Register a unit to get pre-positioning recommendations.</p>
                        <button type="button" onClick={() => setIsUnitModalOpen(true)} className="vp-btn vp-btn-primary">Register a unit</button>
                      </div>
                    ) : (
                      <div className="flex flex-col divide-y divide-[#E2E8F0] border-t border-b border-[#E2E8F0]">
                        {units.map((u) => (
                          <div key={u.id} className="py-2 flex items-center justify-between gap-2">
                            <div className="min-w-0">
                              <div className="text-[14px] font-medium text-[#0F172A] truncate">{u.id}</div>
                              <div className="text-[12px] text-[#64748B]">{u.kind.replace('_', ' ')} · {u.station}</div>
                            </div>
                            <div className="flex items-center gap-1.5 shrink-0">
                              <span
                                className="text-[12px] px-2 py-0.5 rounded-[4px] font-medium"
                                style={{
                                  backgroundColor: u.status === 'available' ? '#DCFCE7' : '#DBEAFE',
                                  color: u.status === 'available' ? '#16A34A' : '#1D4ED8',
                                }}
                              >
                                {u.status === 'available' ? t('available') : u.status}
                              </span>
                              {u.status === 'assigned' && (
                                <button
                                  type="button"
                                  title="Mark task complete — unit becomes available"
                                  onClick={() => handleCompleteUnitTask(u.id)}
                                  className="text-[11px] px-2 py-0.5 rounded-[4px] font-medium bg-[#ECFDF5] text-[#047857] hover:bg-[#D1FAE5] flex items-center gap-1"
                                >
                                  <CheckCircle2 className="w-3 h-3" strokeWidth={2} />
                                  Complete
                                </button>
                              )}
                              <button
                                type="button"
                                title="Remove unit from roster"
                                onClick={() => handleDeleteUnit(u.id)}
                                className="text-[11px] px-2 py-0.5 rounded-[4px] font-medium bg-[#FEF2F2] text-[#B91C1C] hover:bg-[#FEE2E2] flex items-center gap-1"
                              >
                                <Trash2 className="w-3 h-3" strokeWidth={2} />
                                Delete
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}

              </div>
            </aside>
          </div>

          {/* AI BRIEFING WORKBENCH VIEW */}
          {view === 'agents' && (
            <div className="absolute inset-0 z-[450] overflow-y-auto bg-[#F8FAFC]">
              <div className="max-w-[1200px] mx-auto px-4 sm:px-8 py-8 pb-16 flex flex-col gap-8">
                {/* ONE SLIM PAGE HEADER BAND */}
                <div className="border-b border-[#E2E8F0] pb-4 flex flex-col gap-4">
                  <div className="flex flex-wrap items-center justify-between gap-4">
                    <div>
                      <h1 className="text-[20px] font-semibold text-[#0F172A] tracking-tight">
                        AI Briefing
                      </h1>
                      <p className="mt-1 text-[13px] text-[#475569]">
                        On-demand briefing. Reviews the evidence you have already seen. Nothing is dispatched automatically.
                      </p>
                      <div className="flex items-center gap-3 mt-2 text-[12px] text-[#64748B]">
                        <span className="font-medium text-[#0F172A]">Predict</span>
                        <span>·</span>
                        <span className="font-medium text-[#0F172A]">Prepare</span>
                        <span>·</span>
                        <span className="font-medium text-[#0F172A]">Respond</span>
                        <span>·</span>
                        <span className="flex items-center gap-1.5 font-medium" style={{ color: allWeatherLive ? '#16A34A' : '#D97706' }}>
                          <span className="w-2 h-2 rounded-full" style={{ backgroundColor: allWeatherLive ? '#16A34A' : '#D97706' }} />
                          {allWeatherLive ? 'Active system' : 'Data status: partial'}
                        </span>
                        <span>·</span>
                        <span>{maxRisk === null ? alertTone.label : `${alertTone.label} risk`} · {riskZonesError && riskZones.length === 0 ? 'Hotspot data unavailable' : `${riskZones.length} hotspots monitored`}</span>
                      </div>

                      {/* ML Rainfall Forecast Banner */}
                      {rainPrediction ? (
                        <div className="mt-3 flex flex-wrap gap-3">
                          {/* Our ML model */}
                          <div className="inline-flex items-center gap-2 rounded-[6px] border border-[#BFDBFE] bg-[#EFF6FF] px-3 py-1.5 text-[12px]">
                            <span className="w-2 h-2 rounded-full bg-[#3B82F6] shrink-0" />
                            <span className="font-semibold text-[#1E40AF]">ML forecast</span>
                            <span className="text-[#1D4ED8]">for {rainPrediction.for_date}:</span>
                            <span className="font-semibold text-[#1E40AF]">{rainPrediction.rain_next_mm} mm</span>
                            <span className="text-[#1D4ED8]">·</span>
                            <span className="font-semibold text-[#1E40AF]">{(rainPrediction.p_heavy * 100).toFixed(0)}% heavy-rain chance</span>
                            {rainPrediction.p_heavy >= 0.5 && (
                              <span className="ml-1 px-1.5 py-0.5 bg-[#DBEAFE] text-[#1D4ED8] rounded-[4px] font-semibold text-[11px]">HIGH</span>
                            )}
                          </div>
                          {/* Open-Meteo native forecast */}
                          <div className="inline-flex items-center gap-2 rounded-[6px] border border-[#D1FAE5] bg-[#ECFDF5] px-3 py-1.5 text-[12px]">
                            <span className="w-2 h-2 rounded-full bg-[#10B981] shrink-0" />
                            <span className="font-semibold text-[#065F46]">Open-Meteo forecast</span>
                            <span className="text-[#047857]">for {rainPrediction.for_date}:</span>
                            <span className="font-semibold text-[#065F46]">{rainPrediction.open_meteo_rain_mm} mm</span>
                            <span className="text-[#047857]">·</span>
                            <span className="font-semibold text-[#065F46]">{rainPrediction.open_meteo_precip_prob_pct}% precip. prob.</span>
                          </div>
                          <div className="w-full text-[11px] text-[#64748B]">
                            ML model v{rainPrediction.version}, trained {rainPrediction.trained_at ? new Date(rainPrediction.trained_at).toISOString().slice(0, 10) : rainPrediction.version}, 2024+ test ROC-AUC {rainPrediction.test_roc_auc != null ? Number(rainPrediction.test_roc_auc).toFixed(3) : '—'}
                          </div>
                        </div>
                      ) : (
                        <div className="mt-3 inline-flex items-center gap-2 rounded-[6px] border border-[#E2E8F0] bg-[#F8FAFC] px-3 py-1.5 text-[12px] text-[#64748B]">
                          <span className="w-2 h-2 rounded-full bg-[#CBD5E1] shrink-0" />
                          ML model not trained yet — run <code className="px-1 bg-[#F1F5F9] rounded text-[11px]">scripts/train_rainfall_forecaster.py</code> to enable live forecasts
                        </div>
                      )}
                    </div>

                    {/* Underline Tab Bar (Clean, no redundant Tactical Map) */}
                    <div className="flex items-center gap-6 text-[14px]">
                      <span className="text-[#4338CA] font-semibold relative py-2">
                        AI Briefing
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
                  operationsPlan={operationsPlan}
                />

              </div>
            </div>
          )}

          {/* RADAR / ATMOSPHERIC OVERLAYS VIEW */}
          {view === 'windy' && (
            <div className="absolute inset-0 z-[450] flex flex-col bg-[#F8FAFC]">
              <div className="shrink-0 border-b border-[#E2E8F0] bg-white px-4 py-2 text-[12px] text-[#64748B]">
                Cross-check only. Not an input to the risk score.
              </div>
              <div className="flex-1 min-h-0">
                <WindyOverlay />
              </div>
            </div>
          )}

          {view === 'cap' && (
            <CapFeedPage
              alertsPayload={capAlerts}
              onRefresh={handleRefreshCapFeed}
              loading={sourcesLoading}
              onOpenRadar={() => setView('windy')}
            />
          )}
        </main>
      </div>

      {/* Modals */}
      <UnitRegisterModal isOpen={isUnitModalOpen} onClose={() => setIsUnitModalOpen(false)} onRegister={handleRegisterUnit} />
      <IncidentIntakeModal
        isOpen={isIncidentModalOpen}
        onClose={() => setIsIncidentModalOpen(false)}
        onReport={handleReportIncident}
        pinnedLocation={pinnedLocation}
      />
      <BlockedRoadModal isOpen={isRoadModalOpen} onClose={() => setIsRoadModalOpen(false)} onReport={handleReportRoad} />
    </div>
  );
}
