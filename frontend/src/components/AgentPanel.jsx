import React, { useState } from 'react';
import { Activity, AlertTriangle, ArrowRight, Brain, CheckCircle2, RefreshCw, ShieldCheck, Sparkles } from 'lucide-react';
import { useLanguage } from '../i18n.jsx';

export default function AgentPanel({ status, result, error, loading, onRun, onReviewPreparation, riskZones }) {
  const { language } = useLanguage();
  const words = {
    en: ['Predict + Prepare Agents', 'Predict reviews live risk outputs; Prepare reviews unit positioning. The model adds a grounded summary for officer review. Nothing is dispatched automatically.', 'For this run, allow summarized operational data to be sent to Google Gemini. Unit IDs, station names, exact coordinates and incident reports are excluded.', 'Run Predict, then Prepare…', 'Run Predict + Prepare', 'Officer check', 'Review unit recommendations', 'Verify against live sources before acting.'],
    hi: ['जोखिम अनुमान + तैयारी एजेंट', 'अनुमान लाइव जोखिम परिणामों की समीक्षा करता है; तैयारी दलों की स्थिति देखती है। मॉडल अधिकारी की समीक्षा के लिए सारांश देता है। कोई दल अपने आप रवाना नहीं होता।', 'इस बार सारांशित संचालन डेटा Google Gemini को भेजने की अनुमति दें। यूनिट आईडी, स्टेशन नाम, सटीक निर्देशांक और घटना रिपोर्ट शामिल नहीं हैं।', 'अनुमान, फिर तैयारी चल रही है…', 'अनुमान + तैयारी चलाएँ', 'अधिकारी जाँच', 'दल सुझावों की समीक्षा करें', 'कार्रवाई से पहले लाइव स्रोतों से पुष्टि करें।'],
    te: ['ప్రమాద అంచనా + సన్నద్ధత ఏజెంట్లు', 'అంచనా ప్రత్యక్ష ప్రమాద ఫలితాలను పరిశీలిస్తుంది; సన్నద్ధత బృందాల స్థానాలను సమీక్షిస్తుంది. అధికారి పరిశీలన కోసం మోడల్ సారాంశం ఇస్తుంది. బృందాలు స్వయంచాలకంగా పంపబడవు.', 'ఈ రన్ కోసం సంగ్రహించిన కార్యాచరణ డేటాను Google Geminiకి పంపేందుకు అనుమతించండి. యూనిట్ ఐడీలు, స్టేషన్ పేర్లు, ఖచ్చితమైన కోఆర్డినేట్లు, ఘటన నివేదికలు చేర్చబడవు.', 'అంచనా, తర్వాత సన్నద్ధత నడుస్తోంది…', 'అంచనా + సన్నద్ధత నడపండి', 'అధికారి తనిఖీ', 'బృంద సూచనలను సమీక్షించండి', 'చర్యకు ముందు ప్రత్యక్ష మూలాలతో నిర్ధారించండి.'],
  }[language] || [];
  const [confirmGoogleProcessing, setConfirmGoogleProcessing] = useState(false);
  const configured = status?.configured === true;
  const zoneName = (id) => riskZones.find(zone => zone.id === id)?.name || id;
  const notes = result?.prepare?.zone_notes || [];
  const focusZones = result?.predict?.focus_zones || [];

  return (
    <div className="flex flex-col gap-3 text-xs">
      <section className="bg-[#111827]/95 border border-gray-800 rounded-xl p-4 flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Brain className="w-4 h-4 text-violet-400" />
            <span className="font-bold text-white text-sm">{words[0]}</span>
          </div>
          <span className={`px-2 py-0.5 rounded border text-[10px] font-bold ${configured ? 'text-emerald-400 border-emerald-800 bg-emerald-950/50' : 'text-amber-300 border-amber-800 bg-amber-950/50'}`}>
            {configured ? 'GEMINI READY' : 'NEEDS API KEY'}
          </span>
        </div>
        <p className="text-gray-200 leading-relaxed">{words[1]}</p>

        {!configured && (
          <div className="rounded-lg border border-amber-900/80 bg-amber-950/30 p-3 text-amber-100">
            <div className="font-semibold flex items-center gap-1.5"><AlertTriangle className="w-3.5 h-3.5" /> Gemini is not configured</div>
            <div className="text-[10px] text-amber-200/80 mt-1">Add your key as GEMINI_API_KEY in the backend .env file, then restart the backend. The key stays on the server.</div>
          </div>
        )}
        {error && <div className="rounded-lg border border-rose-900 bg-rose-950/40 p-3 text-rose-200">{error}</div>}

        {configured && <label className="rounded-lg border border-gray-700 bg-gray-900/60 p-3 flex gap-2.5 cursor-pointer">
          <input
            type="checkbox"
            checked={confirmGoogleProcessing}
            onChange={event => setConfirmGoogleProcessing(event.target.checked)}
            className="mt-0.5 accent-violet-500"
          />
          <span className="text-xs text-gray-200 leading-relaxed">
            {words[2]}
          </span>
        </label>}

        <button onClick={() => onRun(confirmGoogleProcessing)} disabled={!configured || !confirmGoogleProcessing || loading} className="w-full bg-violet-600 hover:bg-violet-500 text-white font-semibold py-2 rounded-lg flex items-center justify-center gap-2 disabled:opacity-50">
          {loading ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
          {loading ? words[3] : words[4]}
        </button>
        {status?.model && <div className="text-[10px] text-gray-500">Provider: Google Gemini · Model: {status.model}</div>}
      </section>

      {result && <>
        <section className="bg-[#111827]/95 border border-cyan-900/60 rounded-xl p-4 flex flex-col gap-2">
          <div className="flex items-center gap-2 text-cyan-300 font-bold"><Activity className="w-4 h-4" /> {language === 'hi' ? 'अनुमान' : language === 'te' ? 'అంచనా' : 'Predict'}</div>
          <p className="text-gray-200 leading-relaxed">{result.predict.summary}</p>
          {focusZones.length > 0 && <div className="flex flex-col gap-2 mt-1">
            {focusZones.map((item, index) => <div key={`${item.zone_id}-${index}`} className="bg-gray-900/70 rounded-lg p-2.5 border border-gray-800">
              <div className="font-semibold text-white">{zoneName(item.zone_id)}</div>
              <div className="text-gray-300 mt-1">{item.observation}</div>
              <div className="text-xs text-cyan-100 mt-1">{words[5]}: {item.officer_check}</div>
            </div>)}
          </div>}
          {result.predict.data_gaps?.length > 0 && <div className="text-[10px] text-amber-200">Data gaps: {result.predict.data_gaps.join(' · ')}</div>}
          {focusZones.length === 0 && <div className="text-[10px] text-gray-500">No focus zones returned for this run.</div>}
        </section>

        <section className="bg-[#111827]/95 border border-amber-900/60 rounded-xl p-4 flex flex-col gap-2">
          <div className="flex items-center gap-2 text-amber-300 font-bold"><ShieldCheck className="w-4 h-4" /> {language === 'hi' ? 'तैयारी' : language === 'te' ? 'సన్నద్ధత' : 'Prepare'}</div>
          <p className="text-gray-200 leading-relaxed">{result.prepare.summary}</p>
          {notes.map((item, index) => <div key={`${item.zone_id}-${index}`} className="bg-gray-900/70 rounded-lg p-2.5 border border-gray-800">
            <div className="font-semibold text-white">{zoneName(item.zone_id)}</div>
            <div className="text-gray-300 mt-1">{item.note}</div>
            <div className="text-xs text-amber-100 mt-1">{words[5]}: {item.officer_check}</div>
          </div>)}
          {result.prepare.readiness_gaps?.length > 0 && <div className="text-[10px] text-amber-200">Readiness gaps: {result.prepare.readiness_gaps.join(' · ')}</div>}
          <button onClick={onReviewPreparation} className="mt-1 text-amber-300 hover:text-white text-[11px] font-semibold flex items-center gap-1 self-start">
            {words[6]} <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </section>
        <div className="text-xs text-gray-400 text-right">Gemini · {new Date(result.generated_at).toLocaleString()} · {words[7]}</div>
      </>}
    </div>
  );
}
