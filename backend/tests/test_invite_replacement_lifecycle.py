"""Adversarial tests for durable invite replacement (same-email resend + email correction)."""

from __future__ import annotations

from unittest.mock import MagicMock, patch

import pytest
from fastapi.testclient import TestClient

from backend.main import app
from backend.security.recipient_access_token import mint_recipient_access_token
from backend.services.agreement_draft_store import DraftCasConflictError, load_draft, save_draft, save_draft_cas
from backend.services.recipient_delivery_registry import (
    KIND_EMAIL_CORRECTION,
    KIND_SAME_EMAIL_RESEND,
    PENDING_ACTIVATION,
    PENDING_MINT,
    abort_invite_replacement,
    activate_invite_replacement,
    begin_invite_replacement,
    extract_jti_from_token,
    get_pending_replacement,
    get_registry,
    get_registry_revision,
    get_replacement_generation,
    is_jti_superseded,
    record_invite_sent,
    supersede_active_invite,
    supersede_all_phase_invites,
)
from backend.services.recipient_email_correction import (
    EMAIL_CORRECTION_SECURITY_POLICY,
    correct_review_recipient_email,
)
from backend.services.recipient_invite_resend import resend_recipient_invite

pytestmark = pytest.mark.unit

_SECRET = "unit-test-invite-replacement-lifecycle-secret"
_ORG = {"X-Claw-Org-Id": "user-repl-owner", "X-Claw-Test-Auth-User-Id": "repl-owner"}


@pytest.fixture()
def client(monkeypatch, tmp_path):
    from backend.usage_economics import store as usage_economics_store_mod
    from backend.admin_console import store as admin_store

    usage_economics_store_mod._store = None  # noqa: SLF001
    admin_store._store = None  # noqa: SLF001
    monkeypatch.setenv("CLAW_ENVIRONMENT", "test")
    monkeypatch.delenv("CLAW_COMMERCIAL_MODE", raising=False)
    monkeypatch.setenv("CLAW_DATA_DIR", str(tmp_path))
    monkeypatch.setenv("CLAW_USAGE_ECONOMICS_DB_PATH", str(tmp_path / "usage.sqlite3"))
    monkeypatch.setenv("CLAW_ECONOMICS_DB_PATH", str(tmp_path / "economics.sqlite3"))
    monkeypatch.setenv("CLAW_ADMIN_CONSOLE_DB_PATH", str(tmp_path / "admin.sqlite3"))
    monkeypatch.setenv("CLAW_AGREEMENT_SIGNING_TOKEN_SECRET", _SECRET)
    monkeypatch.setenv("CLAW_USAGE_ECONOMICS_ENABLED", "0")
    monkeypatch.setenv("RESEND_API_KEY", "re_test")
    monkeypatch.setenv("EMAIL_FROM", "LawDog <notifications@lawdog.me>")
    monkeypatch.setenv("CLAW_APP_PUBLIC_ORIGIN", "https://app.example.com")
    monkeypatch.setenv("CLAW_REVIEW_DELIVERY_MODE", "email")
    return TestClient(app)


def _mock_resend_success() -> MagicMock:
    mock_response = MagicMock()
    mock_response.status_code = 200
    mock_response.text = '{"id":"msg_ok"}'
    mock_response.json.return_value = {"id": "msg_ok"}
    mock_client = MagicMock()
    mock_client.post.return_value = mock_response
    mock_client.__enter__ = MagicMock(return_value=mock_client)
    mock_client.__exit__ = MagicMock(return_value=False)
    return mock_client


