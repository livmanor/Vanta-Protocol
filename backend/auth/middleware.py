"""Require a valid local session when AUTH_REQUIRED is true."""

from __future__ import annotations

from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import JSONResponse, Response

from backend.auth.citizens import CITIZEN_SESSION_COOKIE, citizen_for_token
from backend.auth.officer import OfficerIdentity
from backend.auth.sessions import SESSION_COOKIE, officer_for_token
from backend.auth.settings import auth_required

_PUBLIC = {
    ("GET", "/api/health"),
    ("GET", "/api/auth/config"),
    ("POST", "/api/auth/login"),
    ("POST", "/api/sos/status"),
    ("POST", "/api/citizen/register"),
    ("POST", "/api/citizen/login"),
}

_CITIZEN_PREFIXES = (
    "/api/citizen/me",
    "/api/citizen/reports",
    "/api/citizen/logout",
)


def _extract_token(request: Request, cookie_name: str) -> str | None:
    header = request.headers.get("Authorization") or ""
    if header.startswith("Bearer "):
        token = header[7:].strip()
        if token:
            return token
    return request.cookies.get(cookie_name)


class SessionAuthMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next) -> Response:
        request.state.officer = None
        request.state.citizen = None
        method = request.method.upper()
        path = request.url.path.rstrip("/") or "/"
        if method == "OPTIONS" or not path.startswith("/api"):
            return await call_next(request)

        officer_token = _extract_token(request, SESSION_COOKIE)
        if officer_token:
            profile = await officer_for_token(officer_token)
            if profile:
                request.state.officer = OfficerIdentity(
                    id=profile["id"],
                    username=profile["username"],
                    display_name=profile["display_name"],
                    officer_id=profile["officer_id"],
                )

        # Prefer a dedicated citizen bearer/cookie when present; do not steal officer tokens.
        citizen_header = request.headers.get("Authorization") or ""
        citizen_token = None
        if citizen_header.startswith("Bearer "):
            # Only treat as citizen when officer lookup failed.
            if request.state.officer is None:
                citizen_token = citizen_header[7:].strip() or None
        if citizen_token is None:
            citizen_token = request.cookies.get(CITIZEN_SESSION_COOKIE)
        if citizen_token and request.state.officer is None:
            citizen = await citizen_for_token(citizen_token)
            if citizen:
                request.state.citizen = citizen

        if (method, path) in _PUBLIC:
            return await call_next(request)
        if path in ("/api/auth/logout", "/api/citizen/logout") and method == "POST":
            return await call_next(request)

        is_citizen_route = path.startswith("/api/citizen/")
        is_photo = path.startswith("/api/citizen-reports/") and path.endswith("/photo")
        is_officer_citizen_api = path == "/api/citizen-reports" or (
            path.startswith("/api/citizen-reports/") and not is_photo
        )

        if not auth_required():
            return await call_next(request)

        if is_citizen_route:
            if request.state.citizen is None:
                return JSONResponse(
                    status_code=401,
                    content={"detail": "Sign in with a citizen account."},
                )
            return await call_next(request)

        if is_photo:
            if request.state.officer is None and request.state.citizen is None:
                return JSONResponse(
                    status_code=401,
                    content={"detail": "Sign in to view this photo."},
                )
            return await call_next(request)

        if is_officer_citizen_api or path.startswith("/api/"):
            if request.state.officer is None:
                return JSONResponse(
                    status_code=401,
                    content={"detail": "Sign in to use the control room."},
                )
        return await call_next(request)
