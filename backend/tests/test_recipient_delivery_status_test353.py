"""test353: recipient-delivery-status must never HTTP 500 in production-like flows."""

from __future__ import annotations

import pytest
from fastapi.testclient import TestClient
from pydantic import ValidationError

from backend.build_info import RECIPIENT_DELIVERY_STATUS_HANDLER_REV
from backend.main import app
from backend.routers import agreements_v2_api as agreements_api
from backend.services.agreement_draft_store import load_draft, save_draft

pytestmark = pytest.mark.unit

_ORG_H = {"X-Claw-Org-Id": "test-org-recipient-status-test353"}
_EXACT_FAILING_AID = "10737cbf-7b9a-491a-ad50-065486e70a25"


@pytest.fixture(autouse=True)
def _reset_usage_economics_singleton():
    from backend.usage_economics import store as usage_economics_store_mod

    usage_economics_store_mod._store = None  # noqa: SLF001
    yield
    usage_economics_store_mod._store = None  # noqa: SLF001


def _env_common(monkeypatch: pytest.MonkeyPatch, tmp_path) -> None:
    monkeypatch.setenv("CLAW_DATA_DIR", str(tmp_path))
    monkeypatch.setenv("CLAW_USAGE_ECONOMICS_DB_PATH", str(tmp_path / "usage.sqlite3"))
    monkeypatch.setenv("RESEND_API_KEY", "re_test")
    monkeypatch.setenv("EMAIL_FROM", "LawDog <notifications@lawdog.me>")
    monkeypatch.setenv("CLAW_APP_PUBLIC_ORIGIN", "https://app.example.com")
    monkeypatch.setenv("CLAW_AGREEMENT_SIGNING_TOKEN_SECRET", "unit-test-signing-invite-secret")
    monkeypatch.setenv("CLAW_REVIEW_DELIVERY_MODE", "email")
    monkeypatch.setenv("RAILWAY_GIT_COMMIT_SHA", "test353deadbeef")


def _paid_pro_review_sent_draft(aid: str) -> dict:
    return {
        "id": aid,
        "title": "Services Agreement",
        "jurisdiction": "TX",
        "purpose": "Consulting services",
        "payment_terms": "Net 30",
        "duration": "1 year",
        "due_date": None,
        "effective_date": None,
        "review_sent_at": "2026-06-13T22:33:00Z",
        "review_invite_emails_sent_at": "2026-06-13T22:33:01Z",
        "parties": [
            {
                "name": "Red Mesa Logistics LLC",
                "role": "client",
                "email": "anthemhayek@me.com",
                "signer_name": "Turdy Manly",
            },
            {
                "name": "Harbor Peak Automation LLC",
                "role": "service_provider",
                "email": "cryptocurated22@gmail.com",
                "signer_name": "Healy Panther",
            },
        ],
        "audit_log": [
            {
                "event_type": "invite_sent",
                "value": {"phase": "review", "participant_id": "party_index_1"},
            }
        ],
    }


def _assert_harbor_peak_reviewer_sent(body: dict) -> None:
    review_rows = [r for r in body.get("recipients") or [] if r.get("phase") == "review"]
    assert len(review_rows) == 1
    row = review_rows[0]
    assert row["entity_name"] == "Harbor Peak Automation LLC"
    assert row["role"] == "reviewer"
    assert row["status"] == "sent"
    assert row["can_correct_email"] is True
    assert row["can_resend_invite"] is True


def test_exact_production_agreement_state_returns_200_not_500(
    monkeypatch: pytest.MonkeyPatch, tmp_path
) -> None:
    _env_common(monkeypatch, tmp_path)
    client = TestClient(app, raise_server_exceptions=False)
    draft = _paid_pro_review_sent_draft(_EXACT_FAILING_AID)
    save_draft(draft)

    res = client.get(
        f"/api/agreements/{_EXACT_FAILING_AID}/recipient-delivery-status",
        headers=_ORG_H,
    )
    assert res.status_code == 200, res.text
    assert res.headers.get("X-Claw-Recipient-Status-Handler") == RECIPIENT_DELIVERY_STATUS_HANDLER_REV
    assert res.headers.get("X-Claw-Git-Commit") == "test353deadb"
    body = res.json()
    assert body.get("ok") is True
    assert body.get("degraded") is not True
    _assert_harbor_peak_reviewer_sent(body)


def test_legacy_pydantic_load_failure_still_returns_200_with_inferred_rows(
    monkeypatch: pytest.MonkeyPatch, tmp_path
) -> None:
    """Simulates pre-023e5a33 route calling _load_or_404 on malformed audit_log."""
    _env_common(monkeypatch, tmp_path)
    client = TestClient(app, raise_server_exceptions=False)
    aid = "ag_legacy_pydantic_load"
    save_draft(_paid_pro_review_sent_draft(aid))

    def _legacy_load(agreement_id: str) -> dict:
        raw = load_draft(agreement_id)
        agreements_api.AgreementDraft.model_validate(raw)
        return raw

    monkeypatch.setattr(agreements_api, "_load_draft_dict_or_404", _legacy_load)

    with pytest.raises(ValidationError):
        agreements_api._load_or_404(aid)

    res = client.get(f"/api/agreements/{aid}/recipient-delivery-status", headers=_ORG_H)
    assert res.status_code == 200, res.text
    body = res.json()
    assert body.get("ok") is True
    _assert_harbor_peak_reviewer_sent(body)


def test_forced_build_exception_returns_200_degraded_with_rows(
    monkeypatch: pytest.MonkeyPatch, tmp_path
) -> None:
    _env_common(monkeypatch, tmp_path)
    client = TestClient(app, raise_server_exceptions=False)
    aid = "ag_forced_build_fail"
    save_draft(_paid_pro_review_sent_draft(aid))

    from backend.services import recipient_delivery_status as rds

    original = rds.build_recipient_delivery_status

    def _boom(draft, *, agreement_id: str = ""):
        if agreement_id == aid:
            raise RuntimeError("simulated build failure")
        return original(draft, agreement_id=agreement_id)

    monkeypatch.setattr(rds, "build_recipient_delivery_status", _boom)

    res = client.get(f"/api/agreements/{aid}/recipient-delivery-status", headers=_ORG_H)
    assert res.status_code == 200, res.text
    body = res.json()
    assert body.get("degraded") is True
    _assert_harbor_peak_reviewer_sent(body)


@pytest.mark.parametrize(
    "mutator",
    [
        lambda d: d,
        lambda d: {**d, "audit_log": [{"event_type": "invite_sent", "value": {"phase": "review"}}]},
        lambda d: {**d, "recipient_delivery_v1": {"v": 1, "recipients": "bad"}},
        lambda d: {**d, "parties": None},
    ],
    ids=["baseline", "audit_missing_at", "bad_registry", "parties_null"],
)
def test_malformed_paid_pro_review_sent_never_500(
    monkeypatch: pytest.MonkeyPatch,
    tmp_path,
    mutator,
    request: pytest.FixtureRequest,
) -> None:
    _env_common(monkeypatch, tmp_path)
    client = TestClient(app, raise_server_exceptions=False)
    case_id = request.node.callspec.id
    aid = f"ag_never_500_{case_id}"
    draft = mutator(_paid_pro_review_sent_draft(aid))
    save_draft(draft)

    res = client.get(f"/api/agreements/{aid}/recipient-delivery-status", headers=_ORG_H)
    assert res.status_code == 200, res.text
    body = res.json()
    assert body.get("ok") is True
    if draft.get("parties"):
        _assert_harbor_peak_reviewer_sent(body)
