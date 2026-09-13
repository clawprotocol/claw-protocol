"""Production-handler proof for Core Paid Journey drafting facts (model stubbed)."""

from __future__ import annotations

from pathlib import Path
from typing import Optional

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
    from backend.storage.artifact_repository import reset_artifact_repository_singleton

    reset_artifact_repository_singleton()
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


def _snapshot_corpus() -> str:
    return (
        "CONSULTING SERVICES AGREEMENT\nHarbor Peak Analytics LLC (Consultant) "
        "and Ironvale Manufacturing Inc. (Client). Fixed fee $48,000. Term twelve months.\n"
        * 8
    ).strip()


def _accept_snapshot(client: TestClient, aid: str, corpus: Optional[str] = None) -> tuple[str, str]:
    body = corpus or _snapshot_corpus()
    snap = client.post(
        f"/api/agreements/{aid}/canonical-review-snapshot",
        headers=_headers(),
        json={"corpus_plain": body},
    )
    assert snap.status_code == 200, snap.text
    snapshot_id = str(snap.json().get("snapshot_id") or snap.json().get("snapshotId") or "")
    digest = str(snap.json().get("corpus_sha256") or snap.json().get("corpusSha256") or "")
    if not snapshot_id:
        frag = snap.json().get("snapshot") or {}
        snapshot_id = str(frag.get("snapshot_id") or frag.get("snapshotId") or "")
        digest = str(frag.get("corpus_sha256") or frag.get("corpusSha256") or digest)
    acc = client.post(
        f"/api/agreements/{aid}/canonical-review-snapshot/accept",
        headers=_headers(),
        json={"snapshot_id": snapshot_id, "expected_digest": digest},
    )
    assert acc.status_code == 200, acc.text
    return snapshot_id, digest


def _detail_code(res) -> str:
    detail = res.json().get("detail")
    if isinstance(detail, dict):
        return str(detail.get("code") or "")
    return str(detail or "")


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
    missing_bind = client.put(
        f"/api/agreements/{aid}/signing-lock",
        headers=_headers(),
        json={"locked_version_id": "lv-direct-1", "locked_at": "2026-09-13T00:00:00Z", "locked_by": "owner"},
    )
    assert missing_bind.status_code == 400, missing_bind.text
    assert _detail_code(missing_bind) == "accepted_review_snapshot_required"
    from backend.services.agreement_signing_lock_store import read_signing_lock

    assert read_signing_lock(aid) is None
    snap_id, digest = _accept_snapshot(client, aid)
    lock = client.put(
        f"/api/agreements/{aid}/signing-lock",
        headers=_headers(),
        json={"locked_version_id": "lv-direct-1", "locked_at": "2026-09-13T00:00:00Z", "locked_by": "owner"},
    )
    assert lock.status_code == 200, lock.text
    got = client.get(f"/api/agreements/{aid}", headers=_headers())
    bound = got.json().get("signing_lock") or {}
    assert bound.get("locked_version_id") == "lv-direct-1"
    assert bound.get("accepted_snapshot_id") == snap_id
    assert bound.get("accepted_snapshot_digest") == digest
    assert got.json().get("authority_mode") == "accepted_review_snapshot"
    assert got.json().get("legacy_pre_cutover") is False


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
    _accept_snapshot(client, aid)
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
    issued = done_c.json().get("finalized_receipt") or {}
    assert issued.get("status") == "bound"
    assert issued.get("bound") is True
    assert str(issued.get("receipt_id") or "").startswith("agr_rcpt_")
    first = client.get(f"/api/agreements/{aid}/proof-status", headers=_headers())
    assert first.status_code == 200, first.text
    first_rec = first.json().get("finalized_receipt") or {}
    assert first_rec.get("status") == "bound"
    assert first_rec.get("receipt_id") == issued.get("receipt_id")
    assert first_rec.get("agreement_id") == aid
    assert first_rec.get("locked_version_id") == "lv-direct-2"
    assert first_rec.get("accepted_snapshot_id")
    assert len(str(first_rec.get("accepted_snapshot_digest") or "")) == 64
    required = first_rec.get("required_participant_ids") or []
    completed = [
        str(ev.get("participantId") or ev.get("participant_id") or "")
        for ev in (first_rec.get("completion_events") or [])
    ]
    assert sorted(required) == ["p-client", "p-owner"]
    assert sorted(set(completed)) == sorted(required)
    second = client.get(f"/api/agreements/{aid}/proof-status", headers=_headers())
    second_rec = second.json().get("finalized_receipt") or {}
    assert second_rec.get("receipt_id") == first_rec.get("receipt_id")
    assert second_rec.get("receipt_hash_sha256") == first_rec.get("receipt_hash_sha256")
    assert second_rec.get("accepted_snapshot_id") == first_rec.get("accepted_snapshot_id")
    assert second_rec.get("accepted_snapshot_digest") == first_rec.get("accepted_snapshot_digest")


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
    _accept_snapshot(client, aid)
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

    snap_id, digest = _accept_snapshot(client, aid)
    write_signing_lock(
        aid,
        {
            "locked_version_id": "lv-review-1",
            "content_sha256": "",
            "accepted_snapshot_id": snap_id,
            "accepted_snapshot_digest": digest,
        },
    )
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


