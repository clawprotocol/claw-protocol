"""GTM Security Slice 3B — same-origin mutation matrix for cookie-authorized review routes."""

from __future__ import annotations

import os
from typing import Any, Callable, Dict, Tuple
from unittest.mock import MagicMock, patch

import pytest
from fastapi.testclient import TestClient

from backend.main import app
from backend.tests.negotiation_review_test_helpers import (
    bootstrap_review_session,
    review_mutation_headers,
)
from backend.usage_economics import store as usage_economics_store_mod

pytestmark = pytest.mark.unit

_ORIGIN = "http://testserver"
_ORG_H = {"X-Claw-Org-Id": "test-org-slice3b-matrix"}


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
    monkeypatch.setenv("CLAW_AGREEMENT_SIGNING_TOKEN_SECRET", "unit-test-slice3b-matrix-secret")
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


def _create_agreement(client: TestClient) -> Tuple[str, str]:
    res = client.post(
        "/api/agreements/draft",
        headers=_ORG_H,
        json={
            "title": "Matrix agreement",
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
    assert res.status_code == 200
    body = res.json()
    return body["id"], body["draft"]["parties"][1]["id"]


def _session_client() -> TestClient:
    client = TestClient(app)
    aid, reviewer_id = _create_agreement(client)
    bootstrap_review_session(
        client,
        aid,
        _ORG_H,
        role="reviewer",
        recipient_party_id=reviewer_id,
    )
    client._matrix_aid = aid  # type: ignore[attr-defined]
    client._matrix_reviewer_id = reviewer_id  # type: ignore[attr-defined]
    return client


def _route_callers() -> Dict[str, Callable[[TestClient, Dict[str, str]], Any]]:
  def recipient_approve(client: TestClient, headers: Dict[str, str]):
      aid = client._matrix_aid  # type: ignore[attr-defined]
      rid = client._matrix_reviewer_id  # type: ignore[attr-defined]
      return client.post(
          f"/api/agreements/{aid}/recipient-approve",
          headers=headers,
          json={"message": "ok", "participant_id": rid, "participant_display_name": "R1"},
      )

  def reviewer_suggestion(client: TestClient, headers: Dict[str, str]):
      aid = client._matrix_aid  # type: ignore[attr-defined]
      rid = client._matrix_reviewer_id  # type: ignore[attr-defined]
      return client.post(
          f"/api/agreements/{aid}/pro-redline/reviewer-suggestion",
          headers=headers,
          json={
              "participant_id": rid,
              "suggestion_text": "Please adjust payment timing.",
              "reviewer_display_name": "R1",
              "reviewer_email": "r1@example.com",
          },
      )

  def negotiate_assist(client: TestClient, headers: Dict[str, str]):
      aid = client._matrix_aid  # type: ignore[attr-defined]
      return client.post(
          f"/api/agreements/{aid}/negotiate-assist",
          headers=headers,
          json={"message": "Can we shorten payment terms?", "session_type": "recipient"},
      )

  def revise(client: TestClient, headers: Dict[str, str]):
      aid = client._matrix_aid  # type: ignore[attr-defined]
      return client.post(
          f"/api/agreements/{aid}/revise",
          headers=headers,
          json={"instruction": "Tighten payment terms.", "session_type": "recipient"},
      )

  def proposal_stage(client: TestClient, headers: Dict[str, str]):
      aid = client._matrix_aid  # type: ignore[attr-defined]
      rid = client._matrix_reviewer_id  # type: ignore[attr-defined]
      owner = TestClient(app)
      draft = owner.get(f"/api/agreements/{aid}", headers=_ORG_H).json()["draft"]
      return client.post(
          f"/api/agreements/{aid}/recipient-proposal/stage",
          headers=headers,
          json={
              "instruction": "Change payment timing.",
              "proposer_id": rid,
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
              "rendered_html": "<p>Payment within fifteen (15) days after receipt.</p>",
          },
      )

  def session_logout(client: TestClient, headers: Dict[str, str]):
      return client.post("/api/negotiation-review/session/logout", headers=headers)

  return {
      "recipient_approve": recipient_approve,
      "reviewer_suggestion": reviewer_suggestion,
      "negotiate_assist": negotiate_assist,
      "revise": revise,
      "recipient_proposal_stage": proposal_stage,
      "session_logout": session_logout,
  }


@pytest.mark.parametrize("route_name", list(_route_callers().keys()))
def test_mutation_same_origin_valid_origin_succeeds(route_name: str):
    client = _session_client()
    caller = _route_callers()[route_name]
    res = caller(client, review_mutation_headers(origin=_ORIGIN))
    assert res.status_code in (200, 201), res.text


@pytest.mark.parametrize("route_name", list(_route_callers().keys()))
def test_mutation_missing_origin_fails_closed(route_name: str):
    client = _session_client()
    caller = _route_callers()[route_name]
    res = caller(client, {"Content-Type": "application/json"})
    assert res.status_code == 403


@pytest.mark.parametrize(
    "bad_origin",
    [
        "null",
        "not-a-url",
        "https://evil.example",
        "http://testserver:9999",
        "ftp://testserver",
    ],
)
def test_recipient_approve_rejects_bad_origins(bad_origin: str):
    client = _session_client()
    caller = _route_callers()["recipient_approve"]
    headers = review_mutation_headers(origin=bad_origin) if bad_origin != "null" else {"Origin": "null", "Content-Type": "application/json"}
    res = caller(client, headers)
    assert res.status_code == 403


@pytest.mark.parametrize(
    "env,origin,expected",
    [
        ("local", _ORIGIN, 200),
        ("dev", _ORIGIN, 200),
        ("test", _ORIGIN, 200),
        ("local", None, 200),
        ("production", _ORIGIN, 200),
        ("production", None, 403),
        ("staging", None, 403),
        ("preview", None, 403),
        ("ci", None, 403),
        ("prod", None, 403),
        ("unknown", None, 403),
    ],
)
def test_exchange_origin_environment_matrix(env: str, origin: str | None, expected: int, monkeypatch):
    monkeypatch.setenv("CLAW_ENVIRONMENT", env)
    client = TestClient(app)
    aid, reviewer_id = _create_agreement(client)
    from backend.security.negotiation_review_bootstrap_token import mint_negotiation_review_bootstrap_token
    from backend.services.agreement_draft_store import load_draft
    from backend.services.recipient_delivery_registry import record_invite_sent

    secret = os.environ["CLAW_AGREEMENT_SIGNING_TOKEN_SECRET"].encode("utf-8")
    from backend.security.negotiation_review_version_binding import PRE_LOCK_VERSION_BINDING
    from backend.security.negotiation_review_content_binding import review_content_binding_sha256

    draft = load_draft(aid)
    token, jti, _ = mint_negotiation_review_bootstrap_token(
        secret=secret,
        agreement_id=aid,
        locked_version_id=PRE_LOCK_VERSION_BINDING,
        party_id=reviewer_id,
        role="reviewer",
        content_sha256=review_content_binding_sha256(draft),
        ttl_seconds=3600,
    )
    record_invite_sent(draft, phase="review", participant_id=reviewer_id, jti=jti, bootstrap_authority=True)
    from backend.services.agreement_draft_store import _agreement_path, _write_draft_file_unlocked, agreement_file_lock

    with agreement_file_lock(aid):
        _write_draft_file_unlocked(_agreement_path(aid), draft)

    headers: Dict[str, str] = {}
    if origin is not None:
        headers["Origin"] = origin
    if env in ("local", "dev", "test") and origin is None:
        headers["Referer"] = f"{_ORIGIN}/agreements/{aid}/review"
    res = client.post(
        "/api/negotiation-review/bootstrap/exchange",
        json={"token": token},
        headers=headers,
    )
    assert res.status_code == expected
