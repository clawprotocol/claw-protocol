"""LawDog Supabase dashboard Phase A tests."""

from __future__ import annotations

from backend.tests.entitlement_test_support import ensure_headers_entitled, ensure_org_pro_entitlement

import os
from typing import Any, Dict, List
from unittest.mock import patch

import pytest
from fastapi.testclient import TestClient

from backend.lawdog_dashboard.supabase_config import is_supabase_dashboard_configured
from backend.lawdog_dashboard.supabase_service import (
    reset_organization_sync_circuit_for_tests,
    sync_agreement_draft_to_supabase,
)
from backend.lawdog_dashboard.workspace_index import (
    fallback_summary_from_supabase_row,
    merge_workspace_index_agreement_ids,
)
from backend.main import app
from backend.tests.conftest_usage_economics_helpers import register_test_agreement_owner
from backend.usage_economics import store as usage_economics_store_mod

pytestmark = pytest.mark.unit

_ORG = {"X-Claw-Org-Id": "lawdog-sync-org", "X-Claw-Test-Auth-User-Id": "test-owner"}


@pytest.fixture(autouse=True)
def _entitle_owner_org_after_env(tmp_path, monkeypatch):
    """Grant Pro for primary owner headers once tmp_path-backed DBs are configured."""
    monkeypatch.setenv("CLAW_DATA_DIR", str(tmp_path))
    monkeypatch.setenv("CLAW_ECONOMICS_DB_PATH", str(tmp_path / "economics.sqlite3"))
    monkeypatch.setenv("CLAW_USAGE_ECONOMICS_DB_PATH", str(tmp_path / "usage.sqlite3"))
    monkeypatch.setenv("CLAW_ONRAMP_DB_PATH", str(tmp_path / "onramp.sqlite3"))
    monkeypatch.setenv("CLAW_TREASURY_DB_PATH", str(tmp_path / "treasury.sqlite3"))
    from backend.economics.store import reset_economics_store_for_tests
    reset_economics_store_for_tests()
    for _name in ("_ORG_H", "_OWNER_H", "OWNER_HEADERS", "_HEADERS", "ORG_HEADERS", "_OWNER", "_ORG_A", "_ORG", "_STAGING_ORG"):
        h = globals().get(_name)
        if isinstance(h, dict) and h.get("X-Claw-Org-Id"):
            ensure_headers_entitled(h)
    yield
    reset_economics_store_for_tests()




