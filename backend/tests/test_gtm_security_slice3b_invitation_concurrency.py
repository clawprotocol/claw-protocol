"""GTM Security Slice 3B — invitation establishment concurrency and conflict semantics."""

from __future__ import annotations

import copy
import json
import os
import threading
from typing import Any, Dict, Tuple
from unittest.mock import patch

import pytest
from fastapi.testclient import TestClient

from backend.main import app
from backend.security.negotiation_review_bootstrap_token import mint_negotiation_review_bootstrap_token
from backend.security.negotiation_review_content_binding import review_content_binding_sha256
from backend.security.negotiation_review_version_binding import PRE_LOCK_VERSION_BINDING
from backend.services.agreement_draft_store import (
    load_draft,
    save_draft,
    save_draft_establish_review_bootstrap_delivery,
)
from backend.services.recipient_delivery_registry import get_registry, record_invite_sent
from backend.tests.negotiation_review_test_helpers import (
    assert_conflicting_establishment_race_outcomes,
    assert_slice3b_provider_isolation,
    extract_bootstrap_token_from_review_url,
    force_agreement_file_storage,
    force_agreement_postgres_storage,
    mint_owner_review_copy_link,
    patch_establishment_persistence_failure,
    review_mutation_headers,
    run_conflicting_establishment_persistence_race,
    update_delivery_registry_row,
)
from backend.usage_economics import store as usage_economics_store_mod

pytestmark = pytest.mark.unit

_ORIGIN = "http://testserver"
_ORG_H = {"X-Claw-Org-Id": "test-org-slice3b-invite-concurrency"}


def _postgres_dsn() -> str:
    return (
        os.getenv("CLAW_AGREEMENT_DATABASE_URL", "").strip()
        or os.getenv("CLAW_AGREEMENT_POSTGRES_DSN", "").strip()
    )


def _configure_postgres(monkeypatch: pytest.MonkeyPatch) -> None:
    force_agreement_postgres_storage(monkeypatch, _postgres_dsn())


@pytest.fixture(autouse=True)
def _isolated(monkeypatch, tmp_path):
    from backend.tests.negotiation_review_test_helpers import install_slice3b_provider_isolation

    install_slice3b_provider_isolation(monkeypatch)
    monkeypatch.setenv("CLAW_DATA_DIR", str(tmp_path))
    monkeypatch.setenv("CLAW_AGREEMENT_DB_PATH", str(tmp_path / "agreements.sqlite3"))
    monkeypatch.setenv("CLAW_USAGE_ECONOMICS_DB_PATH", str(tmp_path / "usage.sqlite3"))
    monkeypatch.setenv("CLAW_AGREEMENT_SIGNING_TOKEN_SECRET", "unit-test-slice3b-invite-concurrency-secret")
    monkeypatch.setenv("CLAW_APP_PUBLIC_ORIGIN", "https://app.example.com")
    monkeypatch.setenv("CLAW_CORS_ALLOW_ORIGINS", "http://testserver,https://testserver,https://app.example.com")
    monkeypatch.setenv("CLAW_NEGOTIATION_REVIEW_BOOTSTRAP_RATE_LIMIT_DISABLED", "1")
    monkeypatch.setenv("CLAW_ENVIRONMENT", "local")
    usage_economics_store_mod._store = None  # noqa: SLF001
    yield
    usage_economics_store_mod._store = None  # noqa: SLF001
    assert_slice3b_provider_isolation()


@pytest.fixture(autouse=True)
def _force_file_storage_for_non_integration(monkeypatch, request):
    if request.node.get_closest_marker("integration"):
        return
    force_agreement_file_storage(monkeypatch)


