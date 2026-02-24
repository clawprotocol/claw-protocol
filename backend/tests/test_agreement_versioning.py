import hashlib
from backend.utils.agreement_version_store import AgreementVersionStore


def test_agreement_versioning_diff(tmp_path, monkeypatch):
    db_path = tmp_path / "agreements.sqlite3"
    monkeypatch.setenv("CLAW_AGREEMENT_DB_PATH", str(db_path))
    store = AgreementVersionStore()

    v1 = store.save_version(
        agreement_id="ag_demo",
        title="Demo Agreement",
        body_markdown="Line one\nLine two\n",
        created_at="2026-01-01T00:00:00Z",
        disclaimers=["Draft / non-binding by default."],
        metadata=None,
    )
    v2 = store.save_version(
        agreement_id="ag_demo",
        title="Demo Agreement",
        body_markdown="Line one\nLine two changed\n",
        created_at="2026-01-02T00:00:00Z",
        disclaimers=["Draft / non-binding by default."],
        metadata=None,
    )
    assert v1["body_sha256"] != v2["body_sha256"]

    versions = store.list_versions(agreement_id="ag_demo")
    assert versions[0]["version"] == 2
    assert versions[1]["version"] == 1

    diff = store.diff_versions(agreement_id="ag_demo", from_version=1, to_version=2)
    assert diff["ok"] is True
    assert "Line two changed" in diff["diff_text"]
    assert diff["diff_sha256"] == hashlib.sha256(diff["diff_text"].encode("utf-8")).hexdigest()
