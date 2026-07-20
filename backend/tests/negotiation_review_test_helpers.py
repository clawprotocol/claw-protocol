"""Shared helpers for negotiation-review bootstrap session tests."""

from __future__ import annotations

import os
import threading
from contextlib import contextmanager
from dataclasses import dataclass
from typing import Any, Callable, Dict, Iterator, List, Optional, Tuple
from unittest.mock import MagicMock, patch
from urllib.parse import unquote

import pytest
from fastapi.testclient import TestClient

DEFAULT_EXCHANGE_ORIGIN = "http://testserver"

AGREEMENT_PG_ENV_KEYS = ("CLAW_AGREEMENT_DATABASE_URL", "CLAW_AGREEMENT_POSTGRES_DSN")


def force_agreement_file_storage(monkeypatch: pytest.MonkeyPatch) -> None:
    """Force agreement draft persistence to JSON files for this test."""
    for key in AGREEMENT_PG_ENV_KEYS:
        monkeypatch.delenv(key, raising=False)


def force_agreement_postgres_storage(monkeypatch: pytest.MonkeyPatch, dsn: str) -> None:
    """Force agreement draft persistence to PostgreSQL for this test."""
    dsn = (dsn or "").strip()
    if not dsn:
        raise ValueError("postgres_dsn_required")
    monkeypatch.setenv("CLAW_AGREEMENT_DATABASE_URL", dsn)
    monkeypatch.setenv("CLAW_AGREEMENT_POSTGRES_DSN", dsn)
    monkeypatch.delenv("CLAW_DATABASE_URL", raising=False)
    monkeypatch.delenv("DATABASE_URL", raising=False)
    from backend.db import agreement_sql

    agreement_sql._pg_migrations_applied = False  # noqa: SLF001


def agreement_storage_uses_postgres() -> bool:
    from backend.services.agreement_draft_store import _use_postgres

    return _use_postgres()


def update_delivery_registry_row(
    agreement_id: str,
    reviewer_id: str,
    **row_updates: Any,
) -> None:
    """Storage-aware registry row mutation for test setup (bypasses save_draft immutability)."""
    from backend.services.agreement_draft_store import (
        _agreement_path,
        _decode_draft_payload,
        _use_postgres,
        _write_draft_file_unlocked,
        agreement_file_lock,
    )
    from backend.services.recipient_delivery_registry import get_registry

    aid = (agreement_id or "").strip()
    pid = (reviewer_id or "").strip()
    if not aid or not pid:
        raise ValueError("missing_registry_target")

    def _apply(draft: Dict[str, Any]) -> Dict[str, Any]:
        reg = get_registry(draft)
        row = dict(reg["recipients"].get(f"review:{pid}") or {})
        row.update(row_updates)
        reg["recipients"][f"review:{pid}"] = row
        out = dict(draft)
        out["recipient_delivery_v1"] = reg
        return out

    if _use_postgres():
        from datetime import datetime, timezone

        from backend.db.agreement_sql import agreement_postgres_connection, pg_execute
        from backend.utils.canon_json import canon_json_bytes

        with agreement_postgres_connection() as cx:
            row = pg_execute(
                cx,
                "SELECT payload FROM agreement_drafts WHERE id = ? FOR UPDATE",
                (aid,),
            ).fetchone()
            if not row:
                raise FileNotFoundError(aid)
            draft = _decode_draft_payload(row[0])
            merged = _apply(draft)
            payload_text = canon_json_bytes(merged).decode("utf-8")
            pg_execute(
                cx,
                "UPDATE agreement_drafts SET payload = ?::jsonb, updated_at = ? WHERE id = ?",
                (payload_text, datetime.now(timezone.utc), aid),
            )
        return

    with agreement_file_lock(aid):
        path = _agreement_path(aid)
        if not path.exists():
            raise FileNotFoundError(str(path))
        draft = _decode_draft_payload(path.read_text(encoding="utf-8"))
        _write_draft_file_unlocked(path, _apply(draft))


