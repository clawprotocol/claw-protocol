"""Adversarial: commercial signing mint/delivery fail closed when JTI registry persist fails."""

from __future__ import annotations

from unittest.mock import MagicMock, patch

import pytest
from fastapi.testclient import TestClient

from backend.main import app
from backend.security.recipient_access_token import mint_recipient_access_token
from backend.services.agreement_draft_store import load_draft
from backend.services.agreement_signing_lock_store import write_signing_lock
from backend.services.email.signing_delivery import (
    maybe_send_signing_invites_after_packet_prepared,
    send_signing_invite_to_target,
)
from backend.services.recipient_delivery_registry import (
    extract_jti_from_token,
    get_registry,
    is_jti_superseded,
    record_invite_sent,
)

pytestmark = pytest.mark.unit

_SECRET = "unit-test-jti-registry-fail-closed-secret"
_ORG = {"X-Claw-Org-Id": "user-jti-owner", "X-Claw-Test-Auth-User-Id": "jti-owner"}


@pytest.fixture()
def client(monkeypatch, tmp_path):
    from backend.usage_economics import store as usage_economics_store_mod
    from backend.admin_console import store as admin_store

    usage_economics_store_mod._store = None  # noqa: SLF001
    admin_store._store = None  # noqa: SLF001
    monkeypatch.setenv("CLAW_ENVIRONMENT", "test")
    monkeypatch.setenv("CLAW_DATA_DIR", str(tmp_path))
    monkeypatch.setenv("CLAW_USAGE_ECONOMICS_DB_PATH", str(tmp_path / "usage.sqlite3"))
    monkeypatch.setenv("CLAW_ECONOMICS_DB_PATH", str(tmp_path / "economics.sqlite3"))
    monkeypatch.setenv("CLAW_ADMIN_CONSOLE_DB_PATH", str(tmp_path / "admin.sqlite3"))
    monkeypatch.setenv("CLAW_AGREEMENT_SIGNING_TOKEN_SECRET", _SECRET)
    monkeypatch.setenv("CLAW_USAGE_ECONOMICS_ENABLED", "0")
    monkeypatch.setenv("RESEND_API_KEY", "re_test")
    monkeypatch.setenv("EMAIL_FROM", "LawDog <notifications@lawdog.me>")
    monkeypatch.setenv("CLAW_APP_PUBLIC_ORIGIN", "https://app.example.com")
    return TestClient(app)


def _create_locked_agreement(client: TestClient) -> str:
    create = client.post(
        "/api/agreements/draft",
        headers=_ORG,
        json={
            "title": "JTI fail-closed",
            "jurisdiction": "DE",
            "parties": [
                {"name": "Owner LLC", "role": "Client", "email": "owner@example.com", "id": "p1"},
                {"name": "CP LLC", "role": "Service Provider", "email": "cp@example.com", "id": "p2"},
            ],
        },
    )
    assert create.status_code == 200, create.text
    aid = create.json()["draft"]["id"]
    write_signing_lock(aid, {"locked_version_id": "v1"})
    return aid


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


def _active_signing_jti(aid: str, participant_id: str = "p2") -> str | None:
    draft = load_draft(aid)
    row = (get_registry(draft).get("recipients") or {}).get(f"signing:{participant_id}") or {}
    active = str(row.get("active_jti") or "").strip()
    return active or None


def test_sign_mint_requires_recipient_party_id(client: TestClient):
    aid = _create_locked_agreement(client)
    mint = client.post(
        f"/api/agreements/{aid}/recipient-access-token",
        headers=_ORG,
        json={"mode": "sign", "role": "signer"},
    )
    assert mint.status_code == 400
    detail = mint.json().get("detail") or {}
    assert detail.get("code") == "recipient_party_id_required"
    assert "token" not in mint.json()
    assert _active_signing_jti(aid) is None


def test_commercial_review_mint_requires_recipient_party_id(client: TestClient, monkeypatch):
    monkeypatch.setenv("CLAW_COMMERCIAL_MODE", "1")
    aid = _create_locked_agreement(client)
    mint = client.post(
        f"/api/agreements/{aid}/recipient-access-token",
        headers=_ORG,
        json={"mode": "review", "role": "signer"},
    )
    assert mint.status_code == 400
    detail = mint.json().get("detail") or {}
    assert detail.get("code") == "recipient_party_id_required"
    assert "token" not in mint.json()
    draft = load_draft(aid)
    row = (get_registry(draft).get("recipients") or {}).get("review:p2") or {}
    assert not str(row.get("active_jti") or "").strip()


