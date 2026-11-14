import asyncio
import json
import re
import uuid
from datetime import datetime, timezone
from typing import Literal, Optional

import aiosqlite
import httpx
from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel, Field, field_validator

from backend.config import settings
from backend.db import DB_PATH
from backend.services.sms import send_sms

router = APIRouter(prefix="/api", tags=["Operations and SOS"])
_bulk_lock = asyncio.Lock()
_last_bulk_at: datetime | None = None


class ContactInput(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    phone: str
    area: str = Field(min_length=1, max_length=160)
    group: Literal["public", "volunteers", "units"]

    @field_validator("phone")
    @classmethod
    def valid_e164(cls, value: str) -> str:
        if not re.fullmatch(r"\+[1-9]\d{7,14}", value.strip()):
            raise ValueError("Phone number must use E.164 format, such as +919876543210.")
        return value.strip()


class ContactCreate(ContactInput):
    pass


class ContactImport(BaseModel):
    contacts: list[ContactInput] = Field(max_length=1000)


class SosSendRequest(BaseModel):
    contact_ids: list[str] = Field(min_length=1, max_length=1000)
    message: str = Field(min_length=1, max_length=320)
    officer_id: str = Field(default="Officer-ControlRoom", max_length=120)
    retry_log_id: Optional[str] = None
    officer_approved: Literal[True]


@router.get("/contacts")
async def get_contacts():
    async with aiosqlite.connect(DB_PATH) as db:
        db.row_factory = aiosqlite.Row
        async with db.execute("SELECT * FROM contacts ORDER BY area, name") as cur:
            rows = await cur.fetchall()
    return [{"id": row["id"], "name": row["name"], "phone": row["phone"], "area": row["area"], "group": row["group_name"], "created_at": row["created_at"]} for row in rows]


@router.post("/contacts")
async def add_contact(contact: ContactCreate):
    item = contact.model_dump()
    item_id, now = f"contact-{uuid.uuid4().hex[:12]}", datetime.now(timezone.utc).isoformat()
    try:
        async with aiosqlite.connect(DB_PATH) as db:
            await db.execute("INSERT INTO contacts VALUES (?, ?, ?, ?, ?, ?)", (item_id, item["name"], item["phone"], item["area"], item["group"], now))
            await db.commit()
    except aiosqlite.IntegrityError as exc:
        raise HTTPException(status_code=409, detail="That phone number is already registered.") from exc
    return {"id": item_id, **item, "created_at": now}


@router.post("/contacts/import")
async def import_contacts(request: ContactImport):
    now = datetime.now(timezone.utc).isoformat()
    created, duplicates = [], []
    async with aiosqlite.connect(DB_PATH) as db:
        for contact in request.contacts:
            item = contact.model_dump()
            item_id = f"contact-{uuid.uuid4().hex[:12]}"
            try:
                await db.execute("INSERT INTO contacts VALUES (?, ?, ?, ?, ?, ?)", (item_id, item["name"], item["phone"], item["area"], item["group"], now))
                created.append({"id": item_id, **item, "created_at": now})
            except aiosqlite.IntegrityError:
                duplicates.append(item["phone"])
        await db.commit()
    return {"created": created, "duplicates": duplicates}


@router.get("/operations-calendar")
async def get_operations_calendar():
    async with aiosqlite.connect(DB_PATH) as db:
        db.row_factory = aiosqlite.Row
        async with db.execute("SELECT event_json FROM operations_calendar ORDER BY updated_at DESC") as cur:
            rows = await cur.fetchall()
    return sorted((json.loads(row["event_json"]) for row in rows), key=lambda event: event.get("start", ""))


@router.patch("/operations-calendar/{event_id}")
async def decide_calendar_event(event_id: str, decision: Literal["approved", "rejected"], officer_id: str = "Officer-ControlRoom"):
    async with aiosqlite.connect(DB_PATH) as db:
        db.row_factory = aiosqlite.Row
        async with db.execute("SELECT event_json FROM operations_calendar WHERE id = ?", (event_id,)) as cur:
            row = await cur.fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="Calendar event not found.")
        event = json.loads(row["event_json"])
        event["status"] = decision
        now = datetime.now(timezone.utc).isoformat()
        await db.execute("UPDATE operations_calendar SET event_json = ?, updated_at = ? WHERE id = ?", (json.dumps(event), now, event_id))
        await db.execute("INSERT INTO officer_decisions VALUES (?, ?, ?, ?, ?)", (f"decision-{uuid.uuid4().hex[:12]}", f"CALENDAR_{decision.upper()}", json.dumps({"event_id": event_id, "title": event["title"]}), officer_id, now))
        await db.commit()
    return event


@router.get("/sos/logs")
async def get_sos_logs():
    async with aiosqlite.connect(DB_PATH) as db:
        db.row_factory = aiosqlite.Row
        async with db.execute("SELECT * FROM sos_send_logs ORDER BY sent_at DESC LIMIT 100") as cur:
            rows = await cur.fetchall()
    return [{"id": row["id"], "sent_at": row["sent_at"], "officer_id": row["officer_id"], "message": row["message"], "recipients": json.loads(row["recipients_json"]), "status": row["status"], "test_mode": bool(row["test_mode"])} for row in rows]


