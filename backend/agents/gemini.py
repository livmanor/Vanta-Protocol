import asyncio
import logging
from typing import Type, TypeVar

from pydantic import BaseModel

from backend.config import settings

T = TypeVar("T", bound=BaseModel)
logger = logging.getLogger("vanta.agents.gemini")

# Transient HTTP status codes that are safe to retry
_RETRYABLE_STATUS_CODES = {429, 500, 502, 503, 504}
# Seconds to wait before each retry (attempt 1 → 3 s, attempt 2 → 7 s)
_RETRY_DELAYS = (3.0, 7.0)


class AgentConfigurationError(RuntimeError):
    pass


class AgentProviderError(RuntimeError):
    pass


def is_configured() -> bool:
    key = settings.GEMINI_API_KEY
    return key is not None and bool(key.get_secret_value().strip())


async def generate_structured(system_instruction: str, context: str, schema: Type[T]) -> T:
    if not is_configured():
        raise AgentConfigurationError(
            "Gemini API is not configured. Set GEMINI_API_KEY in the backend .env and restart the server."
        )

    from google import genai
    from google.genai import types

    api_key = settings.GEMINI_API_KEY.get_secret_value()
    max_attempts = len(_RETRY_DELAYS) + 1  # 3 total attempts

    last_exc: Exception | None = None
    for attempt in range(max_attempts):
        try:
            async with genai.Client(api_key=api_key).aio as client:
                response = await asyncio.wait_for(
                    client.models.generate_content(
                        model=settings.GEMINI_MODEL,
                        contents=context,
                        config=types.GenerateContentConfig(
                            system_instruction=system_instruction,
                            temperature=0.2,
                            max_output_tokens=4096,
                            response_mime_type="application/json",
                            response_json_schema=schema.model_json_schema(),
                        ),
                    ),
                    timeout=50,
                )

            if not response.text:
                raise AgentProviderError("Gemini returned an empty response.")

            try:
                return schema.model_validate_json(response.text)
            except Exception as parse_exc:
                raise AgentProviderError(
                    "Gemini returned data that did not match the agent response format."
                ) from parse_exc

        except AgentConfigurationError:
            raise
        except AgentProviderError:
            raise
        except asyncio.TimeoutError as exc:
            last_exc = exc
            logger.warning(
                "Gemini request timed out (attempt %d/%d).", attempt + 1, max_attempts
            )
        except Exception as exc:
            status_code = getattr(exc, "code", None)
            logger.warning(
                "Gemini structured request failed: exception=%s status=%s (attempt %d/%d)",
                type(exc).__name__, status_code, attempt + 1, max_attempts,
            )

            # Map well-known status codes to clear messages
            if isinstance(status_code, int) and status_code not in _RETRYABLE_STATUS_CODES:
                if status_code in (401, 403):
                    raise AgentProviderError(
                        "Gemini rejected the API credentials or project access (HTTP %s). "
                        "Check the configured key and API access." % status_code
                    ) from exc
                if status_code == 404:
                    raise AgentProviderError(
                        "The configured Gemini model was not found or is unavailable to this project (HTTP 404)."
                    ) from exc
                if status_code == 400:
                    raise AgentProviderError(
                        "Gemini rejected the request or structured-output schema (HTTP 400)."
                    ) from exc
                raise AgentProviderError("Gemini request failed (HTTP %s)." % status_code) from exc

            last_exc = exc

        # Back off before retrying (no sleep after the last attempt)
        if attempt < max_attempts - 1:
            delay = _RETRY_DELAYS[attempt]
            logger.info("Retrying Gemini call in %.0f s (attempt %d/%d).", delay, attempt + 1, max_attempts)
            await asyncio.sleep(delay)

    # All attempts exhausted
    if isinstance(last_exc, asyncio.TimeoutError):
        raise AgentProviderError(
            "Gemini request timed out after %d attempts." % max_attempts
        ) from last_exc
    raise AgentProviderError(
        "Gemini could not produce a valid agent result after %d attempts." % max_attempts
    ) from last_exc
