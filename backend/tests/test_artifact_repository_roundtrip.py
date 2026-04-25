from __future__ import annotations

from pathlib import Path

import pytest

from backend.storage.artifact_repository import (
    get_artifact_repository,
    reset_artifact_repository_singleton,
)


def test_artifact_repository_put_get_roundtrip(monkeypatch: pytest.MonkeyPatch, tmp_path: Path) -> None:
    base = tmp_path / "t"
    monkeypatch.setenv("CLAW_DATA_DIR", str(base / "data"))
    monkeypatch.setenv("CLAW_BLOB_ROOT", str(base / "blobs"))
    monkeypatch.setenv("CLAW_ARTIFACT_REGISTRY_DB_PATH", str(base / "reg.sqlite3"))
    monkeypatch.setenv("CLAW_STORAGE_BACKEND", "local")
    reset_artifact_repository_singleton()

    repo = get_artifact_repository()
    data = b"artifact-bytes-test"
    rec = repo.put_artifact(
        artifact_type="test_blob",
        logical_ref="ref1",
        data=data,
        content_type="application/octet-stream",
        visibility="private",
    )
    assert rec.size_bytes == len(data)
    got = repo.get_bytes_by_logical_ref(artifact_type="test_blob", logical_ref="ref1")
    assert got == data
    repo.delete_logical_latest(artifact_type="test_blob", logical_ref="ref1")
