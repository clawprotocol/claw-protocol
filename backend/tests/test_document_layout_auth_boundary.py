"""
Patch 2 adversarial: document-layout + integration-layout authorization.

Anonymous / cross-org access must fail; owner_org_id bind is server-side only.
"""

from __future__ import annotations

import base64

import pytest
from fastapi.testclient import TestClient

fitz = pytest.importorskip("fitz")

from backend.main import app
from backend.document_layout.store import load_layout_analysis, save_layout_analysis


@pytest.fixture()
def client(monkeypatch, tmp_path):
    monkeypatch.setenv("CLAW_ENVIRONMENT", "test")
    monkeypatch.setenv("CLAW_DATA_DIR", str(tmp_path))
    monkeypatch.setenv("CLAW_LAYOUT_ANALYSIS_DIR", str(tmp_path / "layout"))
    monkeypatch.setenv("CLAW_USAGE_ECONOMICS_DB_PATH", str(tmp_path / "usage.sqlite3"))
    monkeypatch.setenv("CLAW_COMMERCIAL_MODE", "1")
    return TestClient(app)


def _owner(user: str = "owner-a") -> dict[str, str]:
    return {"X-Claw-Org-Id": f"user-{user}", "X-Claw-Test-Auth-User-Id": user}


def _tiny_pdf_b64() -> str:
    doc = fitz.open()
    page = doc.new_page(width=612, height=792)
    page.insert_text((72, 120), "Signature: ___________________________", fontsize=12)
    raw = doc.tobytes()
    doc.close()
    return base64.b64encode(raw).decode("ascii")


def _create_analysis(client: TestClient, *, user: str = "owner-a") -> str:
    r = client.post(
        "/v1/document-layout/analyze",
        headers=_owner(user),
        json={
            "content_base64": _tiny_pdf_b64(),
            "content_type": "application/pdf",
            "options": {"assistive_llm": False, "persist": True},
        },
    )
    assert r.status_code == 200, r.text
    aid = r.json()["analysis_id"]
    assert aid.startswith("layout_")
    disk = load_layout_analysis(aid)
    assert disk is not None
    assert disk.get("owner_org_id") == f"user-{user}"
    return aid


def test_anonymous_get_analysis_fails(client: TestClient):
    aid = _create_analysis(client)
    r = client.get(f"/v1/document-layout/analysis/{aid}")
    assert r.status_code in (401, 403), r.text


def test_anonymous_localize_and_field_review_fail(client: TestClient):
    aid = _create_analysis(client)
    loc = client.post(
        f"/v1/document-layout/analysis/{aid}/localize",
        json={"query": "find signature line"},
    )
    assert loc.status_code in (401, 403), loc.text
    fr = client.post(f"/v1/document-layout/analysis/{aid}/field-review/open")
    assert fr.status_code in (401, 403), fr.text


def test_anonymous_integration_aliases_fail(client: TestClient):
    aid = _create_analysis(client)
    fields = client.get(f"/v1/integration/layout/{aid}/fields")
    assert fields.status_code in (401, 403), fields.text
    loc = client.post(
        f"/v1/integration/layout/{aid}/localize",
        json={"query": "find signature line"},
    )
    assert loc.status_code in (401, 403), loc.text


def test_forged_cross_org_cannot_read_analysis(client: TestClient):
    aid = _create_analysis(client, user="owner-a")
    forged = client.get(
        f"/v1/document-layout/analysis/{aid}",
        headers=_owner("attacker"),
    )
    assert forged.status_code == 403, forged.text
    assert forged.json()["detail"]["code"] == "layout_org_mismatch"

    forged_loc = client.post(
        f"/v1/document-layout/analysis/{aid}/localize",
        headers=_owner("attacker"),
        json={"query": "find signature line"},
    )
    assert forged_loc.status_code == 403, forged_loc.text


def test_owner_can_access_only_own_layout(client: TestClient):
    aid_a = _create_analysis(client, user="owner-a")
    aid_b = _create_analysis(client, user="owner-b")

    ok = client.get(f"/v1/document-layout/analysis/{aid_a}", headers=_owner("owner-a"))
    assert ok.status_code == 200, ok.text
    assert ok.json()["analysis_id"] == aid_a

    cross = client.get(f"/v1/document-layout/analysis/{aid_b}", headers=_owner("owner-a"))
    assert cross.status_code == 403, cross.text

    prep = client.get(
        f"/v1/document-layout/analysis/{aid_a}/signing-prep",
        headers=_owner("owner-a"),
    )
    assert prep.status_code == 200, prep.text


def test_integration_aliases_same_policy_as_canonical(client: TestClient):
    aid = _create_analysis(client, user="owner-a")

    fields_ok = client.get(
        f"/v1/integration/layout/{aid}/fields",
        headers=_owner("owner-a"),
    )
    assert fields_ok.status_code == 200, fields_ok.text

    fields_cross = client.get(
        f"/v1/integration/layout/{aid}/fields",
        headers=_owner("attacker"),
    )
    assert fields_cross.status_code == 403, fields_cross.text

    loc_ok = client.post(
        f"/v1/integration/layout/{aid}/localize",
        headers=_owner("owner-a"),
        json={"query": "find signature line"},
    )
    assert loc_ok.status_code == 200, loc_ok.text

    loc_cross = client.post(
        f"/v1/integration/layout/{aid}/localize",
        headers=_owner("attacker"),
        json={"query": "find signature line"},
    )
    assert loc_cross.status_code == 403, loc_cross.text


def test_legacy_missing_owner_org_fails_closed_in_commercial(client: TestClient, tmp_path):
    aid = "layout_" + ("ab" * 8)
    # Persist advisory JSON without owner_org_id (legacy).
    save_layout_analysis(
        aid,
        {
            "schema_version": "claw.document_layout.v1",
            "analysis_id": aid,
            "field_candidates": [],
            "page_count": 1,
        },
    )
    r = client.get(f"/v1/document-layout/analysis/{aid}", headers=_owner("owner-a"))
    assert r.status_code == 403, r.text
    assert r.json()["detail"]["code"] == "layout_ownership_unregistered"

    integ = client.get(f"/v1/integration/layout/{aid}/fields", headers=_owner("owner-a"))
    assert integ.status_code == 403, integ.text
    assert integ.json()["detail"]["code"] == "layout_ownership_unregistered"


def test_analyze_stamps_owner_org_server_side(client: TestClient):
    r = client.post(
        "/v1/document-layout/analyze",
        headers=_owner("owner-a"),
        json={
            "content_base64": _tiny_pdf_b64(),
            "content_type": "application/pdf",
            "options": {"assistive_llm": False, "persist": True},
            # Client must not be able to spoof ownership via body — field is ignored if present.
            "owner_org_id": "user-attacker",
        },
    )
    assert r.status_code == 200, r.text
    aid = r.json()["analysis_id"]
    disk = load_layout_analysis(aid)
    assert disk is not None
    assert disk.get("owner_org_id") == "user-owner-a"
