"""Phase 3C2A: bootstrap exchange, session cookie auth, and atomic consumption."""

from __future__ import annotations

import json
import multiprocessing
import os
import threading
import time
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime
from unittest.mock import patch
from urllib.parse import unquote, urlparse

import pytest
from fastapi.testclient import TestClient

from backend.main import app
from backend.security.vs01_recipient_bootstrap_token import (
    mint_vs01_recipient_bootstrap_token,
    token_fingerprint,
)
from backend.services.agreement_draft_store import (
    _agreement_path,
    _decode_draft_payload,
    _write_draft_file_unlocked,
    agreement_file_lock,
    load_draft,
    save_draft,
)
from backend.services.recipient_bootstrap_session_store import (
    RECIPIENT_BOOTSTRAP_SESSIONS_FIELD,
    count_sessions_for_agreement,
    count_sessions_in_draft,
    find_session_in_draft_by_token_hash,
    get_session_by_token_hash,
    init_session_lookup_index,
    reset_recipient_bootstrap_session_store_for_tests,
    session_token_hash,
    upsert_session_lookup_hint,
)
from backend.services.vs01_recipient_bootstrap_exchange import (
    RecipientBootstrapExchangeError,
    _min_exchange_window_seconds,
    _session_ttl_seconds,
)
from backend.services.vs01_signing_invite_delivery import (
    VS01_SIGNING_INVITE_DELIVERY_FIELD,
    STATE_DELIVERED,
)
from backend.tests.test_vs01_signing_invite_delivery import (
    _deliver,
    _enable_delivery_gates,
    _mock_provider,
    _token_from_signing_url,
)
from backend.tests.test_vs01_signing_packet_activation import (
    _DOCUMENT_ID,
    _ORG_H,
    _activate,
    _prepare_authorities,
)
from backend.usage_economics import store as usage_economics_store_mod

pytestmark = pytest.mark.unit

_ORIGIN = "http://testserver"


@pytest.fixture(autouse=True)
def _isolated_store(monkeypatch, tmp_path):
    monkeypatch.setenv("CLAW_DATA_DIR", str(tmp_path))
    monkeypatch.setenv("CLAW_AGREEMENT_DB_PATH", str(tmp_path / "agreements.sqlite3"))
    monkeypatch.setenv("CLAW_USAGE_ECONOMICS_DB_PATH", str(tmp_path / "usage.sqlite3"))
    monkeypatch.setenv("CLAW_AGREEMENT_SIGNING_TOKEN_SECRET", "unit-test-bootstrap-exchange-secret")
    monkeypatch.setenv("CLAW_APP_PUBLIC_ORIGIN", "https://app.example.com")
    monkeypatch.setenv("CLAW_ENVIRONMENT", "local")
    monkeypatch.setenv("CLAW_RECIPIENT_BOOTSTRAP_RATE_LIMIT_DISABLED", "1")
    monkeypatch.setenv("RESEND_API_KEY", "re_test_key")
    monkeypatch.setenv("EMAIL_FROM", "LawDog <noreply@example.test>")
    monkeypatch.delenv("CLAW_SIGNING_INVITE_DELIVERY_ENABLED", raising=False)
    monkeypatch.delenv("CLAW_SIGNING_INVITE_RECIPIENT_BOOTSTRAP_ENABLED", raising=False)
    usage_economics_store_mod._store = None  # noqa: SLF001
    reset_recipient_bootstrap_session_store_for_tests()
    yield
    usage_economics_store_mod._store = None  # noqa: SLF001
    reset_recipient_bootstrap_session_store_for_tests()


def _setup_delivered(monkeypatch) -> tuple[TestClient, str, str, str]:
    client = TestClient(app)
    _enable_delivery_gates(monkeypatch)
    agreement_id, _, _, portable = _prepare_authorities(client)
    assert _activate(client, agreement_id, portable).status_code == 200
    provider = _mock_provider()
    with patch(
        "backend.services.email.signing_delivery.default_authoritative_provider_send_fn",
        lambda draft: provider,
    ):
        assert _deliver(client, agreement_id).status_code == 200
    token = _token_from_signing_url(provider.calls[0]["signing_url"])
    delivery_identity = provider.calls[0]["delivery_identity"]
    return client, agreement_id, token, delivery_identity