def test_modern_lock_mint_complete_reject_missing_mismatched_and_invalid_authority(client: TestClient) -> None:
    from backend.services.agreement_draft_store import load_draft, save_draft
    from backend.services.agreement_signing_lock_store import read_signing_lock, write_signing_lock

    create = client.post("/api/agreements/draft", headers=_headers(), json=_harbor_ironvale_payload())
    assert create.status_code == 200, create.text
    aid = create.json()["id"]
    client.post(
        f"/api/agreements/{aid}/update-field",
        headers=_headers(),
        json={"field": "owner_delivery_track", "value": "signature"},
    )
    missing = client.put(
        f"/api/agreements/{aid}/signing-lock",
        headers=_headers(),
        json={"locked_version_id": "lv-missing", "locked_at": "2026-09-13T00:00:00Z", "locked_by": "owner"},
    )
    assert missing.status_code == 400, missing.text
    assert _detail_code(missing) == "accepted_review_snapshot_required"
    assert read_signing_lock(aid) is None

    write_signing_lock(aid, {"locked_version_id": "lv-unbound", "content_sha256": "a" * 64})
    unbound_mint = client.post(
        f"/api/agreements/{aid}/recipient-access-token",
        headers=_headers(),
        json={"mode": "sign", "role": "signer", "recipient_party_id": "p-client"},
    )
    assert unbound_mint.status_code == 400, unbound_mint.text
    assert _detail_code(unbound_mint) == "accepted_review_snapshot_required"
    assert "token" not in unbound_mint.json()

    snap_id, digest = _accept_snapshot(client, aid)
    lock = client.put(
        f"/api/agreements/{aid}/signing-lock",
        headers=_headers(),
        json={"locked_version_id": "lv-bound", "locked_at": "2026-09-13T00:00:00Z", "locked_by": "owner"},
    )
    assert lock.status_code == 200, lock.text
    write_signing_lock(
        aid,
        {
            **(read_signing_lock(aid) or {}),
            "accepted_snapshot_id": "crs-other-agreement",
        },
    )
    id_mismatch = client.post(
        f"/api/agreements/{aid}/recipient-access-token",
        headers=_headers(),
        json={"mode": "sign", "role": "signer", "recipient_party_id": "p-client"},
    )
    assert id_mismatch.status_code == 400, id_mismatch.text
    assert _detail_code(id_mismatch) == "lock_snapshot_id_mismatch"
    assert "token" not in id_mismatch.json()

    write_signing_lock(
        aid,
        {
            **(read_signing_lock(aid) or {}),
            "accepted_snapshot_id": snap_id,
            "accepted_snapshot_digest": "b" * 64,
        },
    )
    digest_mismatch = client.post(
        f"/api/agreements/{aid}/recipient-access-token",
        headers=_headers(),
        json={"mode": "sign", "role": "signer", "recipient_party_id": "p-client"},
    )
    assert digest_mismatch.status_code == 400, digest_mismatch.text
    assert _detail_code(digest_mismatch) == "lock_snapshot_digest_mismatch"

    write_signing_lock(
        aid,
        {
            **(read_signing_lock(aid) or {}),
            "accepted_snapshot_id": snap_id,
            "accepted_snapshot_digest": digest,
        },
    )
    ok_mint = client.post(
        f"/api/agreements/{aid}/recipient-access-token",
        headers=_headers(),
        json={"mode": "sign", "role": "signer", "recipient_party_id": "p-client"},
    )
    assert ok_mint.status_code == 200, ok_mint.text
    write_signing_lock(
        aid,
        {
            **(read_signing_lock(aid) or {}),
            "accepted_snapshot_digest": "c" * 64,
        },
    )
    rh = {"X-Claw-Recipient-Access-Token": ok_mint.json()["token"]}
    complete = client.post(
        f"/api/agreements/{aid}/signing-ceremony/complete",
        headers=rh,
        json={
            "participant_id": "p-client",
            "typed_name": "Jordan Hale",
            "locked_version_id": "lv-bound",
            "consent": _esign_consent(),
        },
    )
    assert complete.status_code == 400, complete.text
    assert _detail_code(complete) == "lock_snapshot_digest_mismatch"
    after = load_draft(aid)
    assert not any(
        str((ev or {}).get("event_type") if isinstance(ev, dict) else "") == "signature_completed"
        for ev in (after.get("audit_log") or [])
    )

    draft = load_draft(aid)
    accepted = dict(draft.get("accepted_review_snapshot_v1") or {})
    accepted["corpusPlain"] = str(accepted.get("corpusPlain") or "") + "\nCORRUPT"
    draft["accepted_review_snapshot_v1"] = accepted
    save_draft(draft)
    write_signing_lock(
        aid,
        {
            "locked_version_id": "lv-bound",
            "accepted_snapshot_id": snap_id,
            "accepted_snapshot_digest": digest,
        },
    )
    invalid = client.post(
        f"/api/agreements/{aid}/recipient-access-token",
        headers=_headers(),
        json={"mode": "sign", "role": "signer", "recipient_party_id": "p-client"},
    )
    assert invalid.status_code == 400, invalid.text
    assert _detail_code(invalid) in {
        "accepted_snapshot_digest_mismatch",
        "accepted_snapshot_length_mismatch",
        "accepted_snapshot_invalid",
    }
    got = client.get(f"/api/agreements/{aid}", headers=_headers())
    assert got.json().get("legacy_pre_cutover") is False
    assert got.json().get("authority_mode") == "accepted_review_snapshot"