def _create_agreement(client: TestClient) -> Tuple[str, str]:
    res = client.post(
        "/api/agreements/draft",
        headers=_ORG_H,
        json={
            "title": "Invite concurrency agreement",
            "jurisdiction": "TX",
            "parties": [
                {"id": "p_owner", "name": "Owner Co", "role": "owner", "email": "owner@example.com"},
                {"id": "p_r1", "name": "R1", "role": "reviewer", "email": "r1@example.com"},
            ],
            "purpose": "Payment within thirty (30) days after receipt.",
            "payment_terms": "Net 30",
            "duration": None,
            "due_date": None,
            "effective_date": None,
        },
    )
    assert res.status_code == 200, res.text
    body = res.json()
    return body["id"], body["draft"]["parties"][1]["id"]


def _establishment_row(draft: Dict[str, Any], reviewer_id: str) -> Dict[str, Any]:
    return get_registry(draft)["recipients"].get(f"review:{reviewer_id}") or {}


def _mint_establishment_draft(
    aid: str,
    reviewer_id: str,
    *,
    jti_suffix: str = "a",
    explicit_supersession: bool = False,
) -> Dict[str, Any]:
    draft = load_draft(aid)
    content_sha256 = review_content_binding_sha256(draft)
    secret = os.environ["CLAW_AGREEMENT_SIGNING_TOKEN_SECRET"].encode("utf-8")
    _token, jti, _exp = mint_negotiation_review_bootstrap_token(
        secret=secret,
        agreement_id=aid,
        locked_version_id=PRE_LOCK_VERSION_BINDING,
        party_id=reviewer_id,
        role="reviewer",
        content_sha256=content_sha256,
        ttl_seconds=3600,
    )
    jti = f"{jti}-{jti_suffix}" if jti_suffix != "a" else jti
    incoming = copy.deepcopy(draft)
    if explicit_supersession:
        record_invite_sent(
            incoming,
            phase="review",
            participant_id=reviewer_id,
            jti=jti,
            bootstrap_authority=True,
            locked_version_id=PRE_LOCK_VERSION_BINDING,
            content_sha256=content_sha256,
            role="reviewer",
        )
        return incoming
    reg = get_registry(incoming)
    row = reg["recipients"].setdefault(
        f"review:{reviewer_id}",
        {
            "phase": "review",
            "participant_id": reviewer_id,
            "active_jti": None,
            "superseded_jtis": [],
            "last_sent_at": None,
            "last_opened_at": None,
            "resent_count": 0,
            "active_signing_email": None,
        },
    )
    row["active_jti"] = jti
    row["bootstrap_authority"] = True
    row["bootstrap_locked_version_id"] = PRE_LOCK_VERSION_BINDING
    row["bootstrap_content_sha256"] = content_sha256
    row["bootstrap_role"] = "reviewer"
    row["last_sent_at"] = "2026-07-19T00:00:00Z"
    incoming["recipient_delivery_v1"] = reg
    return incoming


def test_file_mode_identical_establishment_retry_is_idempotent():
    client = TestClient(app)
    aid, reviewer_id = _create_agreement(client)
    incoming = _mint_establishment_draft(aid, reviewer_id)
    save_draft_establish_review_bootstrap_delivery(incoming)
    first = _establishment_row(load_draft(aid), reviewer_id)
    save_draft_establish_review_bootstrap_delivery(copy.deepcopy(incoming))
    second = _establishment_row(load_draft(aid), reviewer_id)
    assert second["active_jti"] == first["active_jti"]


def test_file_mode_stale_mint_conflicts_with_newer_active_invitation():
    client = TestClient(app)
    aid, reviewer_id = _create_agreement(client)
    first = _mint_establishment_draft(aid, reviewer_id, jti_suffix="first")
    save_draft_establish_review_bootstrap_delivery(first)
    winner_jti = _establishment_row(load_draft(aid), reviewer_id)["active_jti"]
    stale = _mint_establishment_draft(aid, reviewer_id, jti_suffix="stale")
    with pytest.raises(ValueError, match="delivery_establishment_active_invitation_conflict"):
        save_draft_establish_review_bootstrap_delivery(stale)
    assert _establishment_row(load_draft(aid), reviewer_id)["active_jti"] == winner_jti


