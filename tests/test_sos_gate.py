"""SOS cannot leave the approval gate. These calls fail validation before any provider is contacted."""
from fastapi.testclient import TestClient

from backend.main import app

client = TestClient(app)


def test_sos_requires_explicit_officer_approval():
    missing = client.post("/api/sos/send", json={
        "contact_ids": ["contact-1"],
        "message": "Move to higher ground.",
    })
    refused = client.post("/api/sos/send", json={
        "contact_ids": ["contact-1"],
        "message": "Move to higher ground.",
        "officer_approved": False,
    })
    assert missing.status_code == 422
    assert refused.status_code == 422
