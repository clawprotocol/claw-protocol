import json

import pytest
from fastapi.testclient import TestClient

from backend.main import app
from backend.services.agreement_pdf_story_capability import reset_agreement_pdf_story_capability_cache_for_tests
from backend.usage_economics import store as usage_economics_store_mod

pytestmark = pytest.mark.unit

_ORG_H = {"X-Claw-Org-Id": "test-org-api-v2"}


@pytest.fixture(autouse=True)
def _reset_usage_economics_singleton():
    usage_economics_store_mod._store = None  # noqa: SLF001
    yield
    usage_economics_store_mod._store = None  # noqa: SLF001


def test_party_internal_placeholder_stripped_and_role_mapped(monkeypatch, tmp_path):
    monkeypatch.setenv("CLAW_DATA_DIR", str(tmp_path))
    monkeypatch.setenv("CLAW_USAGE_ECONOMICS_DB_PATH", str(tmp_path / "usage.sqlite3"))
    client = TestClient(app)
    create_res = client.post(
        "/api/agreements/draft",
        headers=_ORG_H,
        json={
            "title": "Service Agreement",
            "jurisdiction": "Delaware",
            "parties": [
                {"name": "User Co", "role": "party_a"},
                {"name": "Peaceful Journey [ORG_1]", "role": "ORG_1"},
            ],
            "purpose": "Landscaping",
            "payment_terms": "$100",
            "duration": "1 year",
            "due_date": None,
            "effective_date": "Upon signing",
        },
    )
    assert create_res.status_code == 200
    agreement_id = create_res.json()["id"]
    get_res = client.get(f"/api/agreements/{agreement_id}", headers=_ORG_H)
    assert get_res.status_code == 200
    parties = get_res.json()["draft"]["parties"]
    assert len(parties) >= 2
    assert parties[1]["name"] == "Peaceful Journey"
    assert parties[1]["role"] == "party_b"

    render_res = client.post(
        f"/api/agreements/{agreement_id}/render",
        headers=_ORG_H,
    )
    assert render_res.status_code == 200
    html = render_res.json()["rendered_html"]
    assert "[ORG_1]" not in html
    assert "ORG_1" not in html
    assert "Peaceful Journey" in html


def test_api_agreements_v2_create_update_render_no_template_leakage(monkeypatch, tmp_path):
    monkeypatch.setenv("CLAW_DATA_DIR", str(tmp_path))
    monkeypatch.setenv("CLAW_USAGE_ECONOMICS_DB_PATH", str(tmp_path / "usage.sqlite3"))
    client = TestClient(app)
    create_res = client.post(
        "/api/agreements/draft",
        headers=_ORG_H,
        json={
            "title": "Consulting Agreement",
            "jurisdiction": "Texas",
            "parties": [
                {"name": "Acme Inc", "role": "Client"},
                {"name": "John Smith", "role": "Consultant"},
            ],
            "purpose": "Financial modeling services",
            "payment_terms": "$500 on signing and $2000 on delivery",
            "duration": None,
            "due_date": "March 15, 2026",
            "effective_date": None,
        },
    )
    assert create_res.status_code == 200
    body = create_res.json()
    agreement_id = body["id"]
    assert agreement_id

    update_res = client.post(
        f"/api/agreements/{agreement_id}/update-field",
        headers=_ORG_H,
        json={"field": "effective_date", "value": "2026-03-01"},
    )
    assert update_res.status_code == 200
    assert update_res.json()["draft"]["effective_date"] == "2026-03-01"

    render_res = client.post(
        f"/api/agreements/{agreement_id}/render",
        headers=_ORG_H,
    )
    assert render_res.status_code == 200
    html = render_res.json()["rendered_html"]
    assert "Template Body: true" not in html
    assert "Template Body: false" not in html
    assert "is_template_body" not in html


def test_recipient_magic_link_validate_party_and_agreement_id(monkeypatch, tmp_path):
    monkeypatch.setenv("CLAW_AGREEMENT_SIGNING_TOKEN_SECRET", "unit-test-signing-secret-for-magic-link")
    monkeypatch.setenv("CLAW_DATA_DIR", str(tmp_path))
    monkeypatch.setenv("CLAW_USAGE_ECONOMICS_DB_PATH", str(tmp_path / "usage.sqlite3"))
    client = TestClient(app)
    create_res = client.post(
        "/api/agreements/draft",
        headers=_ORG_H,
        json={
            "title": "Link test",
            "jurisdiction": "DE",
            "parties": [
                {"name": "Owner Co", "role": "owner"},
                {"name": "Alex Signer", "role": "signer"},
            ],
            "purpose": "Services",
            "payment_terms": "Net 30",
            "duration": None,
            "due_date": None,
            "effective_date": None,
        },
    )
    assert create_res.status_code == 200
    aid = create_res.json()["id"]
    upd = client.post(
        f"/api/agreements/{aid}/update-field",
        headers=_ORG_H,
        json={
            "field": "parties",
            "value": [
                {"name": "Owner Co", "role": "owner", "id": "pid-owner"},
                {"name": "Alex Signer", "role": "signer", "id": "pid-signer"},
            ],
        },
    )
    assert upd.status_code == 200
    mint = client.post(
        f"/api/agreements/{aid}/recipient-access-token",
        headers=_ORG_H,
        json={
            "mode": "review",
            "role": "signer",
            "recipient_party_id": "pid-signer",
            "inviter_display_name": "Owner Co",
        },
    )
    assert mint.status_code == 200
    tok = mint.json()["token"]
    ok = client.get(
        f"/api/agreements/access/validate",
        params={"token": tok, "agreement_id": aid},
    )
    assert ok.status_code == 200
    payload = ok.json()
    assert payload["recipient_party_id"] == "pid-signer"
    assert payload["inviter_display_name"] == "Owner Co"
    mismatch = client.get(
        "/api/agreements/access/validate",
        params={"token": tok, "agreement_id": "wrong-id"},
    )
    assert mismatch.status_code == 403
    mint_bad = client.post(
        f"/api/agreements/{aid}/recipient-access-token",
        headers=_ORG_H,
        json={
            "mode": "review",
            "role": "signer",
            "recipient_party_id": "not-on-draft",
        },
    )
    assert mint_bad.status_code == 200
    bad_tok = mint_bad.json()["token"]
    bad_val = client.get(
        "/api/agreements/access/validate",
        params={"token": bad_tok, "agreement_id": aid},
    )
    assert bad_val.status_code == 403


def test_signing_ceremony_multi_signer_and_immutability(monkeypatch, tmp_path):
    monkeypatch.setenv("CLAW_DATA_DIR", str(tmp_path))
    monkeypatch.setenv("CLAW_USAGE_ECONOMICS_DB_PATH", str(tmp_path / "usage.sqlite3"))
    monkeypatch.setenv("CLAW_AGREEMENT_SIGNING_TOKEN_SECRET", "unit-test-signing-ceremony-secret")
    usage_economics_store_mod._store = None  # noqa: SLF001
    client = TestClient(app)
    create_res = client.post(
        "/api/agreements/draft",
        headers=_ORG_H,
        json={
            "title": "Ceremony test",
            "jurisdiction": "TX",
            "parties": [
                {"name": "Owner LLC", "role": "owner"},
                {"name": "Acme Growth LLC", "role": "signer"},
                {"name": "Beta LLC", "role": "signer"},
            ],
            "purpose": "Test",
            "payment_terms": "Net 30",
            "duration": None,
            "due_date": None,
            "effective_date": None,
        },
    )
    assert create_res.status_code == 200
    aid = create_res.json()["id"]
    upd = client.post(
        f"/api/agreements/{aid}/update-field",
        headers=_ORG_H,
        json={
            "field": "parties",
            "value": [
                {"name": "Owner LLC", "role": "owner", "id": "p-owner"},
                {"name": "Acme Growth LLC", "role": "signer", "id": "p-acme"},
                {"name": "Beta LLC", "role": "signer", "id": "p-beta"},
            ],
        },
    )
    assert upd.status_code == 200
    mint_rev = client.post(
        f"/api/agreements/{aid}/recipient-access-token",
        headers=_ORG_H,
        json={"mode": "review", "role": "signer"},
    )
    assert mint_rev.status_code == 200
    review_tok = mint_rev.json()["token"]
    recv_hdr = {"X-Claw-Recipient-Access-Token": review_tok}
    for pid, label in (("p-acme", "Acme"), ("p-beta", "Beta")):
        ap = client.post(
            f"/api/agreements/{aid}/recipient-approve",
            headers=recv_hdr,
            json={
                "participant_id": pid,
                "participant_display_name": label,
            },
        )
        assert ap.status_code == 200
    lock = client.put(
        f"/api/agreements/{aid}/signing-lock",
        headers=_ORG_H,
        json={
            "locked_version_id": "lv-ceremony-1",
            "locked_at": "2026-04-01T12:00:00Z",
            "locked_by": "owner",
        },
    )
    assert lock.status_code == 200
    mint_sign = client.post(
        f"/api/agreements/{aid}/recipient-access-token",
        headers=_ORG_H,
        json={"mode": "sign", "role": "signer"},
    )
    assert mint_sign.status_code == 200
    sign_tok = mint_sign.json()["token"]
    sign_hdr = {"X-Claw-Recipient-Access-Token": sign_tok}
    s1 = client.post(
        f"/api/agreements/{aid}/signing-ceremony/start",
        headers=sign_hdr,
        json={"participant_id": "p-acme"},
    )
    assert s1.status_code == 200
    c1 = client.post(
        f"/api/agreements/{aid}/signing-ceremony/complete",
        headers=sign_hdr,
        json={
            "participant_id": "p-acme",
            "typed_name": "Acme Growth LLC",
            "locked_version_id": "lv-ceremony-1",
        },
    )
    assert c1.status_code == 200
    assert c1.json().get("fully_executed") is False
    d1 = client.get(f"/api/agreements/{aid}", headers=_ORG_H).json()["draft"]
    types1 = [e.get("event_type") for e in d1.get("audit_log", [])]
    assert "signature_initiated" in types1
    assert "signature_completed" in types1
    c2 = client.post(
        f"/api/agreements/{aid}/signing-ceremony/complete",
        headers=sign_hdr,
        json={
            "participant_id": "p-beta",
            "typed_name": "Beta LLC",
            "locked_version_id": "lv-ceremony-1",
        },
    )
    assert c2.status_code == 200
    assert c2.json().get("fully_executed") is True
    audit = client.get(f"/api/agreements/{aid}", headers=_ORG_H).json()["draft"].get("audit_log", [])
    assert any(e.get("event_type") == "signed" for e in audit)
    blocked = client.post(
        f"/api/agreements/{aid}/update-field",
        headers=_ORG_H,
        json={"field": "title", "value": "Hacked"},
    )
    assert blocked.status_code == 400


def test_negotiation_locked_blocks_owner_edits_unlock_restores(monkeypatch, tmp_path):
    monkeypatch.setenv("CLAW_DATA_DIR", str(tmp_path))
    monkeypatch.setenv("CLAW_USAGE_ECONOMICS_DB_PATH", str(tmp_path / "usage.sqlite3"))
    monkeypatch.setenv("CLAW_AGREEMENT_SIGNING_TOKEN_SECRET", "unit-test-signing-lock-guard-secret")
    usage_economics_store_mod._store = None  # noqa: SLF001
    client = TestClient(app)
    create_res = client.post(
        "/api/agreements/draft",
        headers=_ORG_H,
        json={
            "title": "Lock guard",
            "jurisdiction": "TX",
            "parties": [
                {"name": "Owner LLC", "role": "owner"},
                {"name": "Signer LLC", "role": "signer"},
            ],
            "purpose": "Scope",
            "payment_terms": "Net 30",
            "duration": None,
            "due_date": None,
            "effective_date": None,
        },
    )
    assert create_res.status_code == 200
    aid = create_res.json()["id"]
    upd = client.post(
        f"/api/agreements/{aid}/update-field",
        headers=_ORG_H,
        json={
            "field": "parties",
            "value": [
                {"name": "Owner LLC", "role": "owner", "id": "p-owner"},
                {"name": "Signer LLC", "role": "signer", "id": "p-sig"},
            ],
        },
    )
    assert upd.status_code == 200
    mint_rev = client.post(
        f"/api/agreements/{aid}/recipient-access-token",
        headers=_ORG_H,
        json={"mode": "review", "role": "signer"},
    )
    assert mint_rev.status_code == 200
    review_tok = mint_rev.json()["token"]
    recv_hdr = {"X-Claw-Recipient-Access-Token": review_tok}
    ap = client.post(
        f"/api/agreements/{aid}/recipient-approve",
        headers=recv_hdr,
        json={"participant_id": "p-sig", "participant_display_name": "Signer"},
    )
    assert ap.status_code == 200
    lock = client.put(
        f"/api/agreements/{aid}/signing-lock",
        headers=_ORG_H,
        json={
            "locked_version_id": "lv-guard-1",
            "locked_at": "2026-04-01T12:00:00Z",
            "locked_by": "owner",
        },
    )
    assert lock.status_code == 200
    body = client.get(f"/api/agreements/{aid}", headers=_ORG_H).json()
    assert body.get("signing_lock") is not None
    assert body["signing_lock"]["locked_version_id"] == "lv-guard-1"
    assert len(str(body["signing_lock"].get("content_sha256") or "")) == 64

    blocked = client.post(
        f"/api/agreements/{aid}/update-field",
        headers=_ORG_H,
        json={"field": "title", "value": "Changed"},
    )
    assert blocked.status_code == 400
    assert blocked.json().get("detail") == "negotiation_locked"

    exp_blocked = client.post(f"/api/agreements/{aid}/export-docx", headers=_ORG_H)
    assert exp_blocked.status_code == 400
    assert exp_blocked.json().get("detail") == "negotiation_locked"

    ul = client.delete(f"/api/agreements/{aid}/signing-lock", headers=_ORG_H)
    assert ul.status_code == 200
    assert client.get(f"/api/agreements/{aid}", headers=_ORG_H).json().get("signing_lock") is None

    ok = client.post(
        f"/api/agreements/{aid}/update-field",
        headers=_ORG_H,
        json={"field": "title", "value": "Changed"},
    )
    assert ok.status_code == 200


