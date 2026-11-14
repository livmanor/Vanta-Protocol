"""Provider adapters for officer-approved SOS messages."""

import base64
import json
from typing import Any, Dict

import httpx

from backend.config import settings


async def send_sms(to: str, body: str) -> Dict[str, Any]:
    if settings.SMS_TEST_MODE:
        return {"status": "Queued", "provider_reference": None}

    provider = settings.SMS_PROVIDER.strip().lower()
    async with httpx.AsyncClient(timeout=15.0) as client:
        if provider == "twilio":
            if not settings.TWILIO_ACCOUNT_SID or not settings.TWILIO_AUTH_TOKEN or not settings.SMS_SENDER:
                raise RuntimeError("Twilio SMS credentials and SMS_SENDER must be configured on the server.")
            sid = settings.TWILIO_ACCOUNT_SID.get_secret_value()
            token = settings.TWILIO_AUTH_TOKEN.get_secret_value()
            basic = base64.b64encode(f"{sid}:{token}".encode()).decode()
            response = await client.post(
                f"https://api.twilio.com/2010-04-01/Accounts/{sid}/Messages.json",
                headers={"Authorization": f"Basic {basic}"},
                data={
                    "To": to,
                    "From": settings.SMS_SENDER,
                    **({"ContentSid": settings.SMS_DLT_TEMPLATE_ID, "ContentVariables": json.dumps({"1": body})} if settings.SMS_DLT_TEMPLATE_ID else {"Body": body}),
                    **({"StatusCallback": settings.SMS_STATUS_CALLBACK_URL} if settings.SMS_STATUS_CALLBACK_URL else {}),
                },
            )
        elif provider == "msg91":
            if not settings.MSG91_AUTH_KEY or not settings.MSG91_TEMPLATE_ID or not settings.SMS_SENDER:
                raise RuntimeError("MSG91 credentials, approved flow template and sender must be configured on the server.")
            response = await client.post(
                "https://control.msg91.com/api/v5/flow/",
                headers={"authkey": settings.MSG91_AUTH_KEY.get_secret_value(), "Content-Type": "application/json"},
                json={
                    "template_id": settings.MSG91_TEMPLATE_ID or settings.SMS_DLT_TEMPLATE_ID,
                    "recipients": [{"mobiles": to.lstrip("+"), "VAR1": body}],
                },
            )
        else:
            raise RuntimeError("SMS_PROVIDER must be 'twilio' or 'msg91'.")
        response.raise_for_status()
        payload = response.json() if response.content else {}
        return {"status": "Queued", "provider_reference": payload.get("sid") or payload.get("request_id")}