@router.post("/sos/status")
async def twilio_delivery_status(request: Request):
    if settings.SMS_PROVIDER.strip().lower() != "twilio" or not settings.SMS_STATUS_CALLBACK_URL:
        raise HTTPException(status_code=503, detail="A Twilio status callback URL is not configured.")
    if not settings.TWILIO_AUTH_TOKEN:
        raise HTTPException(status_code=503, detail="Twilio webhook validation is not configured.")
    try:
        from twilio.request_validator import RequestValidator
        form = await request.form()
        signature = request.headers.get("X-Twilio-Signature", "")
        valid = RequestValidator(settings.TWILIO_AUTH_TOKEN.get_secret_value()).validate(
            settings.SMS_STATUS_CALLBACK_URL, dict(form), signature
        )
    except Exception as exc:
        raise HTTPException(status_code=400, detail="Could not validate the Twilio status callback.") from exc
    if not valid:
        raise HTTPException(status_code=403, detail="Invalid Twilio status callback signature.")

    fields = dict(form)
    reference = fields.get("MessageSid")
    raw_status = (fields.get("MessageStatus") or "").lower()
    mapped = {"accepted": "Queued", "queued": "Queued", "sending": "Queued", "sent": "Sent", "delivered": "Delivered", "failed": "Failed", "undelivered": "Failed"}.get(raw_status)
    if not reference or not mapped:
        raise HTTPException(status_code=422, detail="The callback did not include a recognized message status.")
    async with aiosqlite.connect(DB_PATH) as db:
        db.row_factory = aiosqlite.Row
        async with db.execute("SELECT * FROM sos_send_logs ORDER BY sent_at DESC LIMIT 100") as cur:
            rows = await cur.fetchall()
        updated_log = None
        for row in rows:
            recipients = json.loads(row["recipients_json"])
            changed = False
            for item in recipients:
                if item.get("provider_reference") == reference:
                    item["status"] = mapped
                    item["error"] = fields.get("ErrorMessage") if mapped == "Failed" else None
                    changed = True
            if changed:
                summary = "Failed" if all(item["status"] == "Failed" for item in recipients) else "Partial" if any(item["status"] == "Failed" for item in recipients) else "Delivered" if all(item["status"] == "Delivered" for item in recipients) else "Sent" if all(item["status"] in ("Sent", "Delivered") for item in recipients) else "Queued"
                await db.execute("UPDATE sos_send_logs SET recipients_json = ?, status = ? WHERE id = ?", (json.dumps(recipients), summary, row["id"]))
                updated_log = row["id"]
                break
        if not updated_log:
            raise HTTPException(status_code=404, detail="No SOS log matches this provider message ID.")
        await db.commit()
    return {"status": mapped, "log_id": updated_log}


@router.post("/sos/send")
async def send_sos(request: SosSendRequest):
    global _last_bulk_at
    placeholders = ",".join("?" for _ in set(request.contact_ids))
    if not placeholders:
        raise HTTPException(status_code=422, detail="Select at least one recipient.")
    async with aiosqlite.connect(DB_PATH) as db:
        db.row_factory = aiosqlite.Row
        async with db.execute(f"SELECT id, name, phone, area, group_name FROM contacts WHERE id IN ({placeholders})", tuple(set(request.contact_ids))) as cur:
            rows = await cur.fetchall()
    if not rows:
        raise HTTPException(status_code=422, detail="No registered contacts match this selection.")
    async with _bulk_lock:
        now = datetime.now(timezone.utc)
        if _last_bulk_at and (now - _last_bulk_at).total_seconds() < 60:
            raise HTTPException(status_code=429, detail="Bulk SOS is rate-limited to one send per minute.")
        _last_bulk_at = now
    recipients = []
    for offset in range(0, len(rows), 20):
        batch = rows[offset:offset + 20]
        for contact in batch:
            status, ref = "Failed", None
            error = None
            for attempt in range(3):
                try:
                    result = await send_sms(contact["phone"], request.message)
                    status, ref = result["status"], result.get("provider_reference")
                    break
                except (httpx.HTTPError, RuntimeError) as exc:
                    error = str(exc)
                    if attempt < 2:
                        await asyncio.sleep(0.25 * (attempt + 1))
            recipients.append({"contact_id": contact["id"], "name": contact["name"], "phone": contact["phone"], "area": contact["area"], "group": contact["group_name"], "status": status, "provider_reference": ref, "error": error})

    log_id = request.retry_log_id or f"sos-{uuid.uuid4().hex[:12]}"
    sent_at = datetime.now(timezone.utc).isoformat()
    async with aiosqlite.connect(DB_PATH) as db:
        original = None
        if request.retry_log_id:
            db.row_factory = aiosqlite.Row
            async with db.execute("SELECT * FROM sos_send_logs WHERE id = ?", (request.retry_log_id,)) as cur:
                original = await cur.fetchone()
            if original:
                previous = json.loads(original["recipients_json"])
                retried = {item["contact_id"]: item for item in recipients}
                recipients = [retried.get(item["contact_id"], item) for item in previous]
                sent_at = original["sent_at"]
                request.message = original["message"]
                request.officer_id = original["officer_id"]
        summary = "Failed" if all(item["status"] == "Failed" for item in recipients) else "Partial" if any(item["status"] == "Failed" for item in recipients) else "Queued" if all(item["status"] == "Queued" for item in recipients) else "Sent"
        await db.execute("INSERT OR REPLACE INTO sos_send_logs VALUES (?, ?, ?, ?, ?, ?, ?)", (log_id, sent_at, request.officer_id, request.message, json.dumps(recipients), summary, 1 if settings.SMS_TEST_MODE else 0))
        await db.commit()
    return {"id": log_id, "sent_at": sent_at, "officer_id": request.officer_id, "message": request.message, "recipient_count": len(recipients), "recipients": recipients, "status": summary, "test_mode": settings.SMS_TEST_MODE, "sender": "TEST MODE — no SMS sent" if settings.SMS_TEST_MODE else settings.SMS_SENDER}
