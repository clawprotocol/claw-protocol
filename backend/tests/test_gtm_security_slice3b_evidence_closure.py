"""GTM Security Slice 3B — final evidence closure (fault injection, MP, stale writer, proposal finalize)."""

from __future__ import annotations

import copy
import json
import multiprocessing
import os
import re
from typing import Any, Dict, Optional, Tuple
from unittest.mock import MagicMock, patch

import pytest
from fastapi.testclient import TestClient

from backend.main import app
from backend.routers.agreements_v2_api import STAGED_RECIPIENT_PROPOSALS_KEY
from backend.security.negotiation_review_version_binding import PRE_LOCK_VERSION_BINDING
from backend.services.agreement_draft_store import (
    _agreement_path,
    _decode_draft_payload,
    load_draft,
    save_draft,
)
from backend.services.negotiation_review_session_store import (
    NEGOTIATION_REVIEW_SESSIONS_FIELD,
    count_sessions_for_agreement,
    get_sessions_field,
)
from backend.services.recipient_delivery_registry import delivery_registry_material, get_registry
from backend.tests.negotiation_review_test_helpers import (
    bootstrap_review_session,
    review_mutation_headers,
)
from backend.usage_economics import store as usage_economics_store_mod

pytestmark = pytest.mark.unit

_ORIGIN = "http://testserver"
_ORG_H = {"X-Claw-Org-Id": "test-org-slice3b-evidence"}


def _postgres_dsn() -> str:
    return (
        os.getenv("CLAW_AGREEMENT_DATABASE_URL", "").strip()
        or os.getenv("CLAW_AGREEMENT_POSTGRES_DSN", "").strip()
    )


@pytest.fixture(autouse=True)
def _isolated(monkeypatch, tmp_path):
    from backend.tests.negotiation_review_test_helpers import (
        assert_slice3b_provider_isolation,
        force_agreement_file_storage,
        install_slice3b_provider_isolation,
    )

    install_slice3b_provider_isolation(monkeypatch)
    force_agreement_file_storage(monkeypatch)
    monkeypatch.setenv("CLAW_DATA_DIR", str(tmp_path))
    monkeypatch.setenv("CLAW_AGREEMENT_DB_PATH", str(tmp_path / "agreements.sqlite3"))
    monkeypatch.setenv("CLAW_USAGE_ECONOMICS_DB_PATH", str(tmp_path / "usage.sqlite3"))
    monkeypatch.setenv("CLAW_AGREEMENT_SIGNING_TOKEN_SECRET", "unit-test-slice3b-evidence-secret")
    monkeypatch.setenv("CLAW_APP_PUBLIC_ORIGIN", "https://app.example.com")
    monkeypatch.setenv("CLAW_CORS_ALLOW_ORIGINS", "http://testserver,https://testserver,https://app.example.com")
    monkeypatch.setenv("CLAW_NEGOTIATION_REVIEW_BOOTSTRAP_RATE_LIMIT_DISABLED", "1")
    monkeypatch.setenv("CLAW_REVIEW_DELIVERY_MODE", "email")
    monkeypatch.setenv("RESEND_API_KEY", "re_test_key")
    monkeypatch.setenv("EMAIL_FROM", "LawDog <noreply@example.test>")
    monkeypatch.setenv("CLAW_ENVIRONMENT", "local")
    usage_economics_store_mod._store = None  # noqa: SLF001
    from backend.services.negotiation_review_session_store import reset_negotiation_review_session_store_for_tests

    reset_negotiation_review_session_store_for_tests()
    yield
    usage_economics_store_mod._store = None  # noqa: SLF001
    reset_negotiation_review_session_store_for_tests()
    assert_slice3b_provider_isolation()


def _mock_resend() -> MagicMock:
    mock_response = MagicMock()
    mock_response.status_code = 200
    mock_response.text = '{"id":"msg_ok"}'
    mock_response.json.return_value = {"id": "msg_ok"}
    mock_client = MagicMock()
    mock_client.post.return_value = mock_response
    mock_client.__enter__ = MagicMock(return_value=mock_client)
    mock_client.__exit__ = MagicMock(return_value=False)
    return mock_client


