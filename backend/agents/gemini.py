import asyncio
from typing import Type, TypeVar

from pydantic import BaseModel

from backend.config import settings

T = TypeVar("T", bound=BaseModel)


class AgentConfigurationError(RuntimeError):
    pass


class AgentProviderError(RuntimeError):
    pass


def is_configured() -> bool:
    key = settings.GEMINI_API_KEY
    return key is not None and bool(key.get_secret_value().strip())


async def generate_structured(system_instruction: str, context: str, schema: Type[T]) -> T:
    if not is_configured():
        raise AgentConfigurationError("Gemini API is not configured. Set GEMINI_API_KEY in the backend .env and restart the server.")

    try:
        from google import genai
        from google.genai import types

        api_key = settings.GEMINI_API_KEY.get_secret_value()
        async with genai.Client(api_key=api_key).aio as client:
            response = await asyncio.wait_for(
                client.models.generate_content(
                    model=settings.GEMINI_MODEL,
                    contents=context,
                    config=types.GenerateContentConfig(
                        system_instruction=system_instruction,
                        temperature=0.2,
                        max_output_tokens=1400,
                        response_mime_type="application/json",
                        response_json_schema=schema.model_json_schema(),
                    ),
                ),
                timeout=45,
            )
        if not response.text:
            raise AgentProviderError("Gemini returned an empty response.")
        return schema.model_validate_json(response.text)
    except AgentConfigurationError:
        raise
    except AgentProviderError:
        raise
    except asyncio.TimeoutError as exc:
        raise AgentProviderError("Gemini request timed out.") from exc
    except Exception as exc:
        # Keep provider details out of the UI; log only a generic failure at the route boundary.
        raise AgentProviderError("Gemini could not produce a valid agent result.") from exc