def _create_review_ready(client: TestClient) -> tuple[str, str, str]:
    create = client.post(
        "/api/agreements/draft",
        headers=_ORG,
        json={
            "title": "Replacement lifecycle",
            "jurisdiction": "DE",
            "parties": [
                {"name": "Owner LLC", "role": "owner", "email": "owner@example.com", "id": "p1"},
                {"name": "CP LLC", "role": "party", "email": "cp@example.com", "id": "p2"},
            ],
        },
    )
    assert create.status_code == 200, create.text
    aid = create.json()["draft"]["id"]
    draft = load_draft(aid)
    draft["review_sent_at"] = "2026-07-01T00:00:00Z"
    old_tok = mint_recipient_access_token(
        secret=_SECRET.encode("utf-8"),
        agreement_id=aid,
        locked_version_id="",
        mode="review",
        role="reviewer",
        ttl_seconds=3600,
        recipient_party_id="p2",
    )
    old_jti = extract_jti_from_token(old_tok)
    base_rev = get_registry_revision(draft)
    record_invite_sent(
        draft,
        phase="review",
        participant_id="p2",
        jti=old_jti,
        email="cp@example.com",
        audit_log=draft.setdefault("audit_log", []),
    )
    save_draft_cas(draft, expected_revision=base_rev)
    return aid, old_tok, old_jti


def test_same_email_resend_registry_failure_preserves_old_active(client: TestClient, monkeypatch):
    from backend.services.recipient_delivery_registry import InviteReplacementError

    aid, old_tok, old_jti = _create_review_ready(client)
    draft = load_draft(aid)
    mock_client = _mock_resend_success()
    monkeypatch.setattr(
        "backend.services.recipient_invite_resend.begin_invite_replacement",
        lambda *a, **k: (_ for _ in ()).throw(
            InviteReplacementError("recipient_invite_registry_unavailable")
        ),
    )
    with patch("backend.services.email.resend_client.httpx.Client", return_value=mock_client):
        next_draft, meta = resend_recipient_invite(
            agreement_id=aid,
            draft=draft,
            phase="review",
            participant_id="p2",
            org_id="user-repl-owner",
        )
    assert meta.get("sent_invite") is False
    assert meta.get("preserved_active") is True
    assert mock_client.post.call_count == 0
    assert _active(next_draft, "p2") == old_jti
    assert not is_jti_superseded(next_draft, old_jti, "review", "p2")
    assert get_pending_replacement(next_draft, phase="review", participant_id="p2") is None


def _active(draft: dict, pid: str) -> str:
    row = (get_registry(draft).get("recipients") or {}).get(f"review:{pid}") or {}
    return str(row.get("active_jti") or "").strip()


def test_same_email_resend_email_failure_preserves_old_active(client: TestClient):
    aid, old_tok, old_jti = _create_review_ready(client)
    draft = load_draft(aid)
    mock_fail = MagicMock()
    mock_fail.status_code = 500
    mock_fail.text = "fail"
    mock_fail.json.return_value = {"error": "fail"}
    mock_client = MagicMock()
    mock_client.post.return_value = mock_fail
    mock_client.__enter__ = MagicMock(return_value=mock_client)
    mock_client.__exit__ = MagicMock(return_value=False)

    with patch("backend.services.email.resend_client.httpx.Client", return_value=mock_client):
        next_draft, meta = resend_recipient_invite(
            agreement_id=aid,
            draft=draft,
            phase="review",
            participant_id="p2",
            org_id="user-repl-owner",
            persist=lambda d: save_draft(d),
        )
    assert meta.get("sent_invite") is False
    assert meta.get("preserved_active") is True
    assert meta.get("code") == "invite_replacement_delivery_failed"
    assert _active(next_draft, "p2") == old_jti
    assert not is_jti_superseded(next_draft, old_jti, "review", "p2")
    pending = get_pending_replacement(next_draft, phase="review", participant_id="p2")
    assert pending is None  # aborted
    # No second active JTI
    row = (get_registry(next_draft).get("recipients") or {}).get("review:p2") or {}
    assert row.get("active_jti") == old_jti


def test_successful_same_email_resend_one_active_invalidates_old(client: TestClient):
    aid, old_tok, old_jti = _create_review_ready(client)
    draft = load_draft(aid)
    mock_client = _mock_resend_success()
    with patch("backend.services.email.resend_client.httpx.Client", return_value=mock_client):
        next_draft, meta = resend_recipient_invite(
            agreement_id=aid,
            draft=draft,
            phase="review",
            participant_id="p2",
            org_id="user-repl-owner",
            persist=lambda d: save_draft(d),
        )
    assert meta.get("sent_invite") is True
    assert meta.get("replacement_activated") is True
    new_jti = _active(next_draft, "p2")
    assert new_jti
    assert new_jti != old_jti
    assert is_jti_superseded(next_draft, old_jti, "review", "p2")
    assert not is_jti_superseded(next_draft, new_jti, "review", "p2")
    assert get_pending_replacement(next_draft, phase="review", participant_id="p2") is None
    assert mock_client.post.call_count == 1


