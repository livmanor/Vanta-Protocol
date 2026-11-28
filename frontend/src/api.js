const API_BASE = '/api';
const TOKEN_KEY = 'vanta_session_token';
const CITIZEN_TOKEN_KEY = 'vanta_citizen_token';

export function getStoredToken() {
  try {
    return localStorage.getItem(TOKEN_KEY) || '';
  } catch {
    return '';
  }
}

export function setStoredToken(token) {
  try {
    if (token) localStorage.setItem(TOKEN_KEY, token);
    else localStorage.removeItem(TOKEN_KEY);
  } catch {
    /* ignore quota / private mode */
  }
}

export function getCitizenToken() {
  try {
    return localStorage.getItem(CITIZEN_TOKEN_KEY) || '';
  } catch {
    return '';
  }
}

export function setCitizenToken(token) {
  try {
    if (token) localStorage.setItem(CITIZEN_TOKEN_KEY, token);
    else localStorage.removeItem(CITIZEN_TOKEN_KEY);
  } catch {
    /* ignore */
  }
}

async function apiFetch(path, options = {}) {
  const headers = { ...(options.headers || {}) };
  const useCitizen = Boolean(options.citizen);
  const token = useCitizen ? getCitizenToken() : getStoredToken();
  if (token && !headers.Authorization) {
    headers.Authorization = `Bearer ${token}`;
  }
  const isFormData = typeof FormData !== 'undefined' && options.body instanceof FormData;
  if (options.body && !headers['Content-Type'] && !isFormData) {
    headers['Content-Type'] = 'application/json';
  }
  const { citizen: _citizenFlag, ...fetchOptions } = options;
  const res = await fetch(`${API_BASE}${path}`, {
    ...fetchOptions,
    headers,
    credentials: 'include',
  });
  return res;
}

export async function fetchDataSources() {
  const res = await apiFetch('/sources');
  if (!res.ok) throw new Error(`HTTP ${res.status}: Failed to fetch source status`);
  return res.json();
}

export async function fetchCapAlerts(refresh = false) {
  const res = await apiFetch(`/alerts${refresh ? '?refresh=true' : ''}`);
  if (!res.ok) throw new Error(`HTTP ${res.status}: Failed to fetch CAP alerts`);
  return res.json();
}

export async function fetchAuthConfig() {
  const res = await apiFetch('/auth/config');
  if (!res.ok) throw new Error('Could not load auth config');
  return res.json();
}

export async function loginOfficer(username, password) {
  const res = await apiFetch('/auth/login', {
    method: 'POST',
    body: JSON.stringify({ username, password }),
  });
  const payload = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(payload.detail || 'Sign-in failed');
  if (payload.token) setStoredToken(payload.token);
  return payload;
}

export async function logoutOfficer() {
  const res = await apiFetch('/auth/logout', { method: 'POST' });
  setStoredToken('');
  if (!res.ok) throw new Error('Sign-out failed');
  return res.json().catch(() => ({ status: 'ok' }));
}

export async function fetchCurrentOfficer() {
  const res = await apiFetch('/auth/me');
  if (res.status === 401) return null;
  if (!res.ok) throw new Error('Could not load the signed-in officer');
  return res.json();
}

export async function fetchRiskZones() {
  const res = await apiFetch('/risk-zones');
  if (!res.ok) throw new Error(`HTTP ${res.status}: Failed to compute risk zones`);
  return res.json();
}

export async function fetchZoneWeather() {
  const res = await apiFetch('/weather');
  if (!res.ok) throw new Error(`HTTP ${res.status}: Failed to fetch Open-Meteo weather`);
  return res.json();
}

export async function fetchAgentStatus() {
  const res = await apiFetch('/agents/status');
  if (!res.ok) throw new Error(`HTTP ${res.status}: Failed to fetch agent status`);
  return res.json();
}

export async function fetchPredictHistoryEvents(days = 90) {
  const res = await apiFetch(`/agents/predict/events?days=${days}`);
  if (!res.ok) throw new Error(`HTTP ${res.status}: Failed to fetch historical rain events`);
  return res.json();
}