def test_file_mode_explicit_resend_supersedes_prior_active_invitation():
    client = TestClient(app)
    aid, reviewer_id = _create_agreement(client)
    first = _mint_establishment_draft(aid, reviewer_id, jti_suffix="first")
    save_draft_establish_review_bootstrap_delivery(first)
    old_jti = _establishment_row(load_draft(aid), reviewer_id)["active_jti"]
    resend = _mint_establishment_draft(aid, reviewer_id, jti_suffix="resend", explicit_supersession=True)
    save_draft_establish_review_bootstrap_delivery(resend)
    row = _establishment_row(load_draft(aid), reviewer_id)
    assert row["active_jti"] != old_jti
    assert old_jti in (row.get("superseded_jtis") or [])


def test_file_mode_consumed_exchange_metadata_cannot_be_overwritten():
    client = TestClient(app)
    aid, reviewer_id = _create_agreement(client)
    established = _mint_establishment_draft(aid, reviewer_id)
    save_draft_establish_review_bootstrap_delivery(established)
    update_delivery_registry_row(
        aid,
        reviewer_id,
        bootstrap_exchanged_at="2026-07-19T00:00:00Z",
        recipient_session_id="sess-protected",
    )
    incoming = _mint_establishment_draft(aid, reviewer_id, jti_suffix="new")
    with pytest.raises(ValueError, match="delivery_establishment_conflict_after_exchange"):
        save_draft_establish_review_bootstrap_delivery(incoming)
    after = _establishment_row(load_draft(aid), reviewer_id)
    assert after.get("recipient_session_id") == "sess-protected"


def test_file_mode_stale_content_binding_rejected():
    client = TestClient(app)
    aid, reviewer_id = _create_agreement(client)
    incoming = _mint_establishment_draft(aid, reviewer_id)
    row = get_registry(incoming)["recipients"][f"review:{reviewer_id}"]
    row["bootstrap_content_sha256"] = "0" * 64
    with pytest.raises(ValueError, match="delivery_establishment_stale_content_binding"):
        save_draft_establish_review_bootstrap_delivery(incoming)


def test_file_mode_rollback_on_write_failure_preserves_registry():
    client = TestClient(app)
    aid, reviewer_id = _create_agreement(client)
    before = _establishment_row(load_draft(aid), reviewer_id)
    incoming = _mint_establishment_draft(aid, reviewer_id)
    with patch_establishment_persistence_failure():
        with pytest.raises(OSError, match="simulated write failure"):
            save_draft_establish_review_bootstrap_delivery(incoming)
    after = _establishment_row(load_draft(aid), reviewer_id)
    assert json.dumps(after, sort_keys=True) == json.dumps(before, sort_keys=True)


def test_file_mode_concurrent_establishments_one_winner():
    client = TestClient(app)
    aid, reviewer_id = _create_agreement(client)
    result = run_conflicting_establishment_persistence_race(
        aid,
        reviewer_id,
        mint_incoming_a=lambda a, r: _mint_establishment_draft(a, r, jti_suffix="one"),
        mint_incoming_b=lambda a, r: _mint_establishment_draft(a, r, jti_suffix="two"),
    )
    assert_conflicting_establishment_race_outcomes(result)


@pytest.mark.parametrize("rep", range(20))
def test_file_mode_concurrent_establishments_one_winner_repeated(rep: int):
    test_file_mode_concurrent_establishments_one_winner()


