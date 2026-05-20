"""Resilient GET /health and GET /v1/healthz (no 500 on optional subsystem failures)."""

from __future__ import annotations

import pytest
from fastapi.testclient import TestClient

from backend.health.public_liveness import build_public_health_payload
from backend.main import app
from backend.services.agreement_pdf_story_capability import (
    assess_agreement_pdf_story_capability_for_health,
    reset_agreement_pdf_story_capability_cache_for_tests,
)

pytestmark = pytest.mark.unit


@pytest.fixture(autouse=True)
def _reset_pdf_cache() -> None:
    reset_agreement_pdf_story_capability_cache_for_tests()
    yield
    reset_agreement_pdf_story_capability_cache_for_tests()


def test_health_endpoints_always_200_when_pdf_probe_raises(monkeypatch: pytest.MonkeyPatch) -> None:
    def boom() -> dict:
        raise RuntimeError("simulated_pdf_probe_failure")

    monkeypatch.setattr("backend.health.public_liveness._probe_recipient_pdf_export", boom)
    client = TestClient(app)
    for path in ("/health", "/v1/healthz"):
        r = client.get(path)
        assert r.status_code == 200, path
        body = r.json()
        assert body.get("ok") is True
        assert body.get("degraded") is True
        assert body["subsystems"]["recipient_pdf_export"]["status"] == "error"


def test_build_payload_when_import_fails(monkeypatch: pytest.MonkeyPatch) -> None:
    def fake_import() -> dict:
        raise ImportError("no pymupdf")

    monkeypatch.setattr(
        "backend.services.agreement_pdf_story_capability.assess_agreement_pdf_story_capability_for_health",
        fake_import,
    )
    body = build_public_health_payload()
    assert body["ok"] is True
    rpe = body["subsystems"]["recipient_pdf_export"]
    assert rpe["status"] == "error"
    assert rpe["available"] is False
    assert body["recipient_pdf_export"]["available"] is False


def test_health_import_only_probe_skips_render(monkeypatch: pytest.MonkeyPatch) -> None:
    render_calls = {"n": 0}

    class _Fitz:
        class Story:
            def __init__(self, *_a: object, **_k: object) -> None:
                pass

            def reset(self) -> None:
                pass

            def place(self, *_a: object, **_k: object) -> tuple[int, int]:
                return (0, 0)

            def draw(self, *_a: object, **_k: object) -> None:
                pass

            def element_positions(self) -> list[object]:
                return []

        class DocumentWriter:
            def __init__(self, *_a: object, **_k: object) -> None:
                render_calls["n"] += 1

            def begin_page(self, *_a: object, **_k: object) -> None:
                pass

            def end_page(self) -> None:
                pass

            def close(self) -> None:
                pass

    monkeypatch.setattr(
        "backend.services.agreement_pdf_story_capability._import_fitz_module",
        lambda: _Fitz(),
    )
    cap = assess_agreement_pdf_story_capability_for_health()
    assert cap["available"] is True
    assert cap.get("reason") == "health_import_only_probe"
    assert render_calls["n"] == 0


def test_health_skips_pdf_when_env_set(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("CLAW_HEALTH_SKIP_RECIPIENT_PDF_PROBE", "1")
    body = build_public_health_payload()
    assert body["ok"] is True
    assert body["subsystems"]["recipient_pdf_export"]["status"] == "skipped"


def test_health_degraded_when_pdf_unavailable(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(
        "backend.services.agreement_pdf_story_capability.assess_agreement_pdf_story_capability_for_health",
        lambda: {"available": False, "engine": "fallback", "reason": "pymupdf_import_failed"},
    )
    body = build_public_health_payload()
    assert body["ok"] is True
    assert body["degraded"] is True
    assert body["subsystems"]["recipient_pdf_export"]["status"] == "degraded"
