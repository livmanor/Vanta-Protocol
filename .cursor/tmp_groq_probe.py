import asyncio
import json

import httpx

from backend.agents.schemas import HistoryQueryIntent
from backend.config import settings


async def main() -> None:
    key = settings.GROQ_API_KEY.get_secret_value()
    headers = {"Authorization": f"Bearer {key}"}
    async with httpx.AsyncClient(timeout=45.0) as client:
        models = await client.get("https://api.groq.com/openai/v1/models", headers=headers)
        print("models_status", models.status_code)
        if models.status_code >= 400:
            print("models_error", models.text[:600])
        else:
            ids = [m.get("id") for m in models.json().get("data", [])]
            print("has_openai/gpt-oss-20b", "openai/gpt-oss-20b" in ids)

        schema = json.dumps(HistoryQueryIntent.model_json_schema(), ensure_ascii=False)
        body = {
            "model": settings.GROQ_MODEL,
            "messages": [
                {
                    "role": "system",
                    "content": "Extract search filters. Return one JSON object matching this schema exactly:\n" + schema,
                },
                {
                    "role": "user",
                    "content": json.dumps(
                        {
                            "current_local_date": "2026-11-13",
                            "allowed_hotspots": [{"id": "hyd-hotspot-nampally-metro", "name": "Nampally"}],
                            "officer_question": "Retrieve effects of last year's flood in Hyderabad city.",
                        },
                        ensure_ascii=False,
                    ),
                },
            ],
            "temperature": 0,
            "max_completion_tokens": 1600,
            "response_format": {"type": "json_object"},
        }
        chat = await client.post("https://api.groq.com/openai/v1/chat/completions", headers=headers, json=body)
        print("chat_status", chat.status_code)
        payload = chat.json() if chat.headers.get("content-type", "").startswith("application/json") else {"raw": chat.text[:800]}
        if chat.status_code >= 400:
            print("chat_error", json.dumps(payload)[:1200])
            return
        message = payload.get("choices", [{}])[0].get("message", {})
        usage = payload.get("usage", {})
        print("finish_reason", payload.get("choices", [{}])[0].get("finish_reason"))
        print("content_type", type(message.get("content")).__name__)
        print("content_len", len(message.get("content") or "") if isinstance(message.get("content"), str) else None)
        print("content_preview", (message.get("content") or "")[:300])
        print("message_keys", list(message.keys()))
        print("reasoning_len", len(message.get("reasoning") or "") if isinstance(message.get("reasoning"), str) else None)
        print("usage", usage)


if __name__ == "__main__":
    asyncio.run(main())