def _mutate_delivery_record(agreement_id: str, delivery_identity: str, mutator) -> None:
    with agreement_file_lock(agreement_id):
        path = _agreement_path(agreement_id)
        draft = _decode_draft_payload(path.read_text(encoding="utf-8"))
        record = draft[VS01_SIGNING_INVITE_DELIVERY_FIELD]["recipients"][delivery_identity]
        mutator(record)
        _write_draft_file_unlocked(path, draft)


def _mutate_draft(agreement_id: str, mutator) -> None:
    with agreement_file_lock(agreement_id):
        path = _agreement_path(agreement_id)
        draft = _decode_draft_payload(path.read_text(encoding="utf-8"))
        mutator(draft)
        _write_draft_file_unlocked(path, draft)


def _exchange(client: TestClient, token: str, *, origin: str = _ORIGIN):
    return client.post(
        "/api/recipient/bootstrap/exchange",
        json={"token": token},
        headers={"Origin": origin},
    )


def _status(client: TestClient):
    return client.get("/api/recipient/session/status")


def _logout(client: TestClient, *, origin: str = _ORIGIN):
    return client.post(
        "/api/recipient/session/logout",
        headers={"Origin": origin},
    )


def test_valid_token_exchanges_and_sets_httponly_cookie(monkeypatch):
    client, agreement_id, token, delivery_identity = _setup_delivered(monkeypatch)
    res = _exchange(client, token)
    assert res.status_code == 200
    body = res.json()
    assert body["authenticated"] is True
    assert body["readiness"] == "session_established"
    assert "session_secret" not in body
    assert "token" not in json.dumps(body)
    set_cookie = res.headers.get("set-cookie") or ""
    assert "claw_recipient_session=" in set_cookie
    assert "httponly" in set_cookie.lower()
    assert "path=/" in set_cookie.lower()
    assert "domain=" not in set_cookie.lower()

    stored = load_draft(agreement_id)[VS01_SIGNING_INVITE_DELIVERY_FIELD]
    record = stored["recipients"][delivery_identity]
    assert record.get("bootstrap_exchanged_at")
    assert record.get("recipient_session_id")
    draft = load_draft(agreement_id)
    assert count_sessions_in_draft(draft) == 1
    assert count_sessions_for_agreement(agreement_id) == 1
    assert RECIPIENT_BOOTSTRAP_SESSIONS_FIELD in draft

    status = _status(client)
    assert status.status_code == 200
    assert status.json()["authenticated"] is True


def test_replay_creates_no_second_session(monkeypatch):
    client, agreement_id, token, _ = _setup_delivered(monkeypatch)
    first = _exchange(client, token)
    assert first.status_code == 200
    replay = _exchange(client, token)
    assert replay.status_code == 403
    assert replay.json()["detail"]["code"] == "bootstrap_invalid_or_expired"
    assert count_sessions_for_agreement(agreement_id) == 1


def test_concurrent_exchange_produces_one_winner(monkeypatch):
    client, agreement_id, token, _ = _setup_delivered(monkeypatch)
    barrier = threading.Barrier(2)

    def _call():
        barrier.wait()
        return _exchange(client, token)

    with ThreadPoolExecutor(max_workers=2) as pool:
        results = list(pool.map(lambda _: _call(), range(2)))
    ok = [r for r in results if r.status_code == 200]
    fail = [r for r in results if r.status_code == 403]
    assert len(ok) == 1
    assert len(fail) == 1
    assert count_sessions_for_agreement(agreement_id) == 1


def test_expired_token_rejected(monkeypatch):
    client, agreement_id, token, delivery_identity = _setup_delivered(monkeypatch)
    stored = load_draft(agreement_id)
    batch = stored[VS01_SIGNING_INVITE_DELIVERY_FIELD]
    record = batch["recipients"][delivery_identity]
    secret = b"unit-test-bootstrap-exchange-secret"
    authority = batch["authority"]
    expired_token, _, _ = mint_vs01_recipient_bootstrap_token(
        secret=secret,
        agreement_id=agreement_id,
        accepted_version_id=authority["accepted_version_id"],
        accepted_corpus_sha256=authority["accepted_corpus_sha256"],
        packet_revision=authority["packet_revision"],
        frozen_authority_material_hash=authority["frozen_authority_material_hash"],
        signer_record_id=record["signer_record_id"],
        party_id=record["party_id"],
        locked_version_id=authority["locked_version_id"],
        ttl_seconds=-10,
    )
    res = _exchange(client, expired_token)
    assert res.status_code == 403