def test_genuine_legacy_pre_cutover_keeps_explicit_continuation(client: TestClient) -> None:
    from backend.services.accepted_review_snapshot import is_pure_legacy_pre_cutover
    from backend.services.agreement_draft_store import load_draft, save_draft
    from backend.services.agreement_signing_lock_store import read_signing_lock

    create = client.post("/api/agreements/draft", headers=_headers(), json=_harbor_ironvale_payload())
    assert create.status_code == 200, create.text
    aid = create.json()["id"]
    draft = load_draft(aid)
    draft["vs01_signing_packet_v1"] = {
        "portable": {"seed": {"corpusPlain": "legacy sealed consulting paper " * 40}}
    }
    save_draft(draft)
    assert is_pure_legacy_pre_cutover(load_draft(aid)) is True
    client.post(
        f"/api/agreements/{aid}/update-field",
        headers=_headers(),
        json={"field": "owner_delivery_track", "value": "signature"},
    )
    classified = client.get(f"/api/agreements/{aid}", headers=_headers())
    assert classified.json().get("legacy_pre_cutover") is True
    assert classified.json().get("authority_mode") == "legacy_packet_pre_snapshot"
    lock = client.put(
        f"/api/agreements/{aid}/signing-lock",
        headers=_headers(),
        json={"locked_version_id": "lv-legacy-1", "locked_at": "2026-09-13T00:00:00Z", "locked_by": "owner"},
    )
    assert lock.status_code == 200, lock.text
    stored = read_signing_lock(aid) or {}
    assert stored.get("locked_version_id") == "lv-legacy-1"
    assert not stored.get("accepted_snapshot_id")
    owner_mint = client.post(
        f"/api/agreements/{aid}/recipient-access-token",
        headers=_headers(),
        json={"mode": "sign", "role": "signer", "recipient_party_id": "p-owner"},
    )
    assert owner_mint.status_code == 200, owner_mint.text
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
            "locked_version_id": "lv-legacy-1",
            "consent": _esign_consent(),
        },
    )
    assert done.status_code == 200, done.text
    assert done.json().get("participant_id") == "p-owner"
    after = client.get(f"/api/agreements/{aid}", headers=_headers())
    assert after.json().get("legacy_pre_cutover") is True


def test_duplicate_completion_events_cannot_substitute_required_signers() -> None:
    from backend.proof.agreement_receipt import build_drafted_ceremony_execution_packet

    packet = build_drafted_ceremony_execution_packet(
        agreement_id="ag-dup",
        locked_version_id="lv-1",
        accepted_snapshot_id="crs-1",
        accepted_snapshot_digest="a" * 64,
        required_participant_ids=["p-owner", "p-client", "p-owner"],
        completion_events=[
            {"participantId": "p-owner", "at": "2026-09-13T00:00:00Z"},
            {"participantId": "p-owner", "at": "2026-09-13T00:01:00Z"},
        ],
    )
    assert packet["requiredParticipantIds"] == ["p-client", "p-owner"]
    assert [ev["participantId"] for ev in packet["completionEvents"]] == ["p-owner"]
    assert set(packet["completionEvents"][0]["participantId"] for ev in packet["completionEvents"]) != set(
        packet["requiredParticipantIds"]
    )


def _signature_completed_count(draft: dict) -> int:
    return sum(
        1
        for ev in (draft.get("audit_log") or [])
        if isinstance(ev, dict) and ev.get("event_type") == "signature_completed"
    )