def test_signing_complete_rejects_stale_draft_vs_lock_hash(monkeypatch, tmp_path):
    monkeypatch.setenv("CLAW_DATA_DIR", str(tmp_path))
    monkeypatch.setenv("CLAW_USAGE_ECONOMICS_DB_PATH", str(tmp_path / "usage.sqlite3"))
    monkeypatch.setenv("CLAW_AGREEMENT_SIGNING_TOKEN_SECRET", "unit-test-stale-lock-hash-secret")
    usage_economics_store_mod._store = None  # noqa: SLF001
    from backend.services.agreement_draft_store import load_draft, save_draft

    client = TestClient(app)
    create_res = client.post(
        "/api/agreements/draft",
        headers=_ORG_H,
        json={
            "title": "Stale hash",
            "jurisdiction": "TX",
            "parties": [
                {"name": "Owner LLC", "role": "owner"},
                {"name": "Acme LLC", "role": "signer"},
            ],
            "purpose": "Original purpose",
            "payment_terms": "Net 30",
            "duration": None,
            "due_date": None,
            "effective_date": None,
        },
    )
    assert create_res.status_code == 200
    aid = create_res.json()["id"]
    upd = client.post(
        f"/api/agreements/{aid}/update-field",
        headers=_ORG_H,
        json={
            "field": "parties",
            "value": [
                {"name": "Owner LLC", "role": "owner", "id": "p-owner"},
                {"name": "Acme LLC", "role": "signer", "id": "p-acme"},
            ],
        },
    )
    assert upd.status_code == 200
    mint_rev = client.post(
        f"/api/agreements/{aid}/recipient-access-token",
        headers=_ORG_H,
        json={"mode": "review", "role": "signer"},
    )
    assert mint_rev.status_code == 200
    review_tok = mint_rev.json()["token"]
    recv_hdr = {"X-Claw-Recipient-Access-Token": review_tok}
    ap = client.post(
        f"/api/agreements/{aid}/recipient-approve",
        headers=recv_hdr,
        json={"participant_id": "p-acme", "participant_display_name": "Acme"},
    )
    assert ap.status_code == 200
    lock = client.put(
        f"/api/agreements/{aid}/signing-lock",
        headers=_ORG_H,
        json={
            "locked_version_id": "lv-stale-1",
            "locked_at": "2026-04-01T12:00:00Z",
            "locked_by": "owner",
        },
    )
    assert lock.status_code == 200
    mint_sign = client.post(
        f"/api/agreements/{aid}/recipient-access-token",
        headers=_ORG_H,
        json={"mode": "sign", "role": "signer"},
    )
    assert mint_sign.status_code == 200
    sign_tok = mint_sign.json()["token"]
    sign_hdr = {"X-Claw-Recipient-Access-Token": sign_tok}

    raw = load_draft(aid)
    raw["purpose"] = "Tampered outside guarded APIs"
    save_draft(raw)

    bad = client.post(
        f"/api/agreements/{aid}/signing-ceremony/complete",
        headers=sign_hdr,
        json={
            "participant_id": "p-acme",
            "typed_name": "Acme LLC",
            "locked_version_id": "lv-stale-1",
        },
    )
    assert bad.status_code == 409
    assert bad.json().get("detail") == "stale_locked_version"


def test_public_agreement_verify_redacted(monkeypatch, tmp_path):
    monkeypatch.setenv("CLAW_DATA_DIR", str(tmp_path))
    monkeypatch.setenv("CLAW_USAGE_ECONOMICS_DB_PATH", str(tmp_path / "usage.sqlite3"))
    usage_economics_store_mod._store = None  # noqa: SLF001
    monkeypatch.setenv("CLAW_PUBLIC_AGREEMENT_VERIFY", "1")
    client = TestClient(app)
    create_res = client.post(
        "/api/agreements/draft",
        headers=_ORG_H,
        json={
            "title": "Verify me",
            "jurisdiction": "WA",
            "parties": [{"name": "A", "role": "owner"}],
            "purpose": "SECRET PURPOSE",
            "payment_terms": "SECRET PAYMENT",
            "duration": None,
            "due_date": None,
            "effective_date": None,
        },
    )
    assert create_res.status_code == 200
    aid = create_res.json()["id"]
    pub = client.get(f"/api/agreements/public/{aid}/verify")
    assert pub.status_code == 200
    body = pub.json()
    assert body["agreement_id"] == aid
    assert body["summary"]["title"] == "Verify me"
    raw = str(pub.content)
    assert "SECRET" not in raw
    assert "agreement_hash" in body["verification"]
    assert len(body["verification"]["agreement_hash"]) == 64
    assert body["version_history"] is not None
    assert "?t=" not in raw.lower()
    assert "recipient_access_token" not in raw.lower()
    monkeypatch.setenv("CLAW_PUBLIC_AGREEMENT_VERIFY", "0")
    assert client.get(f"/api/agreements/public/{aid}/verify").status_code == 404


def test_workspace_index_folder_tags_and_patch(monkeypatch, tmp_path):
    monkeypatch.setenv("CLAW_DATA_DIR", str(tmp_path))
    monkeypatch.setenv("CLAW_USAGE_ECONOMICS_DB_PATH", str(tmp_path / "usage.sqlite3"))
    monkeypatch.setenv("CLAW_PROOF_LAYER_DB_PATH", str(tmp_path / "proof_layer.sqlite3"))
    client = TestClient(app)
    create_res = client.post(
        "/api/agreements/draft",
        headers=_ORG_H,
        json={
            "title": "Folder tags",
            "jurisdiction": "TX",
            "parties": [{"name": "A", "role": "owner"}],
            "purpose": "P",
            "payment_terms": "Net 30",
            "duration": None,
            "due_date": None,
            "effective_date": None,
        },
    )
    assert create_res.status_code == 200
    aid = create_res.json()["id"]

    monkeypatch.setattr(
        "backend.proof_status.capabilities.assert_export_allowed_or_raise",
        lambda _req: None,
    )
    fld = client.post("/v1/proof/folders", headers=_ORG_H, json={"folder_name": "Clients"})
    assert fld.status_code == 200
    folder_id = fld.json()["folder"]["folder_id"]

    assert (
        client.patch(
            f"/api/agreements/{aid}/workspace-folder",
            headers=_ORG_H,
            json={"folder_id": folder_id},
        ).status_code
        == 200
    )
    assert (
        client.patch(
            f"/api/agreements/{aid}/workspace-tags",
            headers=_ORG_H,
            json={"tags": ["nda", "priority"]},
        ).status_code
        == 200
    )

    idx = client.get("/api/agreements/workspace-index", headers=_ORG_H)
    assert idx.status_code == 200
    rows = idx.json()["agreements"]
    mine = next(r for r in rows if r["id"] == aid)
    assert mine.get("workspace_folder_id") == folder_id
    assert mine.get("workspace_folder_name") == "Clients"
    assert mine.get("workspace_tags") == ["nda", "priority"]


def test_workspace_index_reviewer_approved_flag(monkeypatch, tmp_path):
    monkeypatch.setenv("CLAW_DATA_DIR", str(tmp_path))
    monkeypatch.setenv("CLAW_USAGE_ECONOMICS_DB_PATH", str(tmp_path / "usage.sqlite3"))
    from backend.services import agreement_draft_store as ads

    client = TestClient(app)
    create_res = client.post(
        "/api/agreements/draft",
        headers=_ORG_H,
        json={
            "title": "Review approved row",
            "jurisdiction": "TX",
            "parties": [{"name": "A", "role": "owner"}],
            "purpose": "P",
            "payment_terms": "Net 30",
            "duration": None,
            "due_date": None,
            "effective_date": None,
        },
    )
    assert create_res.status_code == 200
    aid = create_res.json()["id"]
    d = ads.load_draft(aid)
    d["audit_log"] = list(d.get("audit_log") or [])
    d["audit_log"].append({"event_type": "recipient_approved", "at": "2026-01-02T00:00:00Z"})
    ads.save_draft(d)

    idx = client.get("/api/agreements/workspace-index", headers=_ORG_H)
    assert idx.status_code == 200
    rows = idx.json()["agreements"]
    mine = next(r for r in rows if r["id"] == aid)
    assert mine.get("reviewer_approved") is True
    assert mine.get("review_approvals_completed") == 1
    assert mine.get("review_approvals_required") == 1
    assert mine.get("all_reviewers_approved") is True


def test_workspace_index_multi_reviewer_partial_rollup(monkeypatch, tmp_path):
    monkeypatch.setenv("CLAW_DATA_DIR", str(tmp_path))
    monkeypatch.setenv("CLAW_USAGE_ECONOMICS_DB_PATH", str(tmp_path / "usage.sqlite3"))
    from backend.services import agreement_draft_store as ads

    client = TestClient(app)
    create_res = client.post(
        "/api/agreements/draft",
        headers=_ORG_H,
        json={
            "title": "Multi reviewer",
            "jurisdiction": "TX",
            "parties": [
                {"name": "O", "role": "owner"},
                {"id": "r1", "name": "R1", "role": "reviewer"},
                {"id": "r2", "name": "R2", "role": "reviewer"},
                {"id": "r3", "name": "R3", "role": "reviewer"},
                {"id": "r4", "name": "R4", "role": "reviewer"},
            ],
            "purpose": "P",
            "payment_terms": "Net 30",
            "duration": None,
            "due_date": None,
            "effective_date": None,
        },
    )
    assert create_res.status_code == 200
    aid = create_res.json()["id"]
    d = ads.load_draft(aid)
    d["audit_log"] = list(d.get("audit_log") or [])
    d["audit_log"].append(
        {
            "event_type": "participant_approved",
            "at": "2026-01-02T00:00:00Z",
            "value": {"participant_id": "r1"},
        }
    )
    ads.save_draft(d)

    idx = client.get("/api/agreements/workspace-index", headers=_ORG_H)
    assert idx.status_code == 200
    rows = idx.json()["agreements"]
    mine = next(r for r in rows if r["id"] == aid)
    assert mine.get("reviewer_approved") is True
    assert mine.get("review_approvals_completed") == 1
    assert mine.get("review_approvals_required") == 4
    assert mine.get("all_reviewers_approved") is False


def test_review_delivery_dry_run_payload_count(monkeypatch, tmp_path):
    monkeypatch.setenv("CLAW_DATA_DIR", str(tmp_path))
    monkeypatch.setenv("CLAW_USAGE_ECONOMICS_DB_PATH", str(tmp_path / "usage.sqlite3"))
    client = TestClient(app)
    create_res = client.post(
        "/api/agreements/draft",
        headers=_ORG_H,
        json={
            "title": "Dry run title",
            "jurisdiction": "TX",
            "parties": [
                {"name": "Owner Co", "role": "owner", "email": "owner@example.com"},
                {"name": "R1", "role": "reviewer", "email": "r1@example.com"},
                {"name": "R2", "role": "reviewer", "email": "r2@example.com"},
            ],
            "purpose": "P",
            "payment_terms": "Net 30",
            "duration": None,
            "due_date": None,
            "effective_date": None,
        },
    )
    assert create_res.status_code == 200
    aid = create_res.json()["id"]
    res = client.post(f"/api/agreements/{aid}/review-delivery-dry-run", headers=_ORG_H, json={})
    assert res.status_code == 200
    data = res.json()
    assert data.get("review_delivery_mode") == "manual"
    assert data.get("payload_count") == 2
    payloads = data.get("payloads") or []
    assert len(payloads) == 2
    assert all(p.get("review_url") is None for p in payloads)
    assert {p.get("to") for p in payloads} == {"r1@example.com", "r2@example.com"}


def test_agreements_refine_alias_requires_instruction(monkeypatch, tmp_path):
    """POST /refine delegates to /revise — empty instruction is rejected."""
    monkeypatch.setenv("CLAW_DATA_DIR", str(tmp_path))
    monkeypatch.setenv("CLAW_USAGE_ECONOMICS_DB_PATH", str(tmp_path / "usage.sqlite3"))
    client = TestClient(app)
    create_res = client.post(
        "/api/agreements/draft",
        headers=_ORG_H,
        json={
            "title": "NDA",
            "jurisdiction": "Delaware",
            "parties": [
                {"name": "A", "role": "party"},
                {"name": "B", "role": "party"},
            ],
            "purpose": "Confidentiality",
            "payment_terms": "N/A",
            "duration": None,
            "due_date": None,
            "effective_date": None,
        },
    )
    assert create_res.status_code == 200
    aid = create_res.json()["id"]
    bad = client.post(f"/api/agreements/{aid}/refine", headers=_ORG_H, json={"instruction": "  "})
    assert bad.status_code == 400


def test_parse_premium_returns_503_without_heuristic_fallback(monkeypatch, tmp_path):
    """Premium path must not silently downgrade to heuristic/basic parse on LLM failure."""
    monkeypatch.setenv("CLAW_DATA_DIR", str(tmp_path))
    monkeypatch.setenv("CLAW_USAGE_ECONOMICS_DB_PATH", str(tmp_path / "usage.sqlite3"))
    import backend.routers.agreements_v2_api as av2

    def boom(*args, **kwargs):
        raise RuntimeError("simulated_openai_failure")

    monkeypatch.setattr(av2, "call_legal_llm", boom)
    client = TestClient(app)
    res = client.post(
        "/api/agreements/parse",
        headers=_ORG_H,
        json={
            "intake_text": "Between Acme LLC and Beta LLC for influencer deal in Fitness Niche",
            "ai_model_class": "premium",
        },
    )
    assert res.status_code == 503
    detail = res.json()["detail"]
    assert isinstance(detail, dict)
    assert detail.get("code") == "premium_parse_unavailable"