def test_malformed_and_forged_tokens_rejected(monkeypatch):
    client, _, token, _ = _setup_delivered(monkeypatch)
    assert _exchange(client, "not-a-token").status_code == 403
    assert _exchange(client, token + "x").status_code == 403


def test_non_delivered_state_rejected(monkeypatch):
    client, agreement_id, token, delivery_identity = _setup_delivered(monkeypatch)
    _mutate_delivery_record(
        agreement_id,
        delivery_identity,
        lambda record: record.__setitem__("state", "prepared"),
    )
    assert _exchange(client, token).status_code == 403


def test_jti_fingerprint_mismatch_rejected(monkeypatch):
    client, agreement_id, token, delivery_identity = _setup_delivered(monkeypatch)
    _mutate_delivery_record(
        agreement_id,
        delivery_identity,
        lambda record: record.__setitem__("token_fp", "deadbeefdeadbeef"),
    )
    assert _exchange(client, token).status_code == 403


def test_stale_accepted_version_rejected(monkeypatch):
    client, agreement_id, token, _ = _setup_delivered(monkeypatch)
    _mutate_draft(
        agreement_id,
        lambda draft: draft.__setitem__(
            "frozen_signing_authority_v1",
            {**draft["frozen_signing_authority_v1"], "acceptedVersionId": "av_stale"},
        ),
    )
    assert _exchange(client, token).status_code == 403


def test_logout_revokes_current_session_only(monkeypatch):
    client, agreement_id, token, _ = _setup_delivered(monkeypatch)
    assert _exchange(client, token).status_code == 200
    assert _status(client).json()["authenticated"] is True
    assert _logout(client).status_code == 200
    assert _status(client).json()["authenticated"] is False
    assert count_sessions_for_agreement(agreement_id) == 1


def test_cross_origin_exchange_rejected(monkeypatch):
    client, _, token, _ = _setup_delivered(monkeypatch)
    res = _exchange(client, token, origin="https://evil.example.com")
    assert res.status_code == 403


def test_cross_origin_logout_rejected(monkeypatch):
    client, _, token, _ = _setup_delivered(monkeypatch)
    assert _exchange(client, token).status_code == 200
    res = _logout(client, origin="https://evil.example.com")
    assert res.status_code == 403


def test_status_reveals_no_packet_or_recipient_emails(monkeypatch):
    client, _, token, _ = _setup_delivered(monkeypatch)
    assert _exchange(client, token).status_code == 200
    body = _status(client).json()
    serialized = json.dumps(body).lower()
    assert "portable" not in serialized
    assert "corpus" not in serialized
    assert "vs01_signing_packet" not in serialized
    assert "@" not in serialized


def test_session_secret_never_persisted_plaintext(monkeypatch, tmp_path):
    client, agreement_id, token, _ = _setup_delivered(monkeypatch)
    res = _exchange(client, token)
    assert res.status_code == 200
    set_cookie = res.headers.get("set-cookie") or ""
    secret = set_cookie.split("claw_recipient_session=")[1].split(";")[0]
    assert secret
    assert get_session_by_token_hash(session_token_hash(secret))
    for path in tmp_path.rglob("*"):
        if path.is_file():
            text = path.read_text(encoding="utf-8", errors="ignore")
            assert secret not in text


def test_persistence_failure_leaves_no_consumed_only_state(monkeypatch):
    client, agreement_id, token, delivery_identity = _setup_delivered(monkeypatch)

    with patch(
        "backend.services.agreement_draft_store._write_draft_file_unlocked",
        side_effect=OSError("atomic_write_failed"),
    ):
        res = _exchange(client, token)
    assert res.status_code == 403
    stored = load_draft(agreement_id)[VS01_SIGNING_INVITE_DELIVERY_FIELD]
    record = stored["recipients"][delivery_identity]
    assert not record.get("bootstrap_exchanged_at")
    draft = load_draft(agreement_id)
    assert count_sessions_in_draft(draft) == 0
    assert count_sessions_for_agreement(agreement_id) == 0


