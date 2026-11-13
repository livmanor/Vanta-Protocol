from pathlib import Path
import os

import httpx
from dotenv import dotenv_values

env_path = Path(".env")
file_vals = dotenv_values(env_path)
file_key = (file_vals.get("GROQ_API_KEY") or "").strip()
os_key = (os.getenv("GROQ_API_KEY") or "").strip()

print("groq_in_dotenv", bool(file_key))
print("dotenv_prefix_ok", file_key.startswith("gsk_"))
print("dotenv_len", len(file_key))
print("os_env_set", bool(os_key))
print("os_same_as_file", os_key == file_key)

if file_key:
    r = httpx.get(
        "https://api.groq.com/openai/v1/models",
        headers={"Authorization": f"Bearer {file_key}"},
        timeout=30.0,
    )
    print("groq_models_status", r.status_code)
    if r.status_code >= 400:
        print("groq_error", r.text[:400])
    else:
        ids = [m.get("id") for m in r.json().get("data", [])]
        print("has_gpt_oss_20b", "openai/gpt-oss-20b" in ids)
