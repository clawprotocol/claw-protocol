"""Production-handler proof for Core Paid Journey drafting facts (model stubbed)."""

from __future__ import annotations

from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from backend.main import app
from backend.tests.entitlement_test_support import ensure_org_pro_entitlement


OWNER = "core-paid-owner"
ORG = f"user-{OWNER}"
FILLED = (
    "Draft a consulting services agreement between Harbor Peak Analytics LLC (Consultant) "
    "and Ironvale Manufacturing Inc. (Client). Scope is AI workflow implementation. "
    "Fixed fee $48,000. Term twelve months starting October 1, 2026. Governing law Delaware. "
    "Consultant owns pre-existing tools; Client owns deliverables after payment."
)


@pytest.fixture
def client(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> TestClient:
    monkeypatch.setenv("CLAW_ENVIRONMENT", "test")
    monkeypatch.setenv("CLAW_COMMERCIAL_MODE", "1")
    monkeypatch.setenv("CLAW_USAGE_ECONOMICS_ENABLED", "1")
    monkeypatch.setenv("CLAW_DATA_DIR", str(tmp_path))
    monkeypatch.setenv("CLAW_ECONOMICS_DB_PATH", str(tmp_path / "economics.sqlite3"))
    monkeypatch.setenv("CLAW_USAGE_ECONOMICS_DB_PATH", str(tmp_path / "usage.sqlite3"))
    monkeypatch.setenv("CLAW_LLM_ACCEPTANCE_STUB", "1")
    monkeypatch.setenv("CLAW_AGREEMENT_SIGNING_TOKEN_SECRET", "core-paid-review-revision-secret")
    monkeypatch.setenv("OPENAI_API_KEY", "sk-acceptance-stub-not-live")
    import backend.routers.agreements_v2_api as av2
    import backend.economics.store as eco_store

    monkeypatch.setattr(av2, "OPENAI_API_KEY", "sk-acceptance-stub-not-live")
    eco_store.reset_economics_store_for_tests()
    ensure_org_pro_entitlement(ORG, user_id=OWNER)
    return TestClient(app, raise_server_exceptions=False)


def _headers() -> dict:
    return {
        "X-Claw-Org-Id": ORG,
        "X-Claw-Test-Auth-User-Id": OWNER,
        "Content-Type": "application/json",
    }


def test_padded_stub_fixture_remains_a_failing_negative_case() -> None:
    from backend.llm_acceptance_stub import PADDED_FILLER, consulting_corpus_padded, stub_legal_llm_completion

    padded = consulting_corpus_padded()
    assert padded.count(PADDED_FILLER.strip()) >= 8
    positive = stub_legal_llm_completion(
        [
            {
                "role": "user",
                "content": FILLED,
            }
        ],
        call_purpose="agreement_drafting",
    )
    assert "Harbor Peak Analytics LLC" in positive
    assert '("Consultant")' in positive or "(\\\"Consultant\\\")" in positive or "Consultant" in positive
    assert padded != positive
    assert positive.count(PADDED_FILLER.strip()) < 8


def test_sparse_stub_does_not_invent_parties(client: TestClient) -> None:
    from backend.llm_acceptance_stub import stub_legal_llm_completion

    sparse = stub_legal_llm_completion(
        [{"role": "user", "content": "need a consulting agreement for about 48k"}],
        call_purpose="agreement_drafting",
    )
    assert "Harbor Peak Analytics LLC" not in sparse
    assert "missing_material_info" in sparse


def test_premium_full_draft_returns_expected_consulting_facts(client: TestClient) -> None:
    res = client.post(
        "/api/agreements/premium-full-draft",
        headers=_headers(),
        json={"intake_text": FILLED, "user_gap_answers": ""},
    )
    assert res.status_code == 200, res.text
    body = res.json()
    doc = str(body.get("document_text") or body.get("server_full_document_text") or "")
    assert "CONSULTING SERVICES AGREEMENT" in doc
    assert "Harbor Peak Analytics LLC" in doc
    assert "Ironvale Manufacturing Inc." in doc
    assert 'Harbor Peak Analytics LLC ("Consultant")' in doc
    assert 'Ironvale Manufacturing Inc. ("Client")' in doc
    assert doc.count("Operative consulting detail on discovery, implementation, acceptance, and handoff.") < 8
    assert "$48,000" in doc
    assert "Delaware" in doc
    assert "AI workflow implementation" in doc
    assert "Orion Labs" not in doc
    assert "[" not in doc or "insert" not in doc.lower()


def test_commercial_es256_bearer_binds_and_sees_pro(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    from backend.jwt_acceptance_jwks import (
        DEFAULT_ISSUER,
        install_acceptance_jwks_fetch_if_configured,
        mint_acceptance_es256_jwt,
        write_acceptance_jwks_bundle,
    )

    bundle = write_acceptance_jwks_bundle(tmp_path)
    monkeypatch.setenv("CLAW_ENVIRONMENT", "test")
    monkeypatch.setenv("CLAW_COMMERCIAL_MODE", "1")
    monkeypatch.setenv("CLAW_USAGE_ECONOMICS_ENABLED", "1")
    monkeypatch.setenv("CLAW_DATA_DIR", str(tmp_path))
    monkeypatch.setenv("CLAW_ECONOMICS_DB_PATH", str(tmp_path / "economics.sqlite3"))
    monkeypatch.setenv("CLAW_USAGE_ECONOMICS_DB_PATH", str(tmp_path / "usage.sqlite3"))
    monkeypatch.setenv("CLAW_JWT_ACCEPTANCE_JWKS_PATH", bundle["jwks_path"])
    monkeypatch.setenv("SUPABASE_JWT_ISSUER", DEFAULT_ISSUER)
    monkeypatch.setenv("SUPABASE_JWT_AUDIENCE", "authenticated")
    import backend.economics.store as eco_store

    eco_store.reset_economics_store_for_tests()
    ensure_org_pro_entitlement(ORG, user_id=OWNER)
    import backend.security.supabase_jwt as jwt_mod

    original_fetch = jwt_mod._fetch_jwks_document
    try:
        assert install_acceptance_jwks_fetch_if_configured() is True
        token = mint_acceptance_es256_jwt(
            OWNER,
            pem_path=Path(bundle["pem_path"]),
            extra={"email": "core.paid.owner@lawdog.test"},
        )
        client = TestClient(app, raise_server_exceptions=False)
        headers = {
            "Authorization": f"Bearer {token}",
            "X-Claw-Org-Id": ORG,
            "Content-Type": "application/json",
        }
        bind = client.post(
            "/v1/workspace/bind-user-org",
            headers=headers,
            json={
                "user_id": OWNER,
                "email": "core.paid.owner@lawdog.test",
                "display_name": "Core Paid Owner",
                "previous_org_id": ORG,
                "claim_method": "session_restore",
            },
        )
        assert bind.status_code == 200, bind.text
        assert bind.json()["org_id"] == ORG
        usage = client.get("/api/agreements/usage/summary", headers=headers)
        assert usage.status_code == 200, usage.text
        body = usage.json()
        commercial = body.get("commercial") or {}
        assert (
            commercial.get("state") == "pro"
            or commercial.get("entitlement") == "paid_pro"
            or body.get("state") == "pro"
            or body.get("tier") in {"paid", "pro"}
        )
    finally:
        jwt_mod._fetch_jwks_document = original_fetch
        jwt_mod.reset_supabase_jwks_cache_for_tests()


def test_review_revision_binding_uses_pending_snapshot_not_signing_lock() -> None:
    from backend.services.accepted_review_snapshot import (
        assert_review_revision_binding,
        create_pending_snapshot,
        current_review_revision_public,
        empty_registry,
        sha256_hex_text,
    )

    corpus = ("Harbor Peak Analytics LLC (Consultant) and Ironvale Manufacturing Inc. (Client). " * 20).strip()
    ok, err, snap, reg = create_pending_snapshot(
        agreement_id="ag-review-rev",
        corpus_plain=corpus,
        registry=empty_registry(),
    )
    assert ok and err is None and snap and reg
    draft = {"canonical_review_snapshots_v1": reg}
    rev = current_review_revision_public(draft, "ag-review-rev")
    assert rev is not None
    assert rev["snapshot_id"] == snap["snapshotId"]
    assert rev["corpus_sha256"] == sha256_hex_text(corpus)
    assert rev["status"] == "pending"
    assert rev["agreement_id"] == "ag-review-rev"
    ok, err, _ = assert_review_revision_binding(draft, "ag-review-rev", "", "")
    assert ok is False and err == "review_revision_required"
    ok, err, _ = assert_review_revision_binding(draft, "ag-review-rev", snap["snapshotId"], "0" * 64)
    assert ok is False and err == "stale_review_revision"
    ok, err, bound = assert_review_revision_binding(
        draft, "ag-review-rev", snap["snapshotId"], rev["corpus_sha256"]
    )
    assert ok is True and err is None and bound == rev


def test_recipient_projection_keeps_only_bound_participant_approval() -> None:
    from backend.services.recipient_draft_projection import project_recipient_agreement_draft

    draft = {
        "parties": [
            {"id": "p-owner", "name": "Harbor Peak Analytics LLC", "role": "owner", "email": "maya@harbor.test"},
            {"id": "p-client", "name": "Ironvale Manufacturing Inc.", "role": "reviewer", "email": "jordan@ironvale.test"},
        ],
        "audit_log": [
            {"event_type": "invite_sent", "at": "2026-09-13T00:00:00Z", "value": {"participant_id": "p-owner"}},
            {
                "event_type": "participant_approved",
                "at": "2026-09-13T00:00:01Z",
                "value": {"participant_id": "p-client", "snapshot_id": "crs_1", "corpus_sha256": "a" * 64},
            },
            {
                "event_type": "participant_approved",
                "at": "2026-09-13T00:00:02Z",
                "value": {"participant_id": "p-other", "snapshot_id": "crs_2"},
            },
        ],
        "recipient_delivery_v1": {"secret": "nope"},
    }
    projected = project_recipient_agreement_draft(draft, recipient_party_id="p-client")
    events = projected.get("audit_log") or []
    assert [event.get("event_type") for event in events] == ["participant_approved"]
    assert events[0]["value"]["participant_id"] == "p-client"
    assert "invite_sent" not in {event.get("event_type") for event in events}
    assert "recipient_delivery_v1" not in projected
    assert all(party.get("email") != "maya@harbor.test" for party in projected.get("parties") or [])


def test_recipient_projection_excludes_missing_ids_and_stale_revision_approvals() -> None:
    from backend.services.accepted_review_snapshot import create_pending_snapshot, empty_registry
    from backend.services.recipient_draft_projection import project_recipient_agreement_draft

    corpus = ("Harbor Peak Analytics LLC (Consultant) and Ironvale Manufacturing Inc. (Client). " * 20).strip()
    ok, err, snap, reg = create_pending_snapshot(
        agreement_id="ag-proj-rev",
        corpus_plain=corpus,
        registry=empty_registry(),
    )
    assert ok and err is None and snap and reg
    draft = {
        "id": "ag-proj-rev",
        "parties": [
            {"id": "p-client", "name": "Ironvale Manufacturing Inc.", "role": "reviewer"},
        ],
        "canonical_review_snapshots_v1": reg,
        "audit_log": [
            {
                "event_type": "participant_approved",
                "at": "2026-09-13T00:00:01Z",
                "value": {"snapshot_id": snap["snapshotId"], "corpus_sha256": "a" * 64},
            },
            {
                "event_type": "participant_approved",
                "at": "2026-09-13T00:00:02Z",
                "value": {
                    "participant_id": "p-other",
                    "snapshot_id": snap["snapshotId"],
                },
            },
            {
                "event_type": "participant_approved",
                "at": "2026-09-13T00:00:03Z",
                "value": {
                    "participant_id": "p-client",
                    "snapshot_id": "crs_earlier",
                    "corpus_sha256": "b" * 64,
                },
            },
        ],
    }
    projected = project_recipient_agreement_draft(draft, recipient_party_id="p-client")
    assert projected.get("audit_log") in (None, [])

    current_ok = {
        **draft,
        "audit_log": [
            {
                "event_type": "participant_approved",
                "at": "2026-09-13T00:00:04Z",
                "value": {
                    "participant_id": "p-client",
                    "snapshot_id": snap["snapshotId"],
                    "corpus_sha256": snap.get("corpusSha256") or snap.get("corpus_sha256"),
                },
            }
        ],
    }
    current = project_recipient_agreement_draft(current_ok, recipient_party_id="p-client")
    events = current.get("audit_log") or []
    assert [event.get("event_type") for event in events] == ["participant_approved"]
    assert events[0]["value"]["participant_id"] == "p-client"
    assert events[0]["value"]["snapshot_id"] == snap["snapshotId"]


def test_review_revision_binding_rejects_missing_corrupt_and_wrong_agreement_when_required() -> None:
    from backend.services.accepted_review_snapshot import (
        assert_review_revision_binding,
        create_pending_snapshot,
        empty_registry,
        is_pure_legacy_pre_cutover,
        review_snapshot_authority_required,
        sha256_hex_text,
    )

    flagged = {
        "canonical_review_snapshots_v1": {
            **empty_registry(),
            "commercialSnapshotAuthorityRequired": True,
        }
    }
    assert review_snapshot_authority_required(flagged) is True
    ok, err, rev = assert_review_revision_binding(flagged, "ag-flagged", "", "")
    assert ok is False and err == "review_revision_required" and rev is None

    corpus = ("Harbor Peak Analytics LLC (Consultant) and Ironvale Manufacturing Inc. (Client). " * 20).strip()
    ok, err, snap, reg = create_pending_snapshot(
        agreement_id="ag-corrupt",
        corpus_plain=corpus,
        registry=empty_registry(),
    )
    assert ok and snap and reg
    broken = dict(reg)
    snaps = dict(broken.get("snapshots") or {})
    row = dict(snaps[snap["snapshotId"]])
    row["corpusPlain"] = corpus + "\nCORRUPT"
    snaps[snap["snapshotId"]] = row
    broken["snapshots"] = snaps
    corrupt_draft = {"canonical_review_snapshots_v1": broken}
    ok, err, _ = assert_review_revision_binding(
        corrupt_draft, "ag-corrupt", snap["snapshotId"], sha256_hex_text(corpus)
    )
    assert ok is False
    assert err in {
        "accepted_snapshot_digest_mismatch",
        "accepted_snapshot_length_mismatch",
        "review_revision_invalid",
    }

    ok, err, foreign, foreign_reg = create_pending_snapshot(
        agreement_id="ag-other",
        corpus_plain=corpus,
        registry=empty_registry(),
    )
    assert ok and foreign and foreign_reg
    foreign_draft = {"canonical_review_snapshots_v1": foreign_reg}
    ok, err, _ = assert_review_revision_binding(
        foreign_draft, "ag-this", foreign["snapshotId"], sha256_hex_text(corpus)
    )
    assert ok is False and err == "snapshot_agreement_mismatch"

    legacy = {
        "vs01_signing_packet_v1": {"portable": {"seed": {"corpusPlain": "legacy sealed " * 40}}},
    }
    assert is_pure_legacy_pre_cutover(legacy) is True
    assert review_snapshot_authority_required(legacy) is False
    ok, err, _ = assert_review_revision_binding(legacy, "ag-legacy", "", "")
    assert ok is True and err is None


def test_recipient_review_revision_projected_and_stale_approve_rejected(client: TestClient) -> None:
    create = client.post(
        "/api/agreements/draft",
        headers=_headers(),
        json={
            "title": "Consulting Services Agreement",
            "jurisdiction": "DE",
            "parties": [
                {"id": "p-owner", "name": "Harbor Peak Analytics LLC", "role": "owner", "email": "maya@harbor.test"},
                {"id": "p-client", "name": "Ironvale Manufacturing Inc.", "role": "signer", "email": "jordan@ironvale.test"},
            ],
            "purpose": "AI workflow implementation",
            "payment_terms": "$48,000",
            "duration": "twelve months",
            "due_date": None,
            "effective_date": "2026-10-01",
        },
    )
    assert create.status_code == 200, create.text
    aid = create.json()["id"]
    corpus = ("CONSULTING SERVICES AGREEMENT\nHarbor Peak Analytics LLC (Consultant)\n" * 18).strip()
    snap = client.post(
        f"/api/agreements/{aid}/canonical-review-snapshot",
        headers=_headers(),
        json={"corpus_plain": corpus},
    )
    assert snap.status_code == 200, snap.text
    snapshot_id = str(snap.json().get("snapshot_id") or snap.json().get("snapshotId") or "")
    digest = str(snap.json().get("corpus_sha256") or snap.json().get("corpusSha256") or "")
    if not snapshot_id:
        frag = snap.json().get("snapshot") or {}
        snapshot_id = str(frag.get("snapshot_id") or frag.get("snapshotId") or "")
        digest = str(frag.get("corpus_sha256") or frag.get("corpusSha256") or digest)
    mint = client.post(
        f"/api/agreements/{aid}/recipient-access-token",
        headers=_headers(),
        json={"mode": "review", "role": "signer", "recipient_party_id": "p-client"},
    )
    assert mint.status_code == 200, mint.text
    tok = mint.json()["token"]
    rh = {"X-Claw-Recipient-Access-Token": tok}
    got = client.get(f"/api/agreements/{aid}", headers=rh)
    assert got.status_code == 200, got.text
    rev = got.json().get("review_revision") or {}
    assert rev.get("snapshot_id")
    assert rev.get("corpus_sha256")
    assert rev.get("status") == "pending"
    assert rev.get("agreement_id") == aid
    assert rev.get("participant_id") == "p-client"
    assert not (got.json().get("signing_lock") or {}).get("locked_version_id")
    missing = client.post(
        f"/api/agreements/{aid}/recipient-approve",
        headers=rh,
        json={"participant_id": "p-client", "participant_display_name": "Jordan Hale"},
    )
    assert missing.status_code == 400, missing.text
    assert missing.json()["detail"]["code"] == "review_revision_required"
    stale = client.post(
        f"/api/agreements/{aid}/recipient-approve",
        headers=rh,
        json={
            "participant_id": "p-client",
            "participant_display_name": "Jordan Hale",
            "snapshot_id": snapshot_id or rev["snapshot_id"],
            "expected_digest": "0" * 64,
        },
    )
    assert stale.status_code == 409, stale.text
    assert stale.json()["detail"]["code"] == "stale_review_revision"
    ok = client.post(
        f"/api/agreements/{aid}/recipient-approve",
        headers=rh,
        json={
            "participant_id": "p-client",
            "participant_display_name": "Jordan Hale",
            "snapshot_id": rev["snapshot_id"],
            "expected_digest": rev["corpus_sha256"],
        },
    )
    assert ok.status_code == 200, ok.text
    events = (ok.json().get("draft") or {}).get("audit_log") or []
    approved = [e for e in events if (e.get("event_type") or "") in {"recipient_approved", "participant_approved"}]
    assert approved
    assert any((e.get("value") or {}).get("snapshot_id") == rev["snapshot_id"] for e in approved if isinstance(e.get("value"), dict))
    after = client.get(f"/api/agreements/{aid}", headers=rh)
    assert after.status_code == 200, after.text
    projected = (after.json().get("draft") or {}).get("audit_log") or []
    projected_types = {str(event.get("event_type") or "") for event in projected}
    assert "participant_approved" in projected_types or "recipient_approved" in projected_types
    assert "invite_sent" not in projected_types
    assert all(
        str((event.get("value") or {}).get("participant_id") or "") in {"", "p-client"}
        for event in projected
        if str(event.get("event_type") or "") in {"recipient_approved", "participant_approved"}
    )


def _approve_audit_count(draft: dict) -> int:
    return sum(
        1
        for event in draft.get("audit_log") or []
        if (event.get("event_type") or "") in {"recipient_approved", "participant_approved"}
    )


def test_missing_snapshot_authority_rejects_approve_without_mutating_state(client: TestClient) -> None:
    from backend.services.accepted_review_snapshot import empty_registry
    from backend.services.agreement_draft_store import load_draft, save_draft

    create = client.post(
        "/api/agreements/draft",
        headers=_headers(),
        json={
            "title": "Consulting Services Agreement",
            "jurisdiction": "DE",
            "parties": [
                {"id": "p-owner", "name": "Harbor Peak Analytics LLC", "role": "owner", "email": "maya@harbor.test"},
                {"id": "p-client", "name": "Ironvale Manufacturing Inc.", "role": "signer", "email": "jordan@ironvale.test"},
            ],
            "purpose": "AI workflow implementation",
            "payment_terms": "$48,000",
            "duration": "twelve months",
            "due_date": None,
            "effective_date": "2026-10-01",
        },
    )
    assert create.status_code == 200, create.text
    aid = create.json()["id"]
    draft = load_draft(aid)
    before_audit = _approve_audit_count(draft)
    before_updated = draft.get("updated_at")
    reg = dict(draft.get("canonical_review_snapshots_v1") or empty_registry())
    reg["commercialSnapshotAuthorityRequired"] = True
    draft["canonical_review_snapshots_v1"] = reg
    save_draft(draft)
    mint = client.post(
        f"/api/agreements/{aid}/recipient-access-token",
        headers=_headers(),
        json={"mode": "review", "role": "signer", "recipient_party_id": "p-client"},
    )
    assert mint.status_code == 200, mint.text
    rh = {"X-Claw-Recipient-Access-Token": mint.json()["token"]}
    rejected = client.post(
        f"/api/agreements/{aid}/recipient-approve",
        headers=rh,
        json={
            "participant_id": "p-client",
            "participant_display_name": "Jordan Hale",
            "snapshot_id": "crs_missing",
            "expected_digest": "a" * 64,
        },
    )
    assert rejected.status_code == 400, rejected.text
    assert rejected.json()["detail"]["code"] == "review_revision_required"
    after = load_draft(aid)
    assert _approve_audit_count(after) == before_audit
    assert after.get("updated_at") == before_updated


def test_corrupt_snapshot_rejects_approve_without_mutating_state(client: TestClient) -> None:
    from backend.services.agreement_draft_store import load_draft, save_draft

    create = client.post(
        "/api/agreements/draft",
        headers=_headers(),
        json={
            "title": "Consulting Services Agreement",
            "jurisdiction": "DE",
            "parties": [
                {"id": "p-owner", "name": "Harbor Peak Analytics LLC", "role": "owner", "email": "maya@harbor.test"},
                {"id": "p-client", "name": "Ironvale Manufacturing Inc.", "role": "signer", "email": "jordan@ironvale.test"},
            ],
            "purpose": "AI workflow implementation",
            "payment_terms": "$48,000",
            "duration": "twelve months",
            "due_date": None,
            "effective_date": "2026-10-01",
        },
    )
    assert create.status_code == 200, create.text
    aid = create.json()["id"]
    corpus = ("CONSULTING SERVICES AGREEMENT\nHarbor Peak Analytics LLC (Consultant)\n" * 18).strip()
    snap = client.post(
        f"/api/agreements/{aid}/canonical-review-snapshot",
        headers=_headers(),
        json={"corpus_plain": corpus},
    )
    assert snap.status_code == 200, snap.text
    frag = snap.json().get("snapshot") or snap.json()
    snapshot_id = str(frag.get("snapshot_id") or frag.get("snapshotId") or "")
    digest = str(frag.get("corpus_sha256") or frag.get("corpusSha256") or "")
    draft = load_draft(aid)
    before_audit = _approve_audit_count(draft)
    reg = dict(draft.get("canonical_review_snapshots_v1") or {})
    snaps = dict(reg.get("snapshots") or {})
    row = dict(snaps.get(snapshot_id) or {})
    row["corpusPlain"] = corpus + "\nCORRUPT"
    snaps[snapshot_id] = row
    reg["snapshots"] = snaps
    draft["canonical_review_snapshots_v1"] = reg
    save_draft(draft)
    mint = client.post(
        f"/api/agreements/{aid}/recipient-access-token",
        headers=_headers(),
        json={"mode": "review", "role": "signer", "recipient_party_id": "p-client"},
    )
    assert mint.status_code == 200, mint.text
    rh = {"X-Claw-Recipient-Access-Token": mint.json()["token"]}
    rejected = client.post(
        f"/api/agreements/{aid}/recipient-approve",
        headers=rh,
        json={
            "participant_id": "p-client",
            "participant_display_name": "Jordan Hale",
            "snapshot_id": snapshot_id,
            "expected_digest": digest,
        },
    )
    assert rejected.status_code == 400, rejected.text
    assert rejected.json()["detail"]["code"] in {
        "accepted_snapshot_digest_mismatch",
        "accepted_snapshot_length_mismatch",
        "review_revision_invalid",
    }
    after = load_draft(aid)
    assert _approve_audit_count(after) == before_audit


def _harbor_ironvale_payload() -> dict:
    return {
        "title": "Consulting Services Agreement",
        "jurisdiction": "DE",
        "parties": [
            {"id": "p-owner", "name": "Harbor Peak Analytics LLC", "role": "owner", "email": "maya@harbor.test"},
            {"id": "p-client", "name": "Ironvale Manufacturing Inc.", "role": "signer", "email": "jordan@ironvale.test"},
        ],
        "purpose": "AI workflow implementation",
        "payment_terms": "$48,000",
        "duration": "twelve months",
        "due_date": None,
        "effective_date": "2026-10-01",
    }


def _esign_consent() -> dict:
    from backend.services.vs01_completion_evidence import (
        CONSENT_ACTION,
        CONSENT_INTENT_STATEMENT,
        CONSENT_INTENT_VERSION,
    )

    return {
        "accepted": True,
        "intent_version": CONSENT_INTENT_VERSION,
        "intent_statement": CONSENT_INTENT_STATEMENT,
        "action": CONSENT_ACTION,
    }


def test_direct_signature_track_lock_without_review_approval(client: TestClient) -> None:
    create = client.post("/api/agreements/draft", headers=_headers(), json=_harbor_ironvale_payload())
    assert create.status_code == 200, create.text
    aid = create.json()["id"]
    blocked = client.put(
        f"/api/agreements/{aid}/signing-lock",
        headers=_headers(),
        json={"locked_version_id": "lv-review-gate", "locked_at": "2026-09-13T00:00:00Z", "locked_by": "owner"},
    )
    assert blocked.status_code == 400, blocked.text
    assert blocked.json()["detail"]["code"] == "approvals_incomplete"
    track = client.post(
        f"/api/agreements/{aid}/update-field",
        headers=_headers(),
        json={"field": "owner_delivery_track", "value": "signature"},
    )
    assert track.status_code == 200, track.text
    lock = client.put(
        f"/api/agreements/{aid}/signing-lock",
        headers=_headers(),
        json={"locked_version_id": "lv-direct-1", "locked_at": "2026-09-13T00:00:00Z", "locked_by": "owner"},
    )
    assert lock.status_code == 200, lock.text
    got = client.get(f"/api/agreements/{aid}", headers=_headers())
    assert (got.json().get("signing_lock") or {}).get("locked_version_id") == "lv-direct-1"


def test_direct_signature_mints_and_owner_ceremony_without_prior_approval(client: TestClient) -> None:
    create = client.post("/api/agreements/draft", headers=_headers(), json=_harbor_ironvale_payload())
    assert create.status_code == 200, create.text
    aid = create.json()["id"]
    track = client.post(
        f"/api/agreements/{aid}/update-field",
        headers=_headers(),
        json={"field": "owner_delivery_track", "value": "signature"},
    )
    assert track.status_code == 200, track.text
    lock = client.put(
        f"/api/agreements/{aid}/signing-lock",
        headers=_headers(),
        json={"locked_version_id": "lv-direct-2", "locked_at": "2026-09-13T00:00:00Z", "locked_by": "owner"},
    )
    assert lock.status_code == 200, lock.text
    owner_mint = client.post(
        f"/api/agreements/{aid}/recipient-access-token",
        headers=_headers(),
        json={"mode": "sign", "role": "signer", "recipient_party_id": "p-owner"},
    )
    assert owner_mint.status_code == 200, owner_mint.text
    client_mint = client.post(
        f"/api/agreements/{aid}/recipient-access-token",
        headers=_headers(),
        json={"mode": "sign", "role": "signer", "recipient_party_id": "p-client"},
    )
    assert client_mint.status_code == 200, client_mint.text
    owner_hdr = {"X-Claw-Recipient-Access-Token": owner_mint.json()["token"]}
    start = client.post(
        f"/api/agreements/{aid}/signing-ceremony/start",
        headers=owner_hdr,
        json={"participant_id": "p-owner"},
    )
    assert start.status_code == 200, start.text
    done = client.post(
        f"/api/agreements/{aid}/signing-ceremony/complete",
        headers=owner_hdr,
        json={
            "participant_id": "p-owner",
            "typed_name": "Maya Chen",
            "locked_version_id": "lv-direct-2",
            "consent": _esign_consent(),
        },
    )
    assert done.status_code == 200, done.text
    assert done.json().get("participant_id") == "p-owner"
    client_hdr = {"X-Claw-Recipient-Access-Token": client_mint.json()["token"]}
    start_c = client.post(
        f"/api/agreements/{aid}/signing-ceremony/start",
        headers=client_hdr,
        json={"participant_id": "p-client"},
    )
    assert start_c.status_code == 200, start_c.text
    done_c = client.post(
        f"/api/agreements/{aid}/signing-ceremony/complete",
        headers=client_hdr,
        json={
            "participant_id": "p-client",
            "typed_name": "Jordan Hale",
            "locked_version_id": "lv-direct-2",
            "consent": _esign_consent(),
        },
    )
    assert done_c.status_code == 200, done_c.text
    assert done_c.json().get("fully_executed") is True


def test_direct_signature_owner_and_reviewer_roles_become_fully_executed(client: TestClient) -> None:
    payload = _harbor_ironvale_payload()
    payload["parties"][1]["role"] = "reviewer"
    create = client.post("/api/agreements/draft", headers=_headers(), json=payload)
    assert create.status_code == 200, create.text
    aid = create.json()["id"]
    client.post(
        f"/api/agreements/{aid}/update-field",
        headers=_headers(),
        json={"field": "owner_delivery_track", "value": "signature"},
    )
    client.put(
        f"/api/agreements/{aid}/signing-lock",
        headers=_headers(),
        json={"locked_version_id": "lv-direct-roles", "locked_at": "2026-09-13T00:00:00Z", "locked_by": "owner"},
    )
    owner_mint = client.post(
        f"/api/agreements/{aid}/recipient-access-token",
        headers=_headers(),
        json={"mode": "sign", "role": "signer", "recipient_party_id": "p-owner"},
    )
    client_mint = client.post(
        f"/api/agreements/{aid}/recipient-access-token",
        headers=_headers(),
        json={"mode": "sign", "role": "signer", "recipient_party_id": "p-client"},
    )
    owner_hdr = {"X-Claw-Recipient-Access-Token": owner_mint.json()["token"]}
    client.post(
        f"/api/agreements/{aid}/signing-ceremony/start",
        headers=owner_hdr,
        json={"participant_id": "p-owner"},
    )
    first = client.post(
        f"/api/agreements/{aid}/signing-ceremony/complete",
        headers=owner_hdr,
        json={
            "participant_id": "p-owner",
            "typed_name": "Maya Chen",
            "locked_version_id": "lv-direct-roles",
            "consent": _esign_consent(),
        },
    )
    assert first.status_code == 200, first.text
    assert first.json().get("fully_executed") is False
    client_hdr = {"X-Claw-Recipient-Access-Token": client_mint.json()["token"]}
    client.post(
        f"/api/agreements/{aid}/signing-ceremony/start",
        headers=client_hdr,
        json={"participant_id": "p-client"},
    )
    second = client.post(
        f"/api/agreements/{aid}/signing-ceremony/complete",
        headers=client_hdr,
        json={
            "participant_id": "p-client",
            "typed_name": "Jordan Hale",
            "locked_version_id": "lv-direct-roles",
            "consent": _esign_consent(),
        },
    )
    assert second.status_code == 200, second.text
    assert second.json().get("fully_executed") is True


def test_review_track_ceremony_still_requires_signer_approval(client: TestClient) -> None:
    create = client.post("/api/agreements/draft", headers=_headers(), json=_harbor_ironvale_payload())
    assert create.status_code == 200, create.text
    aid = create.json()["id"]
    client.post(
        f"/api/agreements/{aid}/update-field",
        headers=_headers(),
        json={"field": "owner_delivery_track", "value": "review"},
    )
    from backend.services.agreement_signing_lock_store import write_signing_lock

    write_signing_lock(aid, {"locked_version_id": "lv-review-1", "content_sha256": ""})
    minted = client.post(
        f"/api/agreements/{aid}/recipient-access-token",
        headers=_headers(),
        json={"mode": "sign", "role": "signer", "recipient_party_id": "p-client"},
    )
    assert minted.status_code == 200, minted.text
    rh = {"X-Claw-Recipient-Access-Token": minted.json()["token"]}
    start = client.post(
        f"/api/agreements/{aid}/signing-ceremony/start",
        headers=rh,
        json={"participant_id": "p-client"},
    )
    assert start.status_code == 403, start.text


def test_signing_lock_binds_accepted_snapshot_and_rejects_mismatched_body() -> None:
    from backend.services.accepted_review_snapshot import (
        assert_signing_lock_bound_to_snapshot,
        create_pending_snapshot,
        empty_registry,
        sha256_hex_text,
    )

    corpus_a = (
        "CONSULTING SERVICES AGREEMENT\nHarbor Peak Analytics LLC (Consultant) "
        "and Ironvale Manufacturing Inc. (Client). Fixed fee $48,000. Term twelve months.\n"
        * 8
    ).strip()
    corpus_b = corpus_a.replace("twelve months", "six months")
    assert "Harbor Peak Analytics LLC" in corpus_b and "$48,000" in corpus_b
    ok, err, snap, _reg = create_pending_snapshot(
        agreement_id="ag-lock-bind",
        corpus_plain=corpus_a,
        registry=empty_registry(),
    )
    assert ok and snap and not err
    lock = {
        "locked_version_id": "lv-1",
        "accepted_snapshot_id": snap["snapshotId"],
        "accepted_snapshot_digest": sha256_hex_text(corpus_a),
    }
    assert assert_signing_lock_bound_to_snapshot(lock, snap["snapshotId"], sha256_hex_text(corpus_a)) == (True, None)
    assert assert_signing_lock_bound_to_snapshot(lock, "crs_other", sha256_hex_text(corpus_a))[0] is False
    assert assert_signing_lock_bound_to_snapshot(lock, snap["snapshotId"], sha256_hex_text(corpus_b)) == (
        False,
        "lock_snapshot_digest_mismatch",
    )
    assert assert_signing_lock_bound_to_snapshot({"locked_version_id": "lv-1"}, snap["snapshotId"], sha256_hex_text(corpus_a)) == (
        False,
        "lock_snapshot_binding_missing",
    )


def test_direct_signature_lock_binds_snapshot_and_survives_clause_change(client: TestClient) -> None:
    create = client.post("/api/agreements/draft", headers=_headers(), json=_harbor_ironvale_payload())
    assert create.status_code == 200, create.text
    aid = create.json()["id"]
    corpus_a = (
        "CONSULTING SERVICES AGREEMENT\nHarbor Peak Analytics LLC (Consultant) "
        "and Ironvale Manufacturing Inc. (Client). Fixed fee $48,000. Term twelve months.\n"
        * 8
    ).strip()
    corpus_b = corpus_a.replace("twelve months", "six months")
    snap = client.post(
        f"/api/agreements/{aid}/canonical-review-snapshot",
        headers=_headers(),
        json={"corpus_plain": corpus_a},
    )
    assert snap.status_code == 200, snap.text
    snapshot_id = str(snap.json().get("snapshot_id") or snap.json().get("snapshotId") or "")
    digest = str(snap.json().get("corpus_sha256") or snap.json().get("corpusSha256") or "")
    if not snapshot_id:
        frag = snap.json().get("snapshot") or {}
        snapshot_id = str(frag.get("snapshot_id") or frag.get("snapshotId") or "")
        digest = str(frag.get("corpus_sha256") or frag.get("corpusSha256") or digest)
    client.post(
        f"/api/agreements/{aid}/canonical-review-snapshot/accept",
        headers=_headers(),
        json={"snapshot_id": snapshot_id, "expected_digest": digest},
    )
    client.post(
        f"/api/agreements/{aid}/update-field",
        headers=_headers(),
        json={"field": "owner_delivery_track", "value": "signature"},
    )
    lock = client.put(
        f"/api/agreements/{aid}/signing-lock",
        headers=_headers(),
        json={"locked_version_id": "lv-bound-1", "locked_at": "2026-09-13T00:00:00Z", "locked_by": "owner"},
    )
    assert lock.status_code == 200, lock.text
    bound = (lock.json().get("signing_lock") or {})
    assert bound.get("accepted_snapshot_id") == snapshot_id
    assert bound.get("accepted_snapshot_digest") == digest
    changed = client.post(
        f"/api/agreements/{aid}/canonical-review-snapshot",
        headers=_headers(),
        json={"corpus_plain": corpus_b},
    )
    assert changed.status_code in {200, 400, 409}, changed.text
    minted = client.post(
        f"/api/agreements/{aid}/recipient-access-token",
        headers=_headers(),
        json={"mode": "sign", "role": "signer", "recipient_party_id": "p-client"},
    )
    assert minted.status_code == 200, minted.text
    got = client.get(
        f"/api/agreements/{aid}",
        headers={"X-Claw-Recipient-Access-Token": minted.json()["token"]},
    )
    assert got.status_code == 200, got.text
    rev = got.json().get("review_revision") or {}
    assert rev.get("snapshot_id") == snapshot_id
    assert rev.get("corpus_sha256") == digest
    assert "twelve months" in str(rev.get("corpus_plain") or "")
    assert "six months" not in str(rev.get("corpus_plain") or "")
    lock_out = got.json().get("signing_lock") or {}
    assert lock_out.get("accepted_snapshot_id") == snapshot_id
    assert lock_out.get("accepted_snapshot_digest") == digest
    from backend.services.accepted_review_snapshot import assert_signing_lock_bound_to_snapshot, sha256_hex_text

    assert assert_signing_lock_bound_to_snapshot(lock_out, snapshot_id, digest) == (True, None)
    assert assert_signing_lock_bound_to_snapshot(lock_out, snapshot_id, sha256_hex_text(corpus_b))[0] is False
