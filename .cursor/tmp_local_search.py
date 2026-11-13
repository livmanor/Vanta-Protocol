import json

import httpx

r = httpx.post(
    "http://127.0.0.1:8000/api/agents/predict/search",
    json={"query": "Retrieve effects of last year flood in Hyderabad"},
    timeout=60.0,
)
print("status", r.status_code)
print(r.text[:1500])
