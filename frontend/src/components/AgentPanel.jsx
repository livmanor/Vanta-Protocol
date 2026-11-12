import React, { useEffect, useState } from 'react';
import { Activity, AlertTriangle, ArrowRight, CheckCircle2, CloudRain, Compass, RefreshCw, ShieldCheck, Siren, Sparkles } from 'lucide-react';
import { useLanguage } from '../i18n.jsx';

const agents = {
  predict: { icon: CloudRain, color: 'cyan', title: ['Weather Predict', 'मौसम अनुमान', 'వాతావరణ అంచనా'], goal: ['Compare live forecasts with the latest historical rain and recorded area impacts.', 'लाइव पूर्वानुमान की तुलना हाल की बारिश और दर्ज क्षेत्रीय प्रभावों से करें।', 'ప్రత్యక్ష అంచనాలను ఇటీవలి వర్షపాతం, నమోదైన ప్రాంతీయ ప్రభావాలతో పోల్చండి.'], data: ['Live weather and flood risk, recent rainfall history, logged flood and road-block counts.', 'लाइव मौसम व बाढ़ जोखिम, हाल की वर्षा, दर्ज बाढ़ और सड़क अवरोधों की संख्या।', 'ప్రత్యక్ష వాతావరణం, వరద ప్రమాదం, ఇటీవలి వర్షపాతం, నమోదైన వరద/రోడ్డు మూసివేతల సంఖ్య.'], output: ['Rain-event comparison, focus areas, data gaps and officer verification checks.', 'बारिश की तुलना, ध्यान देने योग्य क्षेत्र, डेटा की कमी और अधिकारी जाँच।', 'వర్షపాతం పోలిక, దృష్టి ప్రాంతాలు, డేటా లోపాలు, అధికారి తనిఖీలు.'] },
  prepare: { icon: Compass, color: 'amber', title: ['Prepare', 'तैयारी', 'సన్నద్ధత'], goal: ['Turn the forecast, past impacts and available resources into pre-event readiness checks.', 'पूर्वानुमान, पिछले प्रभावों और उपलब्ध संसाधनों से आपदा-पूर्व तैयारी जाँचें बनाएँ।', 'అంచనా, గత ప్రభావాలు, అందుబాటులోని వనరులతో విపత్తుకు ముందస్తు తనిఖీలు రూపొందించండి.'], data: ['Current zone risks, recent rain impacts and aggregated available-unit types and positioning.', 'मौजूदा क्षेत्रीय जोखिम, हाल के वर्षा प्रभाव और उपलब्ध दलों का सार।', 'ప్రస్తుత ప్రాంతీయ ప్రమాదాలు, ఇటీవలి వర్ష ప్రభావాలు, అందుబాటులోని బృందాల సమగ్ర వివరాలు.'], output: ['Evidence-linked readiness actions, resource gaps and officer checks. No assignments.', 'सबूत-आधारित तैयारी कार्य, संसाधन की कमी और अधिकारी जाँच। तैनाती नहीं।', 'ఆధారాలతో కూడిన సన్నద్ధత చర్యలు, వనరుల లోపాలు, అధికారి తనిఖీలు. కేటాయింపులు లేవు.'] },
  respond: { icon: Siren, color: 'rose', title: ['Respond', 'प्रतिक्रिया', 'ప్రతిస్పందన'], goal: ['Assess active reported incidents and help the officer coordinate a safe response.', 'सक्रिय दर्ज घटनाओं का आकलन कर अधिकारी को सुरक्षित प्रतिक्रिया समन्वय में सहायता दें।', 'ప్రస్తుతం నమోదైన ఘటనలను అంచనా వేసి, సురక్షిత ప్రతిస్పందన సమన్వయంలో అధికారికి సహాయపడండి.'], data: ['Active incident counts by type, reported urgency and zone; logged road closures; live risk; available resource counts.', 'प्रकार, तात्कालिकता और क्षेत्र के अनुसार सक्रिय घटनाएँ; दर्ज सड़क बंद; लाइव जोखिम; उपलब्ध संसाधनों की संख्या।', 'రకం, అత్యవసరత, ప్రాంతం వారీగా ఘటనలు; నమోదైన రోడ్డు మూసివేతలు; ప్రత్యక్ష ప్రమాదం; వనరుల సంఖ్య.'], output: ['Priority areas, suggested coordination steps and what an officer must verify. No dispatch.', 'प्राथमिकता वाले क्षेत्र, समन्वय सुझाव और अधिकारी द्वारा जाँची जाने वाली बातें। रवाना नहीं करता।', 'ప్రాధాన్యత ప్రాంతాలు, సమన్వయ సూచనలు, అధికారి నిర్ధారించాల్సిన అంశాలు. పంపిణీ చేయదు.'] },
};