@contextmanager
def patch_approval_persistence_failure(*, error: Exception | None = None) -> Iterator[None]:
    """Inject a persistence failure at the storage-specific approval commit boundary."""
    exc = error or RuntimeError("injected")
    if agreement_storage_uses_postgres():
        from backend.security import negotiation_review_mutation as nrm

        def _boom(**_kwargs: Any) -> None:
            raise exc

        with patch.object(nrm, "_persist_postgres_mutation", side_effect=_boom):
            yield
        return
    with patch(
        "backend.services.agreement_draft_store._write_draft_file_unlocked",
        side_effect=exc,
    ):
        yield


@contextmanager
def observe_approval_persist_before_notify() -> Iterator[List[str]]:
    """Record persist vs notify ordering for the active storage backend."""
    order: List[str] = []

    def _notify(**_kwargs: Any) -> None:
        order.append("notify")

    if agreement_storage_uses_postgres():
        from backend.security import negotiation_review_mutation as nrm

        original = nrm._persist_postgres_mutation

        def _persist_with_marker(**kwargs: Any) -> None:
            order.append("persist")
            return original(**kwargs)

        with patch.object(nrm, "_persist_postgres_mutation", side_effect=_persist_with_marker), patch(
            "backend.services.email.review_delivery.maybe_notify_owner_after_reviewer_approval",
            side_effect=_notify,
        ), patch(
            "backend.services.email.review_delivery.maybe_notify_counterparties_all_reviews_complete",
            lambda **_k: None,
        ):
            yield order
        return

    from backend.services import agreement_draft_store as ads

    original_write = ads._write_draft_file_unlocked

    def _write_with_marker(path: Any, draft: Any) -> None:
        order.append("persist")
        return original_write(path, draft)

    with patch.object(ads, "_write_draft_file_unlocked", side_effect=_write_with_marker), patch(
        "backend.services.email.review_delivery.maybe_notify_owner_after_reviewer_approval",
        side_effect=_notify,
    ), patch(
        "backend.services.email.review_delivery.maybe_notify_counterparties_all_reviews_complete",
        lambda **_k: None,
    ):
        yield order


@contextmanager
def patch_establishment_persistence_failure(*, error: Exception | None = None) -> Iterator[None]:
    """Inject rollback at the establishment persistence guard for file or PostgreSQL."""
    exc = error or OSError("simulated write failure")
    if agreement_storage_uses_postgres():

        def _boom(current: Any, merged: Any) -> Any:
            raise exc

        with patch(
            "backend.services.agreement_draft_store._guard_draft_write_preserving_merged_delivery",
            side_effect=_boom,
        ):
            yield
        return
    with patch(
        "backend.services.agreement_draft_store._write_draft_file_unlocked",
        side_effect=exc,
    ):
        yield

REAL_PROVIDER_ATTEMPT_COUNT = 0


def reset_real_provider_attempt_count() -> None:
    global REAL_PROVIDER_ATTEMPT_COUNT  # noqa: PLW0603
    REAL_PROVIDER_ATTEMPT_COUNT = 0


def record_real_provider_attempt(*_args: Any, **_kwargs: Any) -> None:
    global REAL_PROVIDER_ATTEMPT_COUNT  # noqa: PLW0603
    REAL_PROVIDER_ATTEMPT_COUNT += 1
    raise RuntimeError("real_provider_attempt_blocked")


def assert_slice3b_provider_isolation() -> None:
    assert REAL_PROVIDER_ATTEMPT_COUNT == 0, (
        f"expected zero real provider attempts, observed {REAL_PROVIDER_ATTEMPT_COUNT}"
    )


def _mock_send_email_result(**_kwargs: Any):
    from backend.services.email.resend_client import SendResult

    return SendResult(ok=True, provider_id="mock_msg", status_code=200)


