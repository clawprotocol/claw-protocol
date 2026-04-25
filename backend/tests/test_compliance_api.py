"""Compliance disclosure registry and acknowledgement logging."""

from __future__ import annotations

import pytest
from fastapi.testclient import TestClient

from backend.compliance.disclosure_registry import get_disclosure_record, list_disclosures
from backend.main import app


def test_list_disclosures_has_sha256() -> None:
    d = list_disclosures()
    assert "product_terms_1" in d
    rec = d["product_terms_1"]
    assert rec["content_sha256"]
    assert len(rec["content_sha256"]) == 64


def test_post_acknowledgement_happy_path(tmp_path, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("CLAW_COMPLIANCE_DB_PATH", str(tmp_path / "c.sqlite3"))
    record = get_disclosure_record("product_terms_1")
    assert record is not None
    client = TestClient(app)
    r = client.post(
        "/v1/compliance/acknowledgements",
        json={
            "disclosure_key": "product_terms_1",
            "disclosure_version": record["version"],
            "disclosure_hash": record["content_sha256"],
            "org_id": "org_test",
        },
    )
    assert r.status_code == 200
    data = r.json()
    assert data["ok"] is True
    assert data["acknowledgement_id"].startswith("ack_")


def test_post_acknowledgement_rejects_bad_hash(tmp_path, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("CLAW_COMPLIANCE_DB_PATH", str(tmp_path / "c2.sqlite3"))
    record = get_disclosure_record("product_terms_1")
    assert record is not None
    client = TestClient(app)
    r = client.post(
        "/v1/compliance/acknowledgements",
        json={
            "disclosure_key": "product_terms_1",
            "disclosure_version": record["version"],
            "disclosure_hash": "0" * 64,
            "org_id": "org_test",
        },
    )
    assert r.status_code == 400


def test_post_product_signup_legal_assent(tmp_path, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("CLAW_COMPLIANCE_DB_PATH", str(tmp_path / "pla.sqlite3"))
    client = TestClient(app)
    r = client.post(
        "/v1/compliance/product-signup-assent",
        json={
            "assent_timestamp_iso": "2026-04-09T12:00:00.000Z",
            "terms_version_id": "lawdog_product_legal_v2",
            "privacy_version_id": "lawdog_product_privacy_v2",
            "legal_ack_version": 2,
            "org_id": "org_test",
            "client_assent_id": "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee",
            "auth_path": "email",
            "meta": {"client_path": "/claim"},
        },
    )
    assert r.status_code == 200
    data = r.json()
    assert data["ok"] is True
    assert data["assent_id"].startswith("psa_")
