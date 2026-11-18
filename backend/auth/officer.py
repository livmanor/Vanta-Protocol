"""Current officer attached to a request."""

from dataclasses import dataclass
from typing import Optional

from fastapi import HTTPException, Request, status

from backend.auth.settings import auth_required


@dataclass(frozen=True)
class OfficerIdentity:
    id: str
    username: str
    display_name: str
    officer_id: str


def get_optional_officer(request: Request) -> Optional[OfficerIdentity]:
    return getattr(request.state, "officer", None)


def require_officer(request: Request) -> OfficerIdentity:
    officer = get_optional_officer(request)
    if officer is not None:
        return officer
    if not auth_required():
        return OfficerIdentity(
            id="local-dev",
            username="officer",
            display_name="Officer-ControlRoom",
            officer_id="Officer-ControlRoom",
        )
    raise HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Sign in to use the control room.",
    )