def test_email_correction_invalidates_old_address_on_delivery_failure(client: TestClient):
    aid, old_tok, old_jti = _create_review_ready(client)
    draft = load_draft(aid)
    mock_fail = MagicMock()
    mock_fail.status_code = 500
    mock_fail.text = "fail"
    mock_fail.json.return_value = {}
    mock_client = MagicMock()
    mock_client.post.return_value = mock_fail
    mock_client.__enter__ = MagicMock(return_value=mock_client)
    mock_client.__exit__ = MagicMock(return_value=False)

    with patch("backend.services.email.resend_client.httpx.Client", return_value=mock_client):
        next_draft, meta = correct_review_recipient_email(
            agreement_id=aid,
            draft=draft,
            participant_id="p2",
            new_email="fixed@example.com",
            resend_invite=True,
            org_id="user-repl-owner",
            persist=lambda d: save_draft(d),
        )
    assert meta.get("old_address_authorized") is False
    assert meta.get("correction_pending") is True
    assert meta.get("retryable") is True
    assert meta.get("code") == "correction_delivery_failed"
    assert EMAIL_CORRECTION_SECURITY_POLICY in (meta.get("policy") or "")
    assert is_jti_superseded(next_draft, old_jti, "review", "p2")
    # Party email updated; old address not active on registry
    parties = next_draft.get("parties") or []
    cp = next(p for p in parties if p.get("id") == "p2")
    assert cp.get("email") == "fixed@example.com"
    row = (get_registry(next_draft).get("recipients") or {}).get("review:p2") or {}
    assert row.get("active_jti") in (None, "")
    assert row.get("revoked_at")
    pending = get_pending_replacement(next_draft, phase="review", participant_id="p2")
    assert pending is not None
    assert pending.get("kind") == KIND_EMAIL_CORRECTION


def test_retry_after_pending_activation_converges(client: TestClient, monkeypatch):
    aid, old_tok, old_jti = _create_review_ready(client)
    draft = load_draft(aid)
    mock_client = _mock_resend_success()

    calls = {"n": 0}
    real_activate = None
    import backend.services.recipient_invite_resend as resend_mod
    from backend.services import recipient_delivery_registry as reg_mod

    real_activate = reg_mod.activate_invite_replacement

    def _flaky_activate(*args, **kwargs):
        calls["n"] += 1
        if calls["n"] == 1:
            raise reg_mod.InviteReplacementError("activation_boom")
        return real_activate(*args, **kwargs)

    monkeypatch.setattr(resend_mod, "activate_invite_replacement", _flaky_activate)

    with patch("backend.services.email.resend_client.httpx.Client", return_value=mock_client):
        d1, meta1 = resend_recipient_invite(
            agreement_id=aid,
            draft=draft,
            phase="review",
            participant_id="p2",
            org_id="user-repl-owner",
            persist=lambda d: save_draft(d),
        )
    assert meta1.get("sent_invite") is True
    assert meta1.get("pending_activation") is True
    assert _active(d1, "p2") == old_jti  # old preserved until activation
    pending = get_pending_replacement(d1, phase="review", participant_id="p2")
    assert pending and pending.get("status") == PENDING_ACTIVATION
    pending_new = str(pending.get("new_jti") or "")
    assert pending_new
    assert is_jti_superseded(d1, pending_new, "review", "p2")

    d2, meta2 = resend_recipient_invite(
        agreement_id=aid,
        draft=d1,
        phase="review",
        participant_id="p2",
        org_id="user-repl-owner",
        persist=lambda d: save_draft(d),
    )
    assert meta2.get("replacement_activated") is True
    assert _active(d2, "p2") == pending_new
    assert is_jti_superseded(d2, old_jti, "review", "p2")
    assert get_pending_replacement(d2, phase="review", participant_id="p2") is None


