"""API tests for Pro redline import / accept / reject (owner-only paths)."""

import pytest
from fastapi.testclient import TestClient

import backend.routers.agreements_v2_api as agreements_v2_api
from backend.main import app
from backend.services.agreement_draft_store import load_draft, save_draft
from backend.usage_economics import store as usage_economics_store_mod

pytestmark = pytest.mark.unit

_ORG_H = {"X-Claw-Org-Id": "test-org-pro-redline"}


@pytest.fixture(autouse=True)
def _reset_usage_economics_singleton():
    usage_economics_store_mod._store = None  # noqa: SLF001
    yield
    usage_economics_store_mod._store = None  # noqa: SLF001


def _seed_pro_corpus(raw: dict, text: str) -> None:
    raw["server_full_document_text"] = text
    raw["premium_server_full_document_text"] = text
    raw["premium_full_document_text"] = text
    raw["document_text"] = text
    raw["premium_render_source"] = "server_full_document_text"
    save_draft(raw)


def test_pro_redline_import_accept_creates_version(monkeypatch, tmp_path):
    monkeypatch.setenv("CLAW_DATA_DIR", str(tmp_path))
    monkeypatch.setenv("CLAW_USAGE_ECONOMICS_DB_PATH", str(tmp_path / "usage.sqlite3"))
    client = TestClient(app)
    create_res = client.post(
        "/api/agreements/draft",
        headers=_ORG_H,
        json={
            "title": "Redline test",
            "jurisdiction": "DE",
            "parties": [{"name": "O", "role": "owner"}, {"name": "R", "role": "party"}],
            "purpose": "p",
            "payment_terms": "",
            "duration": None,
            "due_date": None,
            "effective_date": None,
        },
    )
    assert create_res.status_code == 200
    aid = create_res.json()["id"]
    raw = load_draft(aid)
    base = "Section Alpha\n\nSection Beta\n\n" + ("z" * 600)
    _seed_pro_corpus(raw, base)
    imp = base.replace("Section Beta", "Section BETA PRIME")

    imp_res = client.post(
        f"/api/agreements/{aid}/pro-redline/import-text",
        headers=_ORG_H,
        json={"imported_text": imp},
    )
    assert imp_res.status_code == 200
    body = imp_res.json()
    assert body.get("ok") is True
    assert int(body.get("changed_block_count") or 0) >= 1

    raw2 = load_draft(aid)
    pr2 = raw2.get("pro_redline_v1") or {}
    assert isinstance(pr2.get("pending_import"), dict)
    assert any(e.get("source") == "imported_revision" for e in (pr2.get("version_events") or []))

    acc = client.post(f"/api/agreements/{aid}/pro-redline/accept-import", headers=_ORG_H, json={})
    assert acc.status_code == 200
    accj = acc.json()
    assert accj.get("version_number") == 1
    raw3 = load_draft(aid)
    assert "BETA PRIME" in (raw3.get("server_full_document_text") or "")
    pr3 = raw3.get("pro_redline_v1") or {}
    assert pr3.get("pending_import") is None
    assert int(pr3.get("version_counter") or 0) == 1
    assert any(e.get("source") == "owner_accepted_revision" for e in (pr3.get("version_events") or []))


def test_pro_redline_import_reject_keeps_corpus(monkeypatch, tmp_path):
    monkeypatch.setenv("CLAW_DATA_DIR", str(tmp_path))
    monkeypatch.setenv("CLAW_USAGE_ECONOMICS_DB_PATH", str(tmp_path / "usage.sqlite3"))
    client = TestClient(app)
    create_res = client.post(
        "/api/agreements/draft",
        headers=_ORG_H,
        json={
            "title": "Reject test",
            "jurisdiction": "DE",
            "parties": [{"name": "O", "role": "owner"}],
            "purpose": "p",
            "payment_terms": "",
            "duration": None,
            "due_date": None,
            "effective_date": None,
        },
    )
    assert create_res.status_code == 200
    aid = create_res.json()["id"]
    raw = load_draft(aid)
    base = "Only\n\nBlocks\n\n" + ("y" * 600)
    _seed_pro_corpus(raw, base)
    imp = base + "\n\nTail"

    imp_res = client.post(
        f"/api/agreements/{aid}/pro-redline/import-text",
        headers=_ORG_H,
        json={"imported_text": imp},
    )
    assert imp_res.status_code == 200

    before = load_draft(aid).get("server_full_document_text")
    rej = client.post(f"/api/agreements/{aid}/pro-redline/reject-import", headers=_ORG_H, json={})
    assert rej.status_code == 200
    raw4 = load_draft(aid)
    assert raw4.get("server_full_document_text") == before
    pr4 = raw4.get("pro_redline_v1") or {}
    assert pr4.get("pending_import") is None
    assert any(
        e.get("source") == "owner_rejected_revision" and e.get("rejection_kind") == "import"
        for e in (pr4.get("version_events") or [])
    )