def _create_agreement(client: TestClient) -> Tuple[str, str]:
    res = client.post(
        "/api/agreements/draft",
        headers=_ORG_H,
        json={
            "title": "Evidence closure agreement",
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


def _bootstrap_token(client: TestClient, aid: str, reviewer_id: str) -> str:
    mint = client.post(
        f"/api/agreements/{aid}/owner-review-copy-link",
        headers=_ORG_H,
        json={"mode": "review", "role": "reviewer", "recipient_party_id": reviewer_id},
    )
    assert mint.status_code == 200, mint.text
    url = mint.json()["review_url"]
    return url.split("#t=", 1)[-1].split("&", 1)[0]


def _exchange(client: TestClient, token: str, *, origin: str = _ORIGIN):
    return client.post(
        "/api/negotiation-review/bootstrap/exchange",
        json={"token": token},
        headers={"Origin": origin} if origin is not None else {},
    )


def _staged_map(draft: Dict[str, Any]) -> Dict[str, Any]:
    pr = draft.get("pro_redline_v1") or {}
    staged = pr.get(STAGED_RECIPIENT_PROPOSALS_KEY)
    return copy.deepcopy(staged) if isinstance(staged, dict) else {}


def _staged_canonical(draft: Dict[str, Any]) -> str:
    return json.dumps(_staged_map(draft), sort_keys=True, separators=(",", ":"))


def _session_last_seen(draft: Dict[str, Any]) -> Optional[str]:
    sessions = (get_sessions_field(draft).get("sessions") or {}).values()
    seen = [str(s.get("last_seen_at") or "") for s in sessions if isinstance(s, dict)]
    return seen[0] if seen else None


def _assert_no_plaintext_credentials_in_file(path: str, *, bootstrap_token: str) -> None:
    raw = open(path, encoding="utf-8").read()
    assert bootstrap_token not in raw
    # JWT-like bootstrap body must not appear
    if "." in bootstrap_token:
        body_seg = bootstrap_token.split(".", 1)[0]
        if len(body_seg) > 8:
            assert body_seg not in raw
    for forbidden_sub in ('"token":', '"session_secret":', "#t="):
        assert forbidden_sub not in raw
    assert "token_hash" in raw


def _stage_proposal(client: TestClient, aid: str, reviewer_id: str) -> Tuple[str, Dict[str, Any]]:
    owner = TestClient(app, base_url=str(client.base_url))
    draft = owner.get(f"/api/agreements/{aid}", headers=_ORG_H).json()["draft"]
    scheme = "https" if str(client.base_url).startswith("https") else "http"
    rh = review_mutation_headers(origin=f"{scheme}://testserver")
    stage = client.post(
        f"/api/agreements/{aid}/recipient-proposal/stage",
        headers=rh,
        json={
            "instruction": "Change payment timing.",
            "proposer_id": reviewer_id,
            "proposer_display_name": "R1",
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
            "rendered_html": "<p>Payment within fifteen (15) days.</p>",
        },
    )
    assert stage.status_code == 200, stage.text
    return stage.json()["proposal_id"], draft


# ---------------------------------------------------------------------------
# 1. File commit fault injection
# ---------------------------------------------------------------------------


def test_exchange_pre_replace_failure_leaves_authority_uncommitted_and_retry_succeeds():
    client = TestClient(app)
    aid, reviewer_id = _create_agreement(client)
    token = _bootstrap_token(client, aid, reviewer_id)
    assert count_sessions_for_agreement(aid) == 0

    with patch("backend.services.agreement_draft_store.os.replace", side_effect=OSError("simulated pre-commit")):
        denied = _exchange(client, token)
    assert denied.status_code == 403

    draft = load_draft(aid)
    row = get_registry(draft)["recipients"].get(f"review:{reviewer_id}") or {}
    assert not row.get("bootstrap_exchanged_at")
    assert count_sessions_for_agreement(aid) == 0

    ok = _exchange(client, token)
    assert ok.status_code == 200
    assert count_sessions_for_agreement(aid) == 1
    draft_after = load_draft(aid)
    row_after = get_registry(draft_after)["recipients"].get(f"review:{reviewer_id}") or {}
    assert row_after.get("bootstrap_exchanged_at")
    assert row_after.get("recipient_session_id")


def test_exchange_post_replace_dir_fsync_failure_treats_authority_committed_and_blocks_replay():
    client = TestClient(app)
    aid, reviewer_id = _create_agreement(client)
    token = _bootstrap_token(client, aid, reviewer_id)
    fsync_calls = {"n": 0}

    def _fsync(fd: int) -> None:
        fsync_calls["n"] += 1
        if fsync_calls["n"] >= 2:
            raise OSError("simulated directory fsync failure")

    with patch("backend.services.agreement_draft_store.os.fsync", side_effect=_fsync):
        first = _exchange(client, token)
    assert first.status_code == 200
    assert count_sessions_for_agreement(aid) == 1

    replay = _exchange(client, token)
    assert replay.status_code == 403
    assert count_sessions_for_agreement(aid) == 1

    path = str(_agreement_path(aid))
    _assert_no_plaintext_credentials_in_file(path, bootstrap_token=token)


def test_persisted_agreement_file_contains_hashes_not_plaintext_secrets():
    client = TestClient(app)
    aid, reviewer_id = _create_agreement(client)
    token = _bootstrap_token(client, aid, reviewer_id)
    ex = _exchange(client, token)
    assert ex.status_code == 200
    session_secret = client.cookies.get("claw_negotiation_review_session") or client.cookies.get(
        "__Host-claw_negotiation_review_session"
    )
    path = str(_agreement_path(aid))
    raw = open(path, encoding="utf-8").read()
    assert token not in raw
    if session_secret:
        assert session_secret not in raw
    assert "token_hash" in raw
    _assert_no_plaintext_credentials_in_file(path, bootstrap_token=token)


# ---------------------------------------------------------------------------
# 2. Real multiprocessing contention
# ---------------------------------------------------------------------------


def _mp_exchange_worker(data_dir: str, token: str, out_path: str) -> None:
    os.environ["CLAW_DATA_DIR"] = data_dir
    os.environ["CLAW_AGREEMENT_DB_PATH"] = os.path.join(data_dir, "agreements.sqlite3")
    os.environ["CLAW_USAGE_ECONOMICS_DB_PATH"] = os.path.join(data_dir, "usage.sqlite3")
    os.environ["CLAW_AGREEMENT_SIGNING_TOKEN_SECRET"] = "unit-test-slice3b-evidence-secret"
    os.environ["CLAW_NEGOTIATION_REVIEW_BOOTSTRAP_RATE_LIMIT_DISABLED"] = "1"
    os.environ["CLAW_ENVIRONMENT"] = "local"
    os.environ["CLAW_APP_PUBLIC_ORIGIN"] = "https://app.example.com"
    from fastapi.testclient import TestClient

    from backend.main import app as mp_app

    client = TestClient(mp_app)
    res = client.post(
        "/api/negotiation-review/bootstrap/exchange",
        json={"token": token},
        headers={"Origin": "http://testserver"},
    )
    with open(out_path, "w", encoding="utf-8") as handle:
        handle.write(str(res.status_code))


def test_multiprocessing_concurrent_exchange_one_session_one_consumption():
    client = TestClient(app)
    aid, reviewer_id = _create_agreement(client)
    token = _bootstrap_token(client, aid, reviewer_id)
    data_dir = os.environ["CLAW_DATA_DIR"]
    out_a = os.path.join(data_dir, "mp_a.txt")
    out_b = os.path.join(data_dir, "mp_b.txt")
    ctx = multiprocessing.get_context("fork")
    p1 = ctx.Process(target=_mp_exchange_worker, args=(data_dir, token, out_a))
    p2 = ctx.Process(target=_mp_exchange_worker, args=(data_dir, token, out_b))
    p1.start()
    p2.start()
    p1.join(timeout=30)
    p2.join(timeout=30)
    assert p1.exitcode == 0 and p2.exitcode == 0
    codes = sorted([int(open(p, encoding="utf-8").read()) for p in (out_a, out_b)])
    assert codes == [200, 403]
    assert count_sessions_for_agreement(aid) == 1
    draft = load_draft(aid)
    row = get_registry(draft)["recipients"].get(f"review:{reviewer_id}") or {}
    assert row.get("bootstrap_exchanged_at")
    assert row.get("recipient_session_id")
    _assert_no_plaintext_credentials_in_file(str(_agreement_path(aid)), bootstrap_token=token)


# ---------------------------------------------------------------------------
# 3. Stale generic-writer replay
# ---------------------------------------------------------------------------


def _exchange_bootstrap(client: TestClient, aid: str, reviewer_id: str) -> None:
    bootstrap_review_session(client, aid, _ORG_H, recipient_party_id=reviewer_id, role="reviewer")


def test_stale_generic_writer_omission_preserves_authority_and_ordinary_changes():
    client = TestClient(app)
    aid, reviewer_id = _create_agreement(client)
    consumed_token = _bootstrap_token(client, aid, reviewer_id)
    stale = copy.deepcopy(load_draft(aid))
    assert _exchange(client, consumed_token).status_code == 200
    after = load_draft(aid)
    delivery_after = copy.deepcopy(after.get("recipient_delivery_v1"))
    sessions_after = copy.deepcopy(after.get(NEGOTIATION_REVIEW_SESSIONS_FIELD))

    stale["purpose"] = (stale.get("purpose") or "P") + " stale-writer-update"
    stale.pop("recipient_delivery_v1", None)
    stale.pop(NEGOTIATION_REVIEW_SESSIONS_FIELD, None)
    save_draft(stale)

    latest = load_draft(aid)
    assert latest.get("purpose", "").endswith("stale-writer-update")
    assert delivery_registry_material(latest.get("recipient_delivery_v1") or {}) == delivery_registry_material(
        delivery_after or {}
    )
    from backend.services.negotiation_review_session_store import sessions_field_material

    assert sessions_field_material(latest.get(NEGOTIATION_REVIEW_SESSIONS_FIELD) or {}) == sessions_field_material(
        sessions_after or {}
    )
    row = get_registry(latest)["recipients"].get(f"review:{reviewer_id}") or {}
    assert row.get("bootstrap_exchanged_at")
    replay = _exchange(client, consumed_token)
    assert replay.status_code == 403


def test_stale_generic_writer_explicit_registry_cannot_restore_pre_exchange_state():
    client = TestClient(app)
    aid, reviewer_id = _create_agreement(client)
    stale = copy.deepcopy(load_draft(aid))
    pre_delivery = copy.deepcopy(stale.get("recipient_delivery_v1") or {"v": 1, "recipients": {}})
    _exchange_bootstrap(client, aid, reviewer_id)

    stale["purpose"] = (stale.get("purpose") or "P") + " explicit-stale"
    stale["recipient_delivery_v1"] = pre_delivery
    stale.pop(NEGOTIATION_REVIEW_SESSIONS_FIELD, None)
    with pytest.raises(ValueError, match="recipient_delivery_registry_immutable"):
        save_draft(stale)

    latest = load_draft(aid)
    assert not latest.get("purpose", "").endswith("explicit-stale")
    row = get_registry(latest)["recipients"].get(f"review:{reviewer_id}") or {}
    assert row.get("bootstrap_exchanged_at")


def test_stale_generic_writer_cannot_clear_or_establish_sessions_field():
    client = TestClient(app)
    aid, reviewer_id = _create_agreement(client)
    _exchange_bootstrap(client, aid, reviewer_id)
    latest = load_draft(aid)
    tampered = copy.deepcopy(latest)
    tampered["negotiation_review_sessions_v1"] = {"v": 1, "sessions": {}}
    with pytest.raises(ValueError, match="negotiation_review_sessions_immutable"):
        save_draft(tampered)


@pytest.mark.integration
def test_postgres_stale_generic_writer_preserves_authority(monkeypatch):
    dsn = _postgres_dsn()
    if not dsn:
        pytest.skip("CLAW_AGREEMENT_DATABASE_URL unavailable")
    monkeypatch.setenv("CLAW_AGREEMENT_DATABASE_URL", dsn)
    client = TestClient(app)
    aid, reviewer_id = _create_agreement(client)
    stale = copy.deepcopy(load_draft(aid))
    _exchange_bootstrap(client, aid, reviewer_id)
    after = load_draft(aid)
    delivery_after = copy.deepcopy(after.get("recipient_delivery_v1"))
    stale["purpose"] = (stale.get("purpose") or "P") + " pg-stale"
    stale.pop("recipient_delivery_v1", None)
    stale.pop(NEGOTIATION_REVIEW_SESSIONS_FIELD, None)
    save_draft(stale)
    latest = load_draft(aid)
    assert delivery_registry_material(latest.get("recipient_delivery_v1") or {}) == delivery_registry_material(
        delivery_after or {}
    )


# ---------------------------------------------------------------------------
# 4. Proposal finalization authorization / no-side-effect matrix
# ---------------------------------------------------------------------------


@pytest.fixture()
def _staged_proposal() -> Tuple[TestClient, str, str, str, str]:
    client = TestClient(app)
    aid, reviewer_id = _create_agreement(client)
    bootstrap_review_session(client, aid, _ORG_H, recipient_party_id=reviewer_id, role="reviewer")
    proposal_id, _ = _stage_proposal(client, aid, reviewer_id)
    before = load_draft(aid)
    return client, aid, reviewer_id, proposal_id, _staged_canonical(before)


def test_proposal_finalize_success_returns_sanitized_projection(_staged_proposal):
    client, aid, _rid, proposal_id, _ = _staged_proposal
    res = client.post(
        f"/api/agreements/{aid}/recipient-proposal",
        headers=review_mutation_headers(),
        json={"proposal_id": proposal_id},
    )
    assert res.status_code == 200, res.text
    body = res.json()
    assert body.get("ok") is True
    assert "review_authorization" in body
    assert "recipient_delivery_v1" not in body.get("draft", {})
    assert NEGOTIATION_REVIEW_SESSIONS_FIELD not in body.get("draft", {})


@pytest.mark.parametrize(
    "headers",
    [
        {},
        {"Content-Type": "application/json"},
        {"Origin": "null", "Content-Type": "application/json"},
        {"Origin": "not-a-url", "Content-Type": "application/json"},
        {"Origin": "https://evil.example", "Content-Type": "application/json"},
        {"Origin": "http://testserver:9999", "Content-Type": "application/json"},
        {"Origin": "ftp://testserver", "Content-Type": "application/json"},
    ],
)
def test_proposal_finalize_rejects_bad_origin_without_side_effects(_staged_proposal, headers):
    client, aid, _rid, proposal_id, staged_before = _staged_proposal
    before = load_draft(aid)
    last_seen_before = _session_last_seen(before)
    with patch(
        "backend.services.email.review_delivery.maybe_notify_owner_after_reviewer_approval"
    ) as notify_owner:
        res = client.post(
            f"/api/agreements/{aid}/recipient-proposal",
            headers=headers,
            json={"proposal_id": proposal_id},
        )
    assert res.status_code == 403
    notify_owner.assert_not_called()
    after = load_draft(aid)
    assert _staged_canonical(after) == staged_before
    assert _session_last_seen(after) == last_seen_before
    pending = [e for e in (after.get("audit_log") or []) if e.get("event_type") == "recipient_proposal_pending"]
    assert not pending


@pytest.mark.parametrize(
    "env,headers,expected",
    [
        ("local", {"Origin": _ORIGIN, "Content-Type": "application/json"}, 200),
        ("dev", {"Origin": _ORIGIN, "Content-Type": "application/json"}, 200),
        ("test", {"Origin": _ORIGIN, "Content-Type": "application/json"}, 200),
        ("local", {"Referer": f"{_ORIGIN}/agreements/x/review", "Content-Type": "application/json"}, 200),
        ("production", {"Origin": _ORIGIN, "Content-Type": "application/json"}, 200),
        ("production", {}, 403),
        ("production", {"Referer": f"{_ORIGIN}/agreements/x/review", "Content-Type": "application/json"}, 403),
        ("staging", {}, 403),
        ("preview", {}, 403),
        ("ci", {}, 403),
        ("prod", {}, 403),
        ("Production", {}, 403),
        ("", {}, 403),
        ("unknown", {}, 403),
    ],
)
def test_proposal_finalize_origin_environment_matrix(
    monkeypatch, env: str, headers: Dict[str, str], expected: int
):
    monkeypatch.setenv("CLAW_ENVIRONMENT", env)
    relaxed = env in ("local", "dev", "test")
    production_like = not relaxed
    origin = "https://testserver" if production_like else _ORIGIN
    base_url = "https://testserver" if production_like else "http://testserver"
    client = TestClient(app, base_url=base_url)
    aid, reviewer_id = _create_agreement(client)
    bootstrap_review_session(
        client,
        aid,
        _ORG_H,
        recipient_party_id=reviewer_id,
        role="reviewer",
        origin=origin,
    )
    proposal_id, _ = _stage_proposal(client, aid, reviewer_id)
    staged_before = _staged_canonical(load_draft(aid))
    req_headers = dict(headers)
    if production_like and req_headers.get("Origin") == _ORIGIN:
        req_headers["Origin"] = origin
    if production_like and req_headers.get("Referer", "").startswith("http://"):
        req_headers["Referer"] = req_headers["Referer"].replace("http://", "https://", 1)
    res = client.post(
        f"/api/agreements/{aid}/recipient-proposal",
        headers=req_headers,
        json={"proposal_id": proposal_id},
    )
    assert res.status_code == expected
    if expected != 200:
        assert _staged_canonical(load_draft(aid)) == staged_before


def test_proposal_finalize_rejects_bootstrap_token_cross_validator():
    from backend.security.negotiation_review_bootstrap_token import mint_negotiation_review_bootstrap_token
    from backend.services.recipient_delivery_registry import record_invite_sent

    client = TestClient(app)
    aid, reviewer_id = _create_agreement(client)
    secret = os.environ["CLAW_AGREEMENT_SIGNING_TOKEN_SECRET"].encode("utf-8")
    draft = load_draft(aid)
    from backend.security.negotiation_review_content_binding import review_content_binding_sha256

    token, jti, _ = mint_negotiation_review_bootstrap_token(
        secret=secret,
        agreement_id=aid,
        locked_version_id=PRE_LOCK_VERSION_BINDING,
        party_id=reviewer_id,
        role="reviewer",
        content_sha256=review_content_binding_sha256(draft),
        ttl_seconds=3600,
    )
    record_invite_sent(
        draft,
        phase="review",
        participant_id=reviewer_id,
        jti=jti,
        bootstrap_authority=True,
        locked_version_id=PRE_LOCK_VERSION_BINDING,
        content_sha256=review_content_binding_sha256(draft),
        role="reviewer",
    )
    from backend.services.agreement_draft_store import save_draft_establish_review_bootstrap_delivery

    save_draft_establish_review_bootstrap_delivery(draft)
    bootstrap_review_session(client, aid, _ORG_H, recipient_party_id=reviewer_id, role="reviewer")
    proposal_id, _ = _stage_proposal(client, aid, reviewer_id)
    staged_before = _staged_canonical(load_draft(aid))
    assert client.post(
        "/api/negotiation-review/session/logout",
        headers=review_mutation_headers(),
    ).status_code == 200
    header_only = TestClient(app)
    res = header_only.post(
        f"/api/agreements/{aid}/recipient-proposal",
        headers={
            "X-Claw-Recipient-Access-Token": token,
            "Origin": _ORIGIN,
            "Content-Type": "application/json",
        },
        json={"proposal_id": proposal_id},
    )
    assert res.status_code == 403
    assert _staged_canonical(load_draft(aid)) == staged_before
