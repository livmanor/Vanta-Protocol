import os
from pathlib import Path

import httpx
from dotenv import dotenv_values

root = Path(__file__).resolve().parents[1]
values = dotenv_values(root / ".env")
file_key = (values.get("GROQ_API_KEY") or "").strip()
os_key = (os.getenv("GROQ_API_KEY") or "").strip()
print("dotenv_present", bool(file_key), "len", len(file_key), "prefix_ok", file_key.startswith("gsk_"))
print("os_env_present", bool(os_key), "len", len(os_key), "same_as_dotenv", file_key == os_key)
print("dotenv_model", values.get("GROQ_MODEL"))

if not file_key:
    raise SystemExit("GROQ_API_KEY missing from .env")

r = httpx.get(
    "https://api.groq.com/openai/v1/models",
    headers={"Authorization": f"Bearer {file_key}"},
    timeout=30.0,
)
print("groq_models_status", r.status_code)
if r.status_code >= 400:
    print("groq_models_error", r.text[:300])
else:
    ids = [m.get("id") for m in r.json().get("data", [])]
    print("has_model", values.get("GROQ_MODEL") in ids)
