from __future__ import annotations

from backend.tests.entitlement_test_support import ensure_headers_entitled, ensure_org_pro_entitlement

import pytest
from fastapi.testclient import TestClient

from backend.main import app


@pytest.fixture(autouse=True)
def _entitle_owner_org_after_env(tmp_path, monkeypatch):
    """Grant Pro for primary owner headers once tmp_path-backed DBs are configured."""
    monkeypatch.setenv("CLAW_DATA_DIR", str(tmp_path))
    monkeypatch.setenv("CLAW_ECONOMICS_DB_PATH", str(tmp_path / "economics.sqlite3"))
    monkeypatch.setenv("CLAW_USAGE_ECONOMICS_DB_PATH", str(tmp_path / "usage.sqlite3"))
    monkeypatch.setenv("CLAW_ONRAMP_DB_PATH", str(tmp_path / "onramp.sqlite3"))
    monkeypatch.setenv("CLAW_TREASURY_DB_PATH", str(tmp_path / "treasury.sqlite3"))
    from backend.economics.store import reset_economics_store_for_tests
    reset_economics_store_for_tests()
    for _name in ("_ORG_H", "_OWNER_H", "OWNER_HEADERS", "_HEADERS", "ORG_HEADERS", "_OWNER", "_ORG_A", "_ORG", "_STAGING_ORG"):
        h = globals().get(_name)
        if isinstance(h, dict) and h.get("X-Claw-Org-Id"):
            ensure_headers_entitled(h)
    yield
    reset_economics_store_for_tests()



@pytest.fixture()
def isolated_agreement_env(monkeypatch: pytest.MonkeyPatch, tmp_path):
    monkeypatch.setenv("CLAW_DATA_DIR", str(tmp_path))
    monkeypatch.setenv("CLAW_USAGE_ECONOMICS_ENABLED", "1")
    monkeypatch.setenv("CLAW_USAGE_ECONOMICS_DB_PATH", str(tmp_path / "usage.sqlite3"))
    monkeypatch.setenv("CLAW_ECONOMICS_DB_PATH", str(tmp_path / "economics.sqlite3"))
    monkeypatch.setenv("CLAW_AGREEMENT_SIGNING_TOKEN_SECRET", "unit-test-owner-proposal")
    monkeypatch.delenv("CLAW_COMMERCIAL_MODE", raising=False)
    yield tmp_path


def _seed_pending_proposal(client: TestClient, org_hdr: dict) -> tuple[str, str, str]:
    # Reproduce Pro activation before owner draft create (Guest→Genesis→Pro contract).
    ensure_headers_entitled(org_hdr)
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
    assert any(
        (row.get("note") or "") == "Owner accepted recipient proposal"
        for row in draft.get("versions") or []
    )


def test_owner_apply_preserves_confirmed_signer_identity_on_party_ids(monkeypatch, isolated_agreement_env):
    client = TestClient(app)
    org = {"X-Claw-Org-Id": "org-owner-apply-signers", "X-Claw-Test-Auth-User-Id": "test-owner"}
    ensure_headers_entitled(org)
    harbor_id = "61321f75-dd4a-4100-9629-e6cfeaff379f"
    ironvale_id = "e535096f-bbc9-4b18-8cef-07d70be0ea88"
    created = client.post(
        "/api/agreements/draft",
        headers=org,
        json={
            "title": "Consulting Services Agreement",
            "jurisdiction": "Delaware",
            "parties": [
                {
                    "id": harbor_id,
                    "name": "Harbor Peak Analytics LLC",
                    "role": "Consultant",
                    "signerName": "Maya Chen",
                    "email": "maya.chen@harborpeak.test",
                    "signerTitle": "Principal",
                },
                {
                    "id": ironvale_id,
                    "name": "Ironvale Manufacturing Inc.",
                    "role": "Client",
                    "signerName": "Jordan Hale",
                    "email": "jordan.hale@ironvale.test",
                    "signerTitle": "Operations Lead",
                },
            ],
            "purpose": "AI workflow implementation. Payment within thirty (30) days after receipt.",
            "payment_terms": "$48,000",
            "duration": "twelve months",
            "due_date": None,
            "effective_date": None,
        },
    )
    assert created.status_code == 200, created.text
    aid = created.json()["id"]
    draft = created.json()["draft"]
    mint = client.post(
        f"/api/agreements/{aid}/recipient-access-token",
        headers=org,
        json={"mode": "review", "role": "reviewer", "recipient_party_id": ironvale_id, "inviter_display_name": "Maya Chen"},
    )
    assert mint.status_code == 200, mint.text
    tok = mint.json()["token"]
    rh = {"X-Claw-Recipient-Access-Token": tok}
    stage = client.post(
        f"/api/agreements/{aid}/recipient-proposal/stage",
        headers=rh,
        json={
            "instruction": "Weekly steering cadence.",
            "proposer_id": ironvale_id,
            "draft": {
                "title": draft["title"],
                "jurisdiction": draft["jurisdiction"],
                "parties": [
                    {"id": harbor_id, "name": "Harbor Peak Analytics LLC", "role": "Consultant"},
                    {"id": ironvale_id, "name": "Ironvale Manufacturing Inc.", "role": "Client", "email": "jordan.hale@ironvale.test"},
                ],
                "purpose": (draft["purpose"] or "") + "\n\nPROPOSED-IRONVALE-STEERING-CADENCE-WEEKLY",
                "payment_terms": draft["payment_terms"],
                "duration": draft.get("duration"),
                "due_date": draft.get("due_date"),
                "effective_date": draft.get("effective_date"),
            },
            "rendered_html": "<p>proposed</p>",
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
    applied = client.post(
        f"/api/agreements/{aid}/recipient-proposal/{proposal_id}/apply",
        headers=org,
        json={},
    )
    assert applied.status_code == 200, applied.text
    parties = applied.json()["draft"]["parties"]
    by_id = {row["id"]: row for row in parties}
    assert by_id[harbor_id]["signer_name"] == "Maya Chen"
    assert by_id[harbor_id]["email"] == "maya.chen@harborpeak.test"
    assert by_id[ironvale_id]["signer_name"] == "Jordan Hale"
    assert by_id[ironvale_id]["email"] == "jordan.hale@ironvale.test"
    fetched = client.get(f"/api/agreements/{aid}", headers=org)
    assert fetched.status_code == 200, fetched.text
    restored = {row["id"]: row for row in fetched.json()["draft"]["parties"]}
    assert restored[harbor_id]["signer_name"] == "Maya Chen"
    assert restored[ironvale_id]["signer_name"] == "Jordan Hale"


def test_owner_reject_leaves_corpus_unchanged(monkeypatch, isolated_agreement_env):
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