@pytest.fixture(autouse=True)
def _clear_supabase_env(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.delenv("SUPABASE_URL", raising=False)
    monkeypatch.delenv("SUPABASE_SERVICE_ROLE_KEY", raising=False)
    reset_organization_sync_circuit_for_tests()
    yield
    reset_organization_sync_circuit_for_tests()


@pytest.fixture(autouse=True)
def _reset_usage_economics_singleton():
    usage_economics_store_mod._store = None  # noqa: SLF001
    yield
    usage_economics_store_mod._store = None  # noqa: SLF001


def _enable_supabase(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("SUPABASE_URL", "https://example.supabase.co")
    monkeypatch.setenv("SUPABASE_SERVICE_ROLE_KEY", "service-key")


class _FakeSupabaseClient:
    def __init__(self, *args: object, **kwargs: object) -> None:
        self.calls: List[Dict[str, Any]] = []

    def __enter__(self) -> "_FakeSupabaseClient":
        return self

    def __exit__(self, *args: object) -> None:
        return None

    def request(self, method: str, url: str, **kwargs: Any) -> "_FakeResponse":
        self.calls.append({"method": method, "url": url, **kwargs})
        return _FakeResponse()

    def get(self, url: str, **kwargs: Any) -> "_FakeResponse":
        self.calls.append({"method": "GET", "url": url, **kwargs})
        return _FakeResponse()


class _FakeResponse:
    status_code = 200

    def json(self) -> List[Dict[str, Any]]:
        return []


@pytest.fixture
def supabase_client_factory() -> type[_FakeSupabaseClient]:
    return _FakeSupabaseClient


def _last_agreement_upsert_body(calls: List[Dict[str, Any]]) -> Dict[str, Any]:
    for call in reversed(calls):
        if "agreements" in call.get("url", "") and call.get("method") == "POST":
            body = call.get("json")
            if isinstance(body, dict):
                return body
    raise AssertionError("agreement upsert not found")


def _party_delete_and_post_calls(calls: List[Dict[str, Any]]) -> tuple[bool, bool]:
    deleted = any(
        c.get("method") == "DELETE" and "agreement_parties" in c.get("url", "") for c in calls
    )
    posted = any(
        c.get("method") == "POST" and "agreement_parties" in c.get("url", "") for c in calls
    )
    return deleted, posted


def test_local_fallback_when_supabase_env_missing(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.delenv("SUPABASE_URL", raising=False)
    monkeypatch.delenv("SUPABASE_SERVICE_ROLE_KEY", raising=False)
    assert is_supabase_dashboard_configured() is False
    ids = merge_workspace_index_agreement_ids(
        subject_ref="org:local-org",
        local_ids_newest_first=["ag_local_1", "ag_local_2"],
    )
    assert ids == ["ag_local_1", "ag_local_2"]


def test_merge_workspace_index_prefers_supabase_ids(monkeypatch: pytest.MonkeyPatch) -> None:
    _enable_supabase(monkeypatch)

    with patch("backend.lawdog_dashboard.workspace_index.list_agreements_for_organization") as list_mock:
        list_mock.return_value = [
            {"id": "ag_remote_1", "title": "Agreement #1", "updated_at": "2026-05-02T00:00:00Z"},
        ]
        ids = merge_workspace_index_agreement_ids(
            subject_ref="org:local-org",
            local_ids_newest_first=["ag_local_2"],
        )
    assert ids == ["ag_remote_1", "ag_local_2"]


def test_sync_agreement_draft_to_supabase_upserts_row(monkeypatch: pytest.MonkeyPatch) -> None:
    _enable_supabase(monkeypatch)
    fake = _FakeSupabaseClient()

    with patch("backend.lawdog_dashboard.supabase_service.httpx.Client", lambda *a, **k: fake):
        sync_agreement_draft_to_supabase(
            organization_id="local-org",
            draft={
                "id": "ag_1",
                "title": "Agreement #1",
                "created_at": "2026-05-01T12:00:00Z",
                "updated_at": "2026-05-01T12:00:00Z",
                "parties": [
                    {"id": "p1", "name": "Blue Canyon LLC", "role": "signer"},
                ],
            },
        )

    assert any("organizations" in c["url"] for c in fake.calls)
    assert any("agreements" in c["url"] for c in fake.calls)
    assert any("agreement_parties" in c["url"] for c in fake.calls)


def test_fallback_summary_from_supabase_row() -> None:
    summary = fallback_summary_from_supabase_row(
        {
            "id": "ag_1",
            "title": "Agreement #1",
            "created_at": "2026-05-01T12:00:00Z",
            "updated_at": "2026-05-01T12:00:00Z",
        },
        parties=[
            {"display_name": "Blue Canyon LLC", "role": "signer"},
            {"display_name": "Red Mesa LLC", "role": "reviewer"},
        ],
    )
    assert summary["id"] == "ag_1"
    assert summary["title"] == "Agreement #1"
    assert summary["party_count"] == 2
    assert summary["signer_count"] == 1
    assert summary["dashboard_source"] == "supabase_fallback"
    assert summary["content_unavailable"] is True


def test_create_draft_syncs_supabase(
    monkeypatch: pytest.MonkeyPatch,
    tmp_path,
    supabase_client_factory: type[_FakeSupabaseClient],
) -> None:
    monkeypatch.setenv("CLAW_DATA_DIR", str(tmp_path))
    monkeypatch.setenv("CLAW_USAGE_ECONOMICS_ENABLED", "1")
    monkeypatch.setenv("CLAW_USAGE_ECONOMICS_DB_PATH", str(tmp_path / "usage.sqlite3"))
    monkeypatch.setenv("CLAW_ECONOMICS_DB_PATH", str(tmp_path / "economics.sqlite3"))
    _enable_supabase(monkeypatch)
    fake = supabase_client_factory()

    with patch("backend.lawdog_dashboard.supabase_service.httpx.Client", lambda *a, **k: fake):
        client = TestClient(app)
        ensure_headers_entitled(_ORG)
        res = client.post(
            "/api/agreements/draft",
            headers=_ORG,
            json={
                "title": "Agreement #1",
                "jurisdiction": "TX",
                "parties": [{"name": "Blue Canyon LLC", "role": "signer"}],
                "purpose": "Services agreement body",
                "payment_terms": "Net 30",
                "duration": None,
                "due_date": None,
                "effective_date": None,
            },
        )
    assert res.status_code == 200
    body = _last_agreement_upsert_body(fake.calls)
    assert body["title"] == "Agreement #1"
    deleted, posted = _party_delete_and_post_calls(fake.calls)
    assert deleted and posted


def test_create_draft_succeeds_when_supabase_sync_fails(
    monkeypatch: pytest.MonkeyPatch,
    tmp_path,
) -> None:
    monkeypatch.setenv("CLAW_DATA_DIR", str(tmp_path))
    monkeypatch.setenv("CLAW_USAGE_ECONOMICS_ENABLED", "1")
    monkeypatch.setenv("CLAW_USAGE_ECONOMICS_DB_PATH", str(tmp_path / "usage.sqlite3"))
    monkeypatch.setenv("CLAW_ECONOMICS_DB_PATH", str(tmp_path / "economics.sqlite3"))
    _enable_supabase(monkeypatch)

    with patch("backend.lawdog_dashboard.supabase_service._request", return_value=False):
        client = TestClient(app)
        ensure_headers_entitled(_ORG)
        res = client.post(
            "/api/agreements/draft",
            headers=_ORG,
            json={
                "title": "Agreement survives sync failure",
                "jurisdiction": "TX",
                "parties": [{"name": "Blue Canyon LLC", "role": "signer"}],
                "purpose": "Services agreement body",
                "payment_terms": "Net 30",
                "duration": None,
                "due_date": None,
                "effective_date": None,
            },
        )

    assert res.status_code == 200
    payload = res.json()
    aid = str(payload.get("id") or "").strip()
    assert aid
    assert payload["draft"]["title"] == "Agreement survives sync failure"

    get_res = client.get(f"/api/agreements/{aid}", headers=_ORG)
    assert get_res.status_code == 200
    assert get_res.json()["draft"]["title"] == "Agreement survives sync failure"


def test_update_field_title_syncs_supabase(
    monkeypatch: pytest.MonkeyPatch,
    tmp_path,
    supabase_client_factory: type[_FakeSupabaseClient],
) -> None:
    monkeypatch.setenv("CLAW_DATA_DIR", str(tmp_path))
    monkeypatch.setenv("CLAW_USAGE_ECONOMICS_ENABLED", "1")
    monkeypatch.setenv("CLAW_USAGE_ECONOMICS_DB_PATH", str(tmp_path / "usage.sqlite3"))
    monkeypatch.setenv("CLAW_ECONOMICS_DB_PATH", str(tmp_path / "economics.sqlite3"))
    _enable_supabase(monkeypatch)
    fake = supabase_client_factory()

    with patch("backend.lawdog_dashboard.supabase_service.httpx.Client", lambda *a, **k: fake):
        client = TestClient(app)
        ensure_headers_entitled(_ORG)
        created = client.post(
            "/api/agreements/draft",
            headers=_ORG,
            json={
                "title": "Original title",
                "jurisdiction": "TX",
                "parties": [{"name": "Blue Canyon LLC", "role": "signer"}],
                "purpose": "Body",
                "payment_terms": "Net 30",
                "duration": None,
                "due_date": None,
                "effective_date": None,
            },
        )
        aid = created.json()["id"]
        fake.calls.clear()
        updated = client.post(
            f"/api/agreements/{aid}/update-field",
            headers=_ORG,
            json={"field": "title", "value": "Edited title"},
        )
    assert updated.status_code == 200
    body = _last_agreement_upsert_body(fake.calls)
    assert body["title"] == "Edited title"
    assert body["updated_at"]


def test_update_field_parties_replaces_agreement_parties(
    monkeypatch: pytest.MonkeyPatch,
    tmp_path,
    supabase_client_factory: type[_FakeSupabaseClient],
) -> None:
    monkeypatch.setenv("CLAW_DATA_DIR", str(tmp_path))
    monkeypatch.setenv("CLAW_USAGE_ECONOMICS_ENABLED", "1")
    monkeypatch.setenv("CLAW_USAGE_ECONOMICS_DB_PATH", str(tmp_path / "usage.sqlite3"))
    monkeypatch.setenv("CLAW_ECONOMICS_DB_PATH", str(tmp_path / "economics.sqlite3"))
    _enable_supabase(monkeypatch)
    fake = supabase_client_factory()

    with patch("backend.lawdog_dashboard.supabase_service.httpx.Client", lambda *a, **k: fake):
        client = TestClient(app)
        ensure_headers_entitled(_ORG)
        created = client.post(
            "/api/agreements/draft",
            headers=_ORG,
            json={
                "title": "Agreement #1",
                "jurisdiction": "TX",
                "parties": [{"name": "Party A", "role": "signer", "id": "p-a"}],
                "purpose": "Body",
                "payment_terms": "Net 30",
                "duration": None,
                "due_date": None,
                "effective_date": None,
            },
        )
        aid = created.json()["id"]
        fake.calls.clear()
        updated = client.post(
            f"/api/agreements/{aid}/update-field",
            headers=_ORG,
            json={
                "field": "parties",
                "value": [
                    {"name": "Party A", "role": "signer", "id": "p-a"},
                    {"name": "Party B", "role": "reviewer", "id": "p-b"},
                ],
            },
        )
    assert updated.status_code == 200
    deleted, posted = _party_delete_and_post_calls(fake.calls)
    assert deleted and posted
    party_post = next(
        c for c in fake.calls if c.get("method") == "POST" and "agreement_parties" in c.get("url", "")
    )
    rows = party_post["json"]
    assert isinstance(rows, list)
    assert len(rows) == 2
    assert {r["display_name"] for r in rows} == {"Party A", "Party B"}


def test_review_sent_syncs_review_sent_at(
    monkeypatch: pytest.MonkeyPatch,
    tmp_path,
    supabase_client_factory: type[_FakeSupabaseClient],
) -> None:
    monkeypatch.setenv("CLAW_DATA_DIR", str(tmp_path))
    monkeypatch.setenv("CLAW_USAGE_ECONOMICS_ENABLED", "1")
    monkeypatch.setenv("CLAW_USAGE_ECONOMICS_DB_PATH", str(tmp_path / "usage.sqlite3"))
    monkeypatch.setenv("CLAW_ECONOMICS_DB_PATH", str(tmp_path / "economics.sqlite3"))
    _enable_supabase(monkeypatch)
    fake = supabase_client_factory()

    with patch("backend.lawdog_dashboard.supabase_service.httpx.Client", lambda *a, **k: fake):
        client = TestClient(app)
        ensure_headers_entitled(_ORG)
        created = client.post(
            "/api/agreements/draft",
            headers=_ORG,
            json={
                "title": "Agreement #1",
                "jurisdiction": "TX",
                "parties": [{"name": "Party A", "role": "signer"}],
                "purpose": "Body",
                "payment_terms": "Net 30",
                "duration": None,
                "due_date": None,
                "effective_date": None,
            },
        )
        aid = created.json()["id"]
        fake.calls.clear()
        sent = client.post(f"/api/agreements/{aid}/review-sent", headers=_ORG)
    assert sent.status_code == 200
    body = _last_agreement_upsert_body(fake.calls)
    assert body["review_sent_at"]


def test_workspace_archive_syncs_workspace_archived_at(
    monkeypatch: pytest.MonkeyPatch,
    tmp_path,
    supabase_client_factory: type[_FakeSupabaseClient],
) -> None:
    monkeypatch.setenv("CLAW_DATA_DIR", str(tmp_path))
    monkeypatch.setenv("CLAW_USAGE_ECONOMICS_ENABLED", "1")
    monkeypatch.setenv("CLAW_USAGE_ECONOMICS_DB_PATH", str(tmp_path / "usage.sqlite3"))
    monkeypatch.setenv("CLAW_ECONOMICS_DB_PATH", str(tmp_path / "economics.sqlite3"))
    _enable_supabase(monkeypatch)
    fake = supabase_client_factory()

    with patch("backend.lawdog_dashboard.supabase_service.httpx.Client", lambda *a, **k: fake):
        client = TestClient(app)
        ensure_headers_entitled(_ORG)
        created = client.post(
            "/api/agreements/draft",
            headers=_ORG,
            json={
                "title": "Agreement #1",
                "jurisdiction": "TX",
                "parties": [{"name": "Party A", "role": "signer"}],
                "purpose": "Body",
                "payment_terms": "Net 30",
                "duration": None,
                "due_date": None,
                "effective_date": None,
            },
        )
        aid = created.json()["id"]
        fake.calls.clear()
        archived = client.patch(
            f"/api/agreements/{aid}/workspace-archive",
            headers=_ORG,
            json={"archived": True},
        )
    assert archived.status_code == 200
    body = _last_agreement_upsert_body(fake.calls)
    assert body["workspace_archived_at"]


def test_workspace_index_prefers_local_draft_over_supabase(
    monkeypatch: pytest.MonkeyPatch,
    tmp_path,
) -> None:
    monkeypatch.setenv("CLAW_DATA_DIR", str(tmp_path))
    monkeypatch.setenv("CLAW_USAGE_ECONOMICS_ENABLED", "1")
    monkeypatch.setenv("CLAW_USAGE_ECONOMICS_DB_PATH", str(tmp_path / "usage.sqlite3"))
    monkeypatch.setenv("CLAW_ECONOMICS_DB_PATH", str(tmp_path / "economics.sqlite3"))
    _enable_supabase(monkeypatch)
    client = TestClient(app)
    ensure_headers_entitled(_ORG)
    created = client.post(
        "/api/agreements/draft",
        headers=_ORG,
        json={
            "title": "Local draft title",
            "jurisdiction": "TX",
            "parties": [{"name": "Party A", "role": "signer"}],
            "purpose": "Body",
            "payment_terms": "Net 30",
            "duration": None,
            "due_date": None,
            "effective_date": None,
        },
    )
    aid = created.json()["id"]
    client.post(
        f"/api/agreements/{aid}/update-field",
        headers=_ORG,
        json={"field": "title", "value": "Edited local title"},
    )

    stale_row = {
        "id": aid,
        "title": "Stale Supabase title",
        "created_at": "2026-05-01T12:00:00Z",
        "updated_at": "2026-05-01T12:00:00Z",
    }
    with patch(
        "backend.routers.agreements_v2_api.supabase_rows_by_id_for_subject",
        return_value={aid: stale_row},
    ):
        index = client.get("/api/agreements/workspace-index", headers=_ORG)
    assert index.status_code == 200
    rows = index.json()["agreements"]
    match = next(r for r in rows if r["id"] == aid)
    assert match["title"] == "Edited local title"
    assert match["dashboard_source"] == "draft"
    assert match["content_unavailable"] is False


def test_workspace_index_supabase_fallback_marks_content_unavailable(
    monkeypatch: pytest.MonkeyPatch,
    tmp_path,
) -> None:
    monkeypatch.setenv("CLAW_DATA_DIR", str(tmp_path))
    monkeypatch.setenv("CLAW_USAGE_ECONOMICS_ENABLED", "1")
    monkeypatch.setenv("CLAW_USAGE_ECONOMICS_DB_PATH", str(tmp_path / "usage.sqlite3"))
    monkeypatch.setenv("CLAW_ECONOMICS_DB_PATH", str(tmp_path / "economics.sqlite3"))
    _enable_supabase(monkeypatch)
    client = TestClient(app)

    aid = "ag_missing_local"
    stale_row = {
        "id": aid,
        "title": "Supabase metadata title",
        "created_at": "2026-05-01T12:00:00Z",
        "updated_at": "2026-06-01T12:00:00Z",
        "review_sent_at": "2026-06-02T12:00:00Z",
    }
    parties = [
        {"agreement_id": aid, "display_name": "Party A", "role": "signer"},
    ]

    with patch(
        "backend.routers.agreements_v2_api.merge_workspace_index_agreement_ids",
        return_value=[aid],
    ), patch(
        "backend.routers.agreements_v2_api.supabase_rows_by_id_for_subject",
        return_value={aid: stale_row},
    ), patch(
        "backend.lawdog_dashboard.workspace_index.list_agreement_parties_for_agreement",
        return_value=parties,
    ), patch(
        "backend.routers.agreements_v2_api.load_draft",
        side_effect=KeyError("agreement_not_found"),
    ):
        index = client.get("/api/agreements/workspace-index", headers=_ORG)

    assert index.status_code == 200
    rows = index.json()["agreements"]
    match = next(r for r in rows if r["id"] == aid)
    assert match["title"] == "Supabase metadata title"
    assert match["party_count"] == 1
    assert match["dashboard_source"] == "supabase_fallback"
    assert match["content_unavailable"] is True
    assert match["content_unavailable_reason"] == "draft_load_failed"

    register_test_agreement_owner(
        db_path=str(tmp_path / "usage.sqlite3"),
        agreement_id=aid,
        org_id="lawdog-sync-org",
    )
    get_res = client.get(f"/api/agreements/{aid}", headers=_ORG)
    assert get_res.status_code == 404
