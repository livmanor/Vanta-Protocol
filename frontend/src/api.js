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

/* ── Agentic system contract ─────────────────────────────────────
 * The backend should expose (see docs/UI_API_CONTRACT.md):
 *   GET  /api/agents               → Agent[]  (id, name, phase, goal, status, last_run, last_report, pending_actions, activity)
 *   POST /api/agents/{id}/run      → Agent    (triggers one agent cycle)
 *   POST /api/agents/actions/{id}/approve → Agent (officer approves a pending action)
 *   POST /api/agents/actions/{id}/reject  → Agent
 * If these are not implemented yet, the UI shows honest "not connected"
 * states per the repo's zero-mock policy — nothing is fabricated.
 */
export async function fetchAgents() {
  const res = await fetch(`${API_BASE}/agents`);
  if (res.status === 404) throw new Error('AGENT_ENDPOINT_MISSING');
  if (!res.ok) throw new Error(`HTTP ${res.status}: Failed to fetch agent status`);
  return res.json();
}

export async function runAgent(agentId) {
  const res = await fetch(`${API_BASE}/agents/${agentId}/run`, { method: 'POST' });
  if (res.status === 404) throw new Error('AGENT_ENDPOINT_MISSING');
  if (!res.ok) throw new Error(`HTTP ${res.status}: Failed to run agent ${agentId}`);
  return res.json();
}

export async function approveAgentAction(actionId) {
  const res = await fetch(`${API_BASE}/agents/actions/${actionId}/approve`, { method: 'POST' });
  if (res.status === 404) throw new Error('AGENT_ENDPOINT_MISSING');
  if (!res.ok) throw new Error(`HTTP ${res.status}: Failed to approve action ${actionId}`);
  return res.json();
}

export async function rejectAgentAction(actionId) {
  const res = await fetch(`${API_BASE}/agents/actions/${actionId}/reject`, { method: 'POST' });
  if (res.status === 404) throw new Error('AGENT_ENDPOINT_MISSING');
  if (!res.ok) throw new Error(`HTTP ${res.status}: Failed to reject action ${actionId}`);
  return res.json();
}
