# AGENTS.md: Rules for the AI coding agent

Project: **Vanta Protocol**, a real-time disaster-response planning tool for police control rooms (CipherCop 2026, AI Disaster Response track).
Read this file fully before every session. These rules override any default habits.

---

## 1. Prime directive: real-time, real data, no mock data

1. **No mock, fake, dummy, placeholder or randomly generated data in the running app.** This covers incidents, units, risk zones, weather, roads, routes, ETAs, populations and anything else shown to a user.
2. Every data point shown must come from one of:
   - a **live external source** (API or dataset fetched at runtime), or
   - **real user/officer input** (forms, live device location, uploaded files), or
   - **real stored data** created by the two sources above.
3. **If data is unavailable, show an honest empty or error state** ("No incidents reported", "Weather feed unreachable, last updated 14:02"). Never fill the gap with invented values.
4. **Every data source must be visible in the UI**: show its name, the last-updated timestamp and a live/stale/failed status badge.
5. **Never present estimates as facts.** Anything calculated (risk score, ETA, priority) must be labelled as a model output and must have a "Why this?" explanation.
6. **Test fixtures are allowed only inside `/tests`.** They must never be imported by runtime code, never be seeded into the database and never appear in the UI.
7. **No hard-coded coordinates, rainfall values, populations or unit positions in source code.** Configuration (API URLs, city bounding box, thresholds) goes in `config` or `.env`.
8. **Do not fabricate a source, an API, a dataset or a number.** If you don't know whether an API exists or what its response looks like, say so and check the documentation, or ask.

### Approved real data sources (prefer these; all free)
| Need | Source |
|---|---|
| Rainfall, weather forecast | Open-Meteo forecast API |
| River discharge / flood forecast | Open-Meteo Flood API (GloFAS-based) |
| Roads, police stations, hospitals, shelters | OpenStreetMap via Overpass API |
| Routing and ETAs | OSRM (public or self-hosted) or OSMnx |
| Elevation / low-lying terrain | Open-Elevation / SRTM-based service |
| Map tiles | OpenStreetMap tiles |
| Official alerts (if accessible) | IMD / NDMA public feeds |

If a source needs an API key or has strict limits, **ask first** (see section 3).

### Where real units and incidents come from
- **Incidents:** created only through a real intake (officer form now, SOS intake and AI triage later). The app starts with **zero incidents**.
- **Units:** registered by an officer through a "Register unit" form. Live position comes from the device's geolocation (browser Geolocation API), manually confirmed station location, or a real feed. **Never auto-generate units.**
- **Risk zones:** derived at runtime from real data (rainfall forecast, river discharge, elevation, past flood-prone areas from real datasets), not typed in by hand.

---

## 2. Working style

**Do these without asking:**
- Implement features, fix bugs, refactor your own code, write tests and docs.
- Choose standard libraries and routine implementation details.
- Add loading, error and empty states, input validation and logging.
- Make small naming, structure and UI decisions.
- Keep working step by step and tell me what you did afterwards.

**General conduct:**
- Work in small steps. After each step, make sure the app **runs**, then summarise in 3 to 5 lines: what changed, how to run it, what is next.
- Prefer simple, readable code. No clever tricks, no unused abstractions.
- Handle failures gracefully: timeouts, rate limits, offline mode, malformed responses. A failed source must never crash the app.
- Cache real responses sensibly (respect rate limits and terms of use). Caching is not mocking: show the cache age.
- Be honest. If something doesn't work, isn't finished or is an assumption, say so plainly.

---

## 3. Ask me first (high-impact tasks only)

**Stop and ask before doing any of the following:**
1. Changing the **tech stack**, the overall architecture, or replacing the dispatch/pre-positioning algorithm.
2. Changing the **data contracts** (Incident, Unit, RiskZone, BlockedRoad), because the AI triage module depends on them.
3. Adding any **paid service, API key, account or signup**, or relying on a source with unclear terms or tight rate limits.
4. **Deleting** files, data or database tables, or running destructive migrations.
5. Anything involving **privacy, personal data, security or authentication**, such as storing citizen phone numbers or names.
6. **Deploying**, publishing, or sending data to any third party.
7. Adding a **major dependency** or a large new module not covered in this file.
8. Anything that would require **simulating or faking data** because no real source exists. Tell me the gap and propose real options.
9. Any decision that would take more than about half a day to undo.

When asking, use this format: *the decision, 2 or 3 options, your recommendation, and the trade-off.* Keep it short.

---

## 4. Data contracts (frozen without my approval)

```
Incident:    { id, lat, lng, type: "flood"|"trapped"|"medical"|"fire"|"road_blocked",
               urgency: 1-5, people: int, vulnerable: bool, message: string,
               timestamp, status: "new"|"assigned"|"resolved", source: string }
Unit:        { id, kind: "patrol"|"rescue_boat"|"ambulance", lat, lng,
               capacity: int, status: "available"|"assigned", station: string,
               position_updated_at }
RiskZone:    { id, name, risk_level: 1-5, polygon: GeoJSON, population: int | null,
               derived_from: [source names], computed_at }
BlockedRoad: { id, name, geometry: GeoJSON LineString, reason, reported_by, timestamp }
```
`population` may be `null` when no real source is available. Do not guess it.

---

## 5. Product principles

- **Human-in-the-loop:** the system recommends, the officer approves. Never auto-dispatch.
- **Explainability:** every suggestion has a plain-language "Why this?".
- **Offline-tolerant:** the UI must degrade gracefully with no network (queue input, show last known data with age).
- **Privacy by design:** collect the minimum, store the minimum, never log personal data.
- **Demo-readiness:** the app must start cleanly with an empty state and a clear "connect sources" status, then fill with real data. The demo uses real live data and real inputs entered during the demo.

---

## 6. Code and repo standards

- Backend: FastAPI (Python), typed with Pydantic. Frontend: React (Vite), Leaflet, Tailwind.
- One responsibility per module. Keep API routes thin and put logic in services.
- Secrets only in `.env` (never committed). Provide `.env.example`.
- Every external call goes through one small client module with timeout, retry and error handling.
- Keep `README.md` current: setup, run commands, data sources, known limitations.
- Commit messages: short, imperative, one change each.

---

## 7. Definition of done for any step

- [ ] It runs without errors from a clean start.
- [ ] It uses only real data or real input (section 1).
- [ ] Empty, loading and error states are handled.
- [ ] Data sources and their freshness are visible in the UI.
- [ ] README or notes updated.
- [ ] I got a short summary of what changed and what is next.