def _direct_lock_and_mint(client: TestClient, aid: str, lv: str) -> tuple[str, str, str, str]:
    client.post(
        f"/api/agreements/{aid}/update-field",
        headers=_headers(),
        json={"field": "owner_delivery_track", "value": "signature"},
    )
    snap_id, digest = _accept_snapshot(client, aid)
    lock = client.put(
        f"/api/agreements/{aid}/signing-lock",
        headers=_headers(),
        json={"locked_version_id": lv, "locked_at": "2026-09-13T00:00:00Z", "locked_by": "owner"},
    )
    assert lock.status_code == 200, lock.text
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
    assert owner_mint.status_code == 200 and client_mint.status_code == 200
    return snap_id, digest, owner_mint.json()["token"], client_mint.json()["token"]


def _complete_participant(client: TestClient, aid: str, token: str, pid: str, name: str, lv: str):
    hdr = {"X-Claw-Recipient-Access-Token": token}
    start = client.post(
        f"/api/agreements/{aid}/signing-ceremony/start",
        headers=hdr,
        json={"participant_id": pid},
    )
    assert start.status_code == 200, start.text
    return client.post(
        f"/api/agreements/{aid}/signing-ceremony/complete",
        headers=hdr,
        json={
            "participant_id": pid,
            "typed_name": name,
            "locked_version_id": lv,
            "consent": _esign_consent(),
        },
    )


def test_foreign_snapshot_is_rejected_by_isolated_and_production_handlers(client: TestClient) -> None:
    from backend.services.accepted_review_snapshot import (
        accept_snapshot,
        assert_production_signing_lock_authority,
        create_pending_snapshot,
        empty_registry,
        sha256_hex_text,
    )
    from backend.services.agreement_draft_store import load_draft, save_draft
    from backend.services.agreement_signing_lock_store import read_signing_lock, write_signing_lock

    corpus = _snapshot_corpus()
    ok, err, snap_a, reg = create_pending_snapshot(
        agreement_id="ag-foreign-a",
        corpus_plain=corpus,
        registry=empty_registry(),
    )
    assert ok and snap_a and not err
    ok, err, snap_a, _reg = accept_snapshot(
        agreement_id="ag-foreign-a",
        snapshot_id=snap_a["snapshotId"],
        expected_digest=sha256_hex_text(corpus),
        accepting_principal="owner",
        registry=reg,
    )
    assert ok and snap_a and not err
    lock_a = {
        "agreement_id": "ag-foreign-b",
        "locked_version_id": "lv-foreign",
        "accepted_snapshot_id": snap_a["snapshotId"],
        "accepted_snapshot_digest": snap_a["corpusSha256"],
    }
    foreign_draft = {"id": "ag-foreign-b", "accepted_review_snapshot_v1": snap_a}
    ok, code, mode = assert_production_signing_lock_authority(foreign_draft, "ag-foreign-b", lock_a)
    assert ok is False
    assert code == "snapshot_agreement_mismatch"
    assert mode == "accepted_review_snapshot"
    native = {"id": "ag-foreign-a", "accepted_review_snapshot_v1": snap_a}
    native_lock = {**lock_a, "agreement_id": "ag-foreign-a"}
    ok, code, _mode = assert_production_signing_lock_authority(native, "ag-foreign-a", native_lock)
    assert ok is True and code is None

    create_a = client.post("/api/agreements/draft", headers=_headers(), json=_harbor_ironvale_payload())
    create_b = client.post("/api/agreements/draft", headers=_headers(), json=_harbor_ironvale_payload())
    assert create_a.status_code == 200 and create_b.status_code == 200
    aid_a, aid_b = create_a.json()["id"], create_b.json()["id"]
    client.post(
        f"/api/agreements/{aid_a}/update-field",
        headers=_headers(),
        json={"field": "owner_delivery_track", "value": "signature"},
    )
    client.post(
        f"/api/agreements/{aid_b}/update-field",
        headers=_headers(),
        json={"field": "owner_delivery_track", "value": "signature"},
    )
    snap_id, digest = _accept_snapshot(client, aid_a)
    draft_b = load_draft(aid_b)
    draft_b["accepted_review_snapshot_v1"] = load_draft(aid_a)["accepted_review_snapshot_v1"]
    save_draft(draft_b)
    before_lock = read_signing_lock(aid_b)
    put_b = client.put(
        f"/api/agreements/{aid_b}/signing-lock",
        headers=_headers(),
        json={"locked_version_id": "lv-b-foreign", "locked_at": "2026-09-13T00:00:00Z", "locked_by": "owner"},
    )
    assert put_b.status_code == 400, put_b.text
    assert _detail_code(put_b) == "snapshot_agreement_mismatch"
    assert read_signing_lock(aid_b) == before_lock

    create_c = client.post("/api/agreements/draft", headers=_headers(), json=_harbor_ironvale_payload())
    assert create_c.status_code == 200, create_c.text
    aid_c = create_c.json()["id"]
    snap_c, digest_c, owner_tok, client_tok = _direct_lock_and_mint(client, aid_c, "lv-c-native")
    write_signing_lock(
        aid_c,
        {
            "agreement_id": aid_c,
            "locked_version_id": "lv-c-native",
            "accepted_snapshot_id": snap_id,
            "accepted_snapshot_digest": digest,
        },
    )
    planted = load_draft(aid_c)
    planted["accepted_review_snapshot_v1"] = load_draft(aid_a)["accepted_review_snapshot_v1"]
    save_draft(planted)
    before_events = _signature_completed_count(load_draft(aid_c))
    mint_foreign = client.post(
        f"/api/agreements/{aid_c}/recipient-access-token",
        headers=_headers(),
        json={"mode": "sign", "role": "signer", "recipient_party_id": "p-client"},
    )
    assert mint_foreign.status_code == 400, mint_foreign.text
    assert _detail_code(mint_foreign) == "snapshot_agreement_mismatch"
    assert "token" not in mint_foreign.json()
    complete_foreign = client.post(
        f"/api/agreements/{aid_c}/signing-ceremony/complete",
        headers={"X-Claw-Recipient-Access-Token": client_tok},
        json={
            "participant_id": "p-client",
            "typed_name": "Jordan Hale",
            "locked_version_id": "lv-c-native",
            "consent": _esign_consent(),
        },
    )
    assert complete_foreign.status_code == 400, complete_foreign.text
    assert _detail_code(complete_foreign) == "snapshot_agreement_mismatch"
    assert _signature_completed_count(load_draft(aid_c)) == before_events
    assert snap_c and digest_c and owner_tok


