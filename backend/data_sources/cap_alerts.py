"""NDMA SACHET / IMD CAP 1.2 alert pipeline for Greater Hyderabad.

Investigation notes (2026-11-18, live fetches):
- IMD CAP RSS https://cap-sources.s3.amazonaws.com/in-imd-en/rss.xml returned HTTP 200
  with zero <item> entries (lastBuildDate 2026-09-27). No active IMD-native CAP sample.
- SACHET RSS https://sachet.ndma.gov.in/cap_public_website/rss/rss_india.xml returned
  HTTP 200 with 100 items. No Telangana/Hyderabad titles were active at poll time.
- Sampled SACHET CAP XML (cap: namespace, CAP 1.2):
  - severity/urgency/certainty are standard CAP enums on <info>
  - colour is NOT present as a dedicated field; the only <parameter> seen was
    "Polygon URL". Colour for the operations floor is therefore derived from CAP
    severity (Extreme→red, Severe→orange, Moderate→yellow, Minor→green). If a
    future message includes a colour/colour-named parameter, that value wins.
  - <area> carries areaDesc plus geocode valueName="LGD District Code"
  - no inline <polygon>; polygons are linked via the Polygon URL parameter
  - msgType Alert/Update observed; references look like sender,identifier,sent
- Because the IMD index is empty today, SACHET is the primary feed. IMD CAP RSS
  is still polled; messages are deduped on identifier.
- Greater Hyderabad LGD match set (config, not hardcoded in match logic):
  Hyderabad 507, Medchal-Malkajgiri 700, Ranga Reddy 518, Sangareddy 691.
"""

from __future__ import annotations

import asyncio
import json
import logging
import re
from dataclasses import dataclass, field
from datetime import datetime, timedelta, timezone
from typing import Any, Optional
from urllib.parse import urlparse

import aiosqlite
import httpx
from defusedxml import ElementTree as ET

from backend.config import settings
from backend.db import DB_PATH

logger = logging.getLogger("vanta.cap")

CAP_NS = {"cap": "urn:oasis:names:tc:emergency:cap:1.2"}
IST = timezone(timedelta(hours=5, minutes=30))
BAND_RANK = {"quiet": 0, "watch": 1, "heavy": 2}
SEVERITY_COLOUR = {
    "extreme": "red",
    "severe": "orange",
    "moderate": "yellow",
    "minor": "green",
    "unknown": "green",
}

_poll_lock = asyncio.Lock()
_poll_task: asyncio.Task | None = None
_state: dict[str, Any] = {
    "last_polled_at": None,
    "last_success_at": None,
    "last_error": None,
    "items_seen": 0,
    "items_parsed": 0,
    "items_failed": 0,
    "poll_ok": False,
}


def _now_utc() -> datetime:
    return datetime.now(timezone.utc)


def _parse_dt(value: str | None) -> datetime | None:
    if not value or not str(value).strip():
        return None
    text = str(value).strip().replace("Z", "+00:00")
    try:
        parsed = datetime.fromisoformat(text)
    except ValueError:
        return None
    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=IST)
    return parsed.astimezone(timezone.utc)


def _text(node, path: str) -> str | None:
    if node is None:
        return None
    el = node.find(path, CAP_NS)
    if el is None or el.text is None:
        return None
    value = el.text.strip()
    return value or None


def _local(tag: str) -> str:
    return tag.rsplit("}", 1)[-1]


def hyd_district_codes() -> set[str]:
    return {code.strip() for code in settings.CAP_HYD_DISTRICT_CODES.split(",") if code.strip()}


def allowed_hosts() -> set[str]:
    return {host.strip().lower() for host in settings.CAP_ALLOWED_HOSTS.split(",") if host.strip()}


def rss_urls() -> list[str]:
    return [url.strip() for url in settings.CAP_RSS_URLS.split(",") if url.strip()]


def colour_from_severity(severity: str | None, parameters: dict[str, str]) -> str:
    for key, value in parameters.items():
        if re.search(r"colou?r|warning.?level|alert.?level", key, re.I) and value:
            return value.strip().lower()
    return SEVERITY_COLOUR.get((severity or "unknown").strip().lower(), "green")


def floor_for_colour(colour: str | None) -> str | None:
    tone = (colour or "").strip().lower()
    if tone == "red":
        return (settings.CAP_FLOOR_RED or "heavy").strip().lower()
    if tone == "orange":
        return (settings.CAP_FLOOR_ORANGE or "watch").strip().lower()
    return None


