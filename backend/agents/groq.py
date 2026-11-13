import asyncio
import json
import logging
from typing import Type, TypeVar

import httpx
from pydantic import BaseModel, ValidationError

from backend.agents.gemini import AgentConfigurationError, AgentProviderError
from backend.config import settings

T = TypeVar("T", bound=BaseModel)
logger = logging.getLogger("vanta.agents.groq")
GROQ_CHAT_COMPLETIONS_URL = "https://api.groq.com/openai/v1/chat/completions"


def is_configured() -> bool:
    key = settings.GROQ_API_KEY
    return key is not None and bool(key.get_secret_value().strip())


async def generate_structured(system_instruction: str, context: str, schema: Type[T]) -> T:
    if not is_configured():
        raise AgentConfigurationError("Groq API is not configured. Set GROQ_API_KEY in the backend .env and restart the server.")

    request_body = {
        "model": settings.GROQ_MODEL,
        "messages": [
            {"role": "system", "content": f"{system_instruction}\nReturn one JSON object matching this schema exactly:\n{json.dumps(schema.model_json_schema(), ensure_ascii=False)}"},
            {"role": "user", "content": context},
        ],
        "temperature": 0,
        "max_completion_tokens": 1600,
        "response_format": {"type": "json_object"},
    }

    try:
        async with httpx.AsyncClient(timeout=45.0) as client:
            response = await asyncio.wait_for(
                client.post(
                    GROQ_CHAT_COMPLETIONS_URL,
                    headers={"Authorization": f"Bearer {settings.GROQ_API_KEY.get_secret_value()}"},
                    json=request_body,
                ),
                timeout=45,
            )
        if response.status_code >= 400:
            if response.status_code in (401, 403):
                message = "Groq rejected the API key or project access. Check GROQ_API_KEY."
            elif response.status_code == 404:
                message = "The configured Groq model was not found or is unavailable. Check GROQ_MODEL."
            elif response.status_code == 429:
                message = "Groq rate or quota limit reached. Wait, then retry or check the Groq console limits."
            elif response.status_code == 400:
                message = "Groq rejected the request. Check the model and response schema."
            else:
                message = f"Groq request failed (HTTP {response.status_code})."
            raise AgentProviderError(message)

        payload = response.json()
        content = payload.get("choices", [{}])[0].get("message", {}).get("content")
        if not content:
            raise AgentProviderError("Groq returned an empty response.")
        try:
            return schema.model_validate_json(content)
        except ValidationError as exc:
            raise AgentProviderError("Groq returned data that did not match the expected agent format.") from exc
    except AgentConfigurationError:
        raise
    except AgentProviderError:
        raise
    except asyncio.TimeoutError as exc:
        raise AgentProviderError("Groq request timed out.") from exc
    except httpx.TimeoutException as exc:
        raise AgentProviderError("Groq request timed out.") from exc
    except httpx.HTTPError as exc:
        logger.warning("Groq structured request failed: exception=%s", type(exc).__name__)
        raise AgentProviderError("Could not connect to the Groq API.") from exc
    except Exception as exc:
        logger.warning("Groq structured request failed: exception=%s", type(exc).__name__)
        raise AgentProviderError("Groq could not produce a valid agent result.") from exc