def test_receipt_pending_recovers_without_new_signature_or_new_identity(client: TestClient, monkeypatch: pytest.MonkeyPatch) -> None:
    import backend.routers.agreements_v2_api as av2
    from backend.services.agreement_draft_store import load_draft
    from backend.utils.timeline_store import TimelineStore

    create = client.post("/api/agreements/draft", headers=_headers(), json=_harbor_ironvale_payload())
    aid = create.json()["id"]
    _snap_id, _digest, owner_tok, client_tok = _direct_lock_and_mint(client, aid, "lv-recover")
    owner_done = _complete_participant(client, aid, owner_tok, "p-owner", "Maya Chen", "lv-recover")
    assert owner_done.status_code == 200, owner_done.text

    persist_calls = {"n": 0}
    real_persist = av2._persist_agreement_execution_packet_artifact

    def fail_first_packet(**kwargs):
        persist_calls["n"] += 1
        if persist_calls["n"] == 1:
            raise RuntimeError("injected packet write failure")
        return real_persist(**kwargs)

    monkeypatch.setattr(av2, "_persist_agreement_execution_packet_artifact", fail_first_packet)
    first = _complete_participant(client, aid, client_tok, "p-client", "Jordan Hale", "lv-recover")
    assert first.status_code == 200, first.text
    assert first.json().get("fully_executed") is True
    pending = first.json().get("finalized_receipt") or {}
    assert pending.get("status") == "receipt_pending"
    assert pending.get("bound") is False
    draft_after = load_draft(aid)
    assert _signature_completed_count(draft_after) == 2
    assert any(
        isinstance(ev, dict) and ev.get("event_type") == "signed" for ev in (draft_after.get("audit_log") or [])
    )

    create_calls = {"n": 0}
    real_create = TimelineStore.create_receipt

    def count_create(self, *args, **kwargs):
        create_calls["n"] += 1
        return real_create(self, *args, **kwargs)

    monkeypatch.setattr(TimelineStore, "create_receipt", count_create)
    proof_pending = client.get(f"/api/agreements/{aid}/proof-status", headers=_headers())
    assert proof_pending.status_code == 200, proof_pending.text
    pending_get = proof_pending.json().get("finalized_receipt") or {}
    assert pending_get.get("status") == "receipt_pending"
    assert pending_get.get("bound") is False
    assert "accepted_snapshot_id" not in pending_get
    assert "required_participant_ids" not in pending_get
    assert create_calls["n"] == 0

    monkeypatch.setattr(av2, "_persist_agreement_execution_packet_artifact", real_persist)
    retry = client.post(
        f"/api/agreements/{aid}/signing-ceremony/complete",
        headers={"X-Claw-Recipient-Access-Token": client_tok},
        json={
            "participant_id": "p-client",
            "typed_name": "Jordan Hale",
            "locked_version_id": "lv-recover",
            "consent": _esign_consent(),
        },
    )
    assert retry.status_code == 200, retry.text
    recovered = retry.json().get("finalized_receipt") or {}
    assert recovered.get("status") == "bound"
    assert recovered.get("bound") is True
    receipt_id = recovered.get("receipt_id")
    assert str(receipt_id or "").startswith("agr_rcpt_")
    assert _signature_completed_count(load_draft(aid)) == 2

    store_fail = {"n": 0}
    real_store_create = TimelineStore.create_receipt

    def fail_first_store(self, *args, **kwargs):
        store_fail["n"] += 1
        if store_fail["n"] == 1:
            raise RuntimeError("injected receipt store failure")
        return real_store_create(self, *args, **kwargs)

    # Bound receipt already exists; a later store failure on a fresh agreement is covered below.
    create2 = client.post("/api/agreements/draft", headers=_headers(), json=_harbor_ironvale_payload())
    aid2 = create2.json()["id"]
    _s2, _d2, owner2, client2 = _direct_lock_and_mint(client, aid2, "lv-store")
    assert _complete_participant(client, aid2, owner2, "p-owner", "Maya Chen", "lv-store").status_code == 200
    monkeypatch.setattr(TimelineStore, "create_receipt", fail_first_store)
    store_first = _complete_participant(client, aid2, client2, "p-client", "Jordan Hale", "lv-store")
    assert store_first.status_code == 200, store_first.text
    assert (store_first.json().get("finalized_receipt") or {}).get("status") == "receipt_pending"
    assert _signature_completed_count(load_draft(aid2)) == 2
    monkeypatch.setattr(TimelineStore, "create_receipt", real_store_create)
    store_retry = client.post(
        f"/api/agreements/{aid2}/signing-ceremony/complete",
        headers={"X-Claw-Recipient-Access-Token": client2},
        json={
            "participant_id": "p-client",
            "typed_name": "Jordan Hale",
            "locked_version_id": "lv-store",
            "consent": _esign_consent(),
        },
    )
    assert store_retry.status_code == 200, store_retry.text
    store_bound = store_retry.json().get("finalized_receipt") or {}
    assert store_bound.get("status") == "bound"
    second_id = store_bound.get("receipt_id")
    restart = client.post(
        f"/api/agreements/{aid2}/signing-ceremony/complete",
        headers=_headers(),
        json={
            "participant_id": "p-client",
            "typed_name": "Jordan Hale",
            "locked_version_id": "lv-store",
            "consent": _esign_consent(),
        },
    )
    assert restart.status_code == 200, restart.text
    assert (restart.json().get("finalized_receipt") or {}).get("receipt_id") == second_id
    assert _signature_completed_count(load_draft(aid2)) == 2
    assert (client.get(f"/api/agreements/{aid}/proof-status", headers=_headers()).json().get("finalized_receipt") or {}).get(
        "receipt_id"
    ) == receipt_id