def test_atomic_file_replacement_observes_consumption_and_session(monkeypatch):
    client, agreement_id, token, delivery_identity = _setup_delivered(monkeypatch)
    assert _exchange(client, token).status_code == 200
    draft = load_draft(agreement_id)
    record = draft[VS01_SIGNING_INVITE_DELIVERY_FIELD]["recipients"][delivery_identity]
    assert record.get("bootstrap_exchanged_at")
    assert record.get("recipient_session_id")
    assert count_sessions_in_draft(draft) == 1
    session_id = record["recipient_session_id"]
    assert draft[RECIPIENT_BOOTSTRAP_SESSIONS_FIELD]["sessions"][session_id]["token_hash"]


def test_orphan_lookup_index_cannot_authenticate(monkeypatch):
    client, agreement_id, token, _ = _setup_delivered(monkeypatch)
    assert _exchange(client, token).status_code == 200
    set_cookie = (client.cookies.get("claw_recipient_session") or "").strip()
    assert set_cookie
    reset_recipient_bootstrap_session_store_for_tests()
    init_session_lookup_index()
    upsert_session_lookup_hint(
        {
            "token_hash": session_token_hash(set_cookie),
            "agreement_id": agreement_id,
            "session_id": "orphan-session-id",
        }
    )
    _mutate_draft(
        agreement_id,
        lambda draft: draft.pop(RECIPIENT_BOOTSTRAP_SESSIONS_FIELD, None),
    )
    assert _status(client).json()["authenticated"] is False


def test_missing_lookup_index_falls_back_to_draft_authority(monkeypatch):
    client, agreement_id, token, _ = _setup_delivered(monkeypatch)
    assert _exchange(client, token).status_code == 200
    reset_recipient_bootstrap_session_store_for_tests()
    assert _status(client).json()["authenticated"] is True


def test_generic_save_preserves_authoritative_sessions(monkeypatch):
    client, agreement_id, token, _ = _setup_delivered(monkeypatch)
    assert _exchange(client, token).status_code == 200
    before = load_draft(agreement_id)
    sessions_before = before[RECIPIENT_BOOTSTRAP_SESSIONS_FIELD]
    touched = dict(before)
    touched["title"] = "Updated title preserves sessions"
    save_draft(touched)
    after = load_draft(agreement_id)
    assert after["title"] == "Updated title preserves sessions"
    assert after[RECIPIENT_BOOTSTRAP_SESSIONS_FIELD] == sessions_before


def test_session_ttl_rejects_zero_remaining():
    now_ts = 1_700_000_000
    with pytest.raises(RecipientBootstrapExchangeError):
        _session_ttl_seconds(bootstrap_exp=now_ts, now_ts=now_ts)


def test_session_ttl_one_second_remaining():
    now_ts = 1_700_000_000
    assert _session_ttl_seconds(bootstrap_exp=now_ts + 1, now_ts=now_ts) == 1


def test_session_ttl_thirty_seconds_remaining():
    now_ts = 1_700_000_000
    assert _session_ttl_seconds(bootstrap_exp=now_ts + 30, now_ts=now_ts) == 30


def test_session_ttl_never_exceeds_bootstrap_expiry(monkeypatch):
    from backend.security.vs01_recipient_bootstrap_token import verify_vs01_recipient_bootstrap_token

    client, agreement_id, token, _ = _setup_delivered(monkeypatch)
    payload = verify_vs01_recipient_bootstrap_token(
        token=token,
        secret=b"unit-test-bootstrap-exchange-secret",
    )
    bootstrap_exp = int(payload["exp"])
    now_ts = bootstrap_exp - 45
    monkeypatch.setenv("CLAW_RECIPIENT_BOOTSTRAP_SESSION_TTL_SECONDS", "3600")
    with patch("backend.services.vs01_recipient_bootstrap_exchange.time.time", return_value=now_ts):
        res = _exchange(client, token)
    assert res.status_code == 200
    expires_at = res.json()["expires_at"]
    exp_ts = int(datetime.fromisoformat(expires_at.replace("Z", "+00:00")).timestamp())
    assert exp_ts <= bootstrap_exp
    assert exp_ts <= now_ts + 45


def test_session_ttl_configured_shorter_than_bootstrap(monkeypatch):
    monkeypatch.setenv("CLAW_RECIPIENT_BOOTSTRAP_SESSION_TTL_SECONDS", "10")
    now_ts = 1_700_000_000
    assert _session_ttl_seconds(bootstrap_exp=now_ts + 3600, now_ts=now_ts) == 10


def test_min_exchange_window_default():
    assert _min_exchange_window_seconds() == 10