def test_commercial_review_mint_persists_jti_before_token_return(client: TestClient, monkeypatch):
    monkeypatch.setenv("CLAW_COMMERCIAL_MODE", "1")
    aid = _create_locked_agreement(client)
    mint = client.post(
        f"/api/agreements/{aid}/recipient-access-token",
        headers=_ORG,
        json={"mode": "review", "role": "signer", "recipient_party_id": "p2"},
    )
    assert mint.status_code == 200, mint.text
    token = mint.json()["token"]
    jti = extract_jti_from_token(token)
    assert jti
    draft = load_draft(aid)
    row = (get_registry(draft).get("recipients") or {}).get("review:p2") or {}
    assert row.get("active_jti") == jti


def test_commercial_review_mint_registry_failure_returns_no_token(client: TestClient, monkeypatch):
    monkeypatch.setenv("CLAW_COMMERCIAL_MODE", "1")
    aid = _create_locked_agreement(client)

    def _boom(*_a, **_k):
        raise OSError("disk full")

    monkeypatch.setattr("backend.routers.agreements_v2_api._save_draft_registry_cas_sync", _boom)
    mint = client.post(
        f"/api/agreements/{aid}/recipient-access-token",
        headers=_ORG,
        json={"mode": "review", "role": "signer", "recipient_party_id": "p2"},
    )
    assert mint.status_code == 503
    detail = mint.json().get("detail") or {}
    assert detail.get("code") == "recipient_invite_registry_unavailable"
    assert detail.get("retryable") is True
    assert "token" not in mint.json()


def test_sign_mint_registry_save_failure_returns_no_token(client: TestClient, monkeypatch):
    aid = _create_locked_agreement(client)

    def _boom(*_a, **_k):
        raise OSError("disk full simulating registry persist failure")

    monkeypatch.setattr("backend.routers.agreements_v2_api._save_draft_registry_cas_sync", _boom)

    mint = client.post(
        f"/api/agreements/{aid}/recipient-access-token",
        headers=_ORG,
        json={"mode": "sign", "role": "signer", "recipient_party_id": "p2"},
    )
    assert mint.status_code == 503
    detail = mint.json().get("detail") or {}
    assert detail.get("code") == "recipient_invite_registry_unavailable"
    assert detail.get("retryable") is True
    assert "token" not in mint.json()
    assert _active_signing_jti(aid) is None


def test_sign_mint_registry_record_failure_returns_no_token(client: TestClient, monkeypatch):
    aid = _create_locked_agreement(client)

    def _boom(*_a, **_k):
        raise RuntimeError("registry write exploded")

    monkeypatch.setattr(
        "backend.services.recipient_delivery_registry.record_invite_sent",
        _boom,
    )

    mint = client.post(
        f"/api/agreements/{aid}/recipient-access-token",
        headers=_ORG,
        json={"mode": "sign", "role": "signer", "recipient_party_id": "p2"},
    )
    assert mint.status_code == 503
    detail = mint.json().get("detail") or {}
    assert detail.get("code") == "recipient_invite_registry_unavailable"
    assert "token" not in mint.json()
    assert _active_signing_jti(aid) is None


def test_sign_mint_retry_after_storage_recovery_succeeds(client: TestClient, monkeypatch):
    aid = _create_locked_agreement(client)
    calls = {"n": 0}
    real_save = None

    import backend.routers.agreements_v2_api as api

    real_save = api._save_draft_registry_cas_sync

    def _flaky(*args, **kwargs):
        calls["n"] += 1
        if calls["n"] == 1:
            raise OSError("transient persist failure")
        return real_save(*args, **kwargs)

    monkeypatch.setattr(api, "_save_draft_registry_cas_sync", _flaky)

    first = client.post(
        f"/api/agreements/{aid}/recipient-access-token",
        headers=_ORG,
        json={"mode": "sign", "role": "signer", "recipient_party_id": "p2"},
    )
    assert first.status_code == 503
    assert "token" not in first.json()
    assert _active_signing_jti(aid) is None

    second = client.post(
        f"/api/agreements/{aid}/recipient-access-token",
        headers=_ORG,
        json={"mode": "sign", "role": "signer", "recipient_party_id": "p2"},
    )
    assert second.status_code == 200, second.text
    token = second.json()["token"]
    assert token
    jti = extract_jti_from_token(token)
    assert _active_signing_jti(aid) == jti


