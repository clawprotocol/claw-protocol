"""Focused paid-beta release gate — critical commercial paths only.

Covers: Pro entitlement for premium draft, Genesis denial, concurrent finalization
atomicity, and billing plan contract ($99 / Pro-only). Does not run paid LLM APIs.
"""

from __future__ import annotations

from concurrent.futures import ThreadPoolExecutor
from typing import Any
from unittest.mock import patch

import pytest
from fastapi.testclient import TestClient

from backend.billing.pricing import PLANS, get_plan
from backend.main import app
from backend.tests.entitlement_test_support import ensure_headers_entitled
from backend.usage_economics import store as usage_economics_store_mod
from backend.usage_economics.commercial_entitlement import (
    STATE_NONE,
    STATE_PRO,
    resolve_commercial_entitlement,
)

pytestmark = pytest.mark.unit

_ORG = "org-paid-beta-gate"
_USER = "user-paid-beta-gate"
_ORG_H = {"X-Claw-Org-Id": _ORG, "X-Claw-Test-Auth-User-Id": _USER}


@pytest.fixture(autouse=True)
def _isolate(tmp_path, monkeypatch):
    monkeypatch.setenv("CLAW_ENVIRONMENT", "test")
    monkeypatch.setenv("CLAW_DATA_DIR", str(tmp_path))
    monkeypatch.setenv("CLAW_ECONOMICS_DB_PATH", str(tmp_path / "economics.sqlite3"))
    monkeypatch.setenv("CLAW_USAGE_ECONOMICS_DB_PATH", str(tmp_path / "usage.sqlite3"))
    usage_economics_store_mod._store = None  # noqa: SLF001
    import backend.economics.store as eco

    eco._store = None  # noqa: SLF001
    yield
    usage_economics_store_mod._store = None  # noqa: SLF001
    eco._store = None  # noqa: SLF001


@pytest.fixture
def client() -> TestClient:
    return TestClient(app)


def test_billing_plan_pro_is_99_usd_and_starter_maps_to_pro():
    pro = get_plan("pro")
    assert pro["monthly_usd"] == __import__("decimal").Decimal("99.00")
    assert get_plan("starter")["monthly_usd"] == pro["monthly_usd"]
    assert get_plan("plus")["monthly_usd"] == pro["monthly_usd"]
    assert "starter" not in PLANS


def test_genesis_affiliate_cannot_call_premium_full_draft(client: TestClient, monkeypatch):
    """Genesis affiliate status alone is not Pro — premium draft stays denied."""
    from backend.affiliates.genesis_referral_service import create_genesis_affiliate
    from backend.economics.store import get_economics_store

    eco = get_economics_store()
    eco.init_schema()
    create_genesis_affiliate(
        eco,
        user_id=_USER,
        display_name="Aff",
        referral_code="GENPBETA1",
        affiliate_status="active",
    )
    subject = f"org:user-{_USER}"
    decision = resolve_commercial_entitlement(subject)
    assert decision["state"] == STATE_NONE
    assert decision.get("affiliate_status") == "genesis"

    monkeypatch.setattr(
        "backend.routers.agreements_v2_api.OPENAI_API_KEY",
        "sk-test",
        raising=False,
    )
    res = client.post(
        "/api/agreements/premium-full-draft",
        headers={"X-Claw-Org-Id": f"user-{_USER}", "X-Claw-Test-Auth-User-Id": _USER},
        json={"intake_text": "Simple consulting between A LLC and B Inc."},
    )
    assert res.status_code == 403
    detail = res.json().get("detail") or {}
    assert detail.get("code") == "premium_draft_requires_pro"


def test_pro_principal_passes_premium_draft_gate(client: TestClient, monkeypatch):
    ensure_headers_entitled(_ORG_H)
    decision = resolve_commercial_entitlement(f"org:{_ORG}")
    assert decision["state"] == STATE_PRO
    assert decision.get("agreement_allowance") == 25

    monkeypatch.setattr(
        "backend.routers.agreements_v2_api.OPENAI_API_KEY",
        "sk-test",
        raising=False,
    )

    def _fake_llm(*_a: Any, **_k: Any) -> str:
        body = ("Operative clause. " * 800) + "\nIN WITNESS WHEREOF.\n"
        return __import__("json").dumps(
            {
                "title": "Services Agreement",
                "agreement_family": "services_agreement",
                "document_text": body,
                "key_terms_found": ["Fee"],
                "missing_material_info": [],
            }
        )

    monkeypatch.setattr("backend.routers.agreements_v2_api.call_legal_llm", _fake_llm)
    res = client.post(
        "/api/agreements/premium-full-draft",
        headers=_ORG_H,
        json={
            "intake_text": "Client Co hires Designer LLC for services in California. Fee $1500.",
            "context": {
                "title": "Services Agreement",
                "parties": [
                    {"name": "Client Co", "role": "Client"},
                    {"name": "Designer LLC", "role": "Designer"},
                ],
            },
        },
    )
    assert res.status_code in (200, 503), res.text


def test_concurrent_final_signer_single_email_and_signed_event(client: TestClient):
    """Atomicity under concurrent final-signer complete — ≤1 email, ≤1 signed audit."""
    from backend.tests.test_vs01_signer_complete_api import (
        test_vs01_signer_complete_concurrent_final_signer_one_email_set as _concurrent,
    )

    _concurrent(client)


def test_concurrent_finalizer_duplicate_event_counts_under_load(client: TestClient):
    ensure_headers_entitled(_ORG_H)
    from backend.tests import test_vs01_signer_complete_api as mod

    aid = mod._create_two_signer_agreement(client)
    client.post(
        f"/api/agreements/{aid}/vs01-signer-complete",
        headers=mod._org_headers(),
        json={"signer_role_id": "role_owner", "participant_id": "p1", "document_id": "doc_vs01"},
    )
    send_calls: list[str] = []

    def _track_send(*, agreement_id: str, draft: dict, org_id: str | None = None):
        send_calls.append(agreement_id)
        return {
            "event_type": "signing_completion_emails_sent",
            "at": "2026-06-08T00:00:00Z",
            "value": {"sent_count": 2},
        }

    with patch(
        "backend.services.email.signing_completion_delivery.maybe_send_signing_completion_emails",
        side_effect=_track_send,
    ):
        payload = {
            "signer_role_id": "role_cp",
            "participant_id": "p2",
            "document_id": "doc_vs01",
        }
        with ThreadPoolExecutor(max_workers=8) as pool:
            futures = [
                pool.submit(
                    client.post,
                    f"/api/agreements/{aid}/vs01-signer-complete",
                    headers=mod._org_headers(),
                    json=payload,
                )
                for _ in range(8)
            ]
            results = [f.result() for f in futures]

    assert all(r.status_code == 200 for r in results)
    draft = client.get(f"/api/agreements/{aid}", headers=mod._org_headers()).json()["draft"]
    signed_events = [e for e in draft.get("audit_log", []) if e.get("event_type") == "signed"]
    email_events = [
        e for e in draft.get("audit_log", []) if e.get("event_type") == "signing_completion_emails_sent"
    ]
    assert len(signed_events) == 1, f"duplicate signed events: {len(signed_events)}"
    assert len(email_events) <= 1, f"duplicate email events: {len(email_events)}"
    assert len(send_calls) <= 1, f"duplicate email sends: {len(send_calls)}"
