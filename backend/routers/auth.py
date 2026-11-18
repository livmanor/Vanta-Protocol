"""Local officer login, logout, and profile."""

from fastapi import APIRouter, Depends, HTTPException, Request, Response, status
from pydantic import BaseModel, Field

from backend.auth.officer import OfficerIdentity, require_officer
from backend.auth.sessions import SESSION_COOKIE, authenticate, revoke_token
from backend.auth.settings import public_auth_config
from backend.config import settings

router = APIRouter(prefix="/api/auth", tags=["Authentication"])


class LoginRequest(BaseModel):
    username: str = Field(min_length=1, max_length=120)
    password: str = Field(min_length=1, max_length=200)


def _cookie_secure() -> bool:
    # Local Vite over http needs Secure=false. Turn on behind HTTPS.
    return bool(settings.AUTH_COOKIE_SECURE)


@router.get("/config")
async def auth_config():
    return public_auth_config()


@router.post("/login")
async def login(body: LoginRequest, response: Response):
    result = await authenticate(body.username, body.password)
    if not result:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid username or password.",
        )
    response.set_cookie(
        key=SESSION_COOKIE,
        value=result["token"],
        httponly=True,
        samesite="lax",
        secure=_cookie_secure(),
        max_age=max(1, int(settings.SESSION_TTL_HOURS)) * 3600,
        path="/",
    )
    return {
        "status": "ok",
        "expires_at": result["expires_at"],
        "officer": result["officer"],
        "token": result["token"],
    }


@router.post("/logout")
async def logout(request: Request, response: Response):
    header = request.headers.get("Authorization") or ""
    token = None
    if header.startswith("Bearer "):
        token = header[7:].strip()
    token = token or request.cookies.get(SESSION_COOKIE)
    await revoke_token(token)
    response.delete_cookie(SESSION_COOKIE, path="/")
    return {"status": "ok"}


@router.get("/me")
async def me(officer: OfficerIdentity = Depends(require_officer)):
    return {
        "id": officer.id,
        "username": officer.username,
        "display_name": officer.display_name,
        "officer_id": officer.officer_id,
        "provider": "local",
    }