def test_proof_status_fails_closed_on_missing_replaced_or_corrupted_packet(client: TestClient) -> None:
    import json

    from backend.proof.agreement_receipt import verify_drafted_finalized_receipt
    from backend.services.accepted_review_snapshot import sha256_hex_text
    from backend.storage.artifact_repository import get_artifact_repository

    create = client.post("/api/agreements/draft", headers=_headers(), json=_harbor_ironvale_payload())
    aid = create.json()["id"]
    snap_id, digest, owner_tok, client_tok = _direct_lock_and_mint(client, aid, "lv-integrity")
    assert _complete_participant(client, aid, owner_tok, "p-owner", "Maya Chen", "lv-integrity").status_code == 200
    done = _complete_participant(client, aid, client_tok, "p-client", "Jordan Hale", "lv-integrity")
    assert done.status_code == 200, done.text
    bound = done.json().get("finalized_receipt") or {}
    assert bound.get("status") == "bound"
    receipt_id = bound["receipt_id"]
    repo = get_artifact_repository()
    raw = repo.get_bytes_by_logical_ref(artifact_type="agreement_execution_packet", logical_ref=receipt_id)
    assert raw
    packet = json.loads(raw.decode("utf-8"))

    repo.delete_logical_latest(artifact_type="agreement_execution_packet", logical_ref=receipt_id)
    missing = client.get(f"/api/agreements/{aid}/proof-status", headers=_headers())
    missing_rec = missing.json().get("finalized_receipt") or {}
    assert missing_rec.get("status") == "receipt_unavailable"
    assert missing_rec.get("bound") is False
    assert "accepted_snapshot_digest" not in missing_rec
    assert missing_rec.get("receipt_id") == receipt_id

    tampered_time = dict(packet)
    events = [dict(ev) for ev in (packet.get("completionEvents") or [])]
    if events:
        events[0]["at"] = "1999-01-01T00:00:00Z"
    tampered_time["completionEvents"] = events
    tampered_time["finalizedAt"] = "1999-01-01T00:00:00Z"
    repo.put_artifact(
        artifact_type="agreement_execution_packet",
        logical_ref=receipt_id,
        data=json.dumps(tampered_time, separators=(",", ":")).encode("utf-8"),
        content_type="application/json",
        agreement_id=aid,
        version_id="lv-integrity",
    )
    changed_time = client.get(f"/api/agreements/{aid}/proof-status", headers=_headers())
    time_rec = changed_time.json().get("finalized_receipt") or {}
    assert time_rec.get("status") == "receipt_unavailable"
    assert time_rec.get("bound") is False
    assert "required_participant_ids" not in time_rec

    tampered_snap = dict(packet)
    tampered_snap["acceptedSnapshotId"] = "crs-replaced-other"
    tampered_snap["acceptedSnapshotDigest"] = sha256_hex_text("other paper " * 40)
    repo.put_artifact(
        artifact_type="agreement_execution_packet",
        logical_ref=receipt_id,
        data=json.dumps(tampered_snap, separators=(",", ":")).encode("utf-8"),
        content_type="application/json",
        agreement_id=aid,
        version_id="lv-integrity",
    )
    changed_snap = client.get(f"/api/agreements/{aid}/proof-status", headers=_headers())
    snap_rec = changed_snap.json().get("finalized_receipt") or {}
    assert snap_rec.get("status") == "receipt_unavailable"
    assert snap_rec.get("bound") is False

    repo.put_artifact(
        artifact_type="agreement_execution_packet",
        logical_ref=receipt_id,
        data=b"{not-json",
        content_type="application/json",
        agreement_id=aid,
        version_id="lv-integrity",
    )
    corrupt = client.get(f"/api/agreements/{aid}/proof-status", headers=_headers())
    assert (corrupt.json().get("finalized_receipt") or {}).get("status") == "receipt_unavailable"

    ok, err = verify_drafted_finalized_receipt(
        receipt={"receipt_id": receipt_id, "receipt_hash_sha256": "a" * 64, "timeline_id": f"agreement:{aid}"},
        packet=packet,
        agreement_id=aid,
    )
    assert ok is False
    assert err in {"receipt_hash_mismatch", "receipt_unavailable"}

    recovered = client.post(
        f"/api/agreements/{aid}/signing-ceremony/complete",
        headers=_headers(),
        json={
            "participant_id": "p-client",
            "typed_name": "Jordan Hale",
            "locked_version_id": "lv-integrity",
            "consent": _esign_consent(),
        },
    )
    assert recovered.status_code == 200, recovered.text
    recovered_rec = recovered.json().get("finalized_receipt") or {}
    assert recovered_rec.get("status") == "bound"
    assert recovered_rec.get("receipt_id") == receipt_id
    assert recovered_rec.get("accepted_snapshot_id") == snap_id
    assert recovered_rec.get("accepted_snapshot_digest") == digest