def test_parse_basic_falls_back_to_heuristic_when_llm_fails(monkeypatch, tmp_path):
    monkeypatch.setenv("CLAW_DATA_DIR", str(tmp_path))
    monkeypatch.setenv("CLAW_USAGE_ECONOMICS_DB_PATH", str(tmp_path / "usage.sqlite3"))
    import backend.routers.agreements_v2_api as av2

    def boom(*args, **kwargs):
        raise RuntimeError("simulated_openai_failure")

    monkeypatch.setattr(av2, "call_legal_llm", boom)
    client = TestClient(app)
    res = client.post(
        "/api/agreements/parse",
        headers=_ORG_H,
        json={"intake_text": "Between Acme and Beta for lawn mowing weekly", "ai_model_class": "basic"},
    )
    assert res.status_code == 200
    body = res.json()
    assert "draft" in body
    assert body["draft"].get("title")


def test_parse_premium_returns_extract_when_model_includes_optional_fields(monkeypatch, tmp_path):
    monkeypatch.setenv("CLAW_DATA_DIR", str(tmp_path))
    monkeypatch.setenv("CLAW_USAGE_ECONOMICS_DB_PATH", str(tmp_path / "usage.sqlite3"))
    import backend.routers.agreements_v2_api as av2

    def fake_llm(*args, **kwargs):
        return json.dumps(
            {
                "title": "T",
                "jurisdiction": "Delaware",
                "parties": [
                    {"name": "A", "role": "party"},
                    {"name": "B", "role": "party"},
                ],
                "purpose": "p",
                "payment_terms": "x",
                "duration": None,
                "due_date": None,
                "effective_date": None,
                "material_asks": ["Keep weekly readouts", "No side deals"],
                "agreement_family_hint": "services",
                "confidence": "high",
            }
        )

    monkeypatch.setattr(av2, "call_legal_llm", fake_llm)
    client = TestClient(app)
    res = client.post(
        "/api/agreements/parse",
        headers=_ORG_H,
        json={"intake_text": "hello", "ai_model_class": "premium"},
    )
    assert res.status_code == 200
    body = res.json()
    ex = body.get("extract")
    assert ex is not None
    assert ex["material_asks"] == ["Keep weekly readouts", "No side deals"]
    assert ex["agreement_family_hint"] == "services"
    assert ex["confidence"] == "high"
    assert body["draft"]["title"] == "T"


def test_parse_basic_extract_is_null(monkeypatch, tmp_path):
    monkeypatch.setenv("CLAW_DATA_DIR", str(tmp_path))
    monkeypatch.setenv("CLAW_USAGE_ECONOMICS_DB_PATH", str(tmp_path / "usage.sqlite3"))
    import backend.routers.agreements_v2_api as av2

    def fake_llm(*args, **kwargs):
        return json.dumps(
            {
                "title": "Basic T",
                "jurisdiction": "TBD",
                "parties": [
                    {"name": "A", "role": "party"},
                    {"name": "B", "role": "party"},
                ],
                "purpose": "work",
                "payment_terms": "",
                "duration": None,
                "due_date": None,
                "effective_date": None,
            }
        )

    monkeypatch.setattr(av2, "call_legal_llm", fake_llm)
    client = TestClient(app)
    res = client.post(
        "/api/agreements/parse",
        headers=_ORG_H,
        json={"intake_text": "brief", "ai_model_class": "basic"},
    )
    assert res.status_code == 200
    assert res.json().get("extract") is None


def test_parse_premium_invalid_extract_fields_coerced_to_safe_extract(monkeypatch, tmp_path):
    monkeypatch.setenv("CLAW_DATA_DIR", str(tmp_path))
    monkeypatch.setenv("CLAW_USAGE_ECONOMICS_DB_PATH", str(tmp_path / "usage.sqlite3"))
    import backend.routers.agreements_v2_api as av2

    def fake_llm(*args, **kwargs):
        return json.dumps(
            {
                "title": "T2",
                "jurisdiction": "DE",
                "parties": [
                    {"name": "A", "role": "party"},
                    {"name": "B", "role": "party"},
                ],
                "purpose": "p",
                "payment_terms": "",
                "duration": None,
                "due_date": None,
                "effective_date": None,
                "material_asks": "not a list",
                "agreement_family_hint": "invalid_enum",
                "confidence": "maybe",
            }
        )

    monkeypatch.setattr(av2, "call_legal_llm", fake_llm)
    client = TestClient(app)
    res = client.post(
        "/api/agreements/parse",
        headers=_ORG_H,
        json={"intake_text": "x", "ai_model_class": "premium"},
    )
    assert res.status_code == 200
    ex = res.json()["extract"]
    assert ex["material_asks"] == []
    assert ex["agreement_family_hint"] is None
    assert ex["confidence"] is None


def test_premium_full_draft_ok(monkeypatch, tmp_path):
    monkeypatch.setenv("CLAW_DATA_DIR", str(tmp_path))
    monkeypatch.setenv("CLAW_USAGE_ECONOMICS_DB_PATH", str(tmp_path / "usage.sqlite3"))
    import backend.routers.agreements_v2_api as av2

    body_block = "\n\n".join(
        [
            "1. PARTIES. Agency LLC and Client LLC enter this Agreement.",
            "2. SCOPE. Paid media, spend approvals, CRM ownership, and performance reporting.",
            "3. COMPENSATION. Monthly retainer; invoicing and net payment terms as stated.",
            "4. CONFIDENTIALITY. Mutual protection of non-public business information.",
            "5. TERM AND TERMINATION. Initial term with written notice for convenience.",
            "6. LIABILITY. Commercially reasonable limitation except for gross negligence.",
            "7. DISPUTES. Good-faith negotiation then courts of the selected jurisdiction.",
            "8. NOTICES. Email and mailing to designated business addresses.",
            "9. MISCELLANEOUS. Entire agreement; counterparts; electronic signatures valid.",
            "10. GOVERNING LAW. As stated in the agreement header.",
        ]
    )
    doc = (
        "WHEREAS the parties wish to document paid media services.\n\n"
        + body_block
        + "\n\n"
        + ("Additional operative detail. " * 200)
        + "\n\n"
        + ("z" * 1200)
    )
    out_json = {
        "title": "Agency Services Agreement",
        "agreement_family": "Marketing / agency retainer",
        "document_text": doc,
        "key_terms_found": ["Fees", "IP"],
        "missing_material_info": ["Cap table"],
    }

    def fake_llm(*args, **kwargs):
        return __import__("json").dumps(out_json)

    monkeypatch.setattr(av2, "call_legal_llm", fake_llm)
    client = TestClient(app)
    res = client.post(
        "/api/agreements/premium-full-draft",
        headers=_ORG_H,
        json={
            "intake_text": "Retainer for paid media between Agency LLC and Client LLC, spend pre-approval, CRM ownership.",
            "context": {
                "title": "T",
                "jurisdiction": "New York",
                "parties": [
                    {"name": "Agency LLC", "role": "Agency"},
                    {"name": "Client LLC", "role": "Client"},
                ],
                "purpose": "Run campaigns",
                "payment_terms": "Monthly",
                "material_asks": ["Own CRM exports"],
            },
        },
    )
    assert res.status_code == 200
    b = res.json()
    assert b.get("title") == "Agency Services Agreement"
    assert "document_text" in b and len(b["document_text"]) > 1000
    assert b.get("key_terms_found") == ["Fees", "IP"]
    assert "server_full_document_text" in b and len(b.get("server_full_document_text") or "") > 1000
    assert isinstance(b.get("server_repair_document_text"), str)


def test_premium_full_draft_repair_pass_uses_agreement_outbound_airlock_profile(monkeypatch, tmp_path):
    """Primary + quality-triggered repair must both use agreement_outbound (no stricter default on repair)."""
    monkeypatch.setenv("CLAW_DATA_DIR", str(tmp_path))
    monkeypatch.setenv("CLAW_USAGE_ECONOMICS_DB_PATH", str(tmp_path / "usage.sqlite3"))
    monkeypatch.setenv("OPENAI_API_KEY", "sk-test-unit")
    import backend.routers.agreements_v2_api as av2

    body_block = "\n\n".join(
        [
            "1. PARTIES. Agency LLC and Client LLC enter this Agreement.",
            "2. SCOPE. Paid media, spend approvals, CRM ownership, and performance reporting.",
            "3. COMPENSATION. Monthly retainer; invoicing and net payment terms as stated.",
            "4. CONFIDENTIALITY. Mutual protection of non-public business information.",
            "5. TERM AND TERMINATION. Initial term with written notice for convenience.",
            "6. LIABILITY. Commercially reasonable limitation except for gross negligence.",
            "7. DISPUTES. Good-faith negotiation then courts of the selected jurisdiction.",
            "8. NOTICES. Email and mailing to designated business addresses.",
            "9. MISCELLANEOUS. Entire agreement; counterparts; electronic signatures valid.",
            "10. GOVERNING LAW. As stated in the agreement header.",
        ]
    )
    long_doc = (
        "WHEREAS the parties wish to document paid media services.\n\n"
        + body_block
        + "\n\n"
        + ("Additional operative detail. " * 200)
        + "\n\n"
        + ("z" * 1200)
    )
    long_json = {
        "title": "Agency Services Agreement",
        "agreement_family": "Marketing / agency retainer",
        "document_text": long_doc,
        "key_terms_found": ["Fees", "IP"],
        "missing_material_info": [],
    }
    short_json = {
        "title": "Agency Services Agreement",
        "agreement_family": "Marketing / agency retainer",
        "document_text": "TOO SHORT " * 20,
        "key_terms_found": [],
        "missing_material_info": [],
    }

    profiles: list[str | None] = []

    def fake_llm(*args, **kwargs):
        profiles.append(kwargs.get("airlock_profile"))
        if len(profiles) == 1:
            return json.dumps(short_json)
        return json.dumps(long_json)

    monkeypatch.setattr(av2, "call_legal_llm", fake_llm)
    client = TestClient(app)
    res = client.post(
        "/api/agreements/premium-full-draft",
        headers=_ORG_H,
        json={
            "intake_text": "Retainer for paid media between Agency LLC and Client LLC, spend pre-approval, CRM ownership.",
            "context": {
                "title": "T",
                "jurisdiction": "New York",
                "parties": [
                    {"name": "Agency LLC", "role": "Agency"},
                    {"name": "Client LLC", "role": "Client"},
                ],
                "purpose": "Run campaigns",
                "payment_terms": "Monthly",
                "material_asks": ["Own CRM exports"],
            },
        },
    )
    assert res.status_code == 200
    assert profiles == ["agreement_outbound", "agreement_outbound"]
    b = res.json()
    assert len((b.get("document_text") or "").strip()) > 1000


def test_premium_full_draft_saas_reseller_qa_prompt_not_airlock_blocked(monkeypatch, tmp_path):
    """Regression: ordinary commercial QA intake must reach the model (airlock must not pre-block)."""
    monkeypatch.setenv("CLAW_DATA_DIR", str(tmp_path))
    monkeypatch.setenv("CLAW_USAGE_ECONOMICS_DB_PATH", str(tmp_path / "usage.sqlite3"))
    monkeypatch.setenv("OPENAI_API_KEY", "sk-test-unit")
    import backend.routers.agreements_v2_api as av2
    from backend.tests.test_privilege_policy import LAWDOG_QA_SAAS_RESELLER_PROMPT

    body_block = "\n\n".join(
        [
            "1. PARTIES. Five named entities enter this Reseller Agreement.",
            "2. SCOPE. White-label software, APIs, onboarding, analytics, and maintenance.",
            "3. FEES. $124,750 across five milestone payments as stated.",
            "4. TERM. Eighteen months with month-to-month renewal and notice.",
            "5. CONFIDENTIALITY AND SECURITY. Mutual duties and reasonable safeguards.",
            "6. IP. Ownership and license scope for deliverables.",
            "7. LIMITATION OF LIABILITY AND INDEMNITY. Commercial caps and defense obligations.",
            "8. SLA. Uptime and service credit mechanics.",
            "9. DISPUTES. Governing law Delaware; mediation optional; arbitration optional; venue.",
            "10. MISCELLANEOUS. Notices, counterparts, electronic signatures.",
        ]
    )
    doc = (
        "WHEREAS the parties wish to document reseller and white-label services.\n\n"
        + body_block
        + "\n\n"
        + ("Additional operative detail. " * 200)
        + "\n\n"
        + ("z" * 1200)
    )
    out_json = {
        "title": "Reseller and White-Label Services Agreement",
        "agreement_family": "SaaS / software services",
        "document_text": doc,
        "key_terms_found": ["Fees", "SLA"],
        "missing_material_info": [],
    }

    def fake_llm(*args, **kwargs):
        assert kwargs.get("airlock_profile") == "agreement_outbound"
        return json.dumps(out_json)

    monkeypatch.setattr(av2, "call_legal_llm", fake_llm)
    client = TestClient(app)
    res = client.post(
        "/api/agreements/premium-full-draft",
        headers=_ORG_H,
        json={
            "intake_text": LAWDOG_QA_SAAS_RESELLER_PROMPT,
            "context": {
                "title": "Web Development Agreement",
                "jurisdiction": "Delaware",
                "parties": [
                    {"name": "Redwood Peak Ventures LLC", "role": "party"},
                    {"name": "Atlas Harbor Technologies Inc.", "role": "party"},
                ],
                "purpose": "Reseller and white-label services",
                "payment_terms": "$124,750 milestone payments",
                "agreement_family": "services_agreement",
                "material_asks": ["confidentiality", "indemnification", "dispute resolution"],
            },
        },
    )
    assert res.status_code == 200
    body = res.json()
    assert body.get("server_generation_failure_code") != "airlock_blocked"
    assert len((body.get("document_text") or "").strip()) > 1000