def test_cancel_reissue_revoke_supersede_active_and_pending(client: TestClient):
    from backend.services.recipient_delivery_registry import begin_invite_replacement

    aid, old_tok, old_jti = _create_review_ready(client)
    draft = load_draft(aid)
    mock_client = _mock_resend_success()

    import backend.services.recipient_invite_resend as resend_mod
    from backend.services import recipient_delivery_registry as reg_mod

    def _boom_activate(*_a, **_k):
        raise reg_mod.InviteReplacementError("force_pending")

    with patch.object(resend_mod, "activate_invite_replacement", _boom_activate):
        with patch("backend.services.email.resend_client.httpx.Client", return_value=mock_client):
            d1, meta1 = resend_recipient_invite(
                agreement_id=aid,
                draft=draft,
                phase="review",
                participant_id="p2",
                org_id="user-repl-owner",
                persist=lambda d: save_draft(d),
            )
    assert meta1.get("pending_activation")
    pending_new = str(
        (get_pending_replacement(d1, phase="review", participant_id="p2") or {}).get("new_jti") or ""
    )
    assert pending_new

    # Explicit revoke must consume active + pending.
    audit = list(d1.get("audit_log") or [])
    revoked = supersede_active_invite(
        d1, phase="review", participant_id="p2", audit_log=audit, force_revoke_gate=True
    )
    assert is_jti_superseded(revoked, old_jti, "review", "p2")
    assert is_jti_superseded(revoked, pending_new, "review", "p2")
    assert get_pending_replacement(revoked, phase="review", participant_id="p2") is None

    # Phase-wide cancel/reissue helper also clears pending.
    draft2: dict = {
        "id": aid,
        "parties": draft.get("parties") or [],
        "audit_log": [],
        "recipient_delivery_v1": {"v": 1, "recipients": {}},
    }
    record_invite_sent(
        draft2,
        phase="review",
        participant_id="p2",
        jti="active-jti-cancel",
        email="cp@example.com",
        audit_log=draft2.setdefault("audit_log", []),
    )
    begin_invite_replacement(
        draft2,
        phase="review",
        participant_id="p2",
        kind=KIND_SAME_EMAIL_RESEND,
        new_jti="pending-jti-cancel",
        email="cp@example.com",
        audit_log=draft2.setdefault("audit_log", []),
        expected_generation=get_replacement_generation(draft2, phase="review", participant_id="p2"),
        expected_revision=get_registry_revision(draft2),
        agreement_id=aid,
        locked_version_id="",
        mode="review",
    )
    cleared = supersede_all_phase_invites(draft2, phase="review", audit_log=draft2["audit_log"])
    assert get_pending_replacement(cleared, phase="review", participant_id="p2") is None
    assert is_jti_superseded(cleared, "pending-jti-cancel", "review", "p2")
    assert is_jti_superseded(cleared, "active-jti-cancel", "review", "p2")


def test_api_resend_failure_returns_retryable_preserves_active(client: TestClient):
    aid, old_tok, old_jti = _create_review_ready(client)
    mock_fail = MagicMock()
    mock_fail.status_code = 500
    mock_fail.text = "fail"
    mock_fail.json.return_value = {}
    mock_client = MagicMock()
    mock_client.post.return_value = mock_fail
    mock_client.__enter__ = MagicMock(return_value=mock_client)
    mock_client.__exit__ = MagicMock(return_value=False)
    with patch("backend.services.email.resend_client.httpx.Client", return_value=mock_client):
        res = client.post(
            f"/api/agreements/{aid}/recipient-invite-resend",
            headers=_ORG,
            json={"phase": "review", "participant_id": "p2"},
        )
    assert res.status_code == 503, res.text
    detail = res.json().get("detail") or {}
    assert detail.get("retryable") is True
    assert detail.get("preserved_active") is True
    draft = load_draft(aid)
    assert _active(draft, "p2") == old_jti


