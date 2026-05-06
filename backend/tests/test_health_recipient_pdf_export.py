"""Health payload includes recipient PDF Story capability (requires full backend deps)."""

from __future__ import annotations

import pytest
from fastapi.testclient import TestClient

pytest.importorskip("eth_abi")

from backend.main import app

pytestmark = pytest.mark.unit


def test_health_and_healthz_include_recipient_pdf_export() -> None:
    client = TestClient(app)
    for path in ("/health", "/v1/healthz"):
        r = client.get(path)
        assert r.status_code == 200
        body = r.json()
        rpe = body.get("recipient_pdf_export")
        assert isinstance(rpe, dict), path
        assert "available" in rpe
        assert rpe.get("engine") in ("pymupdf-story", "fallback")