def test_premium_full_draft_degraded_200_when_llm_fails(monkeypatch, tmp_path):
    monkeypatch.setenv("CLAW_DATA_DIR", str(tmp_path))
    monkeypatch.setenv("CLAW_USAGE_ECONOMICS_DB_PATH", str(tmp_path / "usage.sqlite3"))
    import backend.routers.agreements_v2_api as av2

    def boom(*args, **kwargs):
        raise RuntimeError("no_model")

    monkeypatch.setattr(av2, "call_legal_llm", boom)
    client = TestClient(app)
    res = client.post(
        "/api/agreements/premium-full-draft",
        headers=_ORG_H,
        json={"intake_text": "Any intake text for testing failure path."},
    )
    assert res.status_code == 200
    assert "application/json" in (res.headers.get("content-type") or "")
    body = res.json()
    assert body.get("generation_outcome") == "degraded"
    assert (body.get("server_generation_failure_code") or "") != ""
    assert (body.get("document_text") or "").strip() != ""
    assert "server_full_document_text" in body


def test_premium_full_draft_degraded_airlock_returns_empty_document(monkeypatch, tmp_path):
    """Airlock failures must not inject fake Pro agreement text into document_text."""
    monkeypatch.setenv("CLAW_DATA_DIR", str(tmp_path))
    monkeypatch.setenv("CLAW_USAGE_ECONOMICS_DB_PATH", str(tmp_path / "usage.sqlite3"))
    import backend.routers.agreements_v2_api as av2
    from backend.llm_router import ExternalAIBlockedError

    def boom(*args, **kwargs):
        raise ExternalAIBlockedError(
            "PROTECTED_MODE_EXTERNAL_AI",
            policy_reason_codes=("policy_test",),
        )

    monkeypatch.setattr(av2, "call_legal_llm", boom)
    client = TestClient(app)
    res = client.post(
        "/api/agreements/premium-full-draft",
        headers=_ORG_H,
        json={"intake_text": "SaaS services agreement between two LLCs. Fee $10,000. Delaware law."},
    )
    assert res.status_code == 200
    body = res.json()
    assert body.get("generation_outcome") == "degraded"
    assert body.get("server_generation_failure_code") == "airlock_blocked"
    assert (body.get("document_text") or "").strip() == ""
    assert (body.get("server_full_document_text") or "").strip() == ""
    assert (body.get("server_repair_document_text") or "").strip() == ""
    for bad in ("Operative terms", "Commercial framework", "automated full pass", "Summary from your intake"):
        assert bad not in (body.get("document_text") or "")
    reasons = body.get("schema_validation_reasons") or []
    assert any(str(x).startswith("fallback_suppressed:") for x in reasons)


def test_premium_full_draft_degraded_no_repeated_operative_filler(monkeypatch, tmp_path):
    """Degraded fallback must not repeat the same generic 'Operative terms' clause many times."""
    monkeypatch.setenv("CLAW_DATA_DIR", str(tmp_path))
    monkeypatch.setenv("CLAW_USAGE_ECONOMICS_DB_PATH", str(tmp_path / "usage.sqlite3"))
    import backend.routers.agreements_v2_api as av2

    def boom(*args, **kwargs):
        raise RuntimeError("no_model")

    monkeypatch.setattr(av2, "call_legal_llm", boom)
    client = TestClient(app)
    res = client.post(
        "/api/agreements/premium-full-draft",
        headers=_ORG_H,
        json={"intake_text": "Any intake text for testing failure path."},
    )
    assert res.status_code == 200
    doc = (res.json().get("document_text") or "").strip()
    assert doc
    needle = "Operative terms. The parties intend to document"
    assert doc.count(needle) <= 1


def test_premium_full_draft_returns_503_structured_when_wire_encode_fails(monkeypatch, tmp_path):
    """Regression: serialization must return complete JSON (CORS-safe) instead of connection reset."""
    monkeypatch.setenv("CLAW_DATA_DIR", str(tmp_path))
    monkeypatch.setenv("CLAW_USAGE_ECONOMICS_DB_PATH", str(tmp_path / "usage.sqlite3"))
    import backend.routers.agreements_v2_api as av2

    def fake_llm(*args, **kwargs):
        return json.dumps(
            {
                "title": "T",
                "agreement_family": "svc",
                "document_text": "x" * 800,
                "key_terms_found": [],
                "missing_material_info": [],
            }
        )

    def boom_wire(_model):
        raise TypeError("simulated_wire_failure")

    monkeypatch.setattr(av2, "call_legal_llm", fake_llm)
    monkeypatch.setattr(av2, "_premium_full_draft_model_to_wire_dict", boom_wire)
    client = TestClient(app)
    res = client.post(
        "/api/agreements/premium-full-draft",
        headers=_ORG_H,
        json={"intake_text": "Paid media retainer between two LLCs with net-30 invoicing."},
    )
    assert res.status_code == 503
    assert "application/json" in (res.headers.get("content-type") or "")
    err = res.json().get("detail") or {}
    assert err.get("code") == "premium_full_draft_response_serialization_failed"
    assert err.get("stage") == "response_serialize"


def test_premium_full_draft_sanitize_wire_nested_replaces_non_utf8_strings():
    from backend.routers.agreements_v2_api import _premium_full_draft_sanitize_wire_nested

    raw = "prefix\udcffsuffix"
    out = _premium_full_draft_sanitize_wire_nested({"document_text": raw, "nested": [raw]})
    assert "\udcff" not in out["document_text"]
    assert "\udcff" not in out["nested"][0]


def test_premium_agreement_review_ok(monkeypatch, tmp_path):
    monkeypatch.setenv("CLAW_DATA_DIR", str(tmp_path))
    monkeypatch.setenv("CLAW_USAGE_ECONOMICS_DB_PATH", str(tmp_path / "usage.sqlite3"))
    import backend.routers.agreements_v2_api as av2

    def fake_llm(*args, **kwargs):
        return json.dumps(
            {
                "strengths": ["Clear party roles", "Payment cadence is readable"],
                "missing_or_weak_terms": ["Governing law still TBD"],
                "questions_for_user": ["Confirm which state law should apply?"],
                "suggested_clause_upgrades": [
                    "Cross-reference the cure period with the 30 days mentioned in the intake for vendor delays."
                ],
                "priority_score": 55,
            }
        )

    monkeypatch.setattr(av2, "call_legal_llm", fake_llm)
    client = TestClient(app)
    doc = "1. SCOPE. Services.\n2. PAYMENT. Net 30.\n3. TERM. 12 months.\n" * 200
    res = client.post(
        "/api/agreements/premium-review",
        headers=_ORG_H,
        json={
            "intake_text": "Marketing retainer between A and B; net 30; CRM access.",
            "document_text": doc,
            "context": {"agreement_family": "services", "jurisdiction": "TBD"},
        },
    )
    assert res.status_code == 200
    b = res.json()
    assert b.get("priority_score") == 55
    assert len(b.get("strengths") or []) == 2
    assert b.get("questions_for_user")
    assert b.get("suggested_clause_upgrades")


def test_premium_missing_facts_ok(monkeypatch, tmp_path):
    monkeypatch.setenv("CLAW_DATA_DIR", str(tmp_path))
    monkeypatch.setenv("CLAW_USAGE_ECONOMICS_DB_PATH", str(tmp_path / "usage.sqlite3"))
    import backend.routers.agreements_v2_api as av2

    def fake_llm(*args, **kwargs):
        return json.dumps(
            {
                "questions": [
                    "What governing law and venue should apply?",
                    "What is the exact fee or retainer amount?",
                ]
            }
        )

    monkeypatch.setattr(av2, "call_legal_llm", fake_llm)
    client = TestClient(app)
    res = client.post(
        "/api/agreements/premium-missing-facts",
        headers=_ORG_H,
        json={
            "intake_text": "Services between A and B, details TBD.",
            "context": {
                "title": "Services",
                "jurisdiction": "TBD",
                "parties": [
                    {"name": "A", "role": "Client"},
                    {"name": "B", "role": "Vendor"},
                ],
                "purpose": "Vague",
                "payment_terms": "To be agreed",
            },
        },
    )
    assert res.status_code == 200
    b = res.json()
    assert len(b.get("questions") or []) == 2


def test_premium_missing_facts_fail_open_empty(monkeypatch, tmp_path):
    monkeypatch.setenv("CLAW_DATA_DIR", str(tmp_path))
    monkeypatch.setenv("CLAW_USAGE_ECONOMICS_DB_PATH", str(tmp_path / "usage.sqlite3"))
    import backend.routers.agreements_v2_api as av2

    def boom(*args, **kwargs):
        raise RuntimeError("no_model")

    monkeypatch.setattr(av2, "call_legal_llm", boom)
    client = TestClient(app)
    res = client.post(
        "/api/agreements/premium-missing-facts",
        headers=_ORG_H,
        json={"intake_text": "x", "context": None},
    )
    assert res.status_code == 200
    assert res.json() == {"questions": []}


def test_premium_refine_update_ok(monkeypatch, tmp_path):
    monkeypatch.setenv("CLAW_DATA_DIR", str(tmp_path))
    monkeypatch.setenv("CLAW_USAGE_ECONOMICS_DB_PATH", str(tmp_path / "usage.sqlite3"))
    import backend.routers.agreements_v2_api as av2

    def fake_llm(*args, **kwargs):
        return json.dumps(
            {
                "updated_document_text": "FULL DOC\nWITH EDIT",
                "summary_changes": ["Added email notices"],
                "readiness_score": 80,
                "suggested_next_step": "send",
            }
        )

    monkeypatch.setattr(av2, "call_legal_llm", fake_llm)
    client = TestClient(app)
    res = client.post(
        "/api/agreements/premium-refine",
        headers=_ORG_H,
        json={
            "current_document_text": "OLD DOC",
            "intake_text": "Referral between A and B, 5% on paid invoices.",
            "user_refinement_prompt": "Allow termination on 10 days email notice",
            "action": "update",
        },
    )
    assert res.status_code == 200
    b = res.json()
    assert "WITH EDIT" in b["updated_document_text"]
    assert b["suggested_next_step"] == "send"
    assert b["readiness_score"] == 80
    assert len(b.get("summary_changes") or []) == 1


def test_premium_refine_update_requires_refinement_prompt(monkeypatch, tmp_path):
    monkeypatch.setenv("CLAW_DATA_DIR", str(tmp_path))
    monkeypatch.setenv("CLAW_USAGE_ECONOMICS_DB_PATH", str(tmp_path / "usage.sqlite3"))
    client = TestClient(app)
    res = client.post(
        "/api/agreements/premium-refine",
        headers=_ORG_H,
        json={
            "current_document_text": "X",
            "intake_text": "Any intake for refine validation.",
            "user_refinement_prompt": "  ",
            "action": "update",
        },
    )
    assert res.status_code == 400


def test_premium_refine_ask_missing_preserves_document(monkeypatch, tmp_path):
    monkeypatch.setenv("CLAW_DATA_DIR", str(tmp_path))
    monkeypatch.setenv("CLAW_USAGE_ECONOMICS_DB_PATH", str(tmp_path / "usage.sqlite3"))
    import backend.routers.agreements_v2_api as av2

    def fake_llm(*args, **kwargs):
        return json.dumps(
            {
                "summary_changes": ["Governing law and venue for cross-border", "Liability cap vs referral fees", "Data retention in CRM"],
                "readiness_score": 50,
                "suggested_next_step": "edit",
            }
        )

    monkeypatch.setattr(av2, "call_legal_llm", fake_llm)
    client = TestClient(app)
    doc = "PREAMBLE\n" + "SECTION. Text.\n" * 50
    res = client.post(
        "/api/agreements/premium-refine",
        headers=_ORG_H,
        json={
            "current_document_text": doc,
            "intake_text": "B2B referral, net-30, US parties.",
            "user_refinement_prompt": "",
            "action": "ask_missing",
        },
    )
    assert res.status_code == 200
    b = res.json()
    assert b["updated_document_text"] == doc
    assert len(b["summary_changes"]) == 3


def test_premium_refine_503_on_llm_failure(monkeypatch, tmp_path):
    monkeypatch.setenv("CLAW_DATA_DIR", str(tmp_path))
    monkeypatch.setenv("CLAW_USAGE_ECONOMICS_DB_PATH", str(tmp_path / "usage.sqlite3"))
    import backend.routers.agreements_v2_api as av2

    def boom(*args, **kwargs):
        raise RuntimeError("no_model")

    monkeypatch.setattr(av2, "call_legal_llm", boom)
    client = TestClient(app)
    res = client.post(
        "/api/agreements/premium-refine",
        headers=_ORG_H,
        json={
            "current_document_text": "DOC",
            "intake_text": "OK intake for refine 503 test.",
            "action": "ready",
        },
    )
    assert res.status_code == 503
    detail = res.json().get("detail")
    assert isinstance(detail, dict) and detail.get("code") == "premium_refine_unavailable"


def _premium_refine_long_fixture_doc() -> str:
    parts = ["# Agreement\n\n", "## Parties\n\nA and B.\n\n", "## Scope\n\n"]
    parts.append("".join(f"Scope detail line {i} with mutual obligations.\n" for i in range(160)))
    parts.append(
        "\n## Payment\n\nFees are net 30. Invoices monthly on the first business day.\n\n"
        "## Intellectual Property\n\nEach party retains pre-existing IP.\n\n"
        "## Confidentiality\n\nParties agree to mutual confidentiality obligations.\n\n"
        "## Termination\n\nEither party may terminate on thirty (30) days written notice.\n"
    )
    return "".join(parts)