def max_band(*bands: str) -> str:
    best = "quiet"
    for band in bands:
        name = (band or "quiet").strip().lower()
        if BAND_RANK.get(name, 0) > BAND_RANK.get(best, 0):
            best = name
    return best


def host_allowed(url: str) -> bool:
    try:
        host = urlparse(url).hostname or ""
    except Exception:
        return False
    return host.lower() in allowed_hosts()


@dataclass
class ParsedArea:
    area_desc: str | None
    geocodes: list[dict[str, str]] = field(default_factory=list)


@dataclass
class ParsedAlert:
    identifier: str
    sender: str | None
    sent: str | None
    msg_type: str | None
    references: str | None
    status: str | None
    severity: str | None
    urgency: str | None
    certainty: str | None
    effective: str | None
    onset: str | None
    expires: str | None
    event: str | None
    headline: str | None
    description: str | None
    instruction: str | None
    colour: str
    areas: list[ParsedArea]
    parameters: dict[str, str]
    raw_xml: str
    matched_district_codes: list[str] = field(default_factory=list)
    match: str = "unmatched_text_only"


def parse_cap_xml(raw_xml: str) -> ParsedAlert:
    root = ET.fromstring(raw_xml.encode("utf-8") if isinstance(raw_xml, str) else raw_xml)
    if _local(root.tag) != "alert":
        raise ValueError("Root element is not alert")
    identifier = _text(root, "cap:identifier")
    if not identifier:
        raise ValueError("CAP alert is missing identifier")
    infos = root.findall("cap:info", CAP_NS)
    info = None
    for candidate in infos:
        language = (_text(candidate, "cap:language") or "").lower()
        if language.startswith("en"):
            info = candidate
            break
    if info is None and infos:
        info = infos[0]

    parameters: dict[str, str] = {}
    areas: list[ParsedArea] = []
    severity = urgency = certainty = effective = onset = expires = event = headline = description = instruction = None
    if info is not None:
        severity = _text(info, "cap:severity")
        urgency = _text(info, "cap:urgency")
        certainty = _text(info, "cap:certainty")
        effective = _text(info, "cap:effective")
        onset = _text(info, "cap:onset")
        expires = _text(info, "cap:expires")
        event = _text(info, "cap:event")
        headline = _text(info, "cap:headline")
        description = _text(info, "cap:description")
        instruction = _text(info, "cap:instruction")
        for param in info.findall("cap:parameter", CAP_NS):
            name = _text(param, "cap:valueName")
            value = _text(param, "cap:value")
            if name and value is not None:
                parameters[name] = value
        for area in info.findall("cap:area", CAP_NS):
            geos = []
            for geo in area.findall("cap:geocode", CAP_NS):
                name = _text(geo, "cap:valueName")
                value = _text(geo, "cap:value")
                if name and value:
                    geos.append({"name": name, "value": value})
            areas.append(ParsedArea(area_desc=_text(area, "cap:areaDesc"), geocodes=geos))

    colour = colour_from_severity(severity, parameters)
    matched = sorted(
        {
            geo["value"]
            for area in areas
            for geo in area.geocodes
            if geo["name"].strip().lower() in {"lgd district code", "lgd_district_code"}
            and geo["value"] in hyd_district_codes()
        }
    )
    has_any_code = any(area.geocodes for area in areas)
    if matched:
        match = "matched"
    elif has_any_code:
        match = "other_district"
    else:
        match = "unmatched_text_only"

    return ParsedAlert(
        identifier=identifier,
        sender=_text(root, "cap:sender"),
        sent=_text(root, "cap:sent"),
        msg_type=_text(root, "cap:msgType"),
        references=_text(root, "cap:references"),
        status=_text(root, "cap:status"),
        severity=severity,
        urgency=urgency,
        certainty=certainty,
        effective=effective,
        onset=onset,
        expires=expires,
        event=event,
        headline=headline,
        description=description,
        instruction=instruction,
        colour=colour,
        areas=areas,
        parameters=parameters,
        raw_xml=raw_xml if isinstance(raw_xml, str) else raw_xml.decode("utf-8", errors="replace"),
        matched_district_codes=matched,
        match=match,
    )


def referenced_identifiers(references: str | None) -> list[str]:
    if not references:
        return []
    found = []
    for chunk in references.split():
        parts = [part.strip() for part in chunk.split(",")]
        if len(parts) >= 2 and parts[1]:
            found.append(parts[1])
    return found


