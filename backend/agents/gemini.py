import asyncio
import logging
from typing import Type, TypeVar

from pydantic import BaseModel

from backend.config import settings

T = TypeVar("T", bound=BaseModel)
logger = logging.getLogger("vanta.agents.gemini")


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
                        max_output_tokens=4096,
                        response_mime_type="application/json",
                        response_json_schema=schema.model_json_schema(),
                    ),
                ),
                timeout=45,
            )
        if not response.text:
            # #region agent log
            try:
                import json as _json
                from datetime import datetime, timezone
                open(r"c:\Users\NEELS\Desktop\Vanta Protocol\.cursor\debug-715d98.log", "a", encoding="utf-8").write(_json.dumps({"sessionId":"715d98","hypothesisId":"E","location":"gemini.py:generate_structured","message":"empty gemini text","data":{"model":settings.GEMINI_MODEL,"schema":schema.__name__},"timestamp":int(datetime.now(timezone.utc).timestamp()*1000)})+"\n")
            except Exception:
                pass
            # #endregion
            raise AgentProviderError("Gemini returned an empty response.")
        # #region agent log
        try:
            import json as _json
            from datetime import datetime, timezone
            open(r"c:\Users\NEELS\Desktop\Vanta Protocol\.cursor\debug-715d98.log", "a", encoding="utf-8").write(_json.dumps({"sessionId":"715d98","hypothesisId":"E","location":"gemini.py:generate_structured","message":"gemini structured ok","data":{"model":settings.GEMINI_MODEL,"schema":schema.__name__,"text_len":len(response.text)},"timestamp":int(datetime.now(timezone.utc).timestamp()*1000)})+"\n")
        except Exception:
            pass
        # #endregion
        try:
            return schema.model_validate_json(response.text)
        except Exception as parse_exc:
            if type(parse_exc).__name__ == "ValidationError":
                # #region agent log
                try:
                    import json as _json
                    from datetime import datetime, timezone
                    open(r"c:\Users\NEELS\Desktop\Vanta Protocol\.cursor\debug-715d98.log", "a", encoding="utf-8").write(_json.dumps({"sessionId":"715d98","hypothesisId":"E","location":"gemini.py:model_validate_json","message":"schema mismatch details","data":{"schema":schema.__name__,"error":str(parse_exc)[:1200],"text_preview":(response.text or "")[:800]},"timestamp":int(datetime.now(timezone.utc).timestamp()*1000)})+"\n")
                except Exception:
                    pass
                # #endregion
            raise
    except AgentConfigurationError:
        raise
    except AgentProviderError:
        raise
    except asyncio.TimeoutError as exc:
        raise AgentProviderError("Gemini request timed out.") from exc
    except Exception as exc:
        # Log only the provider exception class and status. Never log request data or credentials.
        status_code = getattr(exc, "code", None)
        logger.warning("Gemini structured request failed: exception=%s status=%s", type(exc).__name__, status_code)
        # #region agent log
        try:
            import json as _json
            from datetime import datetime, timezone
            open(r"c:\Users\NEELS\Desktop\Vanta Protocol\.cursor\debug-715d98.log", "a", encoding="utf-8").write(_json.dumps({"sessionId":"715d98","hypothesisId":"E","location":"gemini.py:generate_structured","message":"gemini structured failed","data":{"model":settings.GEMINI_MODEL,"schema":schema.__name__,"exc":type(exc).__name__,"status":status_code},"timestamp":int(datetime.now(timezone.utc).timestamp()*1000)})+"\n")
        except Exception:
            pass
        # #endregion
        if isinstance(status_code, int):
            if status_code in (401, 403):
                message = "Gemini rejected the API credentials or project access (HTTP %s). Check the configured key and API access." % status_code
            elif status_code == 404:
                message = "The configured Gemini model was not found or is unavailable to this project (HTTP 404)."
            elif status_code == 429:
                message = "Gemini rate or quota limit reached (HTTP 429). Wait, then retry or check project quota."
            elif status_code == 400:
                message = "Gemini rejected the request or structured-output schema (HTTP 400)."
            else:
                message = "Gemini request failed (HTTP %s)." % status_code
            raise AgentProviderError(message) from exc
        if type(exc).__name__ == "ValidationError":
            # #region agent log
            try:
                import json as _json
                from datetime import datetime, timezone
                open(r"c:\Users\NEELS\Desktop\Vanta Protocol\.cursor\debug-715d98.log", "a", encoding="utf-8").write(_json.dumps({"sessionId":"715d98","hypothesisId":"E","location":"gemini.py:ValidationError","message":"schema mismatch details","data":{"schema":schema.__name__,"error":str(exc)[:1200]},"timestamp":int(datetime.now(timezone.utc).timestamp()*1000)})+"\n")
            except Exception:
                pass
            # #endregion
            raise AgentProviderError("Gemini returned data that did not match the agent response format.") from exc
        raise AgentProviderError("Gemini could not produce a valid agent result.") from exc