def test_accept_import_canonical_matches_imported_and_clears_stale_rendered(monkeypatch, tmp_path):
    """Stale rendered_document_text must not outrank accepted corpus (export / send handoff)."""
    monkeypatch.setenv("CLAW_DATA_DIR", str(tmp_path))
    monkeypatch.setenv("CLAW_USAGE_ECONOMICS_DB_PATH", str(tmp_path / "usage.sqlite3"))
    client = TestClient(app)
    create_res = client.post(
        "/api/agreements/draft",
        headers=_ORG_H,
        json={
            "title": "Canonical test",
            "jurisdiction": "DE",
            "parties": [{"name": "O", "role": "owner"}],
            "purpose": "p",
            "payment_terms": "",
            "duration": None,
            "due_date": None,
            "effective_date": None,
        },
    )
    assert create_res.status_code == 200
    aid = create_res.json()["id"]
    raw = load_draft(aid)
    base = "Section Alpha\n\nSection Beta\n\n" + ("z" * 600)
    _seed_pro_corpus(raw, base)
    raw["rendered_document_text"] = "STALE_RENDERED_PLACEHOLDER\n\n" + ("r" * 12_000)
    save_draft(raw)
    imported = base.replace("Section Beta", "Section BETA ACCEPTED")

    assert client.post(
        f"/api/agreements/{aid}/pro-redline/import-text",
        headers=_ORG_H,
        json={"imported_text": imported},
    ).status_code == 200
    acc = client.post(f"/api/agreements/{aid}/pro-redline/accept-import", headers=_ORG_H, json={})
    assert acc.status_code == 200
    raw_after = load_draft(aid)
    assert raw_after.get("rendered_document_text") in (None, "")
    canon = agreements_v2_api._canonical_agreement_plain_from_raw(raw_after)
    assert canon == imported.strip()
    for k in (
        "server_full_document_text",
        "premium_server_full_document_text",
        "premium_full_document_text",
        "document_text",
    ):
        assert (raw_after.get(k) or "").strip() == imported.strip()


def test_export_txt_matches_canonical_after_accept_and_survives_review_sent(monkeypatch, tmp_path):
    monkeypatch.setenv("CLAW_DATA_DIR", str(tmp_path))
    monkeypatch.setenv("CLAW_USAGE_ECONOMICS_DB_PATH", str(tmp_path / "usage.sqlite3"))
    client = TestClient(app)
    create_res = client.post(
        "/api/agreements/draft",
        headers=_ORG_H,
        json={
            "title": "Export test",
            "jurisdiction": "DE",
            "parties": [{"name": "O", "role": "owner"}],
            "purpose": "p",
            "payment_terms": "",
            "duration": None,
            "due_date": None,
            "effective_date": None,
        },
    )
    aid = create_res.json()["id"]
    raw = load_draft(aid)
    base = "Body\n\n" + ("m" * 600)
    _seed_pro_corpus(raw, base)
    imported = base.replace("Body", "BODY EXPORTED")
    assert client.post(
        f"/api/agreements/{aid}/pro-redline/import-text",
        headers=_ORG_H,
        json={"imported_text": imported},
    ).status_code == 200
    assert client.post(f"/api/agreements/{aid}/pro-redline/accept-import", headers=_ORG_H, json={}).status_code == 200
    canon = agreements_v2_api._canonical_agreement_plain_from_raw(load_draft(aid))
    exp = client.get(f"/api/agreements/{aid}/export-draft.txt", headers=_ORG_H)
    assert exp.status_code == 200
    assert exp.content.decode("utf-8") == canon

    assert client.post(f"/api/agreements/{aid}/review-sent", headers=_ORG_H, json={}).status_code == 200
    exp2 = client.get(f"/api/agreements/{aid}/export-draft.txt", headers=_ORG_H)
    assert exp2.content.decode("utf-8") == canon


def test_reject_import_preserves_corpus_after_reload(monkeypatch, tmp_path):
    monkeypatch.setenv("CLAW_DATA_DIR", str(tmp_path))
    monkeypatch.setenv("CLAW_USAGE_ECONOMICS_DB_PATH", str(tmp_path / "usage.sqlite3"))
    client = TestClient(app)
    create_res = client.post(
        "/api/agreements/draft",
        headers=_ORG_H,
        json={
            "title": "Reload reject",
            "jurisdiction": "DE",
            "parties": [{"name": "O", "role": "owner"}],
            "purpose": "p",
            "payment_terms": "",
            "duration": None,
            "due_date": None,
            "effective_date": None,
        },
    )
    aid = create_res.json()["id"]
    raw = load_draft(aid)
    base = "Keep\n\n" + ("k" * 600)
    _seed_pro_corpus(raw, base)
    assert client.post(
        f"/api/agreements/{aid}/pro-redline/import-text",
        headers=_ORG_H,
        json={"imported_text": base + "\n\nREJECT ME"},
    ).status_code == 200
    assert client.post(f"/api/agreements/{aid}/pro-redline/reject-import", headers=_ORG_H, json={}).status_code == 200

    g1 = client.get(f"/api/agreements/{aid}", headers=_ORG_H)
    g2 = client.get(f"/api/agreements/{aid}", headers=_ORG_H)
    assert g1.status_code == 200 and g2.status_code == 200
    d1 = g1.json()["draft"]
    d2 = g2.json()["draft"]
    assert (d1.get("server_full_document_text") or "").strip() == base.strip()
    assert (d2.get("server_full_document_text") or "").strip() == base.strip()
    assert d1.get("pro_redline_v1", {}).get("pending_import") is None
    assert d2.get("pro_redline_v1", {}).get("pending_import") is None


