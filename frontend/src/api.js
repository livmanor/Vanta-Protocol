const API_BASE = '/api';

export async function fetchSources() {
  const res = await fetch(`${API_BASE}/sources`);
  if (!res.ok) throw new Error(`HTTP ${res.status}: Failed to fetch source health`);
  return res.json();
}

export async function fetchRiskZones() {
  const res = await fetch(`${API_BASE}/risk-zones`);
  if (!res.ok) throw new Error(`HTTP ${res.status}: Failed to compute risk zones`);
  return res.json();
}

export async function fetchZoneWeather() {
  const res = await fetch(`${API_BASE}/weather`);
  if (!res.ok) throw new Error(`HTTP ${res.status}: Failed to fetch Open-Meteo weather`);
  return res.json();
}

export async function fetchAgentStatus() {
  const res = await fetch(`${API_BASE}/agents/status`);
  if (!res.ok) throw new Error(`HTTP ${res.status}: Failed to fetch agent status`);
  return res.json();
}

export async function fetchPredictHistoryEvents(days = 90) {
  const res = await fetch(`${API_BASE}/agents/predict/events?days=${days}`);
  if (!res.ok) throw new Error(`HTTP ${res.status}: Failed to fetch historical rain events`);
  return res.json();
}

export async function searchPredictHistory(query) {
  const res = await fetch(`${API_BASE}/agents/predict/search`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query })
  });
  const payload = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(payload.detail || `HTTP ${res.status}: Failed to search historical events`);
  return payload;
}

export async function runAgent(agentId, confirmGoogleProcessing, language = 'en', inputs = {}) {
  const endpoint = agentId === 'predict' ? `${API_BASE}/agents/predict/run` : `${API_BASE}/agents/run/${agentId}`;
  const approval = agentId === 'predict'
    ? { confirm_groq_processing: confirmGoogleProcessing }
    : { confirm_google_processing: confirmGoogleProcessing };
  const res = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...approval, language, ...inputs })
  });
  const payload = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(payload.detail || `HTTP ${res.status}: Agent workflow failed`);
  return payload;
}

export async function fetchUnits() {
  const res = await fetch(`${API_BASE}/units`);
  if (!res.ok) throw new Error(`HTTP ${res.status}: Failed to fetch units`);
  return res.json();
}

export async function registerUnit(unitData) {
  const res = await fetch(`${API_BASE}/units`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(unitData)
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}: Failed to register unit`);
  return res.json();
}

export async function fetchIncidents() {
  const res = await fetch(`${API_BASE}/incidents`);
  if (!res.ok) throw new Error(`HTTP ${res.status}: Failed to fetch incidents`);
  return res.json();
}

export async function reportIncident(incidentData) {
  const res = await fetch(`${API_BASE}/incidents`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(incidentData)
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}: Failed to log incident`);
  return res.json();
}

export async function fetchPrepositionSuggestions() {
  const res = await fetch(`${API_BASE}/prepositioning-suggestions`);
  if (!res.ok) throw new Error(`HTTP ${res.status}: Failed to fetch prepositioning suggestions`);
  return res.json();
}

export async function approvePrepositioning(suggestionId, unitId, targetZoneName) {
  const res = await fetch(`${API_BASE}/prepositioning/approve`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      suggestion_id: suggestionId,
      unit_id: unitId,
      target_zone_name: targetZoneName
    })
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}: Failed to approve prepositioning`);
  return res.json();
}

export async function generateEvacuationRoute(zoneId, zoneName, lat, lng) {
  const res = await fetch(`${API_BASE}/evacuation-route`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      zone_id: zoneId,
      zone_name: zoneName,
      lat,
      lng
    })
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}: Failed to generate evacuation route`);
  return res.json();
}

export async function fetchBlockedRoads() {
  const res = await fetch(`${API_BASE}/blocked-roads`);
  if (!res.ok) throw new Error(`HTTP ${res.status}: Failed to fetch blocked roads`);
  return res.json();
}

export async function reportBlockedRoad(roadData) {
  const res = await fetch(`${API_BASE}/blocked-roads`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(roadData)
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}: Failed to report road diversion`);
  return res.json();
}

