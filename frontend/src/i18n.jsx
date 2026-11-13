import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';

const messages = {
  en: {
    controlRoom: 'POLICE CONTROL ROOM', area: 'Hyderabad · hotspot pilot',
    logIncident: 'Log Incident', registerUnit: 'Register Unit', roadBlock: 'Road Block / Diversion',
    zones: 'Risk Zones', prepare: 'Prepare', agents: 'AI Agents', incidents: 'Incidents',
    inspectMap: 'Select a mapped waterlogging hotspot to review forecast risk and weather, then plan a route.',
    monitoredWards: 'Monitored Hotspots', refresh: 'Refresh', elevation: 'Elevation', rain: 'Rain',
    risk: 'Risk', lvl: 'Level', loggedIncidents: 'Logged Incidents', addIncident: 'Add Incident',
    noIncidents: 'No incidents reported', noIncidentsHint: 'Incidents appear here after an officer submits a report.',
    registeredUnits: 'Registered Units', noUnits: 'No field units registered',
    unitsHint: 'Register patrol vehicles, rescue boats or ambulances to enable preparation recommendations.',
    people: 'People', available: 'Available', enRoute: 'En route',
    langLabel: 'Language / भाषा / భాష', english: 'English', hindi: 'हिन्दी', telugu: 'తెలుగు',
    mapHint: 'LIVE OPERATIONS MAP', weather: 'Weather', status: 'Status',
    predict: 'Predict', respond: 'Respond',
    landingKicker: 'CIPHERCOP 2026 · TRACK 2 · AI DISASTER RESPONSE',
    landingTitle: 'Predict. Prepare. Respond.',
    landingSub: 'An agentic disaster-response system: live flood-risk prediction from public feeds, evidence-based readiness planning, and officer-led response coordination — with zero mock data.',
    enterApp: 'Enter Control Room',
    landingPredict: 'Compares live forecasts with historical rainfall and recorded impacts to flag focus zones.',
    landingPrepare: 'Turns forecasts and available field units into readiness checks — never assignments.',
    landingRespond: 'Assesses active incidents and supports officer-approved response coordination.',
    landingLive: 'Live public data feeds only',
    landingOfficer: 'Every AI action needs officer approval',
    landingFooter: 'ZERO MOCK DATA · HONEST STATES',
  },
  hi: {
    controlRoom: 'पुलिस नियंत्रण कक्ष', area: 'हैदराबाद · हॉटस्पॉट पायलट',
    logIncident: 'घटना दर्ज करें', registerUnit: 'दल पंजीकृत करें', roadBlock: 'सड़क बंद / मार्ग परिवर्तन',
    zones: 'जोखिम क्षेत्र', prepare: 'तैयारी', agents: 'एआई एजेंट', incidents: 'घटनाएँ',
    inspectMap: 'पूर्वानुमान जोखिम और मौसम देखने तथा मार्ग बनाने के लिए मानचित्र पर जलभराव हॉटस्पॉट चुनें।',
    monitoredWards: 'निगरानी वाले हॉटस्पॉट', refresh: 'रीफ्रेश', elevation: 'ऊँचाई', rain: 'वर्षा',
    risk: 'जोखिम', lvl: 'स्तर', loggedIncidents: 'दर्ज घटनाएँ', addIncident: 'घटना जोड़ें',
    noIncidents: 'कोई घटना दर्ज नहीं', noIncidentsHint: 'अधिकारी की रिपोर्ट के बाद घटनाएँ यहाँ दिखेंगी।',
    registeredUnits: 'पंजीकृत दल', noUnits: 'कोई फील्ड दल पंजीकृत नहीं',
    unitsHint: 'तैयारी सुझाव पाने के लिए गश्ती वाहन, बचाव नौका या एम्बुलेंस पंजीकृत करें।',
    people: 'लोग', available: 'उपलब्ध', enRoute: 'रास्ते में',
    langLabel: 'भाषा / Language', english: 'English', hindi: 'हिन्दी', telugu: 'తెలుగు',
    mapHint: 'लाइव संचालन मानचित्र', weather: 'मौसम', status: 'स्थिति',
    predict: 'अनुमान', respond: 'प्रतिक्रिया',
    landingKicker: 'सिफरकॉप 2026 · ट्रैक 2 · एआई आपदा प्रतिक्रिया',
    landingTitle: 'अनुमान। तैयारी। प्रतिक्रिया।',
    landingSub: 'एक एजेंटिक आपदा-प्रतिक्रिया प्रणाली: सार्वजनिक फ़ीड से लाइव बाढ़-जोखिम अनुमान, साक्ष्य-आधारित तैयारी योजना और अधिकारी-नेतृत्व वाला प्रतिक्रिया समन्वय — बिना किसी नकली डेटा के।',
    enterApp: 'नियंत्रण कक्ष में प्रवेश करें',
    landingPredict: 'लाइव पूर्वानुमान की तुलना ऐतिहासिक वर्षा और दर्ज प्रभावों से करके ध्यान क्षेत्र चिह्नित करता है।',
    landingPrepare: 'पूर्वानुमान और उपलब्ध दलों से तैयारी जाँच बनाता है — केवल सुझाव, तैनाती नहीं।',
    landingRespond: 'सक्रिय घटनाओं का आकलन कर अधिकारी-स्वीकृत प्रतिक्रिया में सहायता करता है।',
    landingLive: 'केवल लाइव सार्वजनिक डेटा फ़ीड',
    landingOfficer: 'हर एआई कार्रवाई के लिए अधिकारी की मंज़ूरी',
    landingFooter: 'कोई नकली डेटा नहीं · ईमानदार स्थिति',
  },
  te: {
    controlRoom: 'పోలీస్ నియంత్రణ గది', area: 'హైదరాబాద్ · హాట్‌స్పాట్ పైలట్',
    logIncident: 'ఘటన నమోదు', registerUnit: 'బృందం నమోదు', roadBlock: 'రోడ్డు మూసివేత / మళ్లింపు',
    zones: 'ప్రమాద ప్రాంతాలు', prepare: 'సన్నద్ధత', agents: 'ఏఐ ఏజెంట్లు', incidents: 'ఘటనలు',
    inspectMap: 'అంచనా ప్రమాదం, వాతావరణం చూడటానికి మరియు మార్గం రూపొందించడానికి మ్యాప్‌లో నీరు నిలిచే ప్రాంతాన్ని ఎంచుకోండి.',
    monitoredWards: 'పర్యవేక్షణలోని హాట్‌స్పాట్‌లు', refresh: 'రిఫ్రెష్', elevation: 'ఎత్తు', rain: 'వర్షం',
    risk: 'ప్రమాదం', lvl: 'స్థాయి', loggedIncidents: 'నమోదైన ఘటనలు', addIncident: 'ఘటన జోడించు',
    noIncidents: 'నమోదైన ఘటనలు లేవు', noIncidentsHint: 'అధికారి నివేదిక సమర్పించిన తర్వాత ఘటనలు ఇక్కడ కనిపిస్తాయి.',
    registeredUnits: 'నమోదైన బృందాలు', noUnits: 'ఫీల్డ్ బృందాలు నమోదు కాలేదు',
    unitsHint: 'సన్నద్ధత సూచనల కోసం పెట్రోలింగ్ వాహనాలు, రక్షణ పడవలు లేదా అంబులెన్సులను నమోదు చేయండి.',
    people: 'ప్రజలు', available: 'అందుబాటులో', enRoute: 'మార్గంలో',
    langLabel: 'భాష / Language', english: 'English', hindi: 'हिन्दी', telugu: 'తెలుగు',
    mapHint: 'ప్రత్యక్ష ఆపరేషన్స్ మ్యాప్', weather: 'వాతావరణం', status: 'స్థితి',
    predict: 'అంచనా', respond: 'ప్రతిస్పందన',
    landingKicker: 'సిఫర్‌కాప్ 2026 · ట్రాక్ 2 · ఏఐ విపత్తు ప్రతిస్పందన',
    landingTitle: 'అంచనా. సన్నద్ధత. ప్రతిస్పందన.',
    landingSub: 'ఏజెంటిక్ విపత్తు-ప్రతిస్పందన వ్యవస్థ: పబ్లిక్ ఫీడ్‌ల నుండి ప్రత్యక్ష వరద-ప్రమాద అంచనా, ఆధారాలతో కూడిన సన్నద్ధత ప్రణాళిక, అధికారి నేతృత్వంలోని ప్రతిస్పందన సమన్వయం — నకిలీ డేటా లేకుండా.',
    enterApp: 'నియంత్రణ గదిలోకి ప్రవేశించండి',
    landingPredict: 'ప్రత్యక్ష అంచనాలను చారిత్రక వర్షపాతం, నమోదైన ప్రభావాలతో పోల్చి దృష్టి ప్రాంతాలను గుర్తిస్తుంది.',
    landingPrepare: 'అంచనాలు, అందుబాటులోని బృందాలతో సన్నద్ధత తనిఖీలు తయారు చేస్తుంది — కేటాయింపులు కాదు.',
    landingRespond: 'క్రియాశీల ఘటనలను అంచనా వేసి అధికారి-ఆమోదిత ప్రతిస్పందనకు తోడ్పడుతుంది.',
    landingLive: 'ప్రత్యక్ష పబ్లిక్ డేటా ఫీడ్‌లు మాత్రమే',
    landingOfficer: 'ప్రతి ఏఐ చర్యకు అధికారి ఆమోదం అవసరం',
    landingFooter: 'నకిలీ డేటా లేదు · నిజాయితీ స్థితి',
  },
};

const LanguageContext = createContext(null);
export function LanguageProvider({ children }) {
  const [language, setLanguage] = useState(() => localStorage.getItem('vanta-language') || 'en');
  useEffect(() => {
    localStorage.setItem('vanta-language', language);
    document.documentElement.lang = language === 'hi' ? 'hi' : language === 'te' ? 'te' : 'en';
  }, [language]);
  const value = useMemo(() => ({ language, setLanguage, t: (key) => messages[language]?.[key] || messages.en[key] || key }), [language]);
  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>;
}
export function useLanguage() {
  const value = useContext(LanguageContext);
  if (!value) throw new Error('useLanguage must be used inside LanguageProvider');
  return value;
}