def test_version_history_persists_after_reload(monkeypatch, tmp_path):
    monkeypatch.setenv("CLAW_DATA_DIR", str(tmp_path))
    monkeypatch.setenv("CLAW_USAGE_ECONOMICS_DB_PATH", str(tmp_path / "usage.sqlite3"))
    client = TestClient(app)
    create_res = client.post(
        "/api/agreements/draft",
        headers=_ORG_H,
        json={
            "title": "History persist",
            "jurisdiction": "DE",
            "parties": [{"name": "O", "role": "owner"}],
            "purpose": "p",
            "payment_terms": "",
            "duration": None,
            "due_date": None,
            "effective_date": None,
        },
    )
    aid = create_res.json()["id"]
    raw = load_draft(aid)
    base = "Hist\n\n" + ("h" * 600)
    _seed_pro_corpus(raw, base)
    imported = base.replace("Hist", "HISTX")
    assert client.post(
        f"/api/agreements/{aid}/pro-redline/import-text",
        headers=_ORG_H,
        json={"imported_text": imported},
    ).status_code == 200
    assert client.post(f"/api/agreements/{aid}/pro-redline/accept-import", headers=_ORG_H, json={}).status_code == 200
    ve_disk = (load_draft(aid).get("pro_redline_v1") or {}).get("version_events") or []
    g = client.get(f"/api/agreements/{aid}", headers=_ORG_H)
    ve_api = (g.json()["draft"].get("pro_redline_v1") or {}).get("version_events") or []
    assert len(ve_api) == len(ve_disk) >= 2


def test_import_stores_full_imported_text_without_truncation(monkeypatch, tmp_path):
    """pending_import.imported_text must hold the full payload (snapshots may truncate separately)."""
    monkeypatch.setenv("CLAW_DATA_DIR", str(tmp_path))
    monkeypatch.setenv("CLAW_USAGE_ECONOMICS_DB_PATH", str(tmp_path / "usage.sqlite3"))
    monkeypatch.setattr(
        agreements_v2_api,
        "compute_pro_redline_block_diff",
        lambda _base, _imp: ([{"kind": "equal", "text": "stub"}], 0),
    )
    client = TestClient(app)
    create_res = client.post(
        "/api/agreements/draft",
        headers=_ORG_H,
        json={
            "title": "Long import",
            "jurisdiction": "DE",
            "parties": [{"name": "O", "role": "owner"}],
            "purpose": "p",
            "payment_terms": "",
            "duration": None,
            "due_date": None,
            "effective_date": None,
        },
    )
    aid = create_res.json()["id"]
    raw = load_draft(aid)
    _seed_pro_corpus(raw, "Intro\n\n" + ("a" * 600))
    suffix = "TAIL\n\n" + ("w" * 270_000)
    imported = ("Intro\n\n" + ("a" * 600) + "\n\n" + suffix).strip()
    assert client.post(
        f"/api/agreements/{aid}/pro-redline/import-text",
        headers=_ORG_H,
        json={"imported_text": imported},
    ).status_code == 200
    pending = (load_draft(aid).get("pro_redline_v1") or {}).get("pending_import") or {}
    assert len(pending.get("imported_text") or "") == len(imported)
    assert pending.get("imported_snapshot_truncated") is True


def test_pro_redline_import_file_rejects_non_txt(monkeypatch, tmp_path):
    monkeypatch.setenv("CLAW_DATA_DIR", str(tmp_path))
    monkeypatch.setenv("CLAW_USAGE_ECONOMICS_DB_PATH", str(tmp_path / "usage.sqlite3"))
    client = TestClient(app)
    create_res = client.post(
        "/api/agreements/draft",
        headers=_ORG_H,
        json={
            "title": "File gate",
            "jurisdiction": "DE",
            "parties": [{"name": "O", "role": "owner"}],
            "purpose": "p",
            "payment_terms": "",
            "duration": None,
            "due_date": None,
            "effective_date": None,
        },
    )
    assert create_res.status_code == 200
    aid = create_res.json()["id"]
    raw = load_draft(aid)
    _seed_pro_corpus(raw, "A\n\nB\n\n" + "x" * 600)

    files = {"file": ("x.docx", b"PK fake", "application/vnd.openxmlformats-officedocument.wordprocessingml.document")}
    r = client.post(f"/api/agreements/{aid}/pro-redline/import-file", headers=_ORG_H, files=files)
    assert r.status_code == 400