export async function searchPredictHistory(query) {
  const res = await apiFetch('/agents/predict/search', {
    method: 'POST',
    body: JSON.stringify({ query })
  });
  const payload = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(payload.detail || `HTTP ${res.status}: Failed to search historical events`);
  return payload;
}

export async function fetchContacts() {
  const res = await apiFetch('/contacts');
  if (!res.ok) throw new Error('Could not load contacts');
  return res.json();
}

export async function createContact(contact) {
  const res = await apiFetch('/contacts', { method: 'POST', body: JSON.stringify(contact) });
  const payload = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(payload.detail || 'Could not register contact');
  return payload;
}

export async function importContacts(contacts) {
  const res = await apiFetch('/contacts/import', { method: 'POST', body: JSON.stringify({ contacts }) });
  const payload = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(payload.detail || 'Could not import contacts');
  return payload;
}

export async function decideCalendarEvent(eventId, decision) {
  const res = await apiFetch(`/operations-calendar/${encodeURIComponent(eventId)}?decision=${decision}`, { method: 'PATCH' });
  const payload = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(payload.detail || 'Could not update calendar decision');
  return payload;
}

export async function fetchSosLogs() {
  const res = await apiFetch('/sos/logs');
  if (!res.ok) throw new Error('Could not load SOS logs');
  return res.json();
}

export async function sendSos(contactIds, message, retryLogId = null) {
  const res = await apiFetch('/sos/send', {
    method: 'POST',
    body: JSON.stringify({ contact_ids: contactIds, message, officer_approved: true, retry_log_id: retryLogId })
  });
  const payload = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(payload.detail || 'SOS send failed');
  return payload;
}

export async function runAgent(agentId, confirmGoogleProcessing, language = 'en', inputs = {}) {
  const hasHistoryDates = Boolean(inputs.event_start && inputs.event_end);
  const endpoint = agentId === 'predict' && hasHistoryDates
    ? '/agents/predict/run'
    : `/agents/run/${agentId}`;
  const approval = agentId === 'predict'
    ? { confirm_groq_processing: confirmGoogleProcessing }
    : { confirm_google_processing: confirmGoogleProcessing };
  const res = await apiFetch(endpoint, {
    method: 'POST',
    body: JSON.stringify({ ...approval, language, ...inputs })
  });
  const payload = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(payload.detail || `HTTP ${res.status}: Agent workflow failed`);
  return payload;
}

/**
 * Run Predict, Prepare, and Respond concurrently.
 * Prefers SSE so each card can update as its agent finishes; falls back to POST /run-all.
 * onPartial(agentId, result|null, errorMessage|null) is called per agent.
 */
export async function runAllAgents({
  confirmGoogleProcessing = false,
  confirmGroqProcessing = false,
  language = 'en',
  inputs = {},
  onPartial,
} = {}) {
  const params = new URLSearchParams({
    confirm_google_processing: String(Boolean(confirmGoogleProcessing)),
    confirm_groq_processing: String(Boolean(confirmGroqProcessing)),
    language,
  });
  if (inputs.officer_query) params.set('officer_query', inputs.officer_query);
  if (inputs.area_query) params.set('area_query', inputs.area_query);
  if (inputs.event_start) params.set('event_start', inputs.event_start);
  if (inputs.event_end) params.set('event_end', inputs.event_end);

  const headers = {};
  const token = getStoredToken();
  if (token) headers.Authorization = `Bearer ${token}`;

  let usedStream = false;
  try {
    const streamRes = await fetch(`${API_BASE}/agents/run-all/stream?${params}`, {
      method: 'GET',
      headers,
      credentials: 'include',
    });
    if (streamRes.ok && streamRes.body) {
      usedStream = true;
      const reader = streamRes.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      const aggregate = { predict: null, prepare: null, respond: null, errors: {} };
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const chunks = buffer.split('\n\n');
        buffer = chunks.pop() || '';
        for (const chunk of chunks) {
          const line = chunk.split('\n').find((l) => l.startsWith('data: '));
          if (!line) continue;
          let event;
          try {
            event = JSON.parse(line.slice(6));
          } catch {
            continue;
          }
          if (!event?.agent || event.agent === 'done') continue;
          if (event.ok) {
            aggregate[event.agent] = event.result;
            onPartial?.(event.agent, event.result, null);
          } else {
            const msg = event.error?.detail || 'Agent workflow failed';
            aggregate.errors[event.agent] = event.error || { detail: msg };
            onPartial?.(event.agent, null, msg);
          }
        }
      }
      return aggregate;
    }
  } catch {
    usedStream = false;
  }

  if (!usedStream) {
    const res = await apiFetch('/agents/run-all', {
      method: 'POST',
      body: JSON.stringify({
        confirm_google_processing: confirmGoogleProcessing,
        confirm_groq_processing: confirmGroqProcessing,
        language,
        officer_query: inputs.officer_query || null,
        area_query: inputs.area_query || null,
        event_start: inputs.event_start || null,
        event_end: inputs.event_end || null,
      }),
    });
    const payload = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(payload.detail || `HTTP ${res.status}: Agent workflow failed`);
    for (const id of ['predict', 'prepare', 'respond']) {
      if (payload[id]) onPartial?.(id, payload[id], null);
      else if (payload.errors?.[id]) {
        onPartial?.(id, null, payload.errors[id].detail || 'Agent workflow failed');
      }
    }
    return payload;
  }
  return { predict: null, prepare: null, respond: null, errors: {} };
}

