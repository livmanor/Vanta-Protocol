import asyncio
import logging
from typing import Type, TypeVar

from pydantic import BaseModel

from backend.config import settings

T = TypeVar("T", bound=BaseModel)
logger = logging.getLogger("vanta.agents.gemini")

# Transient HTTP status codes that are safe to retry on another model.
_RETRYABLE_STATUS_CODES = {429, 500, 502, 503, 504}
_DEPRECATION_MARKERS = (
    "deprecated",
    "deprecation",
    "reroute",
    "redirect",
    "no longer available",
    "has been shut down",
    "migrate to",
)
_model_used: str | None = None


def model_used() -> str:
    """The model that last produced a result, or the configured model if none has."""
    return _model_used or settings.GEMINI_MODEL


def _fallback_models() -> list[str]:
    raw = (settings.GEMINI_FALLBACK_MODELS or "").strip()
    if not raw:
        return []
    return [part.strip() for part in raw.split(",") if part.strip()]


def _model_chain() -> list[str]:
    models = [settings.GEMINI_MODEL]
    for model in _fallback_models():
        if model not in models:
            models.append(model)
    return models


def _looks_like_deprecation(exc: Exception) -> bool:
    text = str(exc or "").lower()
    return any(marker in text for marker in _DEPRECATION_MARKERS)


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
    models = _model_chain()

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
                            max_output_tokens=8192,
                            response_mime_type="application/json",
                            response_json_schema=schema.model_json_schema(),
                        ),
                    ),
                    timeout=45,
                )

            if not response.text:
                last_exc = AgentProviderError("Gemini returned an empty response.")
                failures.append(f"{model} empty response")
                if index < len(models) - 1:
                    logger.info("Trying Gemini fallback %s after empty response.", models[index + 1])
                    continue
                raise last_exc

            try:
                parsed = schema.model_validate_json(response.text)
            except Exception as parse_exc:
                logger.warning(
                    "Gemini schema validation failed on %s: %s; body_prefix=%s",
                    model,
                    type(parse_exc).__name__,
                    (response.text or "")[:400],
                )
                last_exc = AgentProviderError(
                    "Gemini returned data that did not match the agent response format."
                )
                failures.append(f"{model} invalid JSON schema")
                if index < len(models) - 1:
                    logger.info("Trying Gemini fallback %s after schema mismatch.", models[index + 1])
                    continue
                raise last_exc from parse_exc
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
            if model == settings.GEMINI_MODEL and _looks_like_deprecation(exc):
                logger.warning(
                    "Primary Gemini model %s returned a deprecation/redirect signal (%s). "
                    "gemini-2.5-flash is documented to reroute on 2026-12-01; "
                    "set GEMINI_MODEL / GEMINI_FALLBACK_MODELS.",
                    model,
                    type(exc).__name__,
                )
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
                    # 404 often means the model id was retired; try the next fallback.
                    last_exc = exc
                    failures.append(f"{model} HTTP 404")
                    if index < len(models) - 1:
                        logger.info("Trying Gemini fallback %s after HTTP 404.", models[index + 1])
                        continue
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