async def ensure_cap_table(db: aiosqlite.Connection) -> None:
    await db.execute(
        """
        CREATE TABLE IF NOT EXISTS cap_alerts (
            identifier TEXT PRIMARY KEY,
            sender TEXT,
            sent TEXT,
            msg_type TEXT,
            references_text TEXT,
            status TEXT,
            severity TEXT,
            urgency TEXT,
            certainty TEXT,
            effective TEXT,
            onset TEXT,
            expires TEXT,
            event TEXT,
            headline TEXT,
            description TEXT,
            instruction TEXT,
            colour TEXT,
            areas_json TEXT,
            parameters_json TEXT,
            raw_xml TEXT,
            fetched_at TEXT NOT NULL,
            superseded_by TEXT,
            matched_district_codes TEXT,
            match_kind TEXT,
            active INTEGER NOT NULL DEFAULT 1
        )
        """
    )


async def _upsert_alert(db: aiosqlite.Connection, alert: ParsedAlert, fetched_at: str, active: int = 1) -> None:
    await db.execute(
        """
        INSERT INTO cap_alerts (
            identifier, sender, sent, msg_type, references_text, status, severity, urgency, certainty,
            effective, onset, expires, event, headline, description, instruction, colour,
            areas_json, parameters_json, raw_xml, fetched_at, superseded_by, matched_district_codes, match_kind, active
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, ?, ?, ?)
        ON CONFLICT(identifier) DO UPDATE SET
            sender=excluded.sender, sent=excluded.sent, msg_type=excluded.msg_type,
            references_text=excluded.references_text, status=excluded.status, severity=excluded.severity,
            urgency=excluded.urgency, certainty=excluded.certainty, effective=excluded.effective,
            onset=excluded.onset, expires=excluded.expires, event=excluded.event, headline=excluded.headline,
            description=excluded.description, instruction=excluded.instruction, colour=excluded.colour,
            areas_json=excluded.areas_json, parameters_json=excluded.parameters_json, raw_xml=excluded.raw_xml,
            fetched_at=excluded.fetched_at, matched_district_codes=excluded.matched_district_codes,
            match_kind=excluded.match_kind, active=excluded.active
        """,
        (
            alert.identifier,
            alert.sender,
            alert.sent,
            alert.msg_type,
            alert.references,
            alert.status,
            alert.severity,
            alert.urgency,
            alert.certainty,
            alert.effective,
            alert.onset,
            alert.expires,
            alert.event,
            alert.headline,
            alert.description,
            alert.instruction,
            alert.colour,
            json.dumps([{"area_desc": a.area_desc, "geocodes": a.geocodes} for a in alert.areas]),
            json.dumps(alert.parameters),
            alert.raw_xml,
            fetched_at,
            json.dumps(alert.matched_district_codes),
            alert.match,
            active,
        ),
    )


async def _mark_superseded(db: aiosqlite.Connection, old_ids: list[str], new_id: str) -> None:
    for old_id in old_ids:
        await db.execute(
            "UPDATE cap_alerts SET active = 0, superseded_by = ? WHERE identifier = ?",
            (new_id, old_id),
        )


async def _fetch_bytes(client: httpx.AsyncClient, url: str) -> bytes:
    if not host_allowed(url):
        raise ValueError(f"Host not allowlisted: {url}")
    response = await client.get(url)
    response.raise_for_status()
    body = response.content
    if len(body) > settings.CAP_MAX_BODY_BYTES:
        raise ValueError(f"Body exceeds {settings.CAP_MAX_BODY_BYTES} bytes")
    return body


def _rss_item_links(rss_xml: bytes) -> list[str]:
    root = ET.fromstring(rss_xml)
    links = []
    for item in root.findall("./channel/item"):
        link = (item.findtext("link") or "").strip()
        if link:
            links.append(link)
    return links[: max(1, int(settings.CAP_MAX_ITEMS_PER_POLL))]