export async function fetchUnits() {
  const res = await apiFetch('/units');
  if (!res.ok) throw new Error(`HTTP ${res.status}: Failed to fetch units`);
  return res.json();
}

export async function registerUnit(unitData) {
  const res = await apiFetch('/units', {
    method: 'POST',
    body: JSON.stringify(unitData)
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}: Failed to register unit`);
  return res.json();
}

export async function updateUnitStatus(unitId, status) {
  const res = await apiFetch(`/units/${encodeURIComponent(unitId)}/status`, {
    method: 'PATCH',
    body: JSON.stringify({ status }),
  });
  const payload = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(payload.detail || `HTTP ${res.status}: Failed to update unit status`);
  return payload;
}

export async function deleteUnit(unitId) {
  const res = await apiFetch(`/units/${encodeURIComponent(unitId)}`, {
    method: 'DELETE',
  });
  const payload = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(payload.detail || `HTTP ${res.status}: Failed to delete unit`);
  return payload;
}

export async function fetchIncidents() {
  const res = await apiFetch('/incidents');
  if (!res.ok) throw new Error(`HTTP ${res.status}: Failed to fetch incidents`);
  return res.json();
}

export async function fetchIncidentTriage() {
  const res = await apiFetch('/incidents/triage');
  if (!res.ok) throw new Error(`HTTP ${res.status}: Failed to rank incidents`);
  return res.json();
}

export async function reportIncident(incidentData) {
  const res = await apiFetch('/incidents', {
    method: 'POST',
    body: JSON.stringify(incidentData)
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}: Failed to log incident`);
  return res.json();
}

export async function updateIncidentStatus(incidentId, status) {
  const res = await apiFetch(`/incidents/${encodeURIComponent(incidentId)}/status`, {
    method: 'PATCH',
    body: JSON.stringify({ status }),
  });
  const payload = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(payload.detail || `HTTP ${res.status}: Failed to update incident status`);
  return payload;
}

export async function deleteIncident(incidentId) {
  const res = await apiFetch(`/incidents/${encodeURIComponent(incidentId)}`, {
    method: 'DELETE',
  });
  const payload = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(payload.detail || `HTTP ${res.status}: Failed to delete incident`);
  return payload;
}

export async function fetchPrepositionSuggestions() {
  const res = await apiFetch('/prepositioning-suggestions');
  if (!res.ok) throw new Error(`HTTP ${res.status}: Failed to fetch prepositioning suggestions`);
  return res.json();
}

