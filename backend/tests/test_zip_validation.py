import io
import zipfile

from fastapi.testclient import TestClient

from backend.main import app


def _zip_with_path(path: str, content: bytes) -> bytes:
    mem = io.BytesIO()
    with zipfile.ZipFile(mem, "w", compression=zipfile.ZIP_DEFLATED) as zf:
        zf.writestr(path, content)
    return mem.getvalue()


def test_zip_traversal_rejected():
    client = TestClient(app)
    data = _zip_with_path("../evil.txt", b"bad")
    r = client.post("/v1/workflow/bundle/verify", files={"bundle_zip": ("bundle.zip", data)})
    assert r.status_code == 200
    assert r.json().get("ok") is False


def test_zip_unzipped_size_rejected(monkeypatch):
    monkeypatch.setenv("CLAW_BUNDLE_MAX_UNZIPPED_BYTES", "10")
    client = TestClient(app)
    data = _zip_with_path("big.txt", b"01234567890")
    r = client.post("/v1/workflow/bundle/verify", files={"bundle_zip": ("bundle.zip", data)})
    assert r.status_code == 200
    assert r.json().get("ok") is False