def test_api_correction_failure_exposes_support_state(client: TestClient):
    aid, old_tok, old_jti = _create_review_ready(client)
    mock_fail = MagicMock()
    mock_fail.status_code = 500
    mock_fail.text = "fail"
    mock_fail.json.return_value = {}
    mock_client = MagicMock()
    mock_client.post.return_value = mock_fail
    mock_client.__enter__ = MagicMock(return_value=mock_client)
    mock_client.__exit__ = MagicMock(return_value=False)
    with patch("backend.services.email.resend_client.httpx.Client", return_value=mock_client):
        res = client.post(
            f"/api/agreements/{aid}/review-recipient-email",
            headers=_ORG,
            json={"participant_id": "p2", "new_email": "fixed@example.com", "resend_invite": True},
        )
    assert res.status_code == 503, res.text
    detail = res.json().get("detail") or {}
    assert detail.get("old_address_authorized") is False
    assert detail.get("correction_pending") is True
    assert detail.get("retryable") is True
    draft = load_draft(aid)
    assert is_jti_superseded(draft, old_jti, "review", "p2")


def test_correction_retry_same_email_resumes_pending(client: TestClient):
    aid, old_tok, old_jti = _create_review_ready(client)
    draft = load_draft(aid)
    mock_fail = MagicMock()
    mock_fail.status_code = 500
    mock_fail.text = "fail"
    mock_fail.json.return_value = {}
    fail_client = MagicMock()
    fail_client.post.return_value = mock_fail
    fail_client.__enter__ = MagicMock(return_value=fail_client)
    fail_client.__exit__ = MagicMock(return_value=False)
    with patch("backend.services.email.resend_client.httpx.Client", return_value=fail_client):
        d1, meta1 = correct_review_recipient_email(
            agreement_id=aid,
            draft=draft,
            participant_id="p2",
            new_email="fixed@example.com",
            resend_invite=True,
            org_id="user-repl-owner",
        )
    assert meta1.get("code") == "correction_delivery_failed"
    assert meta1.get("correction_pending") is True
    assert get_pending_replacement(d1, phase="review", participant_id="p2") is not None

    ok_client = _mock_resend_success()
    with patch("backend.services.email.resend_client.httpx.Client", return_value=ok_client):
        d2, meta2 = correct_review_recipient_email(
            agreement_id=aid,
            draft=d1,
            participant_id="p2",
            new_email="fixed@example.com",
            resend_invite=True,
            org_id="user-repl-owner",
        )
    assert meta2.get("code") != "email_unchanged"
    assert meta2.get("replacement_activated") is True
    assert meta2.get("old_address_authorized") is False
    assert get_pending_replacement(d2, phase="review", participant_id="p2") is None
    assert is_jti_superseded(d2, old_jti, "review", "p2")
    new_active = str((get_registry(d2).get("recipients") or {}).get("review:p2", {}).get("active_jti") or "")
    assert new_active
    assert not is_jti_superseded(d2, new_active, "review", "p2")


def test_correction_mint_failure_creates_durable_pending(client: TestClient, monkeypatch):
    aid, old_tok, old_jti = _create_review_ready(client)
    draft = load_draft(aid)
    monkeypatch.setattr(
        "backend.services.recipient_email_correction.mint_review_invite_token_for_participant",
        lambda **kwargs: (None, None),
    )
    d1, meta1 = correct_review_recipient_email(
        agreement_id=aid,
        draft=draft,
        participant_id="p2",
        new_email="fixed@example.com",
        resend_invite=True,
        org_id="user-repl-owner",
    )
    assert meta1.get("code") == "correction_mint_failed"
    assert meta1.get("correction_pending") is True
    pending = get_pending_replacement(d1, phase="review", participant_id="p2")
    assert pending is not None
    assert pending.get("kind") == KIND_EMAIL_CORRECTION
    assert pending.get("status") == PENDING_MINT
    assert pending.get("new_email") == "fixed@example.com"
    assert is_jti_superseded(d1, old_jti, "review", "p2")

    ok_client = _mock_resend_success()
    monkeypatch.setattr(
        "backend.services.recipient_email_correction.mint_review_invite_token_for_participant",
        __import__("backend.services.email.review_delivery", fromlist=["mint_review_invite_token_for_participant"]).mint_review_invite_token_for_participant,
    )
    with patch("backend.services.email.resend_client.httpx.Client", return_value=ok_client):
        d2, meta2 = correct_review_recipient_email(
            agreement_id=aid,
            draft=d1,
            participant_id="p2",
            new_email="fixed@example.com",
            resend_invite=True,
            org_id="user-repl-owner",
        )
    assert meta2.get("replacement_activated") is True
    assert get_pending_replacement(d2, phase="review", participant_id="p2") is None


