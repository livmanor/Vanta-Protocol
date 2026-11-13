from datetime import datetime

import httpx

base = "http://127.0.0.1:8000"

with httpx.Client(timeout=180.0) as client:
    status = client.get(f"{base}/api/agents/status")
    print("status", status.status_code, status.json())

    search = client.post(
        f"{base}/api/agents/predict/search",
        json={"query": "Retrieve effects of last year's flood in Hyderabad city."},
    )
    print("search", search.status_code)
    payload = search.json()
    if search.status_code >= 400:
        print("search_error", payload)
        raise SystemExit(1)

    print("search_status", payload.get("status"))
    if payload.get("status") == "clarification_required":
        print("clarification", payload.get("clarification_question"))
        raise SystemExit(1)

    events = payload.get("events") or []
    print("event_count", len(events), "window", payload.get("resolved_window"), "area", payload.get("resolved_area"))

    eligible = []
    for event in events:
        start = event["window_start"]
        end = event["window_end"]
        span = (datetime.fromisoformat(end) - datetime.fromisoformat(start)).days
        if span <= 14:
            eligible.append(event)
    chosen = eligible[0] if eligible else None
    if not chosen:
        print("no_eligible_event")
        raise SystemExit(1)

    print("chosen", chosen["id"], "mean_mm", chosen.get("mean_hotspot_rainfall_mm"))
    run = client.post(
        f"{base}/api/agents/predict/run",
        json={
            "confirm_groq_processing": True,
            "language": "en",
            "event_start": chosen["window_start"],
            "event_end": chosen["window_end"],
            "zone_id": payload.get("resolved_zone_id"),
            "officer_query": "Retrieve effects of last year's flood in Hyderabad city.",
        },
    )
    print("run", run.status_code)
    result = run.json()
    if run.status_code >= 400:
        print("run_error", result)
        raise SystemExit(1)
    predict = result.get("predict") or {}
    print("run_ok", result.get("status"), "provider", result.get("provider"), "model", result.get("model"))
    print("summary", (predict.get("summary") or "")[:400])
    print("assessments", len(predict.get("zone_assessments") or []))
    print("focus", len(predict.get("focus_zones") or []))
