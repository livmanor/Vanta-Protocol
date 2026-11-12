# Agent API Contract (Vanta Protocol — Agentic UI)

The frontend agent console (`frontend/src/components/AgentConsole.jsx`) expects the
backend to implement these endpoints. Until they exist, the console shows honest
"not connected" states — no data is fabricated (per `agent_rules.md`).

## `GET /api/agents`
Returns a list of agent objects:

```json
[
  {
    "id": "predict",
    "name": "Weather Predict",
    "phase": "predict",                // predict | prepare | respond (drives UI color)
    "goal": "Compare live forecasts with the latest historical rain and recorded area impacts.",
    "status": "idle",                  // idle | running | needs_approval | error
    "last_run": "2026-11-12T10:24:00Z",
    "last_report": "Rain event comparison complete. 2 focus areas flagged.",
    "pending_actions": [
      { "id": "act_123", "title": "Pre-position Boat Unit B2 at Velachery",
        "detail": "Risk level 4 · ETA 12 min · based on 24h forecast 140mm" }
    ],
    "activity": [
      { "ts": "2026-11-12T10:24:05Z", "text": "Flagged Velachery/Pallikaranai at risk level 4" }
    ]
  }
]
```

## `POST /api/agents/{id}/run`
Triggers one agent cycle. Returns the updated agent object (status `running` → `idle`/`needs_approval`).

## `POST /api/agents/actions/{action_id}/approve`
Officer approves a pending action (human-in-the-loop). Returns the updated agent object; the action moves to the audit trail.

## `POST /api/agents/actions/{action_id}/reject`
Officer rejects a pending action. Returns the updated agent object.

## UI behavior rules
- `status: "running"` shows a pulsing dot and disables the run button.
- Pending actions always render with Approve/Reject buttons — the UI never auto-approves.
- 404 on any endpoint → console displays "Agent API not connected" banner (no mock data).
- The three phases map to fixed colors: predict = cyan, prepare = amber, respond = rose.