def _premium_refine_15k_doc_client_deliverables_fixture() -> str:
    """Long Pro-style body for surgical QA (narrow insert must not trip idempotent language guard)."""
    parts = ["# Agreement\n\n", "## Parties\n\nClient and Vendor LLC.\n\n", "## Scope\n\n"]
    parts.append(
        "".join(
            f"Scope operational paragraph {i} with deliverables milestones and invoicing context filler line.\n"
            for i in range(240)
        )
    )
    parts.append(
        "\n## 3.4 Client sign-off\n\nVendor submits work; Client signs off using the checklist in Exhibit A.\n\n"
        "## 4 Final Payment\n\nClient pays the final invoice within thirty days following Client sign-off.\n\n"
        "## Intellectual Property\n\nEach party retains its pre-existing IP.\n\n"
        "## Confidentiality\n\nMutual confidentiality obligations.\n\n"
        "## Termination\n\nEither party may terminate on thirty days notice.\n\n"
        "IN WITNESS WHEREOF\n\n__ /s/ Vendor __\n"
    )
    return "".join(parts)


def _premium_refine_doc_fees_and_payment_schedule() -> str:
    parts = ["# Agreement\n\n", "## Parties\n\nA and B.\n\n", "## Scope\n\n"]
    parts.append("".join(f"Scope detail line {i} with mutual obligations.\n" for i in range(160)))
    parts.append(
        "\n## Fees and Payment\n\n"
        "The total fee is fifty thousand dollars USD.\n\n"
        "### Payment Schedule\n\n"
        "Invoices are due net thirty from invoice date.\n\n"
        "## Confidentiality\n\nParties agree to mutual confidentiality obligations.\n\n"
        "## Termination\n\nEither party may terminate on thirty (30) days written notice.\n"
    )
    return "".join(parts)


def test_premium_refine_late_fee_fees_and_payment_section_inserts_before_schedule(monkeypatch, tmp_path):
    monkeypatch.setenv("CLAW_DATA_DIR", str(tmp_path))
    monkeypatch.setenv("CLAW_USAGE_ECONOMICS_DB_PATH", str(tmp_path / "usage.sqlite3"))
    import backend.routers.agreements_v2_api as av2

    def boom(*args, **kwargs):
        raise RuntimeError("call_legal_llm_should_not_run_for_deterministic_late_fee")

    monkeypatch.setattr(av2, "call_legal_llm", boom)
    client = TestClient(app)
    doc = _premium_refine_doc_fees_and_payment_schedule()
    assert len(doc) >= 2500
    res = client.post(
        "/api/agreements/premium-refine",
        headers=_ORG_H,
        json={
            "current_document_text": doc,
            "intake_text": "B2B services between A and B, US law.",
            "user_refinement_prompt": "Add late fee of 5% after 10 days overdue. Preserve all other terms.",
            "action": "update",
        },
    )
    assert res.status_code == 200
    text = res.json()["updated_document_text"]
    low = text.lower()
    assert ("five percent (5%)" in low) or ("5%" in text)
    assert "late" in low
    assert low.find("late payment") < low.find("payment schedule")
    assert "## Fees and Payment" in text
    assert "### Payment Schedule" in text
    assert len(text) >= int(len(doc) * 0.9)


def test_premium_refine_update_identical_llm_output_returns_fail_open(monkeypatch, tmp_path):
    """Full refine echoing the input must not look like a successful apply (fail-open summary)."""
    monkeypatch.setenv("CLAW_DATA_DIR", str(tmp_path))
    monkeypatch.setenv("CLAW_USAGE_ECONOMICS_DB_PATH", str(tmp_path / "usage.sqlite3"))
    import backend.routers.agreements_v2_api as av2

    doc_local = "LONG AGREEMENT\n" + ("Body line with enough chars for narrow skip.\n" * 120)

    def no_narrow(**_k):
        return None

    def echo_llm(*_a, **_k):
        return json.dumps(
            {
                "updated_document_text": doc_local,
                "summary_changes": ["No changes applied"],
                "readiness_score": 80,
                "suggested_next_step": "review",
            }
        )

    monkeypatch.setattr(av2, "try_apply_narrow_amendment", no_narrow)
    monkeypatch.setattr(av2, "call_legal_llm", echo_llm)
    client = TestClient(app)
    res = client.post(
        "/api/agreements/premium-refine",
        headers=_ORG_H,
        json={
            "current_document_text": doc_local,
            "intake_text": "Services deal.",
            "user_refinement_prompt": "Add a material indemnity cap clarification throughout.",
            "action": "update",
        },
    )
    assert res.status_code == 200
    b = res.json()
    assert b["updated_document_text"] == doc_local
    assert av2.PREMIUM_REFINE_UPDATE_FAIL_OPEN_USER_MESSAGE in (b.get("summary_changes") or [])


def test_premium_refine_late_fee_narrow_deterministic_skips_llm(monkeypatch, tmp_path):
    """Narrow late-fee path inserts without calling full-document refine LLM."""
    monkeypatch.setenv("CLAW_DATA_DIR", str(tmp_path))
    monkeypatch.setenv("CLAW_USAGE_ECONOMICS_DB_PATH", str(tmp_path / "usage.sqlite3"))
    import backend.routers.agreements_v2_api as av2

    def boom(*args, **kwargs):
        raise RuntimeError("call_legal_llm_should_not_run_for_deterministic_late_fee")

    monkeypatch.setattr(av2, "call_legal_llm", boom)
    client = TestClient(app)
    doc = _premium_refine_long_fixture_doc()
    assert len(doc) >= 2500
    res = client.post(
        "/api/agreements/premium-refine",
        headers=_ORG_H,
        json={
            "current_document_text": doc,
            "intake_text": "B2B services between A and B, US law.",
            "user_refinement_prompt": "Add late fee of 5% after 10 days overdue. Preserve all other terms.",
            "action": "update",
        },
    )
    assert res.status_code == 200
    b = res.json()
    text = b["updated_document_text"]
    low = text.lower()
    assert ("five percent (5%)" in low) or ("5%" in text)
    assert "late" in low
    assert "## Payment" in text
    assert "Confidentiality" in text
    assert "Intellectual Property" in text or "IP" in text
    assert len(text) >= int(len(doc) * 0.9)
    assert len(b.get("summary_changes") or []) >= 1


def test_premium_refine_late_fee_narrow_still_200_when_record_ai_call_raises(monkeypatch, tmp_path):
    """Usage accounting failures must not 503 a successful deterministic narrow refine."""
    monkeypatch.setenv("CLAW_DATA_DIR", str(tmp_path))
    monkeypatch.setenv("CLAW_USAGE_ECONOMICS_DB_PATH", str(tmp_path / "usage.sqlite3"))
    import backend.routers.agreements_v2_api as av2

    def boom_llm(*_a, **_k):
        raise RuntimeError("llm_should_not_run")

    def boom_record(**_k):
        raise RuntimeError("usage_store_unavailable")

    monkeypatch.setattr(av2, "call_legal_llm", boom_llm)
    monkeypatch.setattr(av2, "record_ai_call", boom_record)
    client = TestClient(app)
    doc = _premium_refine_long_fixture_doc()
    res = client.post(
        "/api/agreements/premium-refine",
        headers=_ORG_H,
        json={
            "current_document_text": doc,
            "intake_text": "B2B services.",
            "user_refinement_prompt": "Add late fee of 5% after 10 days overdue. Preserve all other terms.",
            "action": "update",
        },
    )
    assert res.status_code == 200
    text = res.json()["updated_document_text"]
    assert ("five percent (5%)" in text.lower()) or ("5%" in text)
    assert len(text) >= int(len(doc) * 0.9)


def test_premium_refine_narrow_exception_falls_back_to_full_llm(monkeypatch, tmp_path):
    """Unexpected narrow-path errors fall back to full refine instead of failing the request."""
    monkeypatch.setenv("CLAW_DATA_DIR", str(tmp_path))
    monkeypatch.setenv("CLAW_USAGE_ECONOMICS_DB_PATH", str(tmp_path / "usage.sqlite3"))
    import backend.routers.agreements_v2_api as av2

    doc_local = _premium_refine_long_fixture_doc()

    def boom_narrow(**_k):
        raise ValueError("narrow_internal_bug")

    def fake_llm(*_a, **_k):
        return json.dumps(
            {
                "updated_document_text": doc_local + "\n\nAPPENDED BY FULL LLM PATH.\n",
                "summary_changes": ["Applied via full refine fallback"],
                "readiness_score": 70,
                "suggested_next_step": "review",
            }
        )

    monkeypatch.setattr(av2, "try_apply_narrow_amendment", boom_narrow)
    monkeypatch.setattr(av2, "call_legal_llm", fake_llm)
    client = TestClient(app)
    res = client.post(
        "/api/agreements/premium-refine",
        headers=_ORG_H,
        json={
            "current_document_text": doc_local,
            "intake_text": "B2B services.",
            "user_refinement_prompt": "Add late fee of 5% after 10 days overdue. Preserve all other terms.",
            "action": "update",
        },
    )
    assert res.status_code == 200
    assert "APPENDED BY FULL LLM PATH" in res.json()["updated_document_text"]


def test_premium_refine_narrow_exception_full_llm_fail_returns_200_unchanged(monkeypatch, tmp_path):
    """action=update: narrow throws and full refine fails → 200 with unchanged document (no 503)."""
    monkeypatch.setenv("CLAW_DATA_DIR", str(tmp_path))
    monkeypatch.setenv("CLAW_USAGE_ECONOMICS_DB_PATH", str(tmp_path / "usage.sqlite3"))
    import backend.routers.agreements_v2_api as av2

    doc_local = _premium_refine_long_fixture_doc()

    def boom_narrow(**_k):
        raise ValueError("narrow_internal_bug")

    def boom_llm(*_a, **_k):
        raise RuntimeError("openai_unavailable")

    monkeypatch.setattr(av2, "try_apply_narrow_amendment", boom_narrow)
    monkeypatch.setattr(av2, "call_legal_llm", boom_llm)
    client = TestClient(app)
    res = client.post(
        "/api/agreements/premium-refine",
        headers=_ORG_H,
        json={
            "current_document_text": doc_local,
            "intake_text": "B2B services.",
            "user_refinement_prompt": "Add late fee of 5% after 10 days overdue. Preserve all other terms.",
            "action": "update",
        },
    )
    assert res.status_code == 200
    b = res.json()
    assert b["updated_document_text"] == doc_local
    assert av2.PREMIUM_REFINE_UPDATE_FAIL_OPEN_USER_MESSAGE in (b.get("summary_changes") or [])


def test_premium_refine_update_llm_failure_fail_open_unchanged(monkeypatch, tmp_path):
    """Non-narrow update: LLM outage returns 200 + unchanged document + warning (not 503)."""
    monkeypatch.setenv("CLAW_DATA_DIR", str(tmp_path))
    monkeypatch.setenv("CLAW_USAGE_ECONOMICS_DB_PATH", str(tmp_path / "usage.sqlite3"))
    import backend.routers.agreements_v2_api as av2

    def boom_llm(*_a, **_k):
        raise RuntimeError("no_model")

    monkeypatch.setattr(av2, "call_legal_llm", boom_llm)
    client = TestClient(app)
    doc = "STARTER AGREEMENT BODY\n" + ("Section line.\n" * 80)
    assert len(doc) >= 200
    res = client.post(
        "/api/agreements/premium-refine",
        headers=_ORG_H,
        json={
            "current_document_text": doc,
            "intake_text": "Referral deal between A and B.",
            "user_refinement_prompt": "Rename Party A to Acme LLC throughout.",
            "action": "update",
        },
    )
    assert res.status_code == 200
    b = res.json()
    assert b["updated_document_text"] == doc
    assert av2.PREMIUM_REFINE_UPDATE_FAIL_OPEN_USER_MESSAGE in (b.get("summary_changes") or [])


def test_premium_refine_fail_open_preserves_exact_request_bytes_including_trailing_whitespace(
    monkeypatch, tmp_path,
):
    """LLM failure fail-open must echo request current_document_text byte-for-byte (no strip)."""
    monkeypatch.setenv("CLAW_DATA_DIR", str(tmp_path))
    monkeypatch.setenv("CLAW_USAGE_ECONOMICS_DB_PATH", str(tmp_path / "usage.sqlite3"))
    import backend.routers.agreements_v2_api as av2

    def boom_llm(*_a, **_k):
        raise RuntimeError("no_model")

    monkeypatch.setattr(av2, "call_legal_llm", boom_llm)
    client = TestClient(app)
    core = "STARTER AGREEMENT BODY\n" + ("Section line.\n" * 80)
    raw = core + "\n\n  \t\n"
    assert raw != raw.strip()
    assert len(raw) >= 200
    res = client.post(
        "/api/agreements/premium-refine",
        headers=_ORG_H,
        json={
            "current_document_text": raw,
            "intake_text": "Referral deal between A and B.",
            "user_refinement_prompt": "Rename Party A to Acme LLC throughout.",
            "action": "update",
        },
    )
    assert res.status_code == 200
    b = res.json()
    assert b["updated_document_text"] == raw
    assert av2.PREMIUM_REFINE_UPDATE_FAIL_OPEN_USER_MESSAGE in (b.get("summary_changes") or [])


