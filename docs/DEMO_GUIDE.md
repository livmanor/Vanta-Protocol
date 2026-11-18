# Live demo script

Use the running control room. Every incident, unit, contact, and road block in this demo is entered by the officer during the demo. The repository does not contain a sample roster or sample incidents.

1. Start the backend from the project root with `.\venv\Scripts\python -m uvicorn backend.main:app --host 127.0.0.1 --port 8000`, then start the frontend with `npm run dev` inside `frontend`. Open `http://127.0.0.1:5173`.
2. Enter the control room. The source bar shows which feeds are live. A failed feed stays failed.
3. On the tactical map, leave the city grid on risk colors. Open **Forecast rainfall (mm)** only to show the 25 mm and 64.5 mm lines the calendar uses, then return to risk colors.
4. Open **Prepare**. On a dry day the calendar says no evacuation window is open. That is the decision.
5. Open **Incidents**. The empty state says no incidents are reported. Choose **Log an incident**, allow the browser location, and submit a real report from the device.
6. The incident list shows a rank and a "Why this?" line. That rank is a model output. It does not assign a unit.
7. Choose **Register a unit**. Use the device GPS, or import a CSV the officer brought. Headers are `kind, station, lat, lng`, with optional `id` and `capacity`. Kinds are `patrol`, `rescue_boat`, and `ambulance`.
8. With a unit registered, open **Prepare** again. A pre-positioning suggestion appears only when a registered unit can be matched. Approve it only if the officer accepts the recommendation.
9. Log a blocked road from the New menu by drawing the closed segment. Ask for an evacuation route from a hotspot. The corridor avoids that closure when an OSRM alternative exists. If every alternative still crosses it, the panel shows a warning. Closures have no resolved status, so confirm the road is still closed.
10. Run Predict, then Prepare, then Respond from the agent panel. Predict uses the officer's question only after consent. Prepare drafts the operating window. Respond drafts an SMS and does not send it.
11. In Respond, the banner must say **TEST MODE**. Register one contact, or import a contact CSV with headers `name, phone, area, group`. Review the draft and confirm the send. The log records it as queued. No SMS leaves the server while `SMS_TEST_MODE` is true.