async def poll_cap_feeds(force: bool = False) -> dict[str, Any]:
    """Fetch RSS indexes and CAP messages. Safe to call concurrently; only one poll runs."""
    if _poll_lock.locked() and not force:
        return dict(_state)
    async with _poll_lock:
        seen = parsed = failed = 0
        fetched_at = _now_utc().isoformat()
        _state["last_polled_at"] = fetched_at
        try:
            async with httpx.AsyncClient(
                timeout=settings.CAP_HTTP_TIMEOUT_SECONDS,
                follow_redirects=True,
                headers={"User-Agent": "VantaProtocol/1.0 (disaster-response-control-room)"},
            ) as client:
                links: list[str] = []
                for rss_url in rss_urls():
                    try:
                        rss_body = await _fetch_bytes(client, rss_url)
                        links.extend(_rss_item_links(rss_body))
                    except Exception as exc:
                        logger.warning("CAP RSS failed (%s): %s", rss_url, type(exc).__name__)
                        failed += 1
                # Dedupe links while preserving order
                ordered = list(dict.fromkeys(links))
                seen = len(ordered)
                # Fetch CAP XML bodies concurrently; write to SQLite afterward so auth is not locked out.
                sem = asyncio.Semaphore(6)

                async def _download(link: str) -> tuple[str, bytes | None, str | None]:
                    async with sem:
                        try:
                            body = await _fetch_bytes(client, link)
                            return link, body, None
                        except Exception as exc:
                            return link, None, f"{type(exc).__name__}: {exc}"

                downloads = await asyncio.gather(*[_download(link) for link in ordered])
                async with aiosqlite.connect(DB_PATH) as db:
                    await ensure_cap_table(db)
                    for link, body, err in downloads:
                        if err or body is None:
                            failed += 1
                            logger.warning("CAP item failed (%s): %s", link[:120], err or "empty")
                            continue
                        try:
                            alert = parse_cap_xml(body.decode("utf-8", errors="replace"))
                            if (alert.status or "").strip() != "Actual":
                                continue
                            msg_type = (alert.msg_type or "").strip()
                            if msg_type == "Cancel":
                                await _mark_superseded(db, referenced_identifiers(alert.references) or [alert.identifier], alert.identifier)
                                await _upsert_alert(db, alert, fetched_at, active=0)
                                parsed += 1
                                continue
                            expires = _parse_dt(alert.expires)
                            active = 1
                            if expires is not None and expires <= _now_utc():
                                active = 0
                            await _upsert_alert(db, alert, fetched_at, active=active)
                            if msg_type == "Update":
                                await _mark_superseded(db, referenced_identifiers(alert.references), alert.identifier)
                            parsed += 1
                        except Exception as exc:
                            failed += 1
                            logger.warning("CAP item failed (%s): %s", link[:120], type(exc).__name__)
                    await db.commit()
            _state.update(
                last_success_at=fetched_at,
                last_error=None,
                items_seen=seen,
                items_parsed=parsed,
                items_failed=failed,
                poll_ok=True,
            )
        except Exception as exc:
            _state.update(
                last_error=f"{type(exc).__name__}: {str(exc)[:160]}",
                items_seen=seen,
                items_parsed=parsed,
                items_failed=failed,
                poll_ok=False,
            )
            logger.error("CAP poll failed: %s", _state["last_error"])
        return dict(_state)


def source_status_payload() -> dict[str, Any]:
    now = _now_utc()
    last_success = _parse_dt(_state.get("last_success_at"))
    last_polled = _parse_dt(_state.get("last_polled_at"))
    stale_after = timedelta(seconds=max(1, int(settings.CAP_POLL_SECONDS)) * 3)
    if not last_success:
        status = "failed"
    elif now - last_success > stale_after:
        status = "stale"
    elif (_state.get("items_failed") or 0) > 0 and (_state.get("items_parsed") or 0) >= 0 and _state.get("poll_ok"):
        # partial when the last successful poll had parse failures
        status = "partial" if (_state.get("items_failed") or 0) > 0 else "live"
    elif _state.get("poll_ok"):
        status = "live"
    else:
        status = "failed"
    if status == "live" and (_state.get("items_failed") or 0) > 0:
        status = "partial"
    return {
        "name": "IMD / NDMA CAP alerts",
        "endpoint": rss_urls()[0] if rss_urls() else "",
        "status": status,
        "last_updated": _state.get("last_success_at") or _state.get("last_polled_at"),
        "last_polled_at": _state.get("last_polled_at"),
        "last_success_at": _state.get("last_success_at"),
        "error_message": _state.get("last_error"),
        "items_seen": _state.get("items_seen") or 0,
        "items_parsed": _state.get("items_parsed") or 0,
        "items_failed": _state.get("items_failed") or 0,
        "poll_ok": bool(_state.get("poll_ok")),
    }