def _intercept_outbound_integrations(monkeypatch: pytest.MonkeyPatch) -> list:
    captured: list = []

    def capture(org_id, event_type, object_type, object_id, summary):
        captured.append(
            {
                "org_id": org_id,
                "event_type": event_type,
                "object_type": object_type,
                "object_id": object_id,
                "summary": dict(summary or {}),
            }
        )

    monkeypatch.setattr(
        "backend.integrations.hooks_emit.dispatch_webhook_event_async",
        capture,
    )
    monkeypatch.setattr(
        "backend.integrations.hooks_emit.claw_org_id_for_registered_agreement",
        lambda _aid: ORG,
    )
    return captured


def _agreement_level_completion_events(captured: list) -> list:
    return [
        ev
        for ev in captured
        if ev.get("event_type") in {"agreement.signed", "agreement.completed"}
    ]


def test_ceremony_complete_emits_agreement_completion_only_after_all_required_signers(
    client: TestClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    import backend.routers.agreements_v2_api as av2
    from backend.services.agreement_draft_store import load_draft

    outbound = _intercept_outbound_integrations(monkeypatch)
    create = client.post("/api/agreements/draft", headers=_headers(), json=_harbor_ironvale_payload())
    assert create.status_code == 200, create.text
    aid = create.json()["id"]
    _snap_id, _digest, owner_tok, client_tok = _direct_lock_and_mint(client, aid, "lv-events")

    owner_done = _complete_participant(client, aid, owner_tok, "p-owner", "Maya Chen", "lv-events")
    assert owner_done.status_code == 200, owner_done.text
    assert owner_done.json().get("fully_executed") is not True
    assert _agreement_level_completion_events(outbound) == []
    assert _signature_completed_count(load_draft(aid)) == 1

    replay_owner = _complete_participant(client, aid, owner_tok, "p-owner", "Maya Chen", "lv-events")
    assert replay_owner.status_code == 409, replay_owner.text
    assert _detail_code(replay_owner) == "already_signed"
    assert _agreement_level_completion_events(outbound) == []

    rejected = client.post(
        f"/api/agreements/{aid}/signing-ceremony/complete",
        headers={"X-Claw-Recipient-Access-Token": client_tok},
        json={
            "participant_id": "p-client",
            "typed_name": "Jordan Hale",
            "locked_version_id": "lv-wrong",
            "consent": _esign_consent(),
        },
    )
    assert rejected.status_code == 400, rejected.text
    assert _agreement_level_completion_events(outbound) == []
    assert _signature_completed_count(load_draft(aid)) == 1

    last = _complete_participant(client, aid, client_tok, "p-client", "Jordan Hale", "lv-events")
    assert last.status_code == 200, last.text
    assert last.json().get("fully_executed") is True
    bound = last.json().get("finalized_receipt") or {}
    assert bound.get("status") == "bound"
    assert bound.get("bound") is True
    receipt_id = bound.get("receipt_id")
    assert str(receipt_id or "").startswith("agr_rcpt_")
    milestone = _agreement_level_completion_events(outbound)
    assert [ev["event_type"] for ev in milestone] == ["agreement.signed", "agreement.completed"]
    for ev in milestone:
        assert ev["org_id"] == ORG
        assert ev["object_type"] == "agreement"
        assert ev["object_id"] == aid
        assert ev["summary"].get("locked_version_id") == "lv-events"
    assert milestone[1]["summary"].get("lifecycle") == "fully_executed"
    assert _signature_completed_count(load_draft(aid)) == 2

    replay = client.post(
        f"/api/agreements/{aid}/signing-ceremony/complete",
        headers=_headers(),
        json={
            "participant_id": "p-client",
            "typed_name": "Jordan Hale",
            "locked_version_id": "lv-events",
            "consent": _esign_consent(),
        },
    )
    assert replay.status_code == 200, replay.text
    assert replay.json().get("recovered") is True
    assert (replay.json().get("finalized_receipt") or {}).get("receipt_id") == receipt_id
    assert _agreement_level_completion_events(outbound) == milestone
    assert _signature_completed_count(load_draft(aid)) == 2

    persist_calls = {"n": 0}
    real_persist = av2._persist_agreement_execution_packet_artifact

    def fail_first_packet(**kwargs):
        persist_calls["n"] += 1
        if persist_calls["n"] == 1:
            raise RuntimeError("injected packet write failure")
        return real_persist(**kwargs)

    create2 = client.post("/api/agreements/draft", headers=_headers(), json=_harbor_ironvale_payload())
    aid2 = create2.json()["id"]
    _s2, _d2, owner2, client2 = _direct_lock_and_mint(client, aid2, "lv-pending-events")
    assert _complete_participant(client, aid2, owner2, "p-owner", "Maya Chen", "lv-pending-events").status_code == 200
    before_last = len(_agreement_level_completion_events(outbound))
    monkeypatch.setattr(av2, "_persist_agreement_execution_packet_artifact", fail_first_packet)
    pending_complete = _complete_participant(client, aid2, client2, "p-client", "Jordan Hale", "lv-pending-events")
    assert pending_complete.status_code == 200, pending_complete.text
    pending_rec = pending_complete.json().get("finalized_receipt") or {}
    assert pending_rec.get("status") == "receipt_pending"
    assert pending_rec.get("bound") is False
    after_pending = _agreement_level_completion_events(outbound)
    assert [ev["event_type"] for ev in after_pending[before_last:]] == [
        "agreement.signed",
        "agreement.completed",
    ]
    assert after_pending[-1]["object_id"] == aid2
    assert after_pending[-1]["summary"].get("locked_version_id") == "lv-pending-events"
    assert _signature_completed_count(load_draft(aid2)) == 2
    monkeypatch.setattr(av2, "_persist_agreement_execution_packet_artifact", real_persist)
    recover = client.post(
        f"/api/agreements/{aid2}/signing-ceremony/complete",
        headers={"X-Claw-Recipient-Access-Token": client2},
        json={
            "participant_id": "p-client",
            "typed_name": "Jordan Hale",
            "locked_version_id": "lv-pending-events",
            "consent": _esign_consent(),
        },
    )
    assert recover.status_code == 200, recover.text
    recovered_rec = recover.json().get("finalized_receipt") or {}
    assert recovered_rec.get("status") == "bound"
    assert recovered_rec.get("bound") is True
    assert recovered_rec.get("receipt_id")
    assert recovered_rec.get("receipt_id") != receipt_id
    assert _agreement_level_completion_events(outbound) == after_pending
    assert _signature_completed_count(load_draft(aid2)) == 2
