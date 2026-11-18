import asyncio
import logging
from typing import Type, TypeVar

from pydantic import BaseModel

from backend.config import settings

T = TypeVar("T", bound=BaseModel)
logger = logging.getLogger("vanta.agents.gemini")

# Transient HTTP status codes that are safe to retry on another model.
_RETRYABLE_STATUS_CODES = {429, 500, 502, 503, 504}
# gemini-3.8-flash is listed, but on 2026-11-17 it returned high-demand 503s and timeouts.
# gemini-2.5-flash still answers. It reroutes on 2026-12-01.
FALLBACK_MODEL = "gemini-2.5-flash"
_model_used: str | None = None


def model_used() -> str:
    """The model that last produced a result, or the configured model if none has."""
    return _model_used or settings.GEMINI_MODEL


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
    models = [settings.GEMINI_MODEL]
    if FALLBACK_MODEL not in models:
        models.append(FALLBACK_MODEL)

    last_exc: Exception | None = None
    failures: list[str] = []
    for index, model in enumerate(models):
        try:
            async with genai.Client(api_key=api_key).aio as client:
                response = await asyncio.wait_for(
                    client.models.generate_content(
                        model=model,
                        contents=context,
                        config=types.GenerateContentConfig(
                            system_instruction=system_instruction,
                            temperature=0.2,
                            max_output_tokens=4096,
                            response_mime_type="application/json",
                            response_json_schema=schema.model_json_schema(),
                        ),
                    ),
                    timeout=30,
                )

            if not response.text:
                raise AgentProviderError("Gemini returned an empty response.")

            try:
                parsed = schema.model_validate_json(response.text)
            except Exception as parse_exc:
                raise AgentProviderError(
                    "Gemini returned data that did not match the agent response format."
                ) from parse_exc
            global _model_used
            _model_used = model
            if model != settings.GEMINI_MODEL:
                logger.warning(
                    "Configured Gemini model %s did not answer. Used %s.",
                    settings.GEMINI_MODEL, model,
                )
            return parsed

        except AgentConfigurationError:
            raise
        except AgentProviderError:
            raise
        except asyncio.TimeoutError as exc:
            last_exc = exc
            failures.append(f"{model} timed out")
            logger.warning("Gemini model %s timed out.", model)
        except Exception as exc:
            status_code = getattr(exc, "code", None)
            logger.warning(
                "Gemini structured request failed: model=%s exception=%s status=%s",
                model, type(exc).__name__, status_code,
            )
            if isinstance(status_code, int) and status_code not in _RETRYABLE_STATUS_CODES:
                if status_code in (401, 403):
                    raise AgentProviderError(
                        "Gemini rejected the API credentials or project access (HTTP %s). "
                        "Check the configured key and API access." % status_code
                    ) from exc
                if status_code == 404:
                    raise AgentProviderError(
                        "Gemini model %s was not found for this project (HTTP 404)." % model
                    ) from exc
                if status_code == 400:
                    raise AgentProviderError(
                        "Gemini rejected the request or structured-output schema (HTTP 400)."
                    ) from exc
                raise AgentProviderError("Gemini request failed (HTTP %s)." % status_code) from exc
            last_exc = exc
            failures.append(f"{model} HTTP {status_code or 'unavailable'}")

        if index < len(models) - 1:
            logger.info("Trying Gemini fallback %s.", models[index + 1])

    detail = "; ".join(failures) or "no response"
    raise AgentProviderError(
        "Gemini is unavailable (%s). The configured model is reporting high demand." % detail
    ) from last_exc