def test_premium_refine_client_deliverables_narrow_deterministic_skips_llm(monkeypatch, tmp_path):
    """Narrow path: client approval before final payment + deliverables — full document, no shrink."""
    monkeypatch.setenv("CLAW_DATA_DIR", str(tmp_path))
    monkeypatch.setenv("CLAW_USAGE_ECONOMICS_DB_PATH", str(tmp_path / "usage.sqlite3"))
    import backend.routers.agreements_v2_api as av2

    def boom(*args, **kwargs):
        raise RuntimeError("call_legal_llm_should_not_run_for_deterministic_client_deliverables")

    monkeypatch.setattr(av2, "call_legal_llm", boom)
    client = TestClient(app)
    doc = _premium_refine_15k_doc_client_deliverables_fixture()
    assert len(doc) >= 15000
    instr = "add in the client will need to approve deliverables before final payment is due"
    res = client.post(
        "/api/agreements/premium-refine",
        headers=_ORG_H,
        json={
            "current_document_text": doc,
            "intake_text": "B2B professional services, US.",
            "user_refinement_prompt": instr,
            "action": "update",
        },
    )
    assert res.status_code == 200
    text = res.json()["updated_document_text"]
    low = text.lower()
    assert "deliverables" in low
    assert "final payment" in low
    assert "approval" in low or "approve" in low
    assert "deemed acceptance under section 3.4" in low
    assert "## 3.4" in text
    assert "IN WITNESS WHEREOF" in text
    assert len(text) >= int(len(doc) * 0.95)


def test_premium_refine_late_fee_narrow_llm_anchor_when_no_payment_header(monkeypatch, tmp_path):
    """Without a Payment heading, narrow path falls back to LLM anchor patch."""
    monkeypatch.setenv("CLAW_DATA_DIR", str(tmp_path))
    monkeypatch.setenv("CLAW_USAGE_ECONOMICS_DB_PATH", str(tmp_path / "usage.sqlite3"))
    import backend.routers.agreements_v2_api as av2

    body = [
        "# Agreement\n\n## Scope\n\n",
        "x" * 1200,
        "\n\n## Obligations\n\nMutual NDA duties here. Each party will perform in good faith.\n",
    ]
    doc = "".join(body)

    anchor = "Mutual NDA duties here. Each party will perform in good faith."

    def fake_llm(messages=None, **kwargs):
        m = messages or kwargs.get("messages") or []
        sys = str((m[0] if m else {}).get("content") or "")
        assert "anchor" in sys.lower() or "exact" in sys.lower()
        return json.dumps(
            {
                "anchor": anchor,
                "new_paragraph": (
                    "Late Payment. Any undisputed amount not paid within ten (10) days after it becomes due may accrue "
                    "a late fee equal to five percent (5%) of the overdue amount, unless prohibited by applicable law."
                ),
            }
        )

    monkeypatch.setattr(av2, "call_legal_llm", fake_llm)
    client = TestClient(app)
    res = client.post(
        "/api/agreements/premium-refine",
        headers=_ORG_H,
        json={
            "current_document_text": doc,
            "intake_text": "Services agreement.",
            "user_refinement_prompt": "Add late fee 5% after 10 days overdue.",
            "action": "update",
        },
    )
    assert res.status_code == 200
    text = res.json()["updated_document_text"]
    assert "five percent (5%)" in text.lower()
    assert anchor in text
    assert len(text) >= int(len(doc) * 0.9)


def test_premium_finalize_audit_ok_deal_specific(monkeypatch, tmp_path):
    monkeypatch.setenv("CLAW_DATA_DIR", str(tmp_path))
    monkeypatch.setenv("CLAW_USAGE_ECONOMICS_DB_PATH", str(tmp_path / "usage.sqlite3"))
    import backend.routers.agreements_v2_api as av2

    def fake_llm(*args, **kwargs):
        return json.dumps(
            {
                "deal_specific_missing_terms": [
                    "Allocate ownership of trailer and major equipment",
                    "Clarify profit split and repayment of upfront capital (waterfall)",
                    "Set spending and bank / signature authority",
                ],
                "placeholder_terms_found": [],
                "resolved_strengths": ["Exclusivity zone described"],
                "best_next_step": "edit",
                "confidence": "medium",
            }
        )

    monkeypatch.setattr(av2, "call_legal_llm", fake_llm)
    client = TestClient(app)
    res = client.post(
        "/api/agreements/premium-finalize-audit",
        headers=_ORG_H,
        json={
            "intake_text": "Two partners run a mobile coffee cart; one funded the cart and one runs daily ops. Split and bank rules TBC.",
            "document_text": "1. The parties will operate a coffee cart. 2. Revenue to be defined. 3. Equipment handling TBD.\n" * 10,
        },
    )
    assert res.status_code == 200
    b = res.json()
    assert len(b["deal_specific_missing_terms"]) == 3
    assert b["best_next_step"] in ("edit", "review", "send")
    assert b["confidence"] in ("low", "medium", "high")
    assert any("TBD" in t for t in b["placeholder_terms_found"])


def test_premium_finalize_audit_fail_open_200_when_llm_unavailable(monkeypatch, tmp_path):
    monkeypatch.setenv("CLAW_DATA_DIR", str(tmp_path))
    monkeypatch.setenv("CLAW_USAGE_ECONOMICS_DB_PATH", str(tmp_path / "usage.sqlite3"))
    import backend.routers.agreements_v2_api as av2

    def boom(*args, **kwargs):
        raise RuntimeError("no_model")

    monkeypatch.setattr(av2, "call_legal_llm", boom)
    client = TestClient(app)
    res = client.post(
        "/api/agreements/premium-finalize-audit",
        headers=_ORG_H,
        json={"intake_text": "i", "document_text": "d" * 100},
    )
    assert res.status_code == 200
    b = res.json()
    assert b["deal_specific_missing_terms"] == []
    assert b["placeholder_terms_found"] == []
    assert b["resolved_strengths"] == []
    assert b["best_next_step"] == "review"
    assert b["confidence"] == "medium"


def test_premium_finalize_audit_malformed_payload_normalizes(monkeypatch, tmp_path):
    monkeypatch.setenv("CLAW_DATA_DIR", str(tmp_path))
    monkeypatch.setenv("CLAW_USAGE_ECONOMICS_DB_PATH", str(tmp_path / "usage.sqlite3"))
    import backend.routers.agreements_v2_api as av2

    def fake_llm(*args, **kwargs):
        return json.dumps(
            {
                "deal_specific_missing_terms": "not-a-list",
                "placeholder_terms_found": None,
                "resolved_strengths": 123,
                "best_next_step": "nope",
                "confidence": "N/A",
            }
        )

    monkeypatch.setattr(av2, "call_legal_llm", fake_llm)
    client = TestClient(app)
    res = client.post(
        "/api/agreements/premium-finalize-audit",
        headers=_ORG_H,
        json={"intake_text": "x", "document_text": "y" * 120},
    )
    assert res.status_code == 200
    b = res.json()
    assert b["deal_specific_missing_terms"] == []
    assert isinstance(b["placeholder_terms_found"], list)
    assert b["best_next_step"] in ("edit", "review", "send")
    assert b["confidence"] in ("low", "medium", "high")


def test_premium_review_route_ok(monkeypatch, tmp_path):
    monkeypatch.setenv("CLAW_DATA_DIR", str(tmp_path))
    monkeypatch.setenv("CLAW_USAGE_ECONOMICS_DB_PATH", str(tmp_path / "usage.sqlite3"))
    import backend.routers.agreements_v2_api as av2

    def fake_llm(*args, **kwargs):
        return json.dumps(
            {
                "route": "review",
                "confidence": "high",
                "unresolved_items": [
                    "Confirm final ownership percentages for cart and equipment",
                    "Set exact payout timing for monthly distributions",
                ],
                "reasons": ["Family-operated venture with shared control rights"],
                "send_readiness_score": 74,
                "recommended_cta": "Send for review",
                "short_summary": "This agreement is strong but should be reviewed by both sides before signatures.",
            }
        )

    monkeypatch.setattr(av2, "call_legal_llm", fake_llm)
    client = TestClient(app)
    res = client.post(
        "/api/agreements/premium-review-route",
        headers=_ORG_H,
        json={
            "intake_text": "Two cousins are starting a coffee cart business.",
            "finalize_answers": "Buyout at fair market value after mediation and arbitration path.",
            "agreement_text": "Agreement text body " * 50,
            "party_count": 2,
            "agreement_family": "partnership",
        },
    )
    assert res.status_code == 200
    b = res.json()
    assert b["route"] == "review"
    assert b["recommended_cta"] == "Start collaborative review"
    assert b["confidence"] in ("low", "medium", "high")
    assert isinstance(b["unresolved_items"], list)


def test_premium_review_route_malformed_payload_normalizes(monkeypatch, tmp_path):
    monkeypatch.setenv("CLAW_DATA_DIR", str(tmp_path))
    monkeypatch.setenv("CLAW_USAGE_ECONOMICS_DB_PATH", str(tmp_path / "usage.sqlite3"))
    import backend.routers.agreements_v2_api as av2

    def fake_llm(*args, **kwargs):
        return json.dumps(
            {
                "route": "unknown",
                "confidence": "unknown",
                "unresolved_items": "bad",
                "reasons": None,
                "send_readiness_score": 9999,
                "recommended_cta": "Anything",
                "short_summary": "",
            }
        )

    monkeypatch.setattr(av2, "call_legal_llm", fake_llm)
    client = TestClient(app)
    res = client.post(
        "/api/agreements/premium-review-route",
        headers=_ORG_H,
        json={
            "intake_text": "x",
            "finalize_answers": "",
            "agreement_text": "y" * 120,
            "party_count": 2,
            "agreement_family": "partnership",
        },
    )
    assert res.status_code == 200
    b = res.json()
    assert b["route"] == "review"
    assert b["confidence"] == "medium"
    assert b["send_readiness_score"] == 100
    assert b["recommended_cta"] == "Start collaborative review"


def test_premium_review_route_fallback_on_llm_failure(monkeypatch, tmp_path):
    monkeypatch.setenv("CLAW_DATA_DIR", str(tmp_path))
    monkeypatch.setenv("CLAW_USAGE_ECONOMICS_DB_PATH", str(tmp_path / "usage.sqlite3"))
    import backend.routers.agreements_v2_api as av2

    def boom(*args, **kwargs):
        raise RuntimeError("down")

    monkeypatch.setattr(av2, "call_legal_llm", boom)
    client = TestClient(app)
    res = client.post(
        "/api/agreements/premium-review-route",
        headers=_ORG_H,
        json={
            "intake_text": "x",
            "finalize_answers": "",
            "agreement_text": "z" * 200,
            "party_count": 2,
            "agreement_family": "partnership",
        },
    )
    assert res.status_code == 200
    b = res.json()
    assert b["route"] in ("signature", "review", "fix")
    assert b["recommended_cta"] in ("Send with confidence", "Start collaborative review", "Make these quick upgrades")


def test_premium_review_route_warehouse_downgrades_fix_to_review(monkeypatch, tmp_path):
    monkeypatch.setenv("CLAW_DATA_DIR", str(tmp_path))
    monkeypatch.setenv("CLAW_USAGE_ECONOMICS_DB_PATH", str(tmp_path / "usage.sqlite3"))
    import backend.routers.agreements_v2_api as av2

    def fake_llm(*args, **kwargs):
        return json.dumps(
            {
                "route": "fix",
                "confidence": "medium",
                "unresolved_items": [
                    "Confirm move-out inspection details.",
                    "Confirm exact suspension notice format.",
                ],
                "reasons": ["A few items remain."],
                "send_readiness_score": 58,
                "recommended_cta": "Fix a few items first",
                "short_summary": "Fix before sending.",
            }
        )

    monkeypatch.setattr(av2, "call_legal_llm", fake_llm)
    client = TestClient(app)
    res = client.post(
        "/api/agreements/premium-review-route",
        headers=_ORG_H,
        json={
            "intake_text": "Shared warehouse space agreement.",
            "finalize_answers": "Bays 3 and 4, insurance, access hours",
            "agreement_text": "License fee is $2200 monthly. Party A and Party B agree on shared-space usage and reimbursement terms.",
            "party_count": 2,
            "agreement_family": "shared_space",
        },
    )
    assert res.status_code == 200
    b = res.json()
    assert b["route"] == "review"
    assert b["recommended_cta"] == "Start collaborative review"


def test_premium_review_route_referral_downgrades_fix_to_review(monkeypatch, tmp_path):
    monkeypatch.setenv("CLAW_DATA_DIR", str(tmp_path))
    monkeypatch.setenv("CLAW_USAGE_ECONOMICS_DB_PATH", str(tmp_path / "usage.sqlite3"))
    import backend.routers.agreements_v2_api as av2

    def fake_llm(*args, **kwargs):
        return json.dumps(
            {
                "route": "fix",
                "confidence": "medium",
                "unresolved_items": ["Confirm exact statement delivery format."],
                "reasons": ["Some placeholders remain."],
                "send_readiness_score": 61,
                "recommended_cta": "Fix a few items first",
                "short_summary": "Fix before sending.",
            }
        )

    monkeypatch.setattr(av2, "call_legal_llm", fake_llm)
    client = TestClient(app)
    res = client.post(
        "/api/agreements/premium-review-route",
        headers=_ORG_H,
        json={
            "intake_text": "Referral agreement for B2B leads and commissions.",
            "finalize_answers": "12% commission, payout by 15th, no bypass 24 months.",
            "agreement_text": "Party A pays Party B 12% commission on collected net revenue with monthly payout on the 15th.",
            "party_count": 2,
            "agreement_family": "referral",
        },
    )
    assert res.status_code == 200
    b = res.json()
    assert b["route"] == "review"
    assert b["recommended_cta"] == "Start collaborative review"


