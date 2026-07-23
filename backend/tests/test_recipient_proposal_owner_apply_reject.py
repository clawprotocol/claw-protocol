from __future__ import annotations

import pytest
from fastapi.testclient import TestClient

from backend.main import app


@pytest.fixture()
def isolated_agreement_env(monkeypatch: pytest.MonkeyPatch, tmp_path):
    monkeypatch.setenv("CLAW_DATA_DIR", str(tmp_path))
    monkeypatch.setenv("CLAW_USAGE_ECONOMICS_ENABLED", "1")
    monkeypatch.setenv("CLAW_USAGE_ECONOMICS_DB_PATH", str(tmp_path / "usage.sqlite3"))
    monkeypatch.setenv("CLAW_AGREEMENT_SIGNING_TOKEN_SECRET", "unit-test-owner-proposal")
    yield tmp_path


def _seed_pending_proposal(client: TestClient, org_hdr: dict) -> tuple[str, str, str]:
    r = client.post(
        "/api/agreements/draft",
        headers=org_hdr,
        json={
            "title": "Services",
            "jurisdiction": "CA",
            "parties": [
                {"name": "Owner", "role": "owner"},
                {"name": "Reviewer", "role": "party"},
            ],
            "purpose": "Payment within thirty (30) days after receipt.",
            "payment_terms": "Net 30",
            "duration": None,
            "due_date": None,
            "effective_date": None,
        },
    )
    assert r.status_code == 200, r.text
    aid = r.json()["id"]
    draft = r.json()["draft"]
    reviewer_id = draft["parties"][1]["id"]

    mint = client.post(
        f"/api/agreements/{aid}/recipient-access-token",
        headers=org_hdr,
        json={
            "mode": "review",
            "role": "reviewer",
            "recipient_party_id": reviewer_id,
            "inviter_display_name": "Owner",
        },
    )
    assert mint.status_code == 200, mint.text
    tok = mint.json()["token"]
    rh = {"X-Claw-Recipient-Access-Token": tok}

    stage = client.post(
        f"/api/agreements/{aid}/recipient-proposal/stage",
        headers=rh,
        json={
            "instruction": "Change payment timing to fifteen (15) days.",
            "proposer_id": reviewer_id,
            "draft": {
                "title": draft["title"],
                "jurisdiction": draft["jurisdiction"],
                "parties": draft["parties"],
                "purpose": "Payment within fifteen (15) days after receipt.",
                "payment_terms": draft["payment_terms"],
                "duration": draft.get("duration"),
                "due_date": draft.get("due_date"),
                "effective_date": draft.get("effective_date"),
            },
            "rendered_html": "<p>Payment within fifteen (15) days after receipt.</p>",
        },
    )
    assert stage.status_code == 200, stage.text
    proposal_id = stage.json()["proposal_id"]

    submit = client.post(
        f"/api/agreements/{aid}/recipient-proposal",
        headers=rh,
        json={"proposal_id": proposal_id},
    )
    assert submit.status_code == 200, submit.text
    return aid, proposal_id, draft["purpose"]


def test_owner_apply_updates_corpus_and_preserves_audit(monkeypatch, isolated_agreement_env):
    client = TestClient(app)
    org = {"X-Claw-Org-Id": "org-owner-apply", "X-Claw-Test-Auth-User-Id": "test-owner"}
    aid, proposal_id, original_purpose = _seed_pending_proposal(client, org)

    applied = client.post(
        f"/api/agreements/{aid}/recipient-proposal/{proposal_id}/apply",
        headers=org,
        json={},
    )
    assert applied.status_code == 200, applied.text
    body = applied.json()
    draft = body["draft"]
    assert "fifteen (15) days" in draft["purpose"]
    assert draft["purpose"] != original_purpose
    event_types = [e.get("event_type") for e in draft.get("audit_log") or []]
    assert "recipient_proposal_pending" in event_types
    assert "recipient_proposal_applied" in event_types


def test_owner_reject_preserves_corpus_and_marks_rejected(monkeypatch, isolated_agreement_env):
    client = TestClient(app)
    org = {"X-Claw-Org-Id": "org-owner-reject", "X-Claw-Test-Auth-User-Id": "test-owner"}
    aid, proposal_id, original_purpose = _seed_pending_proposal(client, org)

    rejected = client.post(
        f"/api/agreements/{aid}/recipient-proposal/{proposal_id}/reject",
        headers=org,
        json={},
    )
    assert rejected.status_code == 200, rejected.text
    draft = rejected.json()["draft"]
    assert draft["purpose"] == original_purpose
    assert any(
        e.get("event_type") == "recipient_proposal_rejected"
        and (e.get("value") or {}).get("proposal_id") == proposal_id
        for e in draft.get("audit_log") or []
    )
