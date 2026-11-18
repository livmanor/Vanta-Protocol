"""Keep the suite free of the production AUTH_REQUIRED flag in .env."""

import pytest

from backend.config import settings


@pytest.fixture(autouse=True)
def _auth_off_unless_test_enables_it(monkeypatch):
    monkeypatch.setattr(settings, "AUTH_REQUIRED", False)
