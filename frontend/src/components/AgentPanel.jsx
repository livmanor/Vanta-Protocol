import React, { useEffect, useState } from 'react';
import { ArrowRight, CloudRain, Compass, RefreshCw, ShieldCheck, Siren, Sparkles, Send } from 'lucide-react';
import { useLanguage } from '../i18n.jsx';
import OperationsCalendar from './OperationsCalendar';
import RespondSmsPanel from './RespondSmsPanel';

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
  const [groqConsent, setGroqConsent] = useState(true);
  const [geminiConsent, setGeminiConsent] = useState(true);
  const [commandRunning, setCommandRunning] = useState(false);
  const [commandStates, setCommandStates] = useState({});
  const [historyQuery, setHistoryQuery] = useState('');
  const [areaQuery, setAreaQuery] = useState('');

  const selectedResult = results[selected];
  const current = agents[selected];
  const agentConfigured = selected === 'predict' ? status?.groq_configured : status?.configured;
  const consent = selected === 'predict' ? groqConsent : geminiConsent;
  const zoneName = (id) => riskZones?.find(zone => zone.id === id)?.name || Object.values(results).flatMap(result => result?.analysis_areas || []).find(area => area.zone_id === id)?.zone_name || id;

  const handleChipClick = (chipText) => {
    setHistoryQuery(chipText);
  };

  const handleTriggerRun = () => {
    if (!agentConfigured || !consent) return;
    const inputs = {};
    if (historyQuery.trim()) inputs.officer_query = historyQuery.trim();
    if (areaQuery.trim()) inputs.area_query = areaQuery.trim();
    if (results.predict?.predict) inputs.previous_agent_output = { predict: results.predict.predict };
    if (results.prepare?.prepare) inputs.previous_agent_output = { ...(inputs.previous_agent_output || {}), prepare: results.prepare.prepare };
    onRun(selected, consent, language, inputs);
  };

  const handleRunCommand = async () => {
    if (!historyQuery.trim() || !groqConsent || !geminiConsent || !status?.groq_configured || !status?.configured || commandRunning || loading) return;
    setCommandRunning(true);
    setCommandStates({});
    const inputs = { officer_query: historyQuery.trim(), area_query: areaQuery.trim() || null };
    const previous = {};
    try {
      for (const id of ['predict', 'prepare', 'respond']) {
        setSelected(id);
        setCommandStates(previous => ({ ...previous, [id]: 'running' }));
        const result = await onRun(id, id === 'predict' ? groqConsent : geminiConsent, language, { ...inputs, previous_agent_output: Object.keys(previous).length ? { ...previous } : undefined });
        setCommandStates(previous => ({ ...previous, [id]: result ? 'complete' : 'failed' }));
        if (result) previous[id] = result[id] || result;
      }
    } finally {
      setCommandRunning(false);
    }
  };

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
    if (!historyQuery.trim()) return 'Enter an incident instruction';
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

        {/* Incident instruction input */}
        <div className="w-full flex flex-col gap-1.5">
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
          <div className="mt-1 flex flex-wrap items-center gap-2">
            {SUGGESTION_CHIPS.map(chip => <button key={chip} type="button" onClick={() => handleChipClick(chip)} className="h-7 rounded-[6px] border border-[#E2E8F0] bg-white px-2.5 text-[12px] text-[#475569] hover:bg-[#F8FAFC]">{chip}</button>)}
          </div>
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
                  <span className="mt-1 block text-[10px] font-normal text-[#64748B]">
                    {loadingAgent === id || commandStates[id] === 'running' ? 'Running' : errors[id] ? `Failed · ${errors[id]}` : results[id] ? `Done · ${new Date(results[id].generated_at || Date.now()).toLocaleTimeString()}` : 'Not run'}
                  </span>
                  {active && (
                    <span className="absolute bottom-0 left-0 right-0 h-[2px] bg-[#4338CA]" />
                  )}
                </button>
              );
            })}
          </div>

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

          <div className="flex flex-wrap items-center justify-between gap-4 border-t border-[#E2E8F0] pt-4">
            <div className="text-[12px] text-[#64748B]">
              {agentConfigured ? 'Ready to run with the current form values.' : selected === 'predict' ? 'GROQ_API_KEY is missing.' : 'GEMINI_API_KEY is missing.'}
            </div>
            <button type="button" onClick={handleTriggerRun} disabled={loading || !agentConfigured || !consent || !historyQuery.trim()} className="vp-btn vp-btn-secondary">
              {runningCurrent ? <RefreshCw className="w-4 h-4 animate-spin" strokeWidth={1.5} /> : <Send className="w-4 h-4" strokeWidth={1.5} />}
              <span>Run this agent only</span>
            </button>
          </div>
          {err && <div className="text-[12px] text-[#DC2626]">{err}<button type="button" onClick={handleTriggerRun} className="ml-2 font-medium underline">Retry</button></div>}
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
            {selected === 'prepare' && <><p className="text-[12px] font-medium text-[#B45309]">Drafted by AI, requires officer approval.</p><OperationsCalendar calendar={selectedResult.operations_calendar || selectedResult.prepare?.operations_calendar} model={selectedResult.model || selectedResult.provider} /></>}
            {selected === 'respond' && <RespondSmsPanel draft={selectedResult.respond?.sms_draft} model={selectedResult.model || selectedResult.provider} testMode={status?.sms_test_mode ?? true} sender={status?.sms_sender} />}
            <div className="pt-2 text-[11px] text-[#64748B]">Model: {selectedResult.model || selectedResult.provider || 'Not available'}</div>
          </section>
        )}
      </section>
    </div>
  );
}
