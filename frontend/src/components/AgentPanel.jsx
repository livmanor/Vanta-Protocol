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
    placeholder: 'Ask about historical flood, monsoon window, or hotspot rain (e.g. "Last year flood in Hyderabad")...'
  },
  prepare: {
    icon: Compass,
    title: ['Prepare', 'तैयारी', 'సన్నద్ధత'],
    goal: ['Turn forecasts, past impacts and available resources into pre-event readiness checks.', 'पूर्वानुमान, पिछले प्रभावों और उपलब्ध संसाधनों से आपदा-पूर्व तैयारी जाँचें बनाएँ।', 'అంచనా, గత ప్రభావాలు, అందుబాటులోని వనరులతో విపత్తుకు ముందస్తు తనిఖీలు రూపొందించండి.'],
    data: ['Current zone risks, recent rain impacts and aggregated available-unit types and positioning.', 'मौजूदा क्षेत्रीय जोखिम, हाल के वर्षा प्रभाव और उपलब्ध दलों का सार।', 'ప్రస్తుత ప్రాంతీయ ప్రమాదాలు, ఇటీవలి వర్ష ప్రభావాలు, అందుబాటులోని బృందాల సమగ్ర వివరాలు.'],
    output: ['Evidence-linked readiness actions, resource gaps and officer checks. No assignments.', 'सबूत-आधारित तैयारी कार्य, संसाधन की कमी और अधिकारी जाँच। तैनाती नहीं।', 'ఆధారాలతో కూడిన సన్నద్ధత చర్యలు, వనరుల లోపాలు, అధికారి తనిఖీలు. కేటాయింపులు లేవు.'],
    placeholder: 'Type operational focus or asset instruction (e.g. "Check boat readiness for Musi river zones")...'
  },
  respond: {
    icon: Siren,
    title: ['Respond', 'प्रतिक्रिया', 'ప్రతిస్పందన'],
    goal: ['Assess active reported incidents and help the officer coordinate a safe response.', 'सक्रिय दर्ज घटनाओं का आकलन कर अधिकारी को सुरक्षित प्रतिक्रिया समन्वय में सहायता दें।', 'ప్రస్తుతం నమోదైన ఘటనలను అంచనా వేసి, సురక్షిత ప్రతిస్పందన సమన్వయంలో అధికారికి సహాయపడండి.'],
    data: ['Active incident counts by type, reported urgency and zone; logged road closures; live risk; available resource counts.', 'प्रकार, तात्कालिकता और क्षेत्र के अनुसार सक्रिय घटनाएँ; दर्ज सड़क बंद; लाइव जोखिम; उपलब्ध संसाधनों की संख्या।', 'రకం, అత్యవసరత, ప్రాంతం వారీగా ఘటనలు; నమోదైన రోడ్డు మూసివేతలు; ప్రత్యక్ష ప్రమాదం; వనరుల సంఖ్య.'],
    output: ['Priority areas, suggested coordination steps and what an officer must verify. No dispatch.', 'प्राथमिकता वाले क्षेत्र, समन्वय सुझाव और अधिकारी द्वारा जाँची जाने वाली बातें। रवाना नहीं करता।', 'ప్రాధాన్యత ప్రాంతాలు, సమన్వయ సూచనలు, అధికారి నిర్ధారించాల్సిన అంశాలు. పంపిణీ చేయదు.'],
    placeholder: 'Type incident priority or officer guidance (e.g. "Focus on trapped citizens near Nampally")...'
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
  const zoneName = (id) => riskZones.find(zone => zone.id === id)?.name || Object.values(results).flatMap(result => result?.analysis_areas || []).find(area => area.zone_id === id)?.zone_name || id;

  const handleHistorySearch = async (queryToSearch) => {
    const q = (queryToSearch || historyQuery).trim();
    if (!q) return;
    if (!groqConsent || !status?.groq_configured) {
      setHistoryError('Enable Groq processing consent and configure GROQ_API_KEY before searching historical events.');
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
    en: { title: 'Ask about past rain, flood, or operational query', hint: 'Type your question or scenario. Example: “Retrieve effects of last year’s flood in Hyderabad city.”', search: 'Search history', loading: 'Resolving query & retrieving telemetry…', unavailable: 'Historical telemetry unavailable right now.', empty: 'No matching rainfall events found for that period.', event: 'Matching rain event', area: 'Focus area', all: 'All mapped hotspots', impacts: 'Evidence by hotspot', rainfall: 'Rain total', max: 'Max daily rain', reports: 'Flood / trapped / road reports', blocks: 'Blocked-road reports', coverage: 'Archive coverage', source: 'Rainfall is reanalysis sampled at six mapped hotspots, not gauge data or citywide total.', records: 'Effect counts include only reports recorded in this app.', allAreas: 'All mapped hotspots', selected: 'Resolved search' },
    hi: { title: 'पिछली बारिश या बाढ़ के बारे में पूछें', hint: 'घटना अपने शब्दों में लिखें। उदाहरण: “पिछले साल हैदराबाद में बाढ़ के प्रभाव दिखाएँ।”', search: 'इतिहास खोजें', loading: 'आपका प्रश्न समझकर ऐतिहासिक वर्षा खोजी जा रही है…', unavailable: 'ऐतिहासिक वर्षा अभी उपलब्ध नहीं है।', empty: 'इस अवधि में कोई वर्षा घटना नहीं मिली।', event: 'मिली वर्षा घटना', area: 'ध्यान क्षेत्र', all: 'सभी मानचित्रित हॉटस्पॉट', impacts: 'हॉटस्पॉट के अनुसार साक्ष्य', rainfall: 'कुल वर्षा', max: 'अधिकतम दैनिक वर्षा', reports: 'बाढ़ / फँसे लोग / सड़क रिपोर्ट', blocks: 'सड़क अवरोध रिपोर्ट', coverage: 'संग्रह कवरेज', source: 'वर्षा छह मानचित्रित हॉटस्पॉट पर पुनर्विश्लेषण है।', records: 'केवल ऐप में दर्ज प्रभाव शामिल हैं।', allAreas: 'सभी मानचित्रित हॉटस्पॉट', selected: 'समझी गई खोज' },
    te: { title: 'గత వర్షం లేదా వరద గురించి అడగండి', hint: 'మీ మాటల్లో ఘటనను వివరించండి. ఉదాహరణ: “గత ఏడాది హైదరాబాద్ వరద ప్రభావాలు చూపించు.”', search: 'చరిత్రలో వెతకండి', loading: 'మీ ప్రశ్నను అర్థం చేసుకుని చారిత్రక వర్షాన్ని వెతుకుతోంది…', unavailable: 'చారిత్రక వర్షపాతం ప్రస్తుతం అందుబాటులో లేదు.', empty: 'ఆ కాలానికి సరిపడే వర్ష ఘటనలు లేవు.', event: 'సరిపడిన వర్ష ఘటన', area: 'దృష్టి ప్రాంతం', all: 'మ్యాప్‌లోని అన్ని హాట్‌స్పాట్‌లు', impacts: 'హాట్‌స్పాట్ వారీ ఆధారాలు', rainfall: 'మొత్తం వర్షపాతం', max: 'గరిష్ఠ రోజువారీ వర్షం', reports: 'వరద / చిక్కుకున్నవారు / రోడ్డు నివేదికలు', blocks: 'రోడ్డు మూసివేత నివేదికలు', coverage: 'ఆర్కైవ్ పరిధి', source: 'వర్షపాతం ఆరు మ్యాప్ హాట్‌స్పాట్‌ల వద్ద రీఅనాలిసిస్.', records: 'యాప్‌లో నమోదైన ప్రభావాలే లెక్కించబడతాయి.', allAreas: 'మ్యాప్‌లోని అన్ని హాట్‌స్పాట్‌లు', selected: 'అర్థం చేసుకున్న శోధన' },
  }[language] || {};

  const assessmentLabels = {
    en: { title: 'Groq qualitative assessment · no fixed score', insufficient_data: 'Insufficient data', low: 'Low', moderate: 'Moderate', high: 'High', severe: 'Severe' },
    hi: { title: 'Groq का गुणात्मक आकलन · निश्चित स्कोर नहीं', insufficient_data: 'अपर्याप्त डेटा', low: 'कम', moderate: 'मध्यम', high: 'उच्च', severe: 'गंभीर' },
    te: { title: 'Groq గుణాత్మక అంచనా · స్థిర స్కోరు లేదు', insufficient_data: 'సరిపడా డేటా లేదు', low: 'తక్కువ', moderate: 'మధ్యస్థం', high: 'ఎక్కువ', severe: 'తీవ్రం' },
  }[language] || {};

  const levelPill = (lvl) => {
    switch (lvl) {
      case 'severe': return 'bg-red-100 text-red-800 border-red-200';
      case 'high': return 'bg-red-50 text-red-700 border-red-200';
      case 'moderate': return 'bg-amber-50 text-amber-700 border-amber-200';
      case 'low': return 'bg-emerald-50 text-emerald-700 border-emerald-200';
      default: return 'bg-slate-100 text-slate-600 border-slate-200';
    }
  };

  const dataForConsent = {
    predict: 'Groq receives the incident description, live weather observations, historical rainfall and logged impact counts. Raw incident messages and exact officer locations are excluded.',
    prepare: 'Sends zone risk, live forecasts, past impacts and aggregated available resource availability to Google Gemini. Unit IDs and exact coordinates are excluded.',
    respond: 'Sends aggregated active incident counts, urgency, people totals, road closures and available units to Google Gemini. Raw messages and officer IDs are excluded.',
  };

  const loading = loadingAgent !== null;
  const runningCurrent = loadingAgent === selected;
  const err = errors[selected];

  return (
    <div className="flex flex-col gap-5 text-sm">
      <section className="rounded-2xl border border-indigo-200 bg-indigo-50/50 p-5 shadow-sm">
        <div className="mb-3">
          <div className="text-[11px] font-bold uppercase tracking-[.14em] text-indigo-600">Incident Command Center</div>
          <h2 className="mt-0.5 text-lg font-extrabold text-slate-900">Describe the incident once</h2>
          <p className="mt-1 text-xs text-slate-600">The same officer instruction is passed to Predict, Prepare, then Respond. Each agent runs independently and keeps its own report. Predict uses the latest available rain history unless you select a historical event below.</p>
        </div>
          <div className="grid gap-3 md:grid-cols-[minmax(180px,0.7fr)_minmax(0,2fr)]">
            <label className="text-xs font-bold text-slate-700">Area to focus<input value={areaQuery} onChange={e => setAreaQuery(e.target.value)} placeholder="Secunderabad" className="mt-1 w-full rounded-xl border border-slate-300 bg-white p-3 text-sm font-normal text-slate-900 placeholder:text-slate-400 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-100"/><span className="mt-1 block font-normal text-slate-500">Type a city, town, or locality.</span></label>
            <label className="text-xs font-bold text-slate-700">Incident or instruction<textarea value={historyQuery} onChange={e => setHistoryQuery(e.target.value)} rows={3} placeholder="Example: Retrieve recent rain effects and prepare for expected flooding near Musi river areas." className="mt-1 w-full rounded-xl border border-slate-300 bg-white p-3 text-sm font-normal text-slate-900 placeholder:text-slate-400 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-100" /></label>
          </div>
        <div className="mt-3 grid gap-2 md:grid-cols-2">
          <label className="flex items-start gap-2 rounded-xl border border-slate-200 bg-white p-3 text-xs text-slate-700"><input type="checkbox" checked={groqConsent} onChange={e => setGroqConsent(e.target.checked)} className="mt-0.5 accent-indigo-600"/><span>Allow Groq to process the incident description and Predict data for this run.</span></label>
          <label className="flex items-start gap-2 rounded-xl border border-slate-200 bg-white p-3 text-xs text-slate-700"><input type="checkbox" checked={geminiConsent} onChange={e => setGeminiConsent(e.target.checked)} className="mt-0.5 accent-indigo-600"/><span>Allow Google Gemini to process aggregated Prepare and Respond data for this run.</span></label>
        </div>
        <button onClick={handleRunCommand} disabled={!historyQuery.trim() || !groqConsent || !geminiConsent || !status?.groq_configured || !status?.configured || commandRunning || loading} className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl bg-indigo-600 px-4 py-3 font-extrabold text-white shadow-sm transition hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-40">
          {commandRunning ? <RefreshCw className="h-4 w-4 animate-spin"/> : <Sparkles className="h-4 w-4"/>}{commandRunning ? 'Running command workflow…' : 'Run all agents in sequence'}
        </button>
        {Object.keys(commandStates).length > 0 && <div className="mt-3 grid gap-2 md:grid-cols-3">{['predict','prepare','respond'].map(id => <div key={id} className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs"><b>{agents[id].title[0]}</b><span className="float-right font-semibold">{commandStates[id] === 'running' ? 'Running…' : commandStates[id] === 'complete' ? 'Complete' : commandStates[id] === 'failed' ? 'Failed · see report' : 'Waiting'}</span></div>)}</div>}
      </section>
      {/* ── Choose Agent Selector ───────────────────────── */}
      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="mb-4 flex items-center justify-between gap-3">
          <div>
            <div className="text-[11px] font-bold uppercase tracking-[.14em] text-indigo-600">
              {language === 'hi' ? 'एजेंट कार्यक्षेत्र' : language === 'te' ? 'ఏజెంట్ వర్క్‌స్పేస్' : 'Agent Workbench'}
            </div>
            <h2 className="mt-0.5 text-lg font-extrabold text-slate-900">
              {language === 'hi' ? 'एक एजेंट चुनें' : language === 'te' ? 'ఒక ఏజెంట్‌ను ఎంచుకోండి' : 'Choose an Autonomous Agent'}
            </h2>
          </div>
          <span className={`rounded-full border px-3 py-1 text-xs font-bold ${
            agentConfigured
              ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
              : 'border-amber-200 bg-amber-50 text-amber-700'
          }`}>
            {selected === 'predict' ? (agentConfigured ? 'GROQ QWEN READY' : 'GROQ KEY REQUIRED') : (agentConfigured ? 'GEMINI 2.5 READY' : 'GEMINI KEY REQUIRED')}
          </span>
        </div>

        <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
          {Object.entries(agents).map(([id, item]) => {
            const Icon = item.icon;
            const active = selected === id;
            return (
              <button
                key={id}
                onClick={() => setSelected(id)}
                aria-pressed={active}
                className={`rounded-2xl border p-4 text-left transition flex flex-col justify-between ${
                  active
                    ? 'border-indigo-400 bg-indigo-50/60 ring-2 ring-indigo-100 shadow-sm'
                    : 'border-slate-200 bg-slate-50/70 hover:bg-slate-100/70 hover:border-slate-300'
                }`}
              >
                <div>
                  <div className="flex items-center gap-2.5 font-bold text-slate-900 text-sm">
                    <div className={`w-8 h-8 rounded-xl flex items-center justify-center ${active ? 'bg-indigo-600 text-white' : 'bg-white border border-slate-200 text-slate-600 shadow-xs'}`}>
                      <Icon className="h-4.5 w-4.5" />
                    </div>
                    {item.title[langIndex]}
                  </div>
                  <p className="mt-2.5 text-xs leading-relaxed text-slate-600 font-normal">
                    {item.goal[langIndex]}
                  </p>
                </div>

                <div className="mt-4 pt-2.5 border-t border-slate-200/80 flex items-center justify-between text-xs font-semibold">
                  <span className={results[id] ? 'text-emerald-700' : 'text-slate-400 font-normal'}>
                    {results[id] ? (language === 'hi' ? 'परिणाम तैयार' : language === 'te' ? 'ఫలితం సిద్ధం' : 'Result Ready') : (language === 'hi' ? 'तैयार' : language === 'te' ? 'సిద్ధంగా ఉంది' : 'Standby')}
                  </span>
                  {results[id] && <CheckCircle2 className="h-4 w-4 text-emerald-600" />}
                </div>
              </button>
            );
          })}
        </div>
      </section>

      {/* ── Active Agent Workspace ──────────────────────── */}
      <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm flex flex-col gap-5">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-indigo-600 flex items-center justify-center text-white shadow-sm">
            <current.icon className="h-5 w-5" />
          </div>
          <div>
            <h3 className="text-base font-extrabold text-slate-900">
              {current.title[langIndex]} · {language === 'hi' ? 'कार्य व दायरा' : language === 'te' ? 'లక్ష్యం' : 'Autonomous Advisory Protocol'}
            </h3>
            <p className="text-xs text-slate-500 mt-0.5">{current.goal[langIndex]}</p>
          </div>
        </div>

        <div className="grid gap-3 md:grid-cols-2">
          <div className="rounded-xl bg-slate-50 border border-slate-200 p-3.5">
            <div className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
              {language === 'hi' ? 'यह एजेंट क्या देखता है' : language === 'te' ? 'ఏజెంట్ పరిశీలించేది' : 'Telemetry Ingestion & Inputs'}
            </div>
            <p className="mt-1.5 text-xs leading-relaxed text-slate-700">{current.data[langIndex]}</p>
          </div>
          <div className="rounded-xl bg-slate-50 border border-slate-200 p-3.5">
            <div className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
              {language === 'hi' ? 'आपको क्या मिलेगा' : language === 'te' ? 'మీకు లభించేది' : 'Advisory Output & Officer Checks'}
            </div>
            <p className="mt-1.5 text-xs leading-relaxed text-slate-700">{current.output[langIndex]}</p>
          </div>
        </div>

        {/* ── PROMINENT TYPE BAR (Interactive Search & Prompt Bar) ── */}
        <div className="rounded-2xl border border-slate-200 bg-slate-50/70 p-4 shadow-xs flex flex-col gap-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h4 className="font-extrabold text-slate-900 text-sm">
                {selected === 'predict' ? historyLabels.title : `Ask or Instruct ${current.title[0]}`}
              </h4>
              <p className="text-xs text-slate-500">
                {selected === 'predict' ? historyLabels.hint : 'Type custom guidance, focus queries, or scenario instructions for the agent.'}
              </p>
            </div>
            {history?.available_from && selected === 'predict' && (
              <span className="rounded-full border border-slate-200 bg-white px-2.5 py-0.5 text-[11px] font-semibold text-slate-600 shadow-xs">
                {historyLabels.coverage}: {history.available_from} – {history.available_through || '—'}
              </span>
            )}
          </div>

          {/* Clean Type Bar Input with Embedded Action Button */}
          <div className="relative flex items-center">
            <span className="absolute left-3.5 flex items-center pointer-events-none text-slate-400">
              <Search className="w-4 h-4" />
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
              className="w-full pl-10 pr-28 py-3 text-xs md:text-sm bg-white border border-slate-300 rounded-xl text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-100 focus:border-indigo-500 shadow-sm transition"
            />
            <div className="absolute right-1.5 flex items-center gap-1.5">
              {selected === 'predict' && (
                <button
                  type="button"
                  onClick={() => handleHistorySearch()}
                  disabled={historyLoading || !historyQuery.trim() || !groqConsent || !status?.groq_configured}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-50 hover:bg-indigo-100 text-indigo-700 font-bold px-3 py-1.5 text-xs transition disabled:opacity-40"
                >
                  {historyLoading ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Search className="w-3.5 h-3.5" />}
                  <span>Search</span>
                </button>
              )}
              <button
                type="button"
                onClick={handleTriggerRun}
                disabled={loading || !agentConfigured || !consent}
                className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white font-bold px-3 py-1.5 text-xs transition disabled:opacity-40 shadow-xs"
              >
                {runningCurrent ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
                <span>Run</span>
              </button>
            </div>
          </div>

          {/* Quick-Click Suggestion Chips */}
          {selected === 'predict' && (
            <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
              <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider mr-1">Quick Scenarios:</span>
              {SUGGESTION_CHIPS.map((chip) => (
                <button
                  key={chip}
                  type="button"
                  onClick={() => handleChipClick(chip)}
                  className="px-2.5 py-1 rounded-lg text-xs font-medium bg-white hover:bg-indigo-50 hover:text-indigo-700 border border-slate-200 text-slate-600 transition shadow-2xs"
                >
                  ⚡ {chip}
                </button>
              ))}
            </div>
          )}

          {/* Historical Search Progress / Clarification / Empty Feedback */}
          {historyLoading && (
            <div className="flex items-center gap-2 text-xs text-indigo-700 font-medium pt-1">
              <RefreshCw className="h-4 w-4 animate-spin" />
              {historyLabels.loading}
            </div>
          )}

          {(historyError || (history && history.status === 'failed')) && (
            <div className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs text-rose-700 font-medium">
              {historyError || historyLabels.unavailable}
            </div>
          )}

          {history?.status === 'clarification_required' && (
            <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">
              {history.clarification_question}
            </div>
          )}

          {!historyLoading && history && history.status !== 'failed' && history.status !== 'clarification_required' && !history.events?.length && (
            <div className="text-xs text-slate-500 bg-white p-3 rounded-xl border border-slate-200">
              {history.resolved_hazard === 'flood'
                ? 'No flood reports recorded in Vanta for this period. Rainfall data alone does not confirm flooding.'
                : historyLabels.empty}
            </div>
          )}

          {/* Historical Event Selector */}
          {selectedEvent && (
            <div className="mt-2 flex flex-col gap-3 pt-3 border-t border-slate-200/80">
              <div className="grid gap-2.5 md:grid-cols-2">
                <label className="text-xs font-bold text-slate-700">
                  {historyLabels.event}
                  <select
                    value={selectedEventId}
                    onChange={(e) => setSelectedEventId(e.target.value)}
                    className="mt-1 block w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-100"
                  >
                    {(history?.events || []).map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.window_start} – {item.window_end} · {item.mean_hotspot_rainfall_mm === null ? '—' : `${item.mean_hotspot_rainfall_mm} mm mean at ${item.rainfall_point_count} points`}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="text-xs font-bold text-slate-700">
                  {historyLabels.area}
                  <select
                    value={selectedHistoryZone}
                    onChange={(e) => setSelectedHistoryZone(e.target.value)}
                    className="mt-1 block w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-100"
                  >
                    <option value="">{historyLabels.all}</option>
                    {(riskZones || []).map((zone) => (
                      <option key={zone.id} value={zone.id}>{zone.name}</option>
                    ))}
                  </select>
                </label>
              </div>

              <div className="rounded-xl border border-slate-200 bg-white p-3.5 shadow-xs">
                <div className="mb-2 text-[11px] font-bold uppercase tracking-wider text-slate-500">
                  {historyLabels.impacts} · {selectedEvent.window_start} – {selectedEvent.window_end}
                </div>
                <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
                  {selectedEventAreas.map((area) => (
                    <div key={area.zone_id} className="rounded-xl border border-slate-200 bg-slate-50 p-2.5 text-xs">
                      <b className="text-slate-900 font-bold">{zoneName(area.zone_id)}</b>
                      <div className="mt-1.5 grid grid-cols-2 gap-x-2 gap-y-1 text-slate-600 text-[11px]">
                        <span>{historyLabels.rainfall}</span><span className="text-right font-semibold text-slate-900">{area.rainfall_total_mm ?? '—'} mm</span>
                        <span>{historyLabels.max}</span><span className="text-right font-semibold text-slate-900">{area.max_daily_rainfall_mm ?? '—'} mm</span>
                        <span>{historyLabels.reports}</span><span className="text-right font-semibold text-slate-900">{area.incident_reports}</span>
                        <span>{historyLabels.blocks}</span><span className="text-right font-semibold text-slate-900">{area.blocked_road_reports}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* ── Single Unified Consent Disclosure ───────────── */}
        {agentConfigured ? (
          <label className="flex items-start gap-3 rounded-xl border border-slate-200 bg-slate-50/80 p-3.5 shadow-xs cursor-pointer">
            <input
              type="checkbox"
              checked={consent}
              onChange={(e) => selected === 'predict' ? setGroqConsent(e.target.checked) : setGeminiConsent(e.target.checked)}
              className="mt-0.5 h-4 w-4 accent-indigo-600 rounded"
            />
            <span className="text-xs leading-relaxed text-slate-700">
              {dataForConsent[selected]}
              {selected === 'predict' && selectedEvent && (
                <span className="mt-1 block font-bold text-indigo-700">
                  Active window: {selectedEvent.window_start} – {selectedEvent.window_end} · {selectedHistoryZone ? zoneName(selectedHistoryZone) : historyLabels.allAreas}
                </span>
              )}
            </span>
          </label>
        ) : (
          <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800 font-medium">
            <AlertTriangle className="mr-1.5 inline h-4 w-4 text-amber-600" />
            {selected === 'predict'
              ? 'Add GROQ_API_KEY to backend .env and restart backend.'
              : 'Add GEMINI_API_KEY to backend .env and restart backend.'}
          </div>
        )}

        {err && (
          <div className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs text-rose-800 font-medium">
            {err}
          </div>
        )}

        {/* ── Main Execution Button ───────────────────────── */}
        <button
          onClick={handleTriggerRun}
          disabled={!agentConfigured || !consent || loading}
          className="flex w-full items-center justify-center gap-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 px-4 py-3.5 font-extrabold text-white shadow-md transition disabled:cursor-not-allowed disabled:opacity-40 text-sm"
        >
          {runningCurrent ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
          {runningCurrent
            ? `Running ${current.title[0]}…`
            : selected === 'predict' && selectedEvent
            ? `Run Weather Predict (with ${selectedEvent.window_start} window)`
            : `Run ${current.title[0]}`}
        </button>

        <div className="text-center text-[11px] text-slate-400">
          {selected === 'predict' ? `Groq · ${status?.groq_model || 'qwen/qwen3.8-27b'}` : `Google Gemini · ${status?.model || 'gemini-2.5-flash'}`} · Advisory Output · Officer approval required
        </div>
      </section>

      {/* ── Agent Report Section ────────────────────────── */}
      {selectedResult && (
        <section className="flex flex-col gap-4 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex items-center justify-between border-b border-slate-100 pb-3">
            <h3 className="font-extrabold text-slate-900 text-base">
              {language === 'hi' ? 'एजेंट रिपोर्ट' : language === 'te' ? 'ఏజెంట్ నివేదిక' : 'Agent Intelligence Report'}
            </h3>
            <span className="text-xs text-slate-400 font-mono">
              {selectedResult.generated_at && new Date(selectedResult.generated_at).toLocaleString()}
            </span>
          </div>

          {selected === 'predict' && (
            <>
              <div className="rounded-xl border border-indigo-100 bg-indigo-50/70 p-4">
                <div className="font-bold text-indigo-900 text-xs uppercase tracking-wider mb-1">
                  Weather Analysis Summary
                </div>
                <p className="text-slate-800 leading-relaxed text-sm font-medium">{selectedResult.predict?.summary}</p>
              </div>

              <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-4">
                <div className="mb-3 text-[11px] font-bold uppercase tracking-wider text-slate-500">{assessmentLabels.title}</div>
                <div className="flex flex-col gap-2.5">
                  {(selectedResult.predict?.zone_assessments || []).map((item) => (
                    <div key={item.zone_id} className="rounded-xl border border-slate-200 bg-white p-3 shadow-xs">
                      <div className="flex items-center justify-between gap-2">
                        <b className="text-slate-900 text-sm">{zoneName(item.zone_id)}</b>
                        <span className={`px-2 py-0.5 rounded-full text-xs font-bold uppercase border ${levelPill(item.level)}`}>
                          {assessmentLabels[item.level] || item.level.replace('_', ' ')}
                        </span>
                      </div>
                      <p className="mt-1 text-xs text-slate-600 leading-relaxed">{item.evidence}</p>
                      <div className="mt-2 text-xs font-semibold text-indigo-700 bg-indigo-50/60 p-2 rounded-lg border border-indigo-100">
                        Officer check: {item.officer_check}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="text-xs text-slate-500 px-1 font-medium">
                Source: {selectedResult.recent_rain_impacts?.source} · {selectedResult.recent_rain_impacts?.status} · {selectedResult.recent_rain_impacts?.window_start || '—'} – {selectedResult.recent_rain_impacts?.window_end || '—'}
              </div>

              {(selectedResult.predict?.focus_zones || []).map((item, index) => (
                <div key={`${item.zone_id}-${index}`} className="rounded-xl border border-slate-200 bg-white p-3.5 shadow-xs">
                  <div className="flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-indigo-600" />
                    <b className="text-slate-900 text-xs uppercase tracking-wide">Focus Zone: {zoneName(item.zone_id)}</b>
                  </div>
                  <p className="mt-1 text-xs text-slate-700">{item.observation}</p>
                  <p className="mt-1.5 text-xs font-semibold text-indigo-700">Recommended check: {item.officer_check}</p>
                </div>
              ))}
            </>
          )}

          {selected === 'prepare' && (
            <>
              <div className="rounded-xl border border-indigo-100 bg-indigo-50/70 p-4">
                <p className="text-slate-900 font-medium leading-relaxed">{selectedResult.prepare?.summary}</p>
              </div>

              <div className="flex flex-col gap-2.5">
                {(selectedResult.prepare?.readiness_actions || []).map((item, index) => (
                  <div key={index} className="rounded-xl border border-slate-200 bg-white p-3.5 shadow-xs">
                    <b className="text-slate-900 text-sm">
                      {item.zone_id ? zoneName(item.zone_id) : 'City-wide'} · {item.action}
                    </b>
                    <p className="mt-1 text-xs text-slate-600">{item.reason}</p>
                    <p className="mt-2 text-xs font-semibold text-indigo-700 bg-indigo-50/60 p-2 rounded-lg border border-indigo-100">
                      Officer check: {item.officer_check}
                    </p>
                  </div>
                ))}
              </div>

              <button
                onClick={onReviewPreparation}
                className="inline-flex items-center gap-1.5 self-start text-xs font-bold text-indigo-600 hover:text-indigo-800 transition"
              >
                Review positioning recommendations <ArrowRight className="h-4 w-4" />
              </button>
            </>
          )}

          {selected === 'respond' && (
            <>
              <div className="rounded-xl border border-indigo-100 bg-indigo-50/70 p-4">
                <div className="font-bold text-indigo-900 text-xs uppercase tracking-wider mb-1">
                  Situation Summary
                </div>
                <p className="text-slate-900 font-medium leading-relaxed">{selectedResult.respond?.summary}</p>
              </div>

              <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-4">
                <div className="mb-2 text-[11px] font-bold uppercase tracking-wider text-slate-500">
                  Recorded Operational Picture
                </div>
                <div className="flex flex-col gap-1.5">
                  {(selectedResult.operational_context?.active_incident_and_logged_road_closure_counts_by_zone || []).filter(area => area.active_incidents || area.blocked_road_reports || area.risk_level >= 3).map((area) => (
                    <div key={area.zone_id} className="flex flex-wrap justify-between gap-2 border-b border-slate-200 py-2 text-xs last:border-0">
                      <b className="text-slate-900">{area.zone_name}</b>
                      <span className="text-slate-600 font-medium">
                        Risk {area.risk_level} · {area.active_incidents} incidents · {area.blocked_road_reports} road closures
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              {(selectedResult.respond?.priorities || []).map((item, index) => (
                <div key={index} className="rounded-xl border border-slate-200 bg-white p-3.5 shadow-xs">
                  <b className="text-slate-900 text-sm">{item.zone_id ? zoneName(item.zone_id) : 'City-wide'} · {item.situation}</b>
                  <ul className="mt-2 list-disc pl-5 text-xs text-slate-600 space-y-1">
                    {item.recommended_steps?.map((step, i) => (
                      <li key={i}>{step}</li>
                    ))}
                  </ul>
                  <p className="mt-2 text-xs font-semibold text-indigo-700 bg-indigo-50/60 p-2 rounded-lg border border-indigo-100">
                    Officer check: {item.officer_check}
                  </p>
                </div>
              ))}
            </>
          )}

          <div className="flex items-center gap-1.5 border-t border-slate-100 pt-3 text-xs text-slate-500 font-medium">
            <ShieldCheck className="h-4 w-4 text-emerald-600" />
            Advisory recommendations only. Officer review and approval is required prior to dispatch.
          </div>
        </section>
      )}

      <p className="flex items-center gap-1.5 text-xs text-slate-400 font-medium px-1">
        <Activity className="h-4 w-4 text-indigo-500 shrink-0" />
        Autonomous workflow: Predict, Prepare, and Respond operate independently with transparent data provenance.
      </p>
    </div>
  );
}