def install_slice3b_provider_isolation(monkeypatch: pytest.MonkeyPatch) -> MagicMock:
    """Fail closed on real provider/network usage for Slice 3B focused tests."""
    reset_real_provider_attempt_count()
    for key in (
        "RESEND_API_KEY",
        "SENDGRID_API_KEY",
        "MAILGUN_API_KEY",
        "POSTMARK_API_KEY",
        "SMTP_PASSWORD",
        "SMTP_USER",
    ):
        monkeypatch.delenv(key, raising=False)

    mock_response = MagicMock()
    mock_response.status_code = 200
    mock_response.text = '{"id":"msg_mock"}'
    mock_response.json.return_value = {"id": "msg_mock"}
    mock_client = MagicMock()
    mock_client.post.side_effect = record_real_provider_attempt
    mock_client.get.side_effect = record_real_provider_attempt
    mock_client.request.side_effect = record_real_provider_attempt
    mock_client.__enter__ = MagicMock(return_value=mock_client)
    mock_client.__exit__ = MagicMock(return_value=False)

    monkeypatch.setattr("backend.services.email.resend_client.httpx.Client", lambda *_a, **_k: mock_client)
    monkeypatch.setattr("backend.services.email.resend_client.send_email", _mock_send_email_result)
    monkeypatch.setattr("backend.services.email.delivery.send_email", _mock_send_email_result)
    return mock_client


@pytest.fixture
def slice3b_provider_isolation(monkeypatch: pytest.MonkeyPatch):
    client = install_slice3b_provider_isolation(monkeypatch)
    yield client
    assert_slice3b_provider_isolation()


def extract_bootstrap_token_from_review_url(review_url: str) -> str:
    token_part = review_url.split("#t=", 1)[-1].split("&", 1)[0]
    return unquote(token_part)


def mint_owner_review_copy_link(
    client: TestClient,
    agreement_id: str,
    org_headers: Dict[str, str],
    *,
    role: str = "reviewer",
    recipient_party_id: Optional[str] = None,
    inviter_display_name: Optional[str] = None,
    **extra: Any,
) -> Dict[str, Any]:
    body: Dict[str, Any] = {"mode": "review", "role": role}
    if recipient_party_id:
        body["recipient_party_id"] = recipient_party_id
    if inviter_display_name:
        body["inviter_display_name"] = inviter_display_name
    body.update(extra)
    res = client.post(
        f"/api/agreements/{agreement_id}/owner-review-copy-link",
        headers=org_headers,
        json=body,
    )
    assert res.status_code == 200, res.text
    payload = res.json()
    assert "token" not in payload
    assert "#t=" in str(payload.get("review_url") or "")
    return payload


def bootstrap_review_session(
    client: TestClient,
    agreement_id: str,
    org_headers: Dict[str, str],
    *,
    origin: str = DEFAULT_EXCHANGE_ORIGIN,
    **mint_kwargs: Any,
) -> Dict[str, Any]:
    """Mint owner copy-link and exchange bootstrap token on ``client`` (cookie jar)."""
    mint_body = mint_owner_review_copy_link(
        client,
        agreement_id,
        org_headers,
        **mint_kwargs,
    )
    token = extract_bootstrap_token_from_review_url(str(mint_body.get("review_url") or ""))
    ex = client.post(
        "/api/negotiation-review/bootstrap/exchange",
        json={"token": token},
        headers={"Origin": origin},
    )
    assert ex.status_code == 200, ex.text
    return mint_body


def review_mutation_headers(*, origin: str = DEFAULT_EXCHANGE_ORIGIN) -> Dict[str, str]:
    return {"Origin": origin, "Content-Type": "application/json"}


def review_session_headers(
    client: TestClient,
    agreement_id: str,
    org_headers: Dict[str, str],
    **mint_kwargs: Any,
) -> Dict[str, str]:
    """Bootstrap review session and return same-origin mutation headers."""
    bootstrap_review_session(client, agreement_id, org_headers, **mint_kwargs)
    return review_mutation_headers()


@dataclass(frozen=True)
class EstablishmentPersistenceRaceResult:
    outcomes: Tuple[Tuple[str, str], ...]
    winner_jti: str
    loser_jti: str
    stored_material: bytes


