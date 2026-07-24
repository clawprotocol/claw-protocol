"""Regression: /health runtime probe must not AttributeError on str data_dir()."""

from __future__ import annotations

from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from backend.health.public_liveness import _probe_runtime_environment, build_public_health_payload
from backend.main import app

pytestmark = pytest.mark.unit


def test_runtime_probe_handles_str_data_dir(monkeypatch, tmp_path: Path) -> None:
    monkeypatch.setenv("CLAW_DATA_DIR", str(tmp_path / "claw-data"))
    monkeypatch.setenv("CLAW_ENVIRONMENT", "staging")

    probe = _probe_runtime_environment()
    assert probe.get("status") != "error", probe
    assert probe.get("reason") != "runtime_probe:AttributeError"
    assert probe.get("status") == "ok"
    assert probe.get("data_dir_writable") is True
    assert probe.get("environment") == "staging"


def test_health_not_degraded_by_runtime_probe_attribute_error(monkeypatch, tmp_path: Path) -> None:
    monkeypatch.setenv("CLAW_DATA_DIR", str(tmp_path / "claw-data"))
    monkeypatch.setenv("CLAW_ENVIRONMENT", "staging")
    # Avoid PDF Story import noise dominating degraded; still allow real probe.
    monkeypatch.setenv("CLAW_HEALTH_SKIP_RECIPIENT_PDF_PROBE", "1")

    body = build_public_health_payload()
    runtime = (body.get("subsystems") or {}).get("runtime") or {}
    assert runtime.get("status") == "ok", runtime
    assert runtime.get("reason") != "runtime_probe:AttributeError"
    assert body.get("ok") is True
    # With PDF skipped and writable data dir, health must not be degraded by runtime.
    assert body.get("degraded") is False, body

    client = TestClient(app)
    r = client.get("/health")
    assert r.status_code == 200
    payload = r.json()
    assert payload.get("ok") is True
    rt = (payload.get("subsystems") or {}).get("runtime") or {}
    assert rt.get("status") != "error"
    assert rt.get("reason") != "runtime_probe:AttributeError"