def test_near_expiry_token_rejected_without_consumption(monkeypatch):
    from backend.security.vs01_recipient_bootstrap_token import verify_vs01_recipient_bootstrap_token

    client, agreement_id, token, delivery_identity = _setup_delivered(monkeypatch)
    monkeypatch.setenv("CLAW_RECIPIENT_BOOTSTRAP_MIN_EXCHANGE_WINDOW_SECONDS", "10")
    payload = verify_vs01_recipient_bootstrap_token(
        token=token,
        secret=b"unit-test-bootstrap-exchange-secret",
    )
    bootstrap_exp = int(payload["exp"])
    near_expiry_now = bootstrap_exp - 5
    with patch(
        "backend.services.vs01_recipient_bootstrap_exchange.time.time",
        return_value=near_expiry_now,
    ):
        res = _exchange(client, token)
    assert res.status_code == 403
    record = load_draft(agreement_id)[VS01_SIGNING_INVITE_DELIVERY_FIELD]["recipients"][delivery_identity]
    assert not record.get("bootstrap_exchanged_at")
    assert count_sessions_for_agreement(agreement_id) == 0


def test_exchange_issues_cookie_after_commit_clock_advance(monkeypatch):
    import re

    from backend.security.vs01_recipient_bootstrap_token import verify_vs01_recipient_bootstrap_token
    from backend.routers import recipient_bootstrap_api as api

    client, agreement_id, token, delivery_identity = _setup_delivered(monkeypatch)
    payload = verify_vs01_recipient_bootstrap_token(
        token=token,
        secret=b"unit-test-bootstrap-exchange-secret",
    )
    bootstrap_exp = int(payload["exp"])
    commit_ts = bootstrap_exp - 120
    with patch(
        "backend.services.vs01_recipient_bootstrap_exchange.time.time",
        return_value=commit_ts,
    ):
        res = _exchange(client, token)
    assert res.status_code == 200
    set_cookie = res.headers.get("set-cookie") or ""
    match = re.search(r"Max-Age=(\d+)", set_cookie, re.IGNORECASE)
    assert match is not None
    committed_max_age = int(match.group(1))
    assert committed_max_age == 120
    expires_at = res.json()["expires_at"]
    recomputed_after_advance = api._committed_cookie_max_age_seconds(
        expires_at=expires_at,
        committed_now_ts=commit_ts + 1,
    )
    assert recomputed_after_advance == 119
    assert committed_max_age > recomputed_after_advance
    record = load_draft(agreement_id)[VS01_SIGNING_INVITE_DELIVERY_FIELD]["recipients"][delivery_identity]
    assert record.get("bootstrap_exchanged_at")
    assert count_sessions_for_agreement(agreement_id) == 1
    assert _status(client).json()["authenticated"] is True


def _exchange_worker(data_dir: str, token: str, out_path: str) -> None:
    os.environ["CLAW_DATA_DIR"] = data_dir
    os.environ["CLAW_AGREEMENT_DB_PATH"] = os.path.join(data_dir, "agreements.sqlite3")
    os.environ["CLAW_USAGE_ECONOMICS_DB_PATH"] = os.path.join(data_dir, "usage.sqlite3")
    os.environ["CLAW_AGREEMENT_SIGNING_TOKEN_SECRET"] = "unit-test-bootstrap-exchange-secret"
    os.environ["CLAW_RECIPIENT_BOOTSTRAP_RATE_LIMIT_DISABLED"] = "1"
    client = TestClient(app)
    res = _exchange(client, token)
    with open(out_path, "w", encoding="utf-8") as handle:
        handle.write(str(res.status_code))


def test_cross_process_file_store_exchange_one_winner(monkeypatch, tmp_path):
    client, agreement_id, token, _ = _setup_delivered(monkeypatch)
    out_a = tmp_path / "worker_a.txt"
    out_b = tmp_path / "worker_b.txt"
    data_dir = str(tmp_path)
    p1 = multiprocessing.Process(
        target=_exchange_worker,
        args=(data_dir, token, str(out_a)),
    )
    p2 = multiprocessing.Process(
        target=_exchange_worker,
        args=(data_dir, token, str(out_b)),
    )
    p1.start()
    p2.start()
    p1.join(timeout=30)
    p2.join(timeout=30)
    codes = [int(out_a.read_text()), int(out_b.read_text())]
    assert sorted(codes) == [200, 403]
    assert count_sessions_for_agreement(agreement_id) == 1
