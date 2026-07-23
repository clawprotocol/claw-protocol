from __future__ import annotations

import uuid

import pytest
from fastapi.testclient import TestClient

from backend.main import app
from backend.usage_economics.store import UsageEconomicsStore


@pytest.fixture()
def isolated_usage_db(tmp_path, monkeypatch: pytest.MonkeyPatch):
    path = str(tmp_path / "usage_eco.sqlite3")
    monkeypatch.setenv("CLAW_USAGE_ECONOMICS_DB_PATH", path)
    import backend.usage_economics.store as ue_store

    ue_store._store = None
    st = UsageEconomicsStore(path)
    st.init_schema()
    yield path
    ue_store._store = None


def test_free_tier_blocks_third_draft(isolated_usage_db, monkeypatch: pytest.MonkeyPatch):
    monkeypatch.setenv("CLAW_USAGE_ECONOMICS_ENABLED", "1")
    # Default CLAW_ENVIRONMENT=local relaxes the free draft cap; enforce prod-like limits for this assertion.
    monkeypatch.setenv("CLAW_USAGE_ECONOMICS_STRICT_IN_DEV", "1")
    client = TestClient(app)
    h = {"X-Claw-Org-Id": "test-org-free", "X-Claw-Test-Auth-User-Id": "test-owner"}

    for _ in range(2):
        r = client.post(
            "/api/agreements/draft",
            headers=h,
            json={
                "title": "T",
                "jurisdiction": "CA",
                "parties": [{"name": "A", "role": "owner"}],
                "purpose": "p",
                "payment_terms": "pt",
                "duration": None,
                "due_date": None,
                "effective_date": None,
            },
        )
        assert r.status_code == 200, r.text

    r3 = client.post(
        "/api/agreements/draft",
        headers=h,
        json={
            "title": "T3",
            "jurisdiction": "CA",
            "parties": [{"name": "A", "role": "owner"}],
            "purpose": "p",
            "payment_terms": "pt",
            "duration": None,
            "due_date": None,
            "effective_date": None,
        },
    )
    assert r3.status_code == 403
    body = r3.json()
    assert body.get("detail", {}).get("code") == "draft_limit_reached"


def test_review_first_paid_pro_persist_bypasses_free_draft_cap(isolated_usage_db, monkeypatch: pytest.MonkeyPatch):
    monkeypatch.setenv("CLAW_USAGE_ECONOMICS_ENABLED", "1")
    monkeypatch.setenv("CLAW_USAGE_ECONOMICS_STRICT_IN_DEV", "1")
    client = TestClient(app)
    h = {"X-Claw-Org-Id": "test-org-review-first", "X-Claw-Test-Auth-User-Id": "test-owner"}
    body = {
        "title": "Paid Pro Review",
        "jurisdiction": "CA",
        "parties": [{"name": "A", "role": "owner"}],
        "purpose": "x" * 600,
        "payment_terms": "pt",
        "duration": None,
        "due_date": None,
        "effective_date": None,
    }
    for _ in range(2):
        r = client.post("/api/agreements/draft", headers=h, json=body)
        assert r.status_code == 200, r.text

    r3 = client.post(
        "/api/agreements/draft",
        headers={**h, "X-Claw-Review-First-Persist": "1"},
        json=body,
    )
    assert r3.status_code == 200, r3.text

    r4 = client.post("/api/agreements/draft", headers=h, json=body)
    assert r4.status_code == 403
    assert r4.json().get("detail", {}).get("code") == "draft_limit_reached"


def test_draft_requires_x_claw_org_id_header(isolated_usage_db, monkeypatch: pytest.MonkeyPatch):
    monkeypatch.setenv("CLAW_USAGE_ECONOMICS_ENABLED", "1")
    client = TestClient(app)
    body = {
        "title": "T",
        "jurisdiction": "CA",
        "parties": [{"name": "A", "role": "owner"}],
        "purpose": "p",
        "payment_terms": "pt",
        "duration": None,
        "due_date": None,
        "effective_date": None,
    }
    r = client.post("/api/agreements/draft", json=body)
    assert r.status_code == 401
    detail = r.json().get("detail")
    assert isinstance(detail, dict)
    assert detail.get("code") == "org_header_required"


def test_ip_burst_sets_soft_throttle_for_free_tier(isolated_usage_db, monkeypatch: pytest.MonkeyPatch):
    monkeypatch.setenv("CLAW_USAGE_ECONOMICS_ENABLED", "1")
    from backend.usage_economics import constants as ue_constants

    monkeypatch.setattr(ue_constants, "IP_AGREEMENT_BURST_MAX_CREATES", 3)

    client = TestClient(app)
    body = {
        "title": "T",
        "jurisdiction": "CA",
        "parties": [{"name": "A", "role": "owner"}],
        "purpose": "p",
        "payment_terms": "pt",
        "duration": None,
        "due_date": None,
        "effective_date": None,
    }
    last_org = ""
    for _ in range(4):
        last_org = f"burst-org-{uuid.uuid4().hex[:10]}"
        r = client.post(
            "/api/agreements/draft",
            headers={"X-Claw-Org-Id": last_org, "X-Claw-Test-Auth-User-Id": "burst-owner"},
            json=body,
        )
        assert r.status_code == 200, r.text

    rsum = client.get(
        "/api/agreements/usage/summary",
        headers={"X-Claw-Org-Id": last_org, "X-Claw-Test-Auth-User-Id": "burst-owner"},
    )
    assert rsum.status_code == 200
    assert rsum.json().get("soft_throttle") is True


def test_usage_summary_no_keys_in_payload(isolated_usage_db, monkeypatch: pytest.MonkeyPatch):
    monkeypatch.setenv("CLAW_USAGE_ECONOMICS_ENABLED", "1")
    client = TestClient(app)
    r = client.get("/api/agreements/usage/summary", headers={"X-Claw-Org-Id": "sum-org", "X-Claw-Test-Auth-User-Id": "test-owner"})
    assert r.status_code == 200
    payload = r.json()
    assert "keys" not in str(payload).lower()
    assert "drafts_remaining" in payload
    assert payload.get("draft_ttl_hours") == 24
    assert payload.get("temporary_storage_note")