def test_owner_copy_link_race_with_bootstrap_exchange_preserves_authority():
    client = TestClient(app)
    aid, reviewer_id = _create_agreement(client)
    mint_body = mint_owner_review_copy_link(client, aid, _ORG_H, recipient_party_id=reviewer_id)
    token = extract_bootstrap_token_from_review_url(str(mint_body.get("review_url") or ""))
    exchanged: dict[str, int] = {}

    def _exchange():
        local = TestClient(app)
        exchanged["status"] = local.post(
            "/api/negotiation-review/bootstrap/exchange",
            json={"token": token},
            headers={"Origin": _ORIGIN},
        ).status_code

    def _remint():
        local = TestClient(app)
        exchanged["mint"] = local.post(
            f"/api/agreements/{aid}/owner-review-copy-link",
            headers=_ORG_H,
            json={"mode": "review", "role": "reviewer", "recipient_party_id": reviewer_id},
        ).status_code

    t1 = threading.Thread(target=_exchange)
    t2 = threading.Thread(target=_remint)
    t1.start()
    t2.start()
    t1.join(timeout=30)
    t2.join(timeout=30)
    row = _establishment_row(load_draft(aid), reviewer_id)
    assert row.get("active_jti")
    if exchanged.get("status") == 200:
        assert row.get("bootstrap_exchanged_at")


@pytest.mark.integration
def test_postgres_concurrent_establishments_one_winner(monkeypatch):
    if not _postgres_dsn():
        pytest.skip("CLAW_AGREEMENT_DATABASE_URL unavailable")
    _configure_postgres(monkeypatch)
    client = TestClient(app)
    aid, reviewer_id = _create_agreement(client)
    result = run_conflicting_establishment_persistence_race(
        aid,
        reviewer_id,
        mint_incoming_a=lambda a, r: _mint_establishment_draft(a, r, jti_suffix="pg-one"),
        mint_incoming_b=lambda a, r: _mint_establishment_draft(a, r, jti_suffix="pg-two"),
    )
    assert_conflicting_establishment_race_outcomes(result)


@pytest.mark.integration
@pytest.mark.parametrize("rep", range(20))
def test_postgres_concurrent_establishments_one_winner_repeated(monkeypatch, rep: int):
    test_postgres_concurrent_establishments_one_winner(monkeypatch)


@pytest.mark.integration
def test_postgres_identical_retry_is_idempotent(monkeypatch):
    if not _postgres_dsn():
        pytest.skip("CLAW_AGREEMENT_DATABASE_URL unavailable")
    _configure_postgres(monkeypatch)
    client = TestClient(app)
    aid, reviewer_id = _create_agreement(client)
    incoming = _mint_establishment_draft(aid, reviewer_id)
    save_draft_establish_review_bootstrap_delivery(incoming)
    first = _establishment_row(load_draft(aid), reviewer_id)
    save_draft_establish_review_bootstrap_delivery(copy.deepcopy(incoming))
    second = _establishment_row(load_draft(aid), reviewer_id)
    assert second["active_jti"] == first["active_jti"]


@pytest.mark.integration
def test_postgres_resend_racing_exchange_rejected(monkeypatch):
    if not _postgres_dsn():
        pytest.skip("CLAW_AGREEMENT_DATABASE_URL unavailable")
    _configure_postgres(monkeypatch)
    client = TestClient(app)
    aid, reviewer_id = _create_agreement(client)
    sent = client.post(f"/api/agreements/{aid}/review-sent", headers=_ORG_H, json={})
    assert sent.status_code == 200, sent.text
    mint_body = mint_owner_review_copy_link(client, aid, _ORG_H, recipient_party_id=reviewer_id)
    token = extract_bootstrap_token_from_review_url(str(mint_body.get("review_url") or ""))
    before_row = _establishment_row(load_draft(aid), reviewer_id)
    assert before_row.get("active_jti")
    exchange_status: dict[str, int] = {}
    resend_status: dict[str, int] = {}
    ready = threading.Barrier(2)

    def _exchange():
        local = TestClient(app)
        ready.wait(timeout=10)
        exchange_status["code"] = local.post(
            "/api/negotiation-review/bootstrap/exchange",
            json={"token": token},
            headers={"Origin": _ORIGIN},
        ).status_code

    def _resend():
        local = TestClient(app)
        ready.wait(timeout=10)
        resend_status["code"] = local.post(
            f"/api/agreements/{aid}/recipient-invite-resend",
            headers={**_ORG_H, **review_mutation_headers()},
            json={"phase": "review", "participant_id": reviewer_id},
        ).status_code

    t_exchange = threading.Thread(target=_exchange)
    t_resend = threading.Thread(target=_resend)
    t_exchange.start()
    t_resend.start()
    t_exchange.join(timeout=30)
    t_resend.join(timeout=30)
    codes = sorted([exchange_status.get("code", 0), resend_status.get("code", 0)])
    assert 200 in codes
    assert 409 in codes or 403 in codes
    after_row = _establishment_row(load_draft(aid), reviewer_id)
    assert after_row.get("active_jti")
    if exchange_status.get("code") == 200:
        assert after_row.get("bootstrap_exchanged_at")
        assert after_row.get("recipient_session_id")