def assert_conflicting_establishment_race_outcomes(
    result: EstablishmentPersistenceRaceResult,
) -> None:
    """Require exactly one winner and one stale conflict with winner authority preserved."""
    outcome_types = sorted(status for status, _jti in result.outcomes)
    assert outcome_types == ["conflict", "ok"], result.outcomes
    ok_jtis = {jti for status, jti in result.outcomes if status == "ok"}
    conflict_jtis = {jti for status, jti in result.outcomes if status == "conflict"}
    assert ok_jtis == {result.winner_jti}
    assert len(conflict_jtis) == 1
    assert result.winner_jti not in conflict_jtis
    assert conflict_jtis.pop() == result.loser_jti


def run_conflicting_establishment_persistence_race(
    agreement_id: str,
    reviewer_id: str,
    *,
    mint_incoming_a: Callable[[str, str], Dict[str, Any]],
    mint_incoming_b: Callable[[str, str], Dict[str, Any]],
) -> EstablishmentPersistenceRaceResult:
    """
  Run two conflicting establishment candidates against the persistence authority.

  Synchronization uses a pre-persist barrier only (outside locks/transactions) so both
  candidates reach ``save_draft_establish_review_bootstrap_delivery`` before either
  completes, forcing lock-level serialization without sleeps.
    """
    import copy

    from backend.services.agreement_draft_store import (
        load_draft,
        save_draft_establish_review_bootstrap_delivery,
    )
    from backend.services.recipient_delivery_registry import delivery_registry_material, get_registry

    aid = (agreement_id or "").strip()
    pid = (reviewer_id or "").strip()
    row_key = f"review:{pid}"

    incoming_a = mint_incoming_a(aid, pid)
    incoming_b = mint_incoming_b(aid, pid)
    jti_a = str(get_registry(incoming_a)["recipients"][row_key]["active_jti"])
    jti_b = str(get_registry(incoming_b)["recipients"][row_key]["active_jti"])
    if jti_a == jti_b:
        raise AssertionError("conflicting_establishment_candidates_require_distinct_jti")

    arrival = threading.Barrier(2)
    outcomes: List[Tuple[str, str]] = []
    errors: List[Exception] = []
    outcomes_lock = threading.Lock()

    def _attempt(incoming: Dict[str, Any], expected_jti: str) -> None:
        arrival.wait(timeout=10)
        try:
            save_draft_establish_review_bootstrap_delivery(copy.deepcopy(incoming))
            with outcomes_lock:
                outcomes.append(("ok", expected_jti))
        except ValueError as exc:
            if str(exc) != "delivery_establishment_active_invitation_conflict":
                with outcomes_lock:
                    errors.append(exc)
                return
            with outcomes_lock:
                outcomes.append(("conflict", expected_jti))

    t1 = threading.Thread(target=_attempt, args=(incoming_a, jti_a))
    t2 = threading.Thread(target=_attempt, args=(incoming_b, jti_b))
    t1.start()
    t2.start()
    t1.join(timeout=30)
    t2.join(timeout=30)
    assert not t1.is_alive() and not t2.is_alive()
    if errors:
        raise errors[0]

    stored = load_draft(aid)
    winner_jti = str(get_registry(stored)["recipients"][row_key]["active_jti"])
    loser_jti = jti_b if winner_jti == jti_a else jti_a
    material = delivery_registry_material(get_registry(stored))
    result = EstablishmentPersistenceRaceResult(
        outcomes=tuple(sorted(outcomes, key=lambda item: item[0])),
        winner_jti=winner_jti,
        loser_jti=loser_jti,
        stored_material=material,
    )
    assert_conflicting_establishment_race_outcomes(result)
    return result


@contextmanager
def synchronize_establishment_persist_barrier() -> Iterator[None]:
    """Hold concurrent callers at the establishment persistence seam."""
    from backend.services import agreement_draft_store as ads

    arrival = threading.Barrier(2)
    original = ads.save_draft_establish_review_bootstrap_delivery

    def _synchronized_establish(draft: Dict[str, Any]) -> None:
        arrival.wait(timeout=10)
        return original(draft)

    with patch.object(ads, "save_draft_establish_review_bootstrap_delivery", side_effect=_synchronized_establish):
        yield
