"""Require a valid local session when AUTH_REQUIRED is true."""

from __future__ import annotations

from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import JSONResponse, Response

from backend.auth.officer import OfficerIdentity
from backend.auth.sessions import SESSION_COOKIE, officer_for_token
from backend.auth.settings import auth_required

_PUBLIC = {
    ("GET", "/api/health"),
    ("GET", "/api/auth/config"),
    ("POST", "/api/auth/login"),
    ("POST", "/api/sos/status"),
}


def _extract_token(request: Request) -> str | None:
    header = request.headers.get("Authorization") or ""
    if header.startswith("Bearer "):
        token = header[7:].strip()
        if token:
            return token
    return request.cookies.get(SESSION_COOKIE)


class SessionAuthMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next) -> Response:
        request.state.officer = None
        method = request.method.upper()
        path = request.url.path.rstrip("/") or "/"
        if method == "OPTIONS" or not path.startswith("/api"):
            return await call_next(request)

        token = _extract_token(request)
        if token:
            profile = await officer_for_token(token)
            if profile:
                request.state.officer = OfficerIdentity(
                    id=profile["id"],
                    username=profile["username"],
                    display_name=profile["display_name"],
                    officer_id=profile["officer_id"],
                )

        if (method, path) in _PUBLIC:
            return await call_next(request)
        if path == "/api/auth/logout" and method == "POST":
            return await call_next(request)
        if not auth_required():
            return await call_next(request)
        if request.state.officer is None:
            return JSONResponse(
                status_code=401,
                content={"detail": "Sign in to use the control room."},
            )
        return await call_next(request)