def test_premium_review_route_broken_draft_stays_fix(monkeypatch, tmp_path):
    monkeypatch.setenv("CLAW_DATA_DIR", str(tmp_path))
    monkeypatch.setenv("CLAW_USAGE_ECONOMICS_DB_PATH", str(tmp_path / "usage.sqlite3"))
    import backend.routers.agreements_v2_api as av2

    def fake_llm(*args, **kwargs):
        return json.dumps(
            {
                "route": "fix",
                "confidence": "high",
                "unresolved_items": ["Cannot understand economics", "Contradictory payment obligations"],
                "reasons": ["Draft is materially broken."],
                "send_readiness_score": 20,
                "recommended_cta": "Fix a few items first",
                "short_summary": "Broken draft.",
            }
        )

    monkeypatch.setattr(av2, "call_legal_llm", fake_llm)
    client = TestClient(app)
    res = client.post(
        "/api/agreements/premium-review-route",
        headers=_ORG_H,
        json={
            "intake_text": "Any intake",
            "finalize_answers": "",
            "agreement_text": "TBD TBD Party_A Party_B to be agreed",
            "party_count": 2,
            "agreement_family": "services",
        },
    )
    assert res.status_code == 200
    b = res.json()
    assert b["route"] == "fix"
    assert b["recommended_cta"] == "Make these quick upgrades"
    assert b["short_summary"].lower().startswith("almost there")


def test_premium_review_route_clean_deal_stays_signature(monkeypatch, tmp_path):
    monkeypatch.setenv("CLAW_DATA_DIR", str(tmp_path))
    monkeypatch.setenv("CLAW_USAGE_ECONOMICS_DB_PATH", str(tmp_path / "usage.sqlite3"))
    import backend.routers.agreements_v2_api as av2

    def fake_llm(*args, **kwargs):
        return json.dumps(
            {
                "route": "signature",
                "confidence": "high",
                "unresolved_items": [],
                "reasons": ["Material terms are complete."],
                "send_readiness_score": 94,
                "recommended_cta": "Send for signature",
                "short_summary": "Ready to sign.",
            }
        )

    monkeypatch.setattr(av2, "call_legal_llm", fake_llm)
    client = TestClient(app)
    res = client.post(
        "/api/agreements/premium-review-route",
        headers=_ORG_H,
        json={
            "intake_text": "Clean two-party service deal.",
            "finalize_answers": "All details resolved.",
            "agreement_text": "Party A and Party B agree to a $5,000 monthly fee, invoices due net 15, term 12 months, termination for cause with 15-day cure.",
            "party_count": 2,
            "agreement_family": "services",
        },
    )
    assert res.status_code == 200
    b = res.json()
    assert b["route"] == "signature"
    assert b["recommended_cta"] == "Send with confidence"
    assert b["short_summary"].lower().startswith("ready to send")


def test_premium_review_route_polish_coffee_cart_replaces_generic_unresolved(monkeypatch, tmp_path):
    monkeypatch.setenv("CLAW_DATA_DIR", str(tmp_path))
    monkeypatch.setenv("CLAW_USAGE_ECONOMICS_DB_PATH", str(tmp_path / "usage.sqlite3"))
    import backend.routers.agreements_v2_api as av2

    def fake_llm(*args, **kwargs):
        return json.dumps(
            {
                "route": "review",
                "confidence": "medium",
                "unresolved_items": [
                    "Confirm governing law/venue and any remaining review placeholders.",
                    "Review miscellaneous boilerplate sections.",
                ],
                "reasons": ["Needs review."],
                "send_readiness_score": 62,
                "recommended_cta": "Send for review",
                "short_summary": "Review before send.",
            }
        )

    monkeypatch.setattr(av2, "call_legal_llm", fake_llm)
    client = TestClient(app)
    res = client.post(
        "/api/agreements/premium-review-route",
        headers=_ORG_H,
        json={
            "intake_text": "Two cousins running a coffee cart with shared ownership and buyout terms.",
            "finalize_answers": "60/40 ownership, buyout triggers, spending approval limit.",
            "agreement_text": "Party A and Party B agree on profit split and operating reserve.",
            "party_count": 2,
            "agreement_family": "partnership",
        },
    )
    assert res.status_code == 200
    b = res.json()
    assert b["route"] == "review"
    assert b["recommended_cta"] == "Start collaborative review"
    assert b["short_summary"].lower().startswith("best next step")
    assert all("governing law" not in x.lower() for x in b["unresolved_items"])
    joined = " ".join(b["unresolved_items"]).lower()
    assert "ownership" in joined or "buyout" in joined or "spending" in joined


def test_premium_review_route_polish_referral_replaces_generic_unresolved(monkeypatch, tmp_path):
    monkeypatch.setenv("CLAW_DATA_DIR", str(tmp_path))
    monkeypatch.setenv("CLAW_USAGE_ECONOMICS_DB_PATH", str(tmp_path / "usage.sqlite3"))
    import backend.routers.agreements_v2_api as av2

    def fake_llm(*args, **kwargs):
        return json.dumps(
            {
                "route": "review",
                "confidence": "medium",
                "unresolved_items": ["Confirm governing law/venue and any remaining review placeholders."],
                "reasons": ["Needs review."],
                "send_readiness_score": 63,
                "recommended_cta": "Send for review",
                "short_summary": "Review before send.",
            }
        )

    monkeypatch.setattr(av2, "call_legal_llm", fake_llm)
    client = TestClient(app)
    res = client.post(
        "/api/agreements/premium-review-route",
        headers=_ORG_H,
        json={
            "intake_text": "Referral partner agreement with 12% commission and no bypass.",
            "finalize_answers": "Payout on 15th with chargeback offsets.",
            "agreement_text": "Party A pays Party B referral commissions based on net revenue.",
            "party_count": 2,
            "agreement_family": "referral",
        },
    )
    assert res.status_code == 200
    b = res.json()
    assert b["route"] == "review"
    assert b["recommended_cta"] == "Start collaborative review"
    assert b["short_summary"].lower().startswith("best next step")
    joined = " ".join(b["unresolved_items"]).lower()
    assert "commission" in joined or "net-revenue" in joined or "no-bypass" in joined


def test_premium_review_route_unresolved_items_rank_business_risk_first(monkeypatch, tmp_path):
    monkeypatch.setenv("CLAW_DATA_DIR", str(tmp_path))
    monkeypatch.setenv("CLAW_USAGE_ECONOMICS_DB_PATH", str(tmp_path / "usage.sqlite3"))
    import backend.routers.agreements_v2_api as av2

    def fake_llm(*args, **kwargs):
        return json.dumps(
            {
                "route": "review",
                "confidence": "medium",
                "unresolved_items": [
                    "Confirm logistics notice workflow.",
                    "Confirm commission payout cadence and net-revenue definition.",
                    "Confirm ownership/control votes for exceptions.",
                ],
                "reasons": ["Needs review."],
                "send_readiness_score": 66,
                "recommended_cta": "Send for review",
                "short_summary": "Review before send.",
            }
        )

    monkeypatch.setattr(av2, "call_legal_llm", fake_llm)
    client = TestClient(app)
    res = client.post(
        "/api/agreements/premium-review-route",
        headers=_ORG_H,
        json={
            "intake_text": "Referral commission structure for B2B deals.",
            "finalize_answers": "12% commission, net revenue definition pending.",
            "agreement_text": "Party A pays referral commissions monthly.",
            "party_count": 2,
            "agreement_family": "referral",
        },
    )
    assert res.status_code == 200
    b = res.json()
    assert b["route"] == "review"
    assert b["unresolved_items"]
    first = b["unresolved_items"][0].lower()
    assert "commission" in first or "net-revenue" in first or "payout" in first


def test_premium_agreement_review_fail_open_200_when_llm_fails(monkeypatch, tmp_path):
    monkeypatch.setenv("CLAW_DATA_DIR", str(tmp_path))
    monkeypatch.setenv("CLAW_USAGE_ECONOMICS_DB_PATH", str(tmp_path / "usage.sqlite3"))
    import backend.routers.agreements_v2_api as av2

    def boom(*args, **kwargs):
        raise RuntimeError("no_model")

    monkeypatch.setattr(av2, "call_legal_llm", boom)
    client = TestClient(app)
    res = client.post(
        "/api/agreements/premium-review",
        headers=_ORG_H,
        json={
            "intake_text": "Any intake for review failure test.",
            "document_text": "1. SCOPE. X.\n" * 400,
        },
    )
    assert res.status_code == 200
    b = res.json()
    assert b["strengths"] == []
    assert b["missing_or_weak_terms"] == []
    assert b["questions_for_user"] == []
    assert b["suggested_clause_upgrades"] == []
    assert b["priority_score"] == 35


def test_render_html_watermark_emits_label_once_even_when_body_repeats_it():
    from backend.routers.agreements_v2_api import AgreementDraft, AgreementParty, _render_html
    from backend.usage_economics.constants import WATERMARK_LABEL

    long_body = "z" * 2500 + "\n\n" + WATERMARK_LABEL + "\n" + WATERMARK_LABEL
    d = AgreementDraft(
        id="wm-dup-test",
        created_at="c",
        updated_at="u",
        title="Title",
        jurisdiction="DE",
        parties=[
            AgreementParty(name="Alice", role="party_a"),
            AgreementParty(name="Bob", role="party_b"),
        ],
        purpose=long_body,
        payment_terms="net 30",
        duration="1 year",
        due_date=None,
        effective_date="2026-01-01",
        versions=[],
        audit_log=[],
    )
    out = _render_html(d, watermark=True)
    assert out.count(WATERMARK_LABEL) == 1


def test_render_html_watermark_uses_flow_footer_not_absolute_overlay():
    """VS01 seed PDF: watermark must not use a full-page absolute overlay (Story composites it over signatures)."""
    from backend.routers.agreements_v2_api import AgreementDraft, AgreementParty, _render_html
    from backend.usage_economics.constants import WATERMARK_LABEL

    long_body = "z" * 2500 + "\n\n" + WATERMARK_LABEL + "\nBody line.\n"
    d = AgreementDraft(
        id="wm-flow-footer",
        created_at="c",
        updated_at="u",
        title="Title",
        jurisdiction="DE",
        parties=[
            AgreementParty(name="Alice", role="party_a"),
            AgreementParty(name="Bob", role="party_b"),
        ],
        purpose=long_body,
        payment_terms="net 30",
        duration="1 year",
        due_date=None,
        effective_date="2026-01-01",
        versions=[],
        audit_log=[],
    )
    out = _render_html(d, watermark=True)
    assert "position:absolute;inset:0" not in out
    assert "ldg-draft-footer" in out
    assert out.count(WATERMARK_LABEL) == 1


def test_render_html_watermark_not_inside_pre_body_near_signature_fixture():
    """LawDog label must not remain inside <pre> when economics watermark is on (single footer copy)."""
    from backend.routers.agreements_v2_api import AgreementDraft, AgreementParty, _render_html
    from backend.usage_economics.constants import WATERMARK_LABEL

    tail = (
        "\n\nDEVELOPER: _________________________\n"
        "Title: _____________________________\n"
        "Date: ______________________________\n"
    )
    long_body = "z" * 2500 + "\n\n" + WATERMARK_LABEL + "\n\n" + "Section X.\n" + tail
    d = AgreementDraft(
        id="wm-pre-sig",
        created_at="c",
        updated_at="u",
        title="Title",
        jurisdiction="DE",
        parties=[
            AgreementParty(name="Alice", role="party_a"),
            AgreementParty(name="Bob", role="party_b"),
        ],
        purpose=long_body,
        payment_terms="net 30",
        duration="1 year",
        due_date=None,
        effective_date="2026-01-01",
        versions=[],
        audit_log=[],
    )
    out = _render_html(d, watermark=True)
    assert out.count(WATERMARK_LABEL) == 1
    assert "DEVELOPER:" in out
    pre_i = out.find("<pre")
    pre_j = out.find("</pre>")
    assert pre_i != -1 and pre_j != -1 and pre_j > pre_i
    assert WATERMARK_LABEL not in out[pre_i:pre_j]
    assert "ldg-draft-footer" in out


def test_render_html_short_template_watermark_flow_footer():
    from backend.routers.agreements_v2_api import AgreementDraft, AgreementParty, _render_html
    from backend.usage_economics.constants import WATERMARK_LABEL

    d = AgreementDraft(
        id="wm-short",
        created_at="c",
        updated_at="u",
        title="Short T",
        jurisdiction="DE",
        parties=[
            AgreementParty(name="Alice", role="party_a"),
            AgreementParty(name="Bob", role="party_b"),
        ],
        purpose="Short purpose for template path.",
        payment_terms="net 30",
        duration="1 year",
        due_date=None,
        effective_date="2026-01-01",
        versions=[],
        audit_log=[],
    )
    out = _render_html(d, watermark=True)
    assert "position:absolute;inset:0" not in out
    assert "ldg-draft-footer" in out
    assert WATERMARK_LABEL in out
    assert out.count(WATERMARK_LABEL) == 1


def test_vs01_signing_seed_endpoint_ok_with_s3_backend_uses_legacy_finalize(monkeypatch, tmp_path):
    """S3/Object stub must not 503 VS01 seed — finalize_document falls back to legacy files."""
    from backend.storage.artifact_repository import reset_artifact_repository_singleton

    pytest.importorskip("fitz")
    reset_artifact_repository_singleton()
    monkeypatch.setenv("CLAW_DATA_DIR", str(tmp_path))
    monkeypatch.setenv("CLAW_USAGE_ECONOMICS_DB_PATH", str(tmp_path / "usage.sqlite3"))
    monkeypatch.setenv("CLAW_UNIFIED_ARTIFACT_STORE", "1")
    monkeypatch.setenv("CLAW_ARTIFACT_REGISTRY_DB_PATH", str(tmp_path / "artifact_registry.sqlite3"))
    monkeypatch.setenv("CLAW_BLOB_ROOT", str(tmp_path / "blobs"))
    monkeypatch.setenv("CLAW_STORAGE_BACKEND", "s3")
    monkeypatch.setenv("CLAW_DOCUMENTS_DIR", str(tmp_path / "documents"))
    reset_artifact_repository_singleton()
    client = TestClient(app)
    h = {"X-Claw-Org-Id": "test-vs01-seed-s3-fallback"}
    create_res = client.post(
        "/api/agreements/draft",
        headers=h,
        json={
            "title": "VS01 Seed S3 Fallback",
            "jurisdiction": "Delaware",
            "parties": [
                {"name": "Owner Co", "role": "owner", "email": "o2@example.com"},
                {"name": "Other Co", "role": "signer", "email": "s2@example.com"},
            ],
            "purpose": "Testing VS01 signing seed with S3 stub backend.",
            "payment_terms": "$1",
            "duration": "1 month",
            "due_date": None,
            "effective_date": None,
        },
    )
    assert create_res.status_code == 200
    agreement_id = create_res.json()["id"]
    seed = client.post(
        f"/api/agreements/{agreement_id}/vs01-signing-seed",
        headers=h,
        json={},
    )
    assert seed.status_code == 200, seed.text
    body = seed.json()
    assert body.get("document_id", "").startswith("doc_")
    assert len(body.get("content_sha256", "")) == 64
    reset_artifact_repository_singleton()