export async function approvePrepositioning(suggestionId, unitId, targetZoneName) {
  const res = await apiFetch('/prepositioning/approve', {
    method: 'POST',
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
  const res = await apiFetch('/evacuation-route', {
    method: 'POST',
    body: JSON.stringify({
      zone_id: zoneId,
      zone_name: zoneName,
      lat,
      lng
    })
  });
  const payload = await res.json().catch(() => ({}));
  if (!res.ok) {
    const detail = payload.detail;
    throw new Error(typeof detail === 'string' ? detail : `HTTP ${res.status}: Failed to generate evacuation route`);
  }
  return payload;
}

export async function refreshOperationsPlan() {
  const res = await apiFetch('/operations-calendar/refresh', { method: 'POST' });
  const payload = await res.json().catch(() => ({}));
  if (!res.ok) {
    const detail = payload.detail;
    throw new Error(typeof detail === 'string' ? detail : 'Could not draft the operations calendar');
  }
  return payload;
}

export async function fetchReplay(date, signal = undefined) {
  const res = await apiFetch(`/replay?date=${encodeURIComponent(date)}`, signal ? { signal } : {});
  const payload = await res.json().catch(() => ({}));
  if (!res.ok) {
    const detail = payload.detail;
    throw new Error(typeof detail === 'string' ? detail : `HTTP ${res.status}: Replay failed`);
  }
  return payload;
}

export async function fetchBlockedRoads() {
  const res = await apiFetch('/blocked-roads');
  if (!res.ok) throw new Error(`HTTP ${res.status}: Failed to fetch blocked roads`);
  return res.json();
}

export async function reportBlockedRoad(roadData) {
  const res = await apiFetch('/blocked-roads', {
    method: 'POST',
    body: JSON.stringify(roadData)
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}: Failed to report road diversion`);
  return res.json();
}

export async function snapPointToRoad(lat, lng) {
  try {
    const res = await apiFetch('/snap-to-road', {
      method: 'POST',
      body: JSON.stringify({ lat, lng }),
    });
    if (res.ok) {
      return await res.json();
    }
  } catch (err) {
    console.warn('Backend snap-to-road call failed, attempting direct OSRM fallback:', err);
  }

  // Client-side fallback directly to public OSRM nearest service
  try {
    const url = `https://router.project-osrm.org/nearest/v1/driving/${lng},${lat}?number=1`;
    const resp = await fetch(url);
    if (resp.ok) {
      const data = await resp.json();
      if (data.waypoints && data.waypoints.length > 0) {
        const wp = data.waypoints[0];
        return {
          snapped: true,
          original_lat: lat,
          original_lng: lng,
          lat: wp.location[1],
          lng: wp.location[0],
          distance_m: Math.round(wp.distance * 10) / 10,
          road_name: wp.name || '',
        };
      }
    }
  } catch (err) {
    console.warn('Direct OSRM snap failed:', err);
  }

  return {
    snapped: false,
    original_lat: lat,
    original_lng: lng,
    lat,
    lng,
    distance_m: 0,
    road_name: '',
  };
}

export async function fetchPatrolRoute(waypoints) {
  if (!waypoints || waypoints.length < 2) return null;
  try {
    const res = await apiFetch('/patrol-route', {
      method: 'POST',
      body: JSON.stringify({ waypoints }),
    });
    if (res.ok) {
      return await res.json();
    }
  } catch (err) {
    console.warn('Backend patrol-route call failed, attempting direct OSRM fallback:', err);
  }

  // Client-side fallback to OSRM route
  try {
    const coordsStr = waypoints.map(wp => `${wp.lng},${wp.lat}`).join(';');
    const url = `https://router.project-osrm.org/route/v1/driving/${coordsStr}?overview=full&geometries=geojson`;
    const resp = await fetch(url);
    if (resp.ok) {
      const data = await resp.json();
      if (data.routes && data.routes.length > 0) {
        const r = data.routes[0];
        return {
          distance_meters: Math.round(r.distance * 10) / 10,
          duration_seconds: Math.round(r.duration * 10) / 10,
          geometry: r.geometry,
          waypoints: data.waypoints,
        };
      }
    }
  } catch (err) {
    console.warn('Direct OSRM route failed:', err);
  }
  return null;
}

export async function fetchUnifiedHazards(params = {}) {
  const query = new URLSearchParams(params).toString();
  const res = await apiFetch(`/hazards${query ? `?${query}` : ''}`);
  if (!res.ok) throw new Error(`HTTP ${res.status}: Failed to fetch unified hazards`);
  return res.json();
}

export async function fetchHazardModules() {
  const res = await apiFetch('/hazards/modules');
  if (!res.ok) throw new Error(`HTTP ${res.status}: Failed to fetch hazard module statuses`);
  return res.json();
}

export async function fetchHazardActions(status = null) {
  const res = await apiFetch(`/hazards/actions${status ? `?status=${status}` : ''}`);
  if (!res.ok) throw new Error(`HTTP ${res.status}: Failed to fetch hazard recommended actions`);
  return res.json();
}

export async function approveHazardAction(actionId) {
  const res = await apiFetch(`/hazards/actions/${encodeURIComponent(actionId)}/approve`, { method: 'POST' });
  const payload = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(payload.detail || 'Could not approve action');
  return payload;
}

export async function rejectHazardAction(actionId) {
  const res = await apiFetch(`/hazards/actions/${encodeURIComponent(actionId)}/reject`, { method: 'POST' });
  const payload = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(payload.detail || 'Could not reject action');
  return payload;
}

export async function registerCitizen(username, password, displayName = '') {
  const res = await apiFetch('/citizen/register', {
    method: 'POST',
    citizen: true,
    body: JSON.stringify({ username, password, display_name: displayName }),
  });
  const payload = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(payload.detail || 'Could not create citizen account');
  if (payload.token) setCitizenToken(payload.token);
  return payload;
}

export async function loginCitizen(username, password) {
  const res = await apiFetch('/citizen/login', {
    method: 'POST',
    citizen: true,
    body: JSON.stringify({ username, password }),
  });
  const payload = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(payload.detail || 'Citizen sign-in failed');
  if (payload.token) setCitizenToken(payload.token);
  return payload;
}

export async function logoutCitizen() {
  const res = await apiFetch('/citizen/logout', { method: 'POST', citizen: true });
  setCitizenToken('');
  if (!res.ok) throw new Error('Citizen sign-out failed');
  return res.json().catch(() => ({ status: 'ok' }));
}

export async function fetchCitizenMe() {
  const res = await apiFetch('/citizen/me', { citizen: true });
  if (res.status === 401) return null;
  if (!res.ok) throw new Error('Could not load citizen profile');
  return res.json();
}

export async function submitCitizenReport({ lat, lng, phase, message, photo }) {
  const form = new FormData();
  form.append('lat', String(lat));
  form.append('lng', String(lng));
  form.append('phase', phase);
  form.append('message', message);
  form.append('photo', photo);
  const res = await apiFetch('/citizen/reports', {
    method: 'POST',
    citizen: true,
    body: form,
  });
  const payload = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(payload.detail || 'Could not submit report');
  return payload;
}

export async function fetchMyCitizenReports() {
  const res = await apiFetch('/citizen/reports/mine', { citizen: true });
  if (!res.ok) throw new Error('Could not load your reports');
  return res.json();
}

export async function fetchCitizenReports(status = null) {
  const res = await apiFetch(`/citizen-reports${status ? `?status=${encodeURIComponent(status)}` : ''}`);
  if (!res.ok) throw new Error('Could not load citizen reports');
  return res.json();
}

export async function reviewCitizenReport(reportId, decision, createIncident = true) {
  const res = await apiFetch(`/citizen-reports/${encodeURIComponent(reportId)}/review`, {
    method: 'POST',
    body: JSON.stringify({ decision, create_incident: createIncident }),
  });
  const payload = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(payload.detail || 'Could not review report');
  return payload;
}

export function citizenReportPhotoUrl(reportId) {
  return `${API_BASE}/citizen-reports/${encodeURIComponent(reportId)}/photo`;
}

export async function fetchRainPrediction() {
  const res = await apiFetch('/predict/rain');
  if (res.status === 503) {
    // Model not trained yet — not an error.
    return null;
  }
  if (!res.ok) throw new Error(`HTTP ${res.status}: Failed to fetch rain prediction`);
  return res.json();
}