def test_sign_mint_retry_supersedes_prior_active_jti_not_duplicate(client: TestClient):
    aid = _create_locked_agreement(client)
    first = client.post(
        f"/api/agreements/{aid}/recipient-access-token",
        headers=_ORG,
        json={"mode": "sign", "role": "signer", "recipient_party_id": "p2"},
    )
    assert first.status_code == 200
    old_token = first.json()["token"]
    old_jti = extract_jti_from_token(old_token)

    second = client.post(
        f"/api/agreements/{aid}/recipient-access-token",
        headers=_ORG,
        json={"mode": "sign", "role": "signer", "recipient_party_id": "p2"},
    )
    assert second.status_code == 200
    new_token = second.json()["token"]
    new_jti = extract_jti_from_token(new_token)
    assert new_jti != old_jti
    assert _active_signing_jti(aid) == new_jti

    draft = load_draft(aid)
    assert is_jti_superseded(draft, old_jti, "signing", "p2")
    assert not is_jti_superseded(draft, new_jti, "signing", "p2")


def test_signing_email_skips_dispatch_when_registry_fails(client: TestClient, monkeypatch):
    from backend.services.email.signing_delivery import SigningInviteDeliveryBlocked

    monkeypatch.setenv("CLAW_COMMERCIAL_MODE", "1")
    aid = _create_locked_agreement(client)
    token = mint_recipient_access_token(
        secret=_SECRET.encode("utf-8"),
        agreement_id=aid,
        locked_version_id="v1",
        mode="sign",
        role="signer",
        ttl_seconds=3600,
        recipient_party_id="p2",
    )
    jti = extract_jti_from_token(token)
    assert jti
    url = f"https://app.example.com/app/esign/doc?vs01_recipient_sign=1&t={token}"

    def _boom(*_a, **_k):
        raise RuntimeError("registry unavailable")

    monkeypatch.setattr(
        "backend.services.recipient_delivery_registry.record_invite_sent",
        _boom,
    )
    mock_client = _mock_resend_success()
    draft = load_draft(aid)
    with patch("backend.services.email.resend_client.httpx.Client", return_value=mock_client):
        with pytest.raises(SigningInviteDeliveryBlocked) as ei:
            maybe_send_signing_invites_after_packet_prepared(
                agreement_id=aid,
                draft=draft,
                targets=[
                    {
                        "email": "cp@example.com",
                        "display_name": "CP LLC",
                        "signing_url": url,
                        "signer_role_id": "role_cp",
                        "participant_id": "p2",
                    }
                ],
                packet_revision="rev_fail_closed",
                org_id="user-jti-owner",
            )
    assert ei.value.code == "signing_invite_jti_registry_required"
    assert mock_client.post.call_count == 0
    assert _active_signing_jti(aid) is None


def test_commercial_tokenless_signing_url_cannot_dispatch_email(client: TestClient, monkeypatch):
    from backend.services.email.signing_delivery import SigningInviteDeliveryBlocked

    monkeypatch.setenv("CLAW_COMMERCIAL_MODE", "1")
    aid = _create_locked_agreement(client)
    mock_client = _mock_resend_success()
    draft = load_draft(aid)
    with patch("backend.services.email.resend_client.httpx.Client", return_value=mock_client):
        with pytest.raises(SigningInviteDeliveryBlocked) as ei:
            maybe_send_signing_invites_after_packet_prepared(
                agreement_id=aid,
                draft=draft,
                targets=[
                    {
                        "email": "cp@example.com",
                        "display_name": "CP LLC",
                        "signing_url": "https://app.example.com/app/esign/doc?vs01_recipient_sign=1",
                        "signer_role_id": "role_cp",
                        "participant_id": "p2",
                    }
                ],
                packet_revision="rev_tokenless",
                org_id="user-jti-owner",
            )
    assert ei.value.code == "signing_invite_jti_registry_required"
    assert mock_client.post.call_count == 0
    assert _active_signing_jti(aid) is None


def test_commercial_signing_links_sent_tokenless_returns_retryable_503(
    client: TestClient, monkeypatch
):
    monkeypatch.setenv("CLAW_COMMERCIAL_MODE", "1")
    aid = _create_locked_agreement(client)
    mock_client = _mock_resend_success()
    with patch("backend.services.email.resend_client.httpx.Client", return_value=mock_client):
        res = client.post(
            f"/api/agreements/{aid}/signing-links-sent",
            headers=_ORG,
            json={
                "packet_revision": "rev_tokenless_api",
                "targets": [
                    {
                        "email": "cp@example.com",
                        "display_name": "CP LLC",
                        "signing_url": "https://app.example.com/sign?vs01_recipient_sign=1",
                        "signer_role_id": "role_cp",
                        "is_owner": False,
                    }
                ],
            },
        )
    assert res.status_code == 503, res.text
    detail = res.json().get("detail") or {}
    assert detail.get("code") == "signing_invite_jti_registry_required"
    assert detail.get("retryable") is True
    assert mock_client.post.call_count == 0