def test_vs01_signing_seed_endpoint_ok(monkeypatch, tmp_path):
    pytest.importorskip("fitz")
    monkeypatch.setenv("CLAW_DATA_DIR", str(tmp_path))
    monkeypatch.setenv("CLAW_USAGE_ECONOMICS_DB_PATH", str(tmp_path / "usage.sqlite3"))
    client = TestClient(app)
    h = {"X-Claw-Org-Id": "test-vs01-seed-org"}
    create_res = client.post(
        "/api/agreements/draft",
        headers=h,
        json={
            "title": "VS01 Seed Test",
            "jurisdiction": "Delaware",
            "parties": [
                {"name": "Owner Co", "role": "owner", "email": "o@example.com"},
                {"name": "Other Co", "role": "signer", "email": "s@example.com"},
            ],
            "purpose": "Testing VS01 signing seed PDF pipeline.",
            "payment_terms": "$1",
            "duration": "1 month",
            "due_date": None,
            "effective_date": None,
        },
    )
    assert create_res.status_code == 200
    agreement_id = create_res.json()["id"]
    seed = client.post(
        f"/api/agreements/{agreement_id}/vs01-signing-seed",
        headers=h,
        json={},
    )
    assert seed.status_code == 200, seed.text
    body = seed.json()
    assert body.get("ok") is True
    doc_id = body.get("document_id")
    assert isinstance(doc_id, str) and doc_id.startswith("doc_")
    hsh = body.get("content_sha256")
    assert isinstance(hsh, str) and len(hsh) == 64


def test_vs01_signing_seed_ok_when_economics_watermark_raises(monkeypatch, tmp_path):
    """Regression Railway: economics_overlay / store failures must not 503 VS01 signing seed."""
    import backend.routers.agreements_v2_api as agreements_v2_api

    pytest.importorskip("fitz")
    monkeypatch.setenv("CLAW_DATA_DIR", str(tmp_path))
    monkeypatch.setenv("CLAW_USAGE_ECONOMICS_DB_PATH", str(tmp_path / "usage.sqlite3"))
    client = TestClient(app)
    h = {"X-Claw-Org-Id": "test-vs01-seed-econ-fail"}
    create_res = client.post(
        "/api/agreements/draft",
        headers=h,
        json={
            "title": "VS01 Seed Econ FailOpen",
            "jurisdiction": "Delaware",
            "parties": [
                {"name": "Owner Co", "role": "owner", "email": "o@example.com"},
                {"name": "Other Co", "role": "signer", "email": "s@example.com"},
            ],
            "purpose": "Testing VS01 seed when economics watermark lookup fails.",
            "payment_terms": "$1",
            "duration": "1 month",
            "due_date": None,
            "effective_date": None,
        },
    )
    assert create_res.status_code == 200
    agreement_id = create_res.json()["id"]

    def _boom_wm(_agreement_id: str):
        raise RuntimeError("simulated_economics_store_down")

    monkeypatch.setattr(agreements_v2_api, "_watermark_active_for_agreement", _boom_wm)
    seed = client.post(
        f"/api/agreements/{agreement_id}/vs01-signing-seed",
        headers=h,
        json={},
    )
    assert seed.status_code == 200, seed.text
    body = seed.json()
    assert body.get("document_id", "").startswith("doc_")
    assert len(body.get("content_sha256", "")) == 64


def test_vs01_signing_seed_structured_detail_when_render_html_raises(monkeypatch, tmp_path):
    """Unexpected errors in render must return JSON detail with stage/code, not a bare 500 body."""
    import backend.routers.agreements_v2_api as agreements_v2_api

    pytest.importorskip("fitz")
    monkeypatch.setenv("CLAW_DATA_DIR", str(tmp_path))
    monkeypatch.setenv("CLAW_USAGE_ECONOMICS_DB_PATH", str(tmp_path / "usage.sqlite3"))
    client = TestClient(app)
    h = {"X-Claw-Org-Id": "test-vs01-seed-render-err"}
    create_res = client.post(
        "/api/agreements/draft",
        headers=h,
        json={
            "title": "VS01 Seed Render Fail",
            "jurisdiction": "Delaware",
            "parties": [
                {"name": "Owner Co", "role": "owner", "email": "o@example.com"},
                {"name": "Other Co", "role": "signer", "email": "s@example.com"},
            ],
            "purpose": "Testing VS01 signing seed structured errors.",
            "payment_terms": "$1",
            "duration": "1 month",
            "due_date": None,
            "effective_date": None,
        },
    )
    assert create_res.status_code == 200
    agreement_id = create_res.json()["id"]

    def _boom(*_a, **_k):
        raise RuntimeError("simulated_render_failure")

    monkeypatch.setattr(agreements_v2_api, "_render_html", _boom)
    seed = client.post(
        f"/api/agreements/{agreement_id}/vs01-signing-seed",
        headers=h,
        json={},
    )
    assert seed.status_code == 503, seed.text
    detail = seed.json().get("detail")
    assert isinstance(detail, dict)
    assert detail.get("agreement_id") == agreement_id
    assert detail.get("stage") == "render_html"
    assert detail.get("code") == "vs01_signing_seed_render_failed"
    assert detail.get("exc_type") == "RuntimeError"


def test_vs01_signing_seed_structured_detail_when_finalize_storage_exhausted(monkeypatch, tmp_path):
    """503 detail includes documents_candidates when legacy finalize cannot write anywhere."""
    from backend.services import document_service as ds

    pytest.importorskip("fitz")
    monkeypatch.setenv("CLAW_DATA_DIR", str(tmp_path))
    monkeypatch.setenv("CLAW_USAGE_ECONOMICS_DB_PATH", str(tmp_path / "usage.sqlite3"))
    monkeypatch.setattr("backend.services.document_service.unified_artifact_store_enabled", lambda: False)

    def _always_fail(*_a, **_k):
        raise OSError("simulated_no_writable_root")

    monkeypatch.setattr(ds, "_write_legacy_layout", _always_fail)
    client = TestClient(app)
    h = {"X-Claw-Org-Id": "test-vs01-seed-storage-exhausted"}
    create_res = client.post(
        "/api/agreements/draft",
        headers=h,
        json={
            "title": "VS01 Seed Storage Exhausted",
            "jurisdiction": "Delaware",
            "parties": [
                {"name": "Owner Co", "role": "owner", "email": "o@example.com"},
                {"name": "Other Co", "role": "signer", "email": "s@example.com"},
            ],
            "purpose": "Testing finalize structured storage context.",
            "payment_terms": "$1",
            "duration": "1 month",
            "due_date": None,
            "effective_date": None,
        },
    )
    assert create_res.status_code == 200
    agreement_id = create_res.json()["id"]
    seed = client.post(
        f"/api/agreements/{agreement_id}/vs01-signing-seed",
        headers=h,
        json={},
    )
    assert seed.status_code == 503, seed.text
    detail = seed.json().get("detail")
    assert isinstance(detail, dict)
    assert detail.get("agreement_id") == agreement_id
    assert detail.get("stage") == "finalize_document"
    assert detail.get("code") == "vs01_finalize_failed"
    assert detail.get("exc_type") == "OSError"
    assert "documents_candidates" in detail
    assert isinstance(detail.get("documents_candidates"), list)
    assert len(detail["documents_candidates"]) >= 1


def test_vs01_signing_seed_structured_detail_when_finalize_meta_missing_document_id(
    monkeypatch, tmp_path,
):
    pytest.importorskip("fitz")
    monkeypatch.setenv("CLAW_DATA_DIR", str(tmp_path))
    monkeypatch.setenv("CLAW_USAGE_ECONOMICS_DB_PATH", str(tmp_path / "usage.sqlite3"))
    client = TestClient(app)
    h = {"X-Claw-Org-Id": "test-vs01-seed-bad-meta"}
    create_res = client.post(
        "/api/agreements/draft",
        headers=h,
        json={
            "title": "VS01 Seed Bad Meta",
            "jurisdiction": "Delaware",
            "parties": [
                {"name": "Owner Co", "role": "owner", "email": "o3@example.com"},
                {"name": "Other Co", "role": "signer", "email": "s3@example.com"},
            ],
            "purpose": "Testing finalize incomplete response.",
            "payment_terms": "$1",
            "duration": "1 month",
            "due_date": None,
            "effective_date": None,
        },
    )
    assert create_res.status_code == 200
    agreement_id = create_res.json()["id"]

    monkeypatch.setattr(
        "backend.routers.agreements_v2_api.document_service.finalize_document",
        lambda *_a, **_k: {},
    )
    seed = client.post(
        f"/api/agreements/{agreement_id}/vs01-signing-seed",
        headers=h,
        json={},
    )
    assert seed.status_code == 503, seed.text
    detail = seed.json().get("detail")
    assert isinstance(detail, dict)
    assert detail.get("agreement_id") == agreement_id
    assert detail.get("stage") == "response_serialization"
    assert detail.get("code") == "vs01_finalize_incomplete"


def test_recipient_preview_export_pdf_requires_recipient_token_or_org(monkeypatch, tmp_path):
    reset_agreement_pdf_story_capability_cache_for_tests()
    pytest.importorskip("fitz")
    monkeypatch.setenv("CLAW_AGREEMENT_SIGNING_TOKEN_SECRET", "unit-test-signing-secret-for-magic-link")
    monkeypatch.setenv("CLAW_DATA_DIR", str(tmp_path))
    monkeypatch.setenv("CLAW_USAGE_ECONOMICS_DB_PATH", str(tmp_path / "usage.sqlite3"))
    client = TestClient(app)
    create_res = client.post(
        "/api/agreements/draft",
        headers=_ORG_H,
        json={
            "title": "PDF export test",
            "jurisdiction": "DE",
            "parties": [
                {"name": "Owner Co", "role": "owner"},
                {"name": "Signer Co", "role": "signer"},
            ],
            "purpose": "Services",
            "payment_terms": "Net 30",
            "duration": None,
            "due_date": None,
            "effective_date": None,
        },
    )
    assert create_res.status_code == 200
    aid = create_res.json()["id"]
    upd = client.post(
        f"/api/agreements/{aid}/update-field",
        headers=_ORG_H,
        json={
            "field": "parties",
            "value": [
                {"name": "Owner Co", "role": "owner", "id": "pid-owner"},
                {"name": "Signer Co", "role": "signer", "id": "pid-signer"},
            ],
        },
    )
    assert upd.status_code == 200
    mint = client.post(
        f"/api/agreements/{aid}/recipient-access-token",
        headers=_ORG_H,
        json={
            "mode": "review",
            "role": "signer",
            "recipient_party_id": "pid-signer",
            "inviter_display_name": "Owner Co",
        },
    )
    assert mint.status_code == 200
    tok = mint.json()["token"]
    recv_hdr = {"X-Claw-Recipient-Access-Token": tok}

    denied = client.post(
        f"/api/agreements/{aid}/recipient-preview-export-pdf",
        json={"export_kind": "original", "html": "<p>Hello</p>"},
    )
    assert denied.status_code == 403

    bad = client.post(
        f"/api/agreements/{aid}/recipient-preview-export-pdf",
        headers={"X-Claw-Recipient-Access-Token": "not-a-real-token"},
        json={"export_kind": "original", "html": "<p>Hello</p>"},
    )
    assert bad.status_code == 403

    ok = client.post(
        f"/api/agreements/{aid}/recipient-preview-export-pdf",
        headers=recv_hdr,
        json={"export_kind": "original", "html": "<p>Hello PDF</p>"},
    )
    assert ok.status_code == 200
    assert ok.headers.get("content-type", "").startswith("application/pdf")
    cd = ok.headers.get("content-disposition") or ""
    assert "lawdog-original-draft.pdf" in cd
    assert ok.content.startswith(b"%PDF")

    ok_prop = client.post(
        f"/api/agreements/{aid}/recipient-preview-export-pdf",
        headers=recv_hdr,
        json={"export_kind": "proposed", "html": "<p>Proposed only</p>"},
    )
    assert ok_prop.status_code == 200
    assert "lawdog-proposed-draft.pdf" in (ok_prop.headers.get("content-disposition") or "")

    red = client.post(
        f"/api/agreements/{aid}/recipient-preview-export-pdf",
        headers=recv_hdr,
        json={
            "export_kind": "redline",
            "html": "<article><p style='margin:0'><span style='text-decoration:line-through'>Old</span>"
            " <span style='text-decoration:underline'>New</span></p></article>",
        },
    )
    assert red.status_code == 200
    assert "lawdog-redline-preview.pdf" in (red.headers.get("content-disposition") or "")

    empty = client.post(
        f"/api/agreements/{aid}/recipient-preview-export-pdf",
        headers=recv_hdr,
        json={"export_kind": "original", "html": "  \n\t  "},
    )
    assert empty.status_code == 422