def _row_to_alert(row: aiosqlite.Row) -> dict[str, Any]:
    return {
        "identifier": row["identifier"],
        "sender": row["sender"],
        "sent": row["sent"],
        "msg_type": row["msg_type"],
        "status": row["status"],
        "severity": row["severity"],
        "urgency": row["urgency"],
        "certainty": row["certainty"],
        "effective": row["effective"],
        "onset": row["onset"],
        "expires": row["expires"],
        "event": row["event"],
        "headline": row["headline"],
        "description": row["description"],
        "instruction": row["instruction"],
        "colour": row["colour"],
        "areas": json.loads(row["areas_json"] or "[]"),
        "parameters": json.loads(row["parameters_json"] or "{}"),
        "matched_district_codes": json.loads(row["matched_district_codes"] or "[]"),
        "match": row["match_kind"],
        "fetched_at": row["fetched_at"],
        "superseded_by": row["superseded_by"],
        "floor": floor_for_colour(row["colour"]),
    }


async def list_active_alerts(recent_limit: int = 20) -> dict[str, Any]:
    source = source_status_payload()
    matched: list[dict[str, Any]] = []
    unmatched: list[dict[str, Any]] = []
    recent: list[dict[str, Any]] = []
    async with aiosqlite.connect(DB_PATH) as db:
        db.row_factory = aiosqlite.Row
        await ensure_cap_table(db)
        async with db.execute(
            """
            SELECT * FROM cap_alerts
            WHERE active = 1 AND (superseded_by IS NULL OR superseded_by = '')
            ORDER BY sent DESC
            """
        ) as cur:
            rows = await cur.fetchall()
        async with db.execute(
            """
            SELECT * FROM cap_alerts
            ORDER BY fetched_at DESC, sent DESC
            LIMIT ?
            """,
            (max(1, min(int(recent_limit), 50)),),
        ) as cur:
            recent_rows = await cur.fetchall()
    now = _now_utc()
    for row in rows:
        expires = _parse_dt(row["expires"])
        if expires is not None and expires <= now:
            continue
        item = _row_to_alert(row)
        if item["match"] == "matched":
            matched.append(item)
        elif item["match"] == "unmatched_text_only":
            unmatched.append(item)
    for row in recent_rows:
        item = _row_to_alert(row)
        expires = _parse_dt(row["expires"])
        item["expired"] = bool(expires is not None and expires <= now)
        item["active"] = bool(row["active"]) and not item["expired"] and not row["superseded_by"]
        recent.append(item)
    # none_active only when the feed was read successfully and nothing matches.
    # Failed or stale must never render as "no alerts".
    if source["status"] in ("live", "partial"):
        none_active = len(matched) == 0 and len(unmatched) == 0
    else:
        none_active = False
    return {
        "alerts": matched,
        "unmatched": unmatched,
        "recent": recent,
        "alerts_found": len(matched),
        "none_active": none_active,
        "source": source,
        "last_polled_at": source.get("last_polled_at"),
        "counts": {
            "matched": len(matched),
            "unmatched_text_only": len(unmatched),
            "recent": len(recent),
            "items_seen": source.get("items_seen") or 0,
            "items_parsed": source.get("items_parsed") or 0,
            "items_failed": source.get("items_failed") or 0,
        },
    }


async def active_floor_alerts() -> list[dict[str, Any]]:
    payload = await list_active_alerts()
    return [alert for alert in payload["alerts"] if alert.get("floor") in ("watch", "heavy")]


def alert_signature(alerts: list[dict[str, Any]]) -> tuple:
    return tuple(sorted(
        (alert.get("identifier"), alert.get("colour"), alert.get("expires"), alert.get("floor"))
        for alert in alerts
    ))


async def _poll_loop() -> None:
    while True:
        try:
            await poll_cap_feeds()
        except Exception as exc:
            logger.error("CAP background poll crashed: %s", type(exc).__name__)
        await asyncio.sleep(max(30, int(settings.CAP_POLL_SECONDS)))


def start_cap_poller() -> None:
    global _poll_task
    if _poll_task and not _poll_task.done():
        return
    _poll_task = asyncio.create_task(_poll_loop(), name="cap-alert-poller")


def stop_cap_poller() -> None:
    global _poll_task
    if _poll_task and not _poll_task.done():
        _poll_task.cancel()
    _poll_task = None


def reset_poll_state_for_tests() -> None:
    _state.update(
        last_polled_at=None,
        last_success_at=None,
        last_error=None,
        items_seen=0,
        items_parsed=0,
        items_failed=0,
        poll_ok=False,
    )