def test_same_email_resend_blocked_during_pending_correction(client: TestClient):
    aid, old_tok, old_jti = _create_review_ready(client)
    draft = load_draft(aid)
    mock_fail = MagicMock()
    mock_fail.status_code = 500
    mock_fail.text = "fail"
    mock_fail.json.return_value = {}
    fail_client = MagicMock()
    fail_client.post.return_value = mock_fail
    fail_client.__enter__ = MagicMock(return_value=fail_client)
    fail_client.__exit__ = MagicMock(return_value=False)
    with patch("backend.services.email.resend_client.httpx.Client", return_value=fail_client):
        d1, meta1 = correct_review_recipient_email(
            agreement_id=aid,
            draft=draft,
            participant_id="p2",
            new_email="fixed@example.com",
            resend_invite=True,
            org_id="user-repl-owner",
        )
    assert meta1.get("correction_pending") is True
    pending_before = get_pending_replacement(d1, phase="review", participant_id="p2")
    assert pending_before and pending_before.get("kind") == KIND_EMAIL_CORRECTION

    from fastapi import HTTPException

    with pytest.raises(HTTPException) as ei:
        resend_recipient_invite(
            agreement_id=aid,
            draft=d1,
            phase="review",
            participant_id="p2",
            org_id="user-repl-owner",
        )
    assert ei.value.status_code == 409
    assert (ei.value.detail or {}).get("code") == "email_correction_pending"
    pending_after = get_pending_replacement(d1, phase="review", participant_id="p2")
    assert pending_after == pending_before


def test_interleaved_resend_stale_abort_cannot_resurrect(client: TestClient):
    import copy

    from backend.services.recipient_delivery_registry import InviteReplacementError

    aid, old_tok, old_jti = _create_review_ready(client)
    draft = load_draft(aid)
    # R1: begin B, activate, CAS save
    d1 = copy.deepcopy(draft)
    rev0 = get_registry_revision(d1)
    gen0 = get_replacement_generation(d1, phase="review", participant_id="p2")
    begin_invite_replacement(
        d1,
        phase="review",
        participant_id="p2",
        kind=KIND_SAME_EMAIL_RESEND,
        new_jti="jti-B",
        email="cp@example.com",
        expected_generation=gen0,
        expected_revision=rev0,
        agreement_id=aid,
        locked_version_id="",
        mode="review",
        audit_log=d1.setdefault("audit_log", []),
    )
    save_draft_cas(d1, expected_revision=rev0)
    rev1 = get_registry_revision(d1)
    gen1 = get_replacement_generation(d1, phase="review", participant_id="p2")
    activate_invite_replacement(
        d1,
        phase="review",
        participant_id="p2",
        email="cp@example.com",
        expected_generation=gen1,
        expected_revision=rev1,
        audit_log=d1.setdefault("audit_log", []),
    )
    save_draft_cas(d1, expected_revision=rev1)
    assert _active(d1, "p2") == "jti-B"
    assert is_jti_superseded(d1, old_jti, "review", "p2")

    # R2: stale world still thinks active=old; begin C then abort preserve — CAS must fail
    d2 = copy.deepcopy(draft)
    begin_invite_replacement(
        d2,
        phase="review",
        participant_id="p2",
        kind=KIND_SAME_EMAIL_RESEND,
        new_jti="jti-C",
        email="cp@example.com",
        expected_generation=gen0,
        expected_revision=rev0,
        agreement_id=aid,
        locked_version_id="",
        mode="review",
        audit_log=d2.setdefault("audit_log", []),
    )
    with pytest.raises(DraftCasConflictError):
        save_draft_cas(d2, expected_revision=rev0)

    # Even if abort mutates stale memory, CAS against authoritative rev must fail
    abort_invite_replacement(
        d2,
        phase="review",
        participant_id="p2",
        failure_code="stale",
        preserve_active=True,
        expected_generation=get_replacement_generation(d2, phase="review", participant_id="p2"),
        expected_revision=get_registry_revision(d2),
        audit_log=d2.setdefault("audit_log", []),
    )
    with pytest.raises(DraftCasConflictError):
        save_draft_cas(d2, expected_revision=rev0)

    authoritative = load_draft(aid)
    assert _active(authoritative, "p2") == "jti-B"
    assert is_jti_superseded(authoritative, old_jti, "review", "p2")
    assert not is_jti_superseded(authoritative, "jti-B", "review", "p2")