def test_signing_resend_skips_email_when_registry_fails(client: TestClient, monkeypatch):
    aid = _create_locked_agreement(client)
    token = mint_recipient_access_token(
        secret=_SECRET.encode("utf-8"),
        agreement_id=aid,
        locked_version_id="v1",
        mode="sign",
        role="signer",
        ttl_seconds=3600,
        recipient_party_id="p2",
    )
    url = f"https://app.example.com/app/esign/doc?vs01_recipient_sign=1&t={token}"

    def _boom(*_a, **_k):
        raise RuntimeError("registry unavailable")

    monkeypatch.setattr(
        "backend.services.recipient_delivery_registry.record_invite_sent",
        _boom,
    )
    mock_client = _mock_resend_success()
    draft = load_draft(aid)
    with patch("backend.services.email.resend_client.httpx.Client", return_value=mock_client):
        ok = send_signing_invite_to_target(
            agreement_id=aid,
            draft=draft,
            target={
                "email": "cp@example.com",
                "display_name": "CP LLC",
                "signing_url": url,
                "signer_role_id": "role_cp",
                "participant_id": "p2",
            },
            packet_revision="rev_resend",
            org_id="user-jti-owner",
        )
    assert ok is False
    assert mock_client.post.call_count == 0


def test_revoke_after_successful_mint_still_blocks_complete(client: TestClient):
    aid = _create_locked_agreement(client)
    from backend.services.agreement_draft_store import save_draft

    draft = load_draft(aid)
    draft["vs01_signing_packet_v1"] = {
        "v": 1,
        "document_id": "doc_vs01",
        "portable": {
            "v": 1,
            "seed": {"documentId": "doc_vs01", "agreementId": aid},
            "fields": [],
            "roles": [],
        },
    }
    save_draft(draft)

    mint = client.post(
        f"/api/agreements/{aid}/recipient-access-token",
        headers=_ORG,
        json={"mode": "sign", "role": "signer", "recipient_party_id": "p2"},
    )
    assert mint.status_code == 200
    token = mint.json()["token"]
    jti = extract_jti_from_token(token)
    assert _active_signing_jti(aid) == jti

    revoke = client.post(
        f"/api/agreements/{aid}/recipient-invite-revoke",
        headers=_ORG,
        json={"phase": "signing", "participant_id": "p2", "reason": "owner revoke"},
    )
    assert revoke.status_code == 200, revoke.text

    complete = client.post(
        f"/api/agreements/{aid}/vs01-signer-complete",
        headers={"X-Claw-Recipient-Access-Token": token},
        json={"signer_role_id": "role_cp", "participant_id": "p2", "document_id": "doc_vs01"},
    )
    assert complete.status_code == 403
    assert complete.json()["detail"]["code"] == "invite_superseded"


def test_reissue_supersedes_without_leaving_dual_active_jtis(client: TestClient):
    aid = _create_locked_agreement(client)
    t1 = client.post(
        f"/api/agreements/{aid}/recipient-access-token",
        headers=_ORG,
        json={"mode": "sign", "role": "signer", "recipient_party_id": "p2"},
    )
    assert t1.status_code == 200
    j1 = extract_jti_from_token(t1.json()["token"])

    draft = load_draft(aid)
    # Simulate owner cancel/reissue path: supersede then mint fresh.
    from backend.services.recipient_delivery_registry import (
        get_registry_revision,
        supersede_active_invite,
    )
    from backend.services.agreement_draft_store import save_draft_cas

    base_rev = get_registry_revision(draft)
    supersede_active_invite(draft, phase="signing", participant_id="p2", audit_log=draft["audit_log"])
    save_draft_cas(draft, expected_revision=base_rev)

    t2 = client.post(
        f"/api/agreements/{aid}/recipient-access-token",
        headers=_ORG,
        json={"mode": "sign", "role": "signer", "recipient_party_id": "p2"},
    )
    assert t2.status_code == 200
    j2 = extract_jti_from_token(t2.json()["token"])
    assert j2 != j1
    assert _active_signing_jti(aid) == j2
    draft2 = load_draft(aid)
    assert is_jti_superseded(draft2, j1, "signing", "p2")
    assert not is_jti_superseded(draft2, j2, "signing", "p2")
