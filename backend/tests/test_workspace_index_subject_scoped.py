"""workspace-index prefers subject ownership rows and skips global draft scan when healthy."""

from __future__ import annotations

from unittest.mock import patch

import pytest
from fastapi.testclient import TestClient

from backend.main import app
from backend.tests.conftest_usage_economics_helpers import register_test_agreement_owner


_ORG_ID = "dash-speed-org"
_ORG = {"X-Claw-Org-Id": _ORG_ID, "X-Claw-Test-Auth-User-Id": "dash-speed-owner"}


@pytest.fixture()
def client(monkeypatch: pytest.MonkeyPatch, tmp_path):
    monkeypatch.setenv("CLAW_DATA_DIR", str(tmp_path))
    monkeypatch.setenv("CLAW_USAGE_ECONOMICS_ENABLED", "1")
    db_path = str(tmp_path / "usage.sqlite3")
    monkeypatch.setenv("CLAW_USAGE_ECONOMICS_DB_PATH", db_path)
    return TestClient(app), db_path


def test_workspace_index_uses_subject_ids_not_global_draft_list(client):
    test_client, db_path = client
    owned = ["ag_owned_a", "ag_owned_b"]
    for aid in owned:
        register_test_agreement_owner(db_path=db_path, agreement_id=aid, org_id=_ORG_ID)

    def _fake_draft(aid: str):
        return {
            "id": aid,
            "title": f"Title {aid}",
            "created_at": "2026-08-01T00:00:00Z",
            "updated_at": "2026-08-02T00:00:00Z",
            "parties": [{"name": "A"}, {"name": "B"}],
            "audit_log": [],
            "versions": [],
        }

    with patch(
        "backend.routers.agreements_v2_api.list_draft_agreement_ids_newest_first",
        side_effect=AssertionError("global draft scan must not run for healthy subject"),
    ) as global_list, patch(
        "backend.routers.agreements_v2_api.merge_workspace_index_agreement_ids",
        side_effect=lambda **kwargs: list(kwargs["local_ids_newest_first"]),
    ), patch(
        "backend.routers.agreements_v2_api.supabase_rows_by_id_for_subject",
        return_value={},
    ), patch(
        "backend.routers.agreements_v2_api.workspace_lists_agreement_for_subject",
        return_value=True,
    ), patch(
        "backend.routers.agreements_v2_api.load_draft",
        side_effect=_fake_draft,
    ), patch(
        "backend.routers.agreements_v2_api.read_signing_lock",
        return_value=None,
    ), patch(
        "backend.routers.agreements_v2_api._folder_name_map_for_subject",
        return_value={},
    ), patch(
        "backend.routers.agreements_v2_api._schedule_workspace_index_ownership_heal",
    ) as schedule_heal, patch(
        "backend.usage_economics.store.UsageEconomicsStore.heal_orphaned_agreement_ownership_for_subject",
        side_effect=AssertionError("sync heal must not run when ownership rows exist"),
    ):
        res = test_client.get("/api/agreements/workspace-index", headers=_ORG)

    assert res.status_code == 200, res.text
    ids = [r["id"] for r in res.json()["agreements"]]
    assert set(ids) == set(owned)
    global_list.assert_not_called()
    schedule_heal.assert_called()