def test_stale_activate_receives_generation_conflict(client: TestClient):
    import copy

    from backend.services.recipient_delivery_registry import InviteReplacementError

    aid, old_tok, old_jti = _create_review_ready(client)
    draft = load_draft(aid)
    d1 = copy.deepcopy(draft)
    rev0 = get_registry_revision(d1)
    gen0 = get_replacement_generation(d1, phase="review", participant_id="p2")
    begin_invite_replacement(
        d1,
        phase="review",
        participant_id="p2",
        kind=KIND_SAME_EMAIL_RESEND,
        new_jti="jti-new",
        email="cp@example.com",
        expected_generation=gen0,
        expected_revision=rev0,
        agreement_id=aid,
        locked_version_id="",
        mode="review",
        audit_log=d1.setdefault("audit_log", []),
    )
    save_draft_cas(d1, expected_revision=rev0)
    current = load_draft(aid)
    # Stale callers still holding pre-begin generation/revision must conflict.
    with pytest.raises(InviteReplacementError) as ei:
        activate_invite_replacement(
            copy.deepcopy(current),
            phase="review",
            participant_id="p2",
            email="cp@example.com",
            expected_generation=gen0,
            expected_revision=rev0,
        )
    assert ei.value.code == "invite_replacement_conflict"
    assert _active(load_draft(aid), "p2") == old_jti
    assert get_pending_replacement(load_draft(aid), phase="review", participant_id="p2") is not None


def test_pending_delivery_retry_reuses_pending(client: TestClient):
    """Crash-window: pending_delivery on disk is resumed (rebind) instead of dual-begin."""
    aid, old_tok, old_jti = _create_review_ready(client)
    draft = load_draft(aid)
    rev0 = get_registry_revision(draft)
    gen0 = get_replacement_generation(draft, phase="review", participant_id="p2")
    begin_invite_replacement(
        draft,
        phase="review",
        participant_id="p2",
        kind=KIND_SAME_EMAIL_RESEND,
        new_jti="pending-delivery-jti",
        email="cp@example.com",
        expected_generation=gen0,
        expected_revision=rev0,
        agreement_id=aid,
        locked_version_id="",
        mode="review",
        audit_log=draft.setdefault("audit_log", []),
    )
    save_draft_cas(draft, expected_revision=rev0)
    pending = get_pending_replacement(draft, phase="review", participant_id="p2")
    assert pending and pending.get("status") == "pending_delivery"
    assert _active(draft, "p2") == old_jti

    ok = _mock_resend_success()
    with patch("backend.services.email.resend_client.httpx.Client", return_value=ok):
        d2, meta2 = resend_recipient_invite(
            agreement_id=aid,
            draft=load_draft(aid),
            phase="review",
            participant_id="p2",
            org_id="user-repl-owner",
        )
    assert meta2.get("replacement_activated") is True
    assert _active(d2, "p2") != old_jti
    assert is_jti_superseded(d2, old_jti, "review", "p2")
    # Prior crash-window pending JTI must not remain active
    assert _active(d2, "p2") != "pending-delivery-jti"
    assert is_jti_superseded(d2, "pending-delivery-jti", "review", "p2")