@pytest.mark.integration
def test_postgres_stale_content_binding_rejected(monkeypatch):
    if not _postgres_dsn():
        pytest.skip("CLAW_AGREEMENT_DATABASE_URL unavailable")
    _configure_postgres(monkeypatch)
    client = TestClient(app)
    aid, reviewer_id = _create_agreement(client)
    incoming = _mint_establishment_draft(aid, reviewer_id, jti_suffix="stale")
    incoming["recipient_delivery_v1"]["recipients"][f"review:{reviewer_id}"]["bootstrap_content_sha256"] = "deadbeef"
    with pytest.raises(ValueError, match="delivery_establishment_stale_content_binding"):
        save_draft_establish_review_bootstrap_delivery(incoming)


@pytest.mark.integration
def test_postgres_establishment_rollback_preserves_registry(monkeypatch):
    if not _postgres_dsn():
        pytest.skip("CLAW_AGREEMENT_DATABASE_URL unavailable")
    _configure_postgres(monkeypatch)
    client = TestClient(app)
    aid, reviewer_id = _create_agreement(client)
    before = copy.deepcopy(get_registry(load_draft(aid)))
    incoming = _mint_establishment_draft(aid, reviewer_id, jti_suffix="rollback")
    with patch_establishment_persistence_failure(error=RuntimeError("injected rollback")):
        with pytest.raises(RuntimeError, match="injected rollback"):
            save_draft_establish_review_bootstrap_delivery(incoming)
    after = get_registry(load_draft(aid))
    assert after == before


def test_establishment_race_reraises_unrelated_value_error():
    client = TestClient(app)
    aid, reviewer_id = _create_agreement(client)

    def _boom(_draft: Dict[str, Any]) -> None:
        raise ValueError("unrelated_failure")

    with patch(
        "backend.services.agreement_draft_store.save_draft_establish_review_bootstrap_delivery",
        side_effect=_boom,
    ):
        with pytest.raises(ValueError, match="unrelated_failure"):
            run_conflicting_establishment_persistence_race(
                aid,
                reviewer_id,
                mint_incoming_a=lambda a, r: _mint_establishment_draft(a, r, jti_suffix="one"),
                mint_incoming_b=lambda a, r: _mint_establishment_draft(a, r, jti_suffix="two"),
            )


def test_establishment_race_records_exact_active_invitation_conflict():
    client = TestClient(app)
    aid, reviewer_id = _create_agreement(client)
    result = run_conflicting_establishment_persistence_race(
        aid,
        reviewer_id,
        mint_incoming_a=lambda a, r: _mint_establishment_draft(a, r, jti_suffix="winner"),
        mint_incoming_b=lambda a, r: _mint_establishment_draft(a, r, jti_suffix="loser"),
    )
    assert_conflicting_establishment_race_outcomes(result)
    assert sorted(status for status, _jti in result.outcomes) == ["conflict", "ok"]
