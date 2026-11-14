import React, { useEffect, useState } from 'react';
import { Activity, AlertTriangle, ArrowRight, CheckCircle2, CloudRain, Compass, RefreshCw, Search, ShieldCheck, Siren, Sparkles, Send } from 'lucide-react';
import { useLanguage } from '../i18n.jsx';
import { searchPredictHistory } from '../api';

const agents = {
  predict: {
    icon: CloudRain,
    title: ['Weather Predict', 'मौसम अनुमान', 'వాతావరణ అంచనా'],
    goal: ['Compare live forecasts with historical rainfall and recorded area impacts.', 'लाइव पूर्वानुमान की तुलना हाल की बारिश और दर्ज क्षेत्रीय प्रभावों से करें।', 'ప్రత్యక్ష అంచనాలను ఇటీవలి వర్షపాతం, నమోదైన ప్రాంతీయ ప్రభావాలతో పోల్చండి.'],
    data: ['Live weather and flood risk, recent rainfall history, logged flood and road-block counts.', 'लाइव मौसम व बाढ़ जोखिम, हाल की वर्षा, दर्ज बाढ़ और सड़क अवरोधों की संख्या।', 'ప్రత్యక్ష వాతావరణం, వరద ప్రమాదం, ఇటీవలి వర్షపాతం, నమోదైన వరద/రోడ్డు మూసివేతల సంఖ్య.'],
    output: ['Rain-event comparison, focus areas, data gaps and officer verification checks.', 'बारिश की तुलना, ध्यान देने योग्य क्षेत्र, डेटा की कमी और अधिकारी जाँच।', 'వర్షపాతం పోలిక, దృష్టి ప్రాంతాలు, డేటా లోపాలు, అధికారి తనిఖీలు.'],
    placeholder: 'e.g. Last year flood in Hyderabad or Musi river overflow...'
  },
  prepare: {
    icon: Compass,
    title: ['Prepare', 'तैयारी', 'సన్నద్ధత'],
    goal: ['Turn forecasts, past impacts and available resources into pre-event readiness checks.', 'पूर्वानुमान, पिछले प्रभावों और उपलब्ध संसाधनों से आपदा-पूर्व तैयारी जाँचें बनाएँ।', 'అంచనా, గత ప్రభావాలు, అందుబాటులోని వనరులతో విపత్తుకు ముందస్తు తనిఖీలు రూపొందించండి.'],
    data: ['Current zone risks, recent rain impacts and aggregated available-unit types and positioning.', 'मौजूदा क्षेत्रीय जोखिम, हाल के वर्षा प्रभाव और उपलब्ध दलों का सार।', 'ప్రస్తుత ప్రాంతీయ ప్రమాదాలు, ఇటీవలి వర్ష ప్రభావాలు, అందుబాటులోని బృందాల సమగ్ర వివరాలు.'],
    output: ['Evidence-linked readiness actions, resource gaps and officer checks. No assignments.', 'सबूत-आधारित तैयारी कार्य, संसाधन की कमी और अधिकारी जाँच। तैनाती नहीं।', 'ఆధారాలతో కూడిన సన్నద్ధత చర్యలు, వనరుల లోపాలు, అధికారి తనిఖీలు. కేటాయింపులు లేవు.'],
    placeholder: 'e.g. Check boat readiness for Musi river zones...'
  },
  respond: {
    icon: Siren,
    title: ['Respond', 'प्रतिक्रिया', 'ప్రతిస్పందన'],
    goal: ['Assess active reported incidents and help the officer coordinate a safe response.', 'सक्रिय दर्ज घटनाओं का आकलन कर अधिकारी को सुरक्षित प्रतिक्रिया समन्वय में सहायता दें।', 'ప్రస్తుతం నమోదైన ఘటనలను అంచనా వేసి, సురక్షిత ప్రతిస్పందన సమన్వయంలో అధికారికి సహాయపడండి.'],
    data: ['Active incident counts by type, reported urgency and zone; logged road closures; live risk; available resource counts.', 'प्रकार, तात्कालिकता और क्षेत्र के अनुसार सक्रिय घटनाएँ; दर्ज सड़क बंद; लाइव जोखिम; उपलब्ध संसाधनों की संख्या।', 'రకం, అత్యవసరత, ప్రాంతం వారీగా ఘటనలు; నమోదైన రోడ్డు మూసివేతలు; ప్రత్యక్ష ప్రమాదం; వనరుల సంఖ్య.'],
    output: ['Priority areas, suggested coordination steps and what an officer must verify. No dispatch.', 'प्राथमिकता वाले क्षेत्र, समन्वय सुझाव और अधिकारी द्वारा जाँची जाने वाली बातें। रवाना नहीं करता।', 'ప్రాధాన్యత ప్రాంతాలు, సమన్వయ సూచనలు, అధికారి నిర్ధారించాల్సిన అంశాలు. పంపిణీ చేయదు.'],
    placeholder: 'e.g. Focus on trapped citizens near Nampally underpass...'
  },
};