export default function AgentPanel({ status, results = {}, errors = {}, loadingAgent, onRun, onReviewPreparation, riskZones }) {
  const { language } = useLanguage();
  const langIndex = language === 'hi' ? 1 : language === 'te' ? 2 : 0;
  const [selected, setSelected] = useState('predict');
  const [consent, setConsent] = useState(false);
  const selectedResult = results[selected];
  const current = agents[selected];
  const zoneName = (id) => riskZones.find(zone => zone.id === id)?.name || id;
  useEffect(() => setConsent(false), [selected]);

  const colors = { cyan: 'border-cyan-700 bg-cyan-950/40 text-cyan-200', amber: 'border-amber-700 bg-amber-950/40 text-amber-200', rose: 'border-rose-700 bg-rose-950/40 text-rose-200' };
  const dataForConsent = {
    predict: ['This run sends zone risk, forecast, historical rainfall and aggregated flood/road-report counts to Google Gemini. No raw incident reports or exact locations are sent.', 'इस रन में क्षेत्रीय जोखिम, पूर्वानुमान, ऐतिहासिक वर्षा और बाढ़/सड़क रिपोर्ट की कुल संख्या Google Gemini को भेजी जाएगी। मूल रिपोर्ट या सटीक स्थान नहीं भेजे जाएँगे।', 'ఈ రన్‌లో ప్రాంతీయ ప్రమాదం, అంచనా, చారిత్రక వర్షపాతం, వరద/రోడ్డు నివేదికల సమగ్ర సంఖ్యలు Google Geminiకి పంపబడతాయి. అసలు నివేదికలు లేదా ఖచ్చితమైన స్థానాలు పంపబడవు.'],
    prepare: ['This run sends zone risk, forecast, historical rainfall and aggregated resource-positioning information to Google Gemini. Unit IDs, station names and exact locations are excluded.', 'इस रन में क्षेत्रीय जोखिम, पूर्वानुमान, ऐतिहासिक वर्षा और संसाधन स्थिति का सार Google Gemini को भेजा जाएगा। यूनिट आईडी, स्टेशन नाम और सटीक स्थान शामिल नहीं हैं।', 'ఈ రన్‌లో ప్రాంతీయ ప్రమాదం, అంచనా, చారిత్రక వర్షపాతం, వనరుల స్థితి సమగ్ర వివరాలు Google Geminiకి పంపబడతాయి. యూనిట్ ఐడీలు, స్టేషన్ పేర్లు, ఖచ్చితమైన స్థానాలు ఉండవు.'],
    respond: ['This run sends aggregated active incident type, urgency and people counts by zone, logged closure counts, risk and resource availability to Google Gemini. Raw messages, IDs and exact locations are excluded.', 'इस रन में क्षेत्रवार सक्रिय घटना प्रकार, तात्कालिकता और लोगों की कुल संख्या, सड़क बंद की संख्या, जोखिम और संसाधन उपलब्धता Google Gemini को भेजी जाएगी। मूल संदेश, आईडी और सटीक स्थान शामिल नहीं हैं।', 'ఈ రన్‌లో ప్రాంతాల వారీగా క్రియాశీల ఘటన రకాలు, అత్యవసరత, ప్రజల సంఖ్య, రోడ్డు మూసివేతలు, ప్రమాదం, వనరుల లభ్యత Google Geminiకి పంపబడతాయి. అసలు సందేశాలు, ఐడీలు, ఖచ్చితమైన స్థానాలు పంపబడవు.'],
  };
  const loading = loadingAgent !== null;
  const runningCurrent = loadingAgent === selected;
  const err = errors[selected];

  return (
    <div className="flex flex-col gap-4 text-sm">
      <section className="rounded-xl border border-slate-700 bg-slate-900/80 p-4">
        <div className="mb-3 flex items-center justify-between gap-3">
          <div>
            <div className="text-xs font-bold uppercase tracking-[.16em] text-slate-400">{language === 'hi' ? 'एजेंट कार्यक्षेत्र' : language === 'te' ? 'ఏజెంట్ వర్క్‌స్పేస్' : 'Agent Workbench'}</div>
            <h2 className="mt-1 text-lg font-extrabold text-white">{language === 'hi' ? 'एक एजेंट चुनें' : language === 'te' ? 'ఒక ఏజెంట్‌ను ఎంచుకోండి' : 'Choose an agent'}</h2>
          </div>
          <span className={`rounded-full border px-3 py-1 text-xs font-bold ${status?.configured ? 'border-emerald-700 bg-emerald-950/60 text-emerald-300' : 'border-amber-700 bg-amber-950/60 text-amber-200'}`}>
            {status?.configured ? 'GEMINI READY' : 'API KEY REQUIRED'}
          </span>
        </div>
        <div className="grid grid-cols-1 gap-2 md:grid-cols-3">
          {Object.entries(agents).map(([id, item]) => {
            const Icon = item.icon;
            const active = selected === id;
            return <button key={id} onClick={() => setSelected(id)} aria-pressed={active}
              className={`rounded-xl border p-3 text-left transition ${active ? colors[item.color] : 'border-slate-700 bg-slate-950/70 text-slate-300 hover:border-slate-500'}`}>
              <div className="flex items-center gap-2 font-bold"><Icon className="h-5 w-5" />{item.title[langIndex]}</div>
              <p className="mt-2 text-xs leading-relaxed text-slate-300">{item.goal[langIndex]}</p>
              <div className="mt-3 flex items-center gap-1 text-xs font-semibold text-white">{results[id] ? (language === 'hi' ? 'परिणाम उपलब्ध' : language === 'te' ? 'ఫలితం సిద్ధం' : 'Result available') : (language === 'hi' ? 'अभी नहीं चलाया' : language === 'te' ? 'ఇంకా నడపలేదు' : 'Not run yet')} {results[id] && <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" />}</div>
            </button>;
          })}
        </div>
      </section>

      <section className="rounded-xl border border-slate-700 bg-[#111827]/95 p-4">
        <div className="flex items-center gap-2">
          <current.icon className={`h-5 w-5 ${selected === 'predict' ? 'text-cyan-300' : selected === 'prepare' ? 'text-amber-300' : 'text-rose-300'}`} />
          <h3 className="text-base font-extrabold text-white">{current.title[langIndex]} · {language === 'hi' ? 'उद्देश्य' : language === 'te' ? 'లక్ష్యం' : 'Goal'}</h3>
        </div>
        <p className="mt-2 leading-relaxed text-slate-200">{current.goal[langIndex]}</p>
        <div className="mt-3 grid gap-3 md:grid-cols-2">
          <div className="rounded-lg bg-slate-950/80 p-3"><div className="text-xs font-bold uppercase text-slate-400">{language === 'hi' ? 'यह एजेंट क्या देखता है' : language === 'te' ? 'ఏజెంట్ పరిశీలించేది' : 'Inputs'}</div><p className="mt-1 text-xs leading-relaxed text-slate-200">{current.data[langIndex]}</p></div>
          <div className="rounded-lg bg-slate-950/80 p-3"><div className="text-xs font-bold uppercase text-slate-400">{language === 'hi' ? 'आपको क्या मिलेगा' : language === 'te' ? 'మీకు లభించేది' : 'Output'}</div><p className="mt-1 text-xs leading-relaxed text-slate-200">{current.output[langIndex]}</p></div>
        </div>

        {!status?.configured && <div className="mt-3 rounded-lg border border-amber-800 bg-amber-950/30 p-3 text-sm text-amber-100"><AlertTriangle className="mr-1 inline h-4 w-4" />{language === 'hi' ? 'backend .env में GEMINI_API_KEY जोड़ें और backend पुनः शुरू करें।' : language === 'te' ? 'backend .envలో GEMINI_API_KEY జోడించి backendను మళ్లీ ప్రారంభించండి.' : 'Add GEMINI_API_KEY to backend .env and restart the backend.'}</div>}
        {status?.configured && <label className="mt-3 flex cursor-pointer gap-3 rounded-lg border border-slate-600 bg-slate-950/80 p-3">
          <input type="checkbox" checked={consent} onChange={event => setConsent(event.target.checked)} className="mt-1 h-4 w-4 accent-violet-500" />
          <span className="text-xs leading-relaxed text-slate-200">{dataForConsent[selected][langIndex]}</span>
        </label>}
        {err && <div className="mt-3 rounded-lg border border-rose-800 bg-rose-950/40 p-3 text-rose-100">{err}</div>}
        <button onClick={() => onRun(selected, consent, language)} disabled={!status?.configured || !consent || loading}
          className="mt-3 flex w-full items-center justify-center gap-2 rounded-lg bg-violet-600 px-4 py-3 font-bold text-white shadow-lg transition hover:bg-violet-500 disabled:cursor-not-allowed disabled:opacity-50">
          {runningCurrent ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
          {runningCurrent ? (language === 'hi' ? 'एजेंट चल रहा है…' : language === 'te' ? 'ఏజెంట్ నడుస్తోంది…' : `Running ${current.title[0]}…`) : (language === 'hi' ? `${current.title[1]} चलाएँ` : language === 'te' ? `${current.title[2]} నడపండి` : `Run ${current.title[0]}`)}
        </button>
        <div className="mt-2 text-center text-xs text-slate-500">Google Gemini · {status?.model || ''} · {language === 'hi' ? 'अधिकारी की मंज़ूरी आवश्यक' : language === 'te' ? 'అధికారి ఆమోదం అవసరం' : 'Officer approval required'}</div>
      </section>

      {selectedResult && <section className="flex flex-col gap-3 rounded-xl border border-slate-700 bg-slate-900/80 p-4">
        <div className="flex items-center justify-between"><h3 className="font-extrabold text-white">{language === 'hi' ? 'एजेंट रिपोर्ट' : language === 'te' ? 'ఏజెంట్ నివేదిక' : 'Agent report'}</h3><span className="text-xs text-slate-400">{selectedResult.generated_at && new Date(selectedResult.generated_at).toLocaleString()}</span></div>
        {selected === 'predict' && <>
          <div className="rounded-lg border border-cyan-900 bg-cyan-950/20 p-3"><div className="font-bold text-cyan-200">{language === 'hi' ? 'पूर्वानुमान विश्लेषण' : language === 'te' ? 'వాతావరణ అంచనా విశ్లేషణ' : 'Weather analysis'}</div><p className="mt-1 text-slate-100">{selectedResult.predict?.summary}</p></div>
          <div className="text-xs text-slate-300">{selectedResult.recent_rain_impacts?.source} · {selectedResult.recent_rain_impacts?.status} · {selectedResult.recent_rain_impacts?.window_start || '—'} – {selectedResult.recent_rain_impacts?.window_end || '—'}</div>
          {(selectedResult.recent_rain_impacts?.zones || []).filter(area => area.event_precipitation_total_mm !== null || area.incident_count || area.blocked_road_reports).map(area => <div key={area.zone_id} className="rounded-lg border border-slate-700 bg-slate-950/70 p-3 text-xs">
            <b className="text-white">{area.zone_name}</b>
            <div className="mt-1 text-slate-200">{language === 'hi' ? 'कुल वर्षा' : language === 'te' ? 'మొత్తం వర్షపాతం' : 'Rain total'}: {area.event_precipitation_total_mm ?? '—'} mm · {language === 'hi' ? 'बाढ़/फँसे लोग' : language === 'te' ? 'వరద/చిక్కుకున్నవారు' : 'Flood/trapped reports'}: {area.incident_count} · {language === 'hi' ? 'सड़क रिपोर्ट' : language === 'te' ? 'రోడ్డు నివేదికలు' : 'Road reports'}: {area.blocked_road_reports}</div>
          </div>)}
          <p className="text-xs text-amber-200">{language === 'hi' ? 'प्रभावों में केवल इस ऐप में दर्ज रिपोर्टें शामिल हैं; दर्ज नहीं होना, सड़क साफ होने का प्रमाण नहीं है।' : language === 'te' ? 'ప్రభావాల్లో ఈ యాప్‌లో నమోదు చేసిన నివేదికలే ఉంటాయి; నమోదు కాలేదని రోడ్డు స్పష్టంగా ఉందని కాదు.' : selectedResult.recent_rain_impacts?.traffic_data_note}</p>
          {(selectedResult.predict?.focus_zones || []).map((item, index) => <div key={`${item.zone_id}-${index}`} className="rounded-lg border border-slate-700 bg-slate-950/70 p-3"><b className="text-white">{zoneName(item.zone_id)}</b><p className="mt-1 text-slate-200">{item.observation}</p><p className="mt-1 text-xs text-cyan-100">Officer check: {item.officer_check}</p></div>)}
          {selectedResult.predict?.data_gaps?.map((gap, index) => <p key={index} className="text-xs text-amber-200">{gap}</p>)}
        </>}
        {selected === 'prepare' && <>
          <p className="text-slate-100">{selectedResult.prepare?.summary}</p>
          {(selectedResult.prepare?.readiness_actions || []).map((item, index) => <div key={index} className="rounded-lg border border-amber-900 bg-amber-950/20 p-3"><b className="text-amber-100">{item.zone_id ? zoneName(item.zone_id) : 'City-wide'} · {item.action}</b><p className="mt-1 text-slate-200">{item.reason}</p><p className="mt-1 text-xs text-amber-100">Officer check: {item.officer_check}</p></div>)}
          {(selectedResult.prepare?.readiness_gaps || []).map((gap, index) => <p key={index} className="text-xs text-amber-200">{gap}</p>)}
          <button onClick={onReviewPreparation} className="flex items-center gap-1 self-start text-xs font-bold text-amber-300 hover:text-white">Review positioning recommendations <ArrowRight className="h-4 w-4" /></button>
        </>}
        {selected === 'respond' && <>
          <div className="rounded-lg border border-rose-900 bg-rose-950/20 p-3"><div className="font-bold text-rose-200">{language === 'hi' ? 'स्थिति सारांश' : language === 'te' ? 'పరిస్థితి సారాంశం' : 'Situation summary'}</div><p className="mt-1 text-slate-100">{selectedResult.respond?.summary}</p></div>
          <div className="rounded-lg border border-slate-700 bg-slate-950/70 p-3">
            <div className="mb-2 text-xs font-bold uppercase text-slate-400">{language === 'hi' ? 'दर्ज मौजूदा जानकारी' : language === 'te' ? 'నమోదైన ప్రస్తుత సమాచారం' : 'Recorded operational picture'}</div>
            {(selectedResult.operational_context?.active_incident_and_logged_road_closure_counts_by_zone || []).filter(area => area.active_incidents || area.blocked_road_reports || area.risk_level >= 3).map(area => <div key={area.zone_id} className="flex flex-wrap justify-between gap-2 border-b border-slate-800 py-1.5 text-xs last:border-0"><b className="text-white">{area.zone_name}</b><span className="text-slate-200">Risk {area.risk_level} · {language === 'hi' ? 'घटनाएँ' : language === 'te' ? 'ఘటనలు' : 'incidents'} {area.active_incidents} · {language === 'hi' ? 'सड़क बंद रिपोर्ट' : language === 'te' ? 'రోడ్డు మూసివేత నివేదికలు' : 'road closure reports'} {area.blocked_road_reports}</span></div>)}
            <p className="mt-2 text-xs text-amber-200">{selectedResult.operational_context?.traffic_input_note}</p>
          </div>
          {(selectedResult.respond?.priorities || []).map((item, index) => <div key={index} className="rounded-lg border border-slate-700 bg-slate-950/70 p-3"><b className="text-white">{item.zone_id ? zoneName(item.zone_id) : 'City-wide'} · {item.situation}</b><ul className="mt-2 list-disc pl-5 text-slate-200">{item.recommended_steps?.map((step, i) => <li key={i}>{step}</li>)}</ul><p className="mt-2 text-xs text-rose-100">Officer check: {item.officer_check}</p></div>)}
          {(selectedResult.respond?.immediate_checks || []).map((item, index) => <p key={index} className="text-xs text-rose-100">✓ {item}</p>)}
          {(selectedResult.respond?.data_gaps || []).map((gap, index) => <p key={index} className="text-xs text-amber-200">{gap}</p>)}
        </>}
        {selected === 'prepare' && selectedResult.positioning_recommendations?.length > 0 && <div className="text-xs text-slate-300">{selectedResult.positioning_recommendations.length} deterministic positioning recommendation(s) ready for officer review.</div>}
        <div className="flex items-center gap-1 border-t border-slate-700 pt-2 text-xs text-slate-400"><ShieldCheck className="h-4 w-4" />{language === 'hi' ? 'सुझाव हैं, स्वचालित कार्रवाई नहीं।' : language === 'te' ? 'ఇవి సూచనలు మాత్రమే; స్వయంచాలక చర్యలు కావు.' : 'Recommendations only; no automatic action.'}</div>
      </section>}
      <p className="flex items-start gap-1 text-xs text-slate-500"><Activity className="mt-0.5 h-3.5 w-3.5 shrink-0" />{language === 'hi' ? 'एजेंट स्वतंत्र रूप से चलाए जाते हैं और अपने अलग लक्ष्य व रिपोर्ट रखते हैं।' : language === 'te' ? 'ఏజెంట్లు స్వతంత్రంగా నడుస్తాయి; ఒక్కొక్కదానికి వేరు లక్ష్యం, నివేదిక ఉంటాయి.' : 'Agents run independently, with separate goals and reports.'}</p>
    </div>
  );
}
