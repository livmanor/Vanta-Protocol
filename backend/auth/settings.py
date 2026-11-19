"""Local auth flags. Passwords never leave the server."""

from backend.config import settings


def bootstrap_configured() -> bool:
    return bool(
        settings.BOOTSTRAP_OFFICER_USERNAME.strip()
        and settings.BOOTSTRAP_OFFICER_PASSWORD.get_secret_value().strip()
    )


def auth_required() -> bool:
    return bool(settings.AUTH_REQUIRED)


def cookie_secure() -> bool:
    # Local Vite over http needs Secure=false. Turn on behind HTTPS.
    return bool(settings.AUTH_COOKIE_SECURE)


def public_auth_config() -> dict:
    return {
        "provider": "local",
        "required": auth_required(),
        "bootstrap_ready": bootstrap_configured(),
        "citizen_signup": True,
        "note": (
            "Sign in with a control-room officer account, or use citizen signup for field reports."
            if auth_required()
            else "Authentication is optional. Set AUTH_REQUIRED=true for production."
        ),
    }