const SUGGESTION_CHIPS = [
  "2025 August heavy rainfall",
  "Moosarambagh bridge overflow",
  "Nampally metro waterlogging",
  "Banjara Hills rain impacts"
];

export default function AgentPanel({ status, results = {}, errors = {}, loadingAgent, onRun, onReviewPreparation, riskZones }) {
  const { language } = useLanguage();
  const langIndex = language === 'hi' ? 1 : language === 'te' ? 2 : 0;
  const [selected, setSelected] = useState('predict');
  const [groqConsent, setGroqConsent] = useState(false);
  const [geminiConsent, setGeminiConsent] = useState(false);
  const [commandRunning, setCommandRunning] = useState(false);
  const [commandStates, setCommandStates] = useState({});
  const [history, setHistory] = useState(null);
  const [historyQuery, setHistoryQuery] = useState('');
  const [areaQuery, setAreaQuery] = useState('');
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyError, setHistoryError] = useState('');
  const [selectedEventId, setSelectedEventId] = useState('');
  const [selectedHistoryZone, setSelectedHistoryZone] = useState('');

  const selectedResult = results[selected];
  const current = agents[selected];
  const agentConfigured = selected === 'predict' ? status?.groq_configured : status?.configured;
  const consent = selected === 'predict' ? groqConsent : geminiConsent;
  const zoneName = (id) => riskZones?.find(zone => zone.id === id)?.name || Object.values(results).flatMap(result => result?.analysis_areas || []).find(area => area.zone_id === id)?.zone_name || id;

  const handleHistorySearch = async (queryToSearch) => {
    const q = (queryToSearch || historyQuery).trim();
    if (!q) return;
    if (!groqConsent || !status?.groq_configured) {
      setHistoryError('Accept Groq permission before searching historical events.');
      return;
    }
    setHistoryLoading(true);
    setHistoryError('');
    try {
      const data = await searchPredictHistory(q);
      setHistory(data);
      setSelectedEventId(data.events?.[0]?.id || '');
      setSelectedHistoryZone(data.resolved_zone_id || '');
    } catch (error) {
      setHistory(null);
      setHistoryError(error.message);
    } finally {
      setHistoryLoading(false);
    }
  };

  const handleChipClick = (chipText) => {
    setHistoryQuery(chipText);
    handleHistorySearch(chipText);
  };

  const handleTriggerRun = () => {
    if (!agentConfigured || !consent) return;
    const inputs = {};
    if (selected === 'predict') {
      if (selectedEvent) {
        inputs.event_start = selectedEvent.window_start;
        inputs.event_end = selectedEvent.window_end;
        inputs.zone_id = selectedHistoryZone || null;
      }
    }
    if (historyQuery.trim()) inputs.officer_query = historyQuery.trim();
    const requestedArea = areaQuery.trim() || (!selectedEvent && historyQuery.trim().split(/\s+/).length <= 3 ? historyQuery.trim() : '');
    if (requestedArea) inputs.area_query = requestedArea;
    onRun(selected, consent, language, inputs);
  };

  const handleRunCommand = async () => {
    if (!historyQuery.trim() || !groqConsent || !geminiConsent || !status?.groq_configured || !status?.configured || commandRunning || loading) return;
    setCommandRunning(true);
    setCommandStates({});
    const requestedArea = areaQuery.trim() || (historyQuery.trim().split(/\s+/).length <= 3 ? historyQuery.trim() : '');
    const inputs = { officer_query: historyQuery.trim(), ...(requestedArea ? { area_query: requestedArea } : {}) };
    try {
      for (const id of ['predict', 'prepare', 'respond']) {
        setCommandStates(previous => ({ ...previous, [id]: 'running' }));
        const result = await onRun(id, id === 'predict' ? groqConsent : geminiConsent, language, inputs);
        setCommandStates(previous => ({ ...previous, [id]: result ? 'complete' : 'failed' }));
      }
    } finally {
      setCommandRunning(false);
    }
  };

  const selectedEvent = history?.events?.find(item => item.id === selectedEventId);
  const selectedEventAreas = selectedEvent?.areas?.filter(item => !selectedHistoryZone || item.zone_id === selectedHistoryZone) || [];

  const historyLabels = {
    en: { title: 'Ask about past rain, flood, or operational query', hint: 'Type your question or scenario. Example: “Retrieve effects of last year’s flood in Hyderabad city.”', search: 'Search history', loading: 'Resolving query & retrieving telemetry…', unavailable: 'Historical telemetry unavailable right now.', empty: 'No matching rainfall events found for that period.', event: 'Matching rain event', area: 'Focus area', all: 'All mapped hotspots', impacts: 'Evidence by hotspot', rainfall: 'Rain total', max: 'Max daily rain', reports: 'Flood / trapped / road reports', blocks: 'Blocked-road reports', coverage: 'Archive coverage', source: 'Rainfall is reanalysis sampled at six mapped hotspots.', records: 'Effect counts include only reports recorded in this app.', allAreas: 'All mapped hotspots' },
    hi: { title: 'पिछली बारिश या बाढ़ के बारे में पूछें', hint: 'घटना अपने शब्दों में लिखें। उदाहरण: “पिछले साल हैदराबाद में बाढ़ के प्रभाव दिखाएँ।”', search: 'इतिहास खोजें', loading: 'ऐतिहासिक वर्षा खोजी जा रही है…', unavailable: 'ऐतिहासिक वर्षा अभी उपलब्ध नहीं है।', empty: 'इस अवधि में कोई वर्षा घटना नहीं मिली।', event: 'मिली वर्षा घटना', area: 'ध्यान क्षेत्र', all: 'सभी मानचित्रित हॉटस्पॉट', impacts: 'हॉटस्पॉट के अनुसार साक्ष्य', rainfall: 'कुल वर्षा', max: 'अधिकतम दैनिक वर्षा', reports: 'बाढ़ / फँसे लोग / सड़क रिपोर्ट', blocks: 'सड़क अवरोध रिपोर्ट', coverage: 'संग्रह कवरेज', source: 'वर्षा छह मानचित्रित हॉटस्पॉट पर पुनर्विश्लेषण है।', records: 'केवल ऐप में दर्ज प्रभाव शामिल हैं।', allAreas: 'सभी मानचित्रित हॉटस्पॉट' },
    te: { title: 'గత వర్షం లేదా వరద గురించి అడగండి', hint: 'మీ మాటల్లో ఘటనను వివరించండి. ఉదాహరణ: “గత ఏడాది హైదరాబాద్ వరద ప్రభావాలు చూపించు.”', search: 'చరిత్రలో వెతకండి', loading: 'చారిత్రక వర్షాన్ని వెతుకుతోంది…', unavailable: 'చారిత్రక వర్షపాతం ప్రస్తుతం అందుబాటులో లేదు.', empty: 'ఆ కాలానికి సరిపడే వర్ష ఘటనలు లేవు.', event: 'సరిపడిన వర్ష ఘటన', area: 'దృష్టి ప్రాంతం', all: 'మ్యాప్‌లోని అన్ని హాట్‌స్పాట్‌లు', impacts: 'హాట్‌స్పాట్ వారీ ఆధారాలు', rainfall: 'మొత్తం వర్షపాతం', max: 'గరిష్ఠ రోజువారీ వర్షం', reports: 'వరద / చిక్కుకున్నవారు / రోడ్డు నివేదికలు', blocks: 'రోడ్డు మూసివేత నివేదికలు', coverage: 'ఆర్కైవ్ పరిధి', source: 'వర్షపాతం ఆరు మ్యాప్ హాట్‌స్పాట్‌ల వద్ద రీఅనాలిసిస్.', records: 'యాప్‌లో నమోదైన ప్రభావాలే లెక్కించబడతాయి.', allAreas: 'మ్యాప్‌లోని అన్ని హాట్‌స్పాట్‌లు' },
  }[language] || {};

  const assessmentLabels = {
    en: { title: 'Qualitative assessment', insufficient_data: 'Insufficient data', low: 'Low', moderate: 'Moderate', high: 'High', severe: 'Severe' },
    hi: { title: 'गुणात्मक आकलन', insufficient_data: 'अपर्याप्त डेटा', low: 'कम', moderate: 'मध्यम', high: 'उच्च', severe: 'गंभीर' },
    te: { title: 'గుణాత్మక అంచనా', insufficient_data: 'సరిపడా డేటా లేదు', low: 'తక్కువ', moderate: 'మధ్యస్థం', high: 'ఎక్కువ', severe: 'తీవ్రం' },
  }[language] || {};

  const levelBadge = (lvl) => {
    switch (lvl) {
      case 'severe': return { bg: '#FEE2E2', text: '#DC2626' };
      case 'high': return { bg: '#FEE2E2', text: '#DC2626' };
      case 'moderate': return { bg: '#FEF3C7', text: '#D97706' };
      case 'low': return { bg: '#DCFCE7', text: '#16A34A' };
      default: return { bg: '#F1F5F9', text: '#64748B' };
    }
  };

  const loading = loadingAgent !== null;
  const runningCurrent = loadingAgent === selected;
  const err = errors[selected];

  const canRunSequence = Boolean(
    historyQuery.trim() &&
    groqConsent &&
    geminiConsent &&
    status?.groq_configured &&
    status?.configured &&
    !commandRunning &&
    !loading
  );

  const getSequenceDisabledReason = () => {
    if (!historyQuery.trim()) return 'Enter an incident instruction above.';
    if (!groqConsent || !geminiConsent) return 'Accept both permissions to run.';
    if (!status?.groq_configured || !status?.configured) return 'AI models not fully configured.';
    return '';
  };

  return (
    <div className="flex flex-col gap-8 text-[14px]">
      {/* ── ONE PRIMARY SURFACE: Incident Command Form ── */}
      <section className="bg-white border border-[#E2E8F0] rounded-[6px] p-6 flex flex-col gap-6">
        <div>
          <h2 className="text-[16px] font-semibold text-[#0F172A] tracking-tight">
            Incident Command Form
          </h2>
          <p className="text-[14px] text-[#475569] mt-1">
            Describe the situation once to run Predict, Prepare and Respond sequentially.
          </p>
        </div>

        {/* Inputs: Label above each field, Area narrow, Instruction wide */}
        <div className="flex flex-col md:flex-row gap-4 items-start">
          <div className="w-full md:w-64 flex flex-col gap-1.5">
            <label className="text-[12px] font-medium text-[#475569]">
              Focus area
            </label>
            <input
              type="text"
              value={areaQuery}
              onChange={(e) => setAreaQuery(e.target.value)}
              placeholder="e.g. Secunderabad"
              className="vp-input"
            />
          </div>

          <div className="w-full flex-1 flex flex-col gap-1.5">
            <label className="text-[12px] font-medium text-[#475569]">
              Incident instruction
            </label>
            <input
              type="text"
              value={historyQuery}
              onChange={(e) => setHistoryQuery(e.target.value)}
              placeholder="e.g. Retrieve recent rain effects and prepare for expected flooding near Musi river"
              className="vp-input"
            />
          </div>
        </div>

        {/* Compact Consent Checkboxes: Combined single block, 14px text, no individual card boxes */}
        <div className="flex flex-col gap-2 pt-2 border-t border-[#E2E8F0]">
          <label className="flex items-center gap-2.5 text-[14px] text-[#334155] cursor-pointer">
            <input
              type="checkbox"
              checked={groqConsent}
              onChange={(e) => setGroqConsent(e.target.checked)}
              className="w-4 h-4 rounded-[4px] border-[#CBD5E1] text-[#4338CA] focus:ring-[#4338CA]"
            />
            <span>Allow Groq to process incident query and telemetry for Weather Predict.</span>
          </label>

          <label className="flex items-center gap-2.5 text-[14px] text-[#334155] cursor-pointer">
            <input
              type="checkbox"
              checked={geminiConsent}
              onChange={(e) => setGeminiConsent(e.target.checked)}
              className="w-4 h-4 rounded-[4px] border-[#CBD5E1] text-[#4338CA] focus:ring-[#4338CA]"
            />
            <span>Allow Google Gemini to process aggregated data for Prepare and Respond.</span>
          </label>
        </div>

        {/* Sticky / Right-Aligned Run All Agents Button with Helper text */}
        <div className="flex flex-wrap items-center justify-between gap-4 pt-4 border-t border-[#E2E8F0]">
          <div className="text-[12px] text-[#64748B]">
            {!canRunSequence && getSequenceDisabledReason()}
          </div>

          <button
            onClick={handleRunCommand}
            disabled={!canRunSequence}
            className="vp-btn vp-btn-primary"
          >
            {commandRunning ? (
              <RefreshCw className="w-4 h-4 animate-spin" strokeWidth={1.5} />
            ) : (
              <Sparkles className="w-4 h-4" strokeWidth={1.5} />
            )}
            <span>
              {commandRunning ? 'Running sequence…' : 'Run all agents in sequence'}
            </span>
          </button>
        </div>

        {/* Progress indicator during sequential run */}
        {Object.keys(commandStates).length > 0 && (
          <div className="flex flex-wrap items-center gap-6 pt-3 border-t border-[#E2E8F0] text-[12px]">
            {['predict', 'prepare', 'respond'].map((id) => (
              <div key={id} className="flex items-center gap-2">
                <span className="font-medium text-[#0F172A]">{agents[id].title[0]}:</span>
                <span className="text-[#475569]">
                  {commandStates[id] === 'running' ? 'Running…' : commandStates[id] === 'complete' ? 'Completed' : commandStates[id] === 'failed' ? 'Failed' : 'Pending'}
                </span>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* ── AGENT SELECTOR: Segmented Control / Tab Row (No large cards) ── */}
      <section className="flex flex-col gap-6">
        <div className="flex items-center justify-between border-b border-[#E2E8F0]">
          <div className="flex items-center gap-8">
            {Object.entries(agents).map(([id, item]) => {
              const active = selected === id;
              return (
                <button
                  key={id}
                  onClick={() => setSelected(id)}
                  className={`relative py-3 text-[14px] font-medium transition ${
                    active
                      ? 'text-[#4338CA] font-semibold'
                      : 'text-[#64748B] hover:text-[#0F172A]'
                  }`}
                >
                  <span>{item.title[langIndex]}</span>
                  {active && (
                    <span className="absolute bottom-0 left-0 right-0 h-[2px] bg-[#4338CA]" />
                  )}
                </button>
              );
            })}
          </div>

          <span className="text-[12px] text-[#64748B]">
            {selected === 'predict' ? 'Groq Qwen' : 'Google Gemini 2.5'}
          </span>
        </div>

        {/* ── SELECTED AGENT DETAIL AREA (Plain headings and text, NO boxes) ── */}
        <div className="flex flex-col gap-6">
          <div>
            <h3 className="text-[16px] font-semibold text-[#0F172A]">
              {current.title[langIndex]} Protocol
            </h3>
            <p className="text-[14px] text-[#475569] mt-1">
              {current.goal[langIndex]}
            </p>
          </div>

          {/* Telemetry & Output rendered as plain text lists with small labels, NO boxes */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 py-4 border-t border-b border-[#E2E8F0]">
            <div>
              <div className="text-[12px] uppercase font-medium text-[#64748B] tracking-wider mb-1">
                Telemetry ingestion & inputs
              </div>
              <p className="text-[14px] text-[#334155] leading-relaxed">
                {current.data[langIndex]}
              </p>
            </div>
            <div>
              <div className="text-[12px] uppercase font-medium text-[#64748B] tracking-wider mb-1">
                Advisory output & officer checks
              </div>
              <p className="text-[14px] text-[#334155] leading-relaxed">
                {current.output[langIndex]}
              </p>
            </div>
          </div>

          {/* Type bar for individual agent queries */}
          <div className="flex flex-col gap-3">
            <div className="flex items-center justify-between text-[12px]">
              <span className="font-medium text-[#475569]">
                {selected === 'predict' ? historyLabels.title : `Direct query for ${current.title[0]}`}
              </span>
              {history?.available_from && selected === 'predict' && (
                <span className="text-[#64748B]">
                  Archive: {history.available_from} to {history.available_through || 'present'}
                </span>
              )}
            </div>

            <div className="flex items-center gap-2">
              <div className="relative flex-1">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[#94A3B8]">
                  <Search className="w-4 h-4" strokeWidth={1.5} />
                </span>
                <input
                  type="text"
                  value={historyQuery}
                  onChange={(e) => setHistoryQuery(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      if (selected === 'predict') handleHistorySearch();
                      else handleTriggerRun();
                    }
                  }}
                  placeholder={current.placeholder}
                  className="vp-input pl-9"
                />
              </div>

              {selected === 'predict' && (
                <button
                  type="button"
                  onClick={() => handleHistorySearch()}
                  disabled={historyLoading || !historyQuery.trim() || !groqConsent || !status?.groq_configured}
                  className="vp-btn vp-btn-secondary"
                >
                  {historyLoading ? <RefreshCw className="w-4 h-4 animate-spin" strokeWidth={1.5} /> : <Search className="w-4 h-4" strokeWidth={1.5} />}
                  <span>Search</span>
                </button>
              )}

              <button
                type="button"
                onClick={handleTriggerRun}
                disabled={loading || !agentConfigured || !consent}
                className="vp-btn vp-btn-primary"
              >
                {runningCurrent ? <RefreshCw className="w-4 h-4 animate-spin" strokeWidth={1.5} /> : <Send className="w-4 h-4" strokeWidth={1.5} />}
                <span>Run {current.title[0]}</span>
              </button>
            </div>

            {/* Quick scenario chips: Plain text chips with 1px border, neutral icon (no lightning), 8px gap */}
            {selected === 'predict' && (
              <div className="flex flex-wrap items-center gap-2 pt-1">
                <span className="text-[12px] text-[#64748B]">Quick scenarios:</span>
                {SUGGESTION_CHIPS.map((chip) => (
                  <button
                    key={chip}
                    type="button"
                    onClick={() => handleChipClick(chip)}
                    className="h-7 px-2.5 rounded-[6px] border border-[#E2E8F0] bg-white hover:bg-[#F8FAFC] text-[12px] text-[#475569] inline-flex items-center gap-1.5 transition"
                  >
                    <Search className="w-3 h-3 text-[#64748B]" strokeWidth={1.5} />
                    <span>{chip}</span>
                  </button>
                ))}
              </div>
            )}

            {/* Feedback states */}
            {historyLoading && (
              <div className="text-[12px] text-[#4338CA] flex items-center gap-2 py-1">
                <RefreshCw className="w-3.5 h-3.5 animate-spin" strokeWidth={1.5} />
                <span>{historyLabels.loading}</span>
              </div>
            )}

            {(historyError || (history && history.status === 'failed')) && (
              <div className="text-[12px] text-[#DC2626] py-1">
                {historyError || historyLabels.unavailable}
              </div>
            )}

            {/* Historical events list */}
            {selectedEvent && (
              <div className="flex flex-col gap-3 pt-3 border-t border-[#E2E8F0]">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="flex flex-col gap-1">
                    <label className="text-[12px] font-medium text-[#475569]">
                      {historyLabels.event}
                    </label>
                    <select
                      value={selectedEventId}
                      onChange={(e) => setSelectedEventId(e.target.value)}
                      className="vp-input"
                    >
                      {(history?.events || []).map((item) => (
                        <option key={item.id} value={item.id}>
                          {item.window_start} – {item.window_end} ({item.mean_hotspot_rainfall_mm ?? '—'} mm mean)
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="flex flex-col gap-1">
                    <label className="text-[12px] font-medium text-[#475569]">
                      {historyLabels.area}
                    </label>
                    <select
                      value={selectedHistoryZone}
                      onChange={(e) => setSelectedHistoryZone(e.target.value)}
                      className="vp-input"
                    >
                      <option value="">{historyLabels.all}</option>
                      {(riskZones || []).map((zone) => (
                        <option key={zone.id} value={zone.id}>{zone.name}</option>
                      ))}
                    </select>
                  </div>
                </div>

                {/* Evidence table rows */}
                <div className="flex flex-col divide-y divide-[#E2E8F0] border-t border-b border-[#E2E8F0]">
                  {selectedEventAreas.map((area) => (
                    <div key={area.zone_id} className="py-2 flex items-center justify-between text-[12px]">
                      <span className="font-medium text-[#0F172A]">{zoneName(area.zone_id)}</span>
                      <div className="flex items-center gap-4 text-[#64748B]">
                        <span>Rain: <strong className="text-[#0F172A] font-medium">{area.rainfall_total_mm ?? '—'} mm</strong></span>
                        <span>Incidents: <strong className="text-[#0F172A] font-medium">{area.incident_reports}</strong></span>
                        <span>Road blocks: <strong className="text-[#0F172A] font-medium">{area.blocked_road_reports}</strong></span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Individual permission helper / error */}
            {!agentConfigured && (
              <div className="text-[12px] text-[#D97706]">
                {selected === 'predict'
                  ? 'Add GROQ_API_KEY to backend .env to run Weather Predict.'
                  : 'Add GEMINI_API_KEY to backend .env to run this agent.'}
              </div>
            )}

            {err && (
              <div className="text-[12px] text-[#DC2626]">
                {err}
              </div>
            )}
          </div>
        </div>

        {/* ── AGENT RESULTS / REPORT: Plain headings and text, NO card boxes ── */}
        {selectedResult && (
          <section className="flex flex-col gap-6 pt-6 border-t border-[#E2E8F0]">
            <div className="flex items-center justify-between">
              <h3 className="text-[16px] font-semibold text-[#0F172A]">
                Intelligence Report
              </h3>
              <span className="vp-mono text-[12px] text-[#64748B]">
                {selectedResult.generated_at && new Date(selectedResult.generated_at).toLocaleString()}
              </span>
            </div>

            {selected === 'predict' && (
              <div className="flex flex-col gap-6">
                <div>
                  <div className="text-[12px] uppercase font-medium text-[#64748B] tracking-wider mb-1">
                    Summary
                  </div>
                  <p className="text-[14px] text-[#0F172A] leading-relaxed">
                    {selectedResult.predict?.summary}
                  </p>
                </div>

                <div className="flex flex-col gap-2">
                  <div className="text-[12px] uppercase font-medium text-[#64748B] tracking-wider">
                    {assessmentLabels.title}
                  </div>
                  <div className="flex flex-col divide-y divide-[#E2E8F0] border-t border-b border-[#E2E8F0]">
                    {(selectedResult.predict?.zone_assessments || []).map((item) => {
                      const badge = levelBadge(item.level);
                      return (
                        <div key={item.zone_id} className="py-3 flex flex-col gap-1">
                          <div className="flex items-center justify-between">
                            <span className="font-medium text-[#0F172A] text-[14px]">{zoneName(item.zone_id)}</span>
                            <span
                              className="px-2 py-0.5 rounded-[4px] text-[12px] font-semibold uppercase"
                              style={{ backgroundColor: badge.bg, color: badge.text }}
                            >
                              {assessmentLabels[item.level] || item.level}
                            </span>
                          </div>
                          <p className="text-[14px] text-[#475569]">{item.evidence}</p>
                          <div className="text-[12px] text-[#4338CA]">
                            Officer check: {item.officer_check}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {(selectedResult.predict?.focus_zones || []).length > 0 && (
                  <div className="flex flex-col gap-2">
                    <div className="text-[12px] uppercase font-medium text-[#64748B] tracking-wider">
                      Focus zones
                    </div>
                    <div className="flex flex-col divide-y divide-[#E2E8F0] border-t border-b border-[#E2E8F0]">
                      {selectedResult.predict.focus_zones.map((item, idx) => (
                        <div key={`${item.zone_id}-${idx}`} className="py-2.5 flex flex-col gap-1">
                          <span className="font-medium text-[#0F172A] text-[14px]">{zoneName(item.zone_id)}</span>
                          <p className="text-[14px] text-[#475569]">{item.observation}</p>
                          <div className="text-[12px] text-[#4338CA]">
                            Recommended check: {item.officer_check}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            {selected === 'prepare' && (
              <div className="flex flex-col gap-6">
                <div>
                  <div className="text-[12px] uppercase font-medium text-[#64748B] tracking-wider mb-1">
                    Readiness summary
                  </div>
                  <p className="text-[14px] text-[#0F172A] leading-relaxed">
                    {selectedResult.prepare?.summary}
                  </p>
                </div>

                <div className="flex flex-col divide-y divide-[#E2E8F0] border-t border-b border-[#E2E8F0]">
                  {(selectedResult.prepare?.readiness_actions || []).map((item, idx) => (
                    <div key={idx} className="py-3 flex flex-col gap-1">
                      <span className="font-medium text-[#0F172A] text-[14px]">
                        {item.zone_id ? zoneName(item.zone_id) : 'Citywide'} · {item.action}
                      </span>
                      <p className="text-[14px] text-[#475569]">{item.reason}</p>
                      <div className="text-[12px] text-[#4338CA]">
                        Officer verification: {item.officer_check}
                      </div>
                    </div>
                  ))}
                </div>

                <button
                  onClick={onReviewPreparation}
                  className="self-start text-[14px] font-medium text-[#4338CA] hover:underline flex items-center gap-1.5"
                >
                  <span>Review prepositioning recommendations</span>
                  <ArrowRight className="w-4 h-4" strokeWidth={1.5} />
                </button>
              </div>
            )}

            {selected === 'respond' && (
              <div className="flex flex-col gap-6">
                <div>
                  <div className="text-[12px] uppercase font-medium text-[#64748B] tracking-wider mb-1">
                    Situation summary
                  </div>
                  <p className="text-[14px] text-[#0F172A] leading-relaxed">
                    {selectedResult.respond?.summary}
                  </p>
                </div>

                <div className="flex flex-col divide-y divide-[#E2E8F0] border-t border-b border-[#E2E8F0]">
                  {(selectedResult.respond?.priorities || []).map((item, idx) => (
                    <div key={idx} className="py-3 flex flex-col gap-1.5">
                      <span className="font-medium text-[#0F172A] text-[14px]">
                        {item.zone_id ? zoneName(item.zone_id) : 'Citywide'} · {item.situation}
                      </span>
                      <ul className="list-disc pl-5 text-[14px] text-[#475569] space-y-1">
                        {item.recommended_steps?.map((step, i) => (
                          <li key={i}>{step}</li>
                        ))}
                      </ul>
                      <div className="text-[12px] text-[#4338CA] pt-1">
                        Officer verification: {item.officer_check}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="flex items-center gap-2 pt-2 text-[12px] text-[#64748B]">
              <ShieldCheck className="w-4 h-4 text-[#16A34A]" strokeWidth={1.5} />
              <span>Advisory recommendations only. Officer review and approval is required prior to dispatch.</span>
            </div>
          </section>
        )}
      </section>
    </div>
  );
}
