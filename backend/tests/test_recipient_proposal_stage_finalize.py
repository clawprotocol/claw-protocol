from __future__ import annotations

import pytest
from fastapi.testclient import TestClient

from backend.main import app


@pytest.fixture()
def isolated_agreement_env(monkeypatch: pytest.MonkeyPatch, tmp_path):
    monkeypatch.setenv("CLAW_DATA_DIR", str(tmp_path))
    monkeypatch.setenv("CLAW_USAGE_ECONOMICS_ENABLED", "1")
    monkeypatch.setenv("CLAW_USAGE_ECONOMICS_DB_PATH", str(tmp_path / "usage.sqlite3"))
    monkeypatch.setenv("CLAW_AGREEMENT_SIGNING_TOKEN_SECRET", "unit-test-recipient-proposal-stage")
    yield tmp_path


def _draft_with_reviewer(client: TestClient, org_hdr: dict) -> tuple[str, dict]:
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
    return aid, {"draft": draft, "reviewer_id": reviewer_id}


def test_recipient_proposal_stage_then_finalize(monkeypatch, isolated_agreement_env):
    client = TestClient(app)
    org = {"X-Claw-Org-Id": "org-stage-finalize"}
    aid, ctx = _draft_with_reviewer(client, org)
    reviewer_id = ctx["reviewer_id"]
    draft = ctx["draft"]

    mint = client.post(
        f"/api/agreements/{aid}/recipient-access-token",
        headers=org,
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
            "proposer_display_name": "Reviewer",
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
    assert proposal_id

    missing = client.post(
        f"/api/agreements/{aid}/recipient-proposal",
        headers=rh,
        json={},
    )
    assert missing.status_code == 400
    assert missing.json().get("detail") == "proposal_id_required"

    finalized = client.post(
        f"/api/agreements/{aid}/recipient-proposal",
        headers=rh,
        json={"proposal_id": proposal_id},
    )
    assert finalized.status_code == 200, finalized.text
    assert finalized.json().get("proposal_id") == proposal_id
    pending = [
        e
        for e in finalized.json()["draft"]["audit_log"]
        if e.get("event_type") == "recipient_proposal_pending"
    ]
    assert len(pending) == 1
    assert pending[0]["value"]["proposal_id"] == proposal_id
