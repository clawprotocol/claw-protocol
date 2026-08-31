"""Leftover fused GET /content is never a successful paint when persist Review exists."""

from __future__ import annotations

import re

import pytest

from backend.services.vs01_leftover_fused_content import (
    FIRST_FAILING_LEFTOVER_GET_CONTENT_PAINTS_BEFORE_PERSIST_REVIEW_REPLACE,
    extract_plain_from_document_bytes,
    leftover_get_content_must_refuse,
    packet_is_persist_review_corpus,
    persist_review_corpus_from_draft,
    persist_review_plain_for_agreement,
    review_corpus_looks_like_leftover_fused_notices,
)

pytestmark = pytest.mark.unit

_ORG = "test-org-leftover-get-content"
_USER = "owner-leftover-get-content"
_ORG_H = {"X-Claw-Org-Id": _ORG, "X-Claw-Test-Auth-User-Id": _USER}
_ORIGIN_H = {
    **_ORG_H,
    "Origin": "https://believable-gentleness-staging.up.railway.app",
}

_PAD = "The parties agree to perform the stated obligations in good faith. " * 40


def _certified_review() -> str:
    return (
        "\n".join(
            [
                "SERVICES AGREEMENT",
                "",
                "This Agreement is between Alpha Workshop (Client) and Beta Counsel LLC (Service Provider).",
                "",
                "2. TERM",
                "This Agreement commences Upon full execution by the parties unless otherwise specified "
                "and continues for 30 days.",
                "",
                "10. LIABILITY",
                "Each party's aggregate liability is limited to fees paid under this Agreement.",
                "",
                "11. GOVERNING LAW",
                "This Agreement is governed by the laws of the applicable jurisdiction.",
                "",
                "12. NOTICES",
                "If to Alpha Workshop:",
                "Attn: Owner One",
                "Email: owner@example.test",
                "Address:",
                "100 Workshop Lane",
                "",
                "If to Beta Counsel LLC:",
                "Attn: Signer Two",
                "Email: signer@example.test",
                "Address:",
                "",
                "13. MISCELLANEOUS",
                "This Agreement constitutes the entire agreement of the parties. "
                "Notices are effective 30 days after delivery.",
            ]
        )
        + "\n\n"
        + _PAD
    ).strip()


def _leftover_story_banner_packet_bytes() -> bytes | None:
    """Leftover Story chrome + leftover 8-section designer — not persist Review."""
    try:
        from backend.services.agreement_vs01_pdf_seed import agreement_rendered_html_to_pdf_bytes
    except Exception:
        return None
    from html import escape

    leftover = _leftover_eight_section_designer()
    html = (
        "<article><p>Draft Agreement (non-binding template)</p><pre>"
        + escape(leftover)
        + "</pre></article>"
    )
    try:
        built = agreement_rendered_html_to_pdf_bytes(html, title="Services Agreement")
    except Exception:
        return None
    raw = built.pdf_bytes
    if not raw or not raw.startswith(b"%PDF"):
        return None
    return raw


def _leftover_story_pdf_bytes() -> bytes | None:
    """Production leftover packet: fitz Story render of leftover fused Notices."""
    try:
        from backend.services.agreement_vs01_pdf_seed import agreement_rendered_html_to_pdf_bytes
    except Exception:
        return None
    html = "<pre>" + _leftover_fused().replace("&", "&amp;").replace("<", "&lt;") + "</pre>"
    try:
        built = agreement_rendered_html_to_pdf_bytes(html, title="Services Agreement")
    except Exception:
        return None
    raw = built.pdf_bytes
    if not raw or not raw.startswith(b"%PDF"):
        return None
    return raw


def _leftover_packet_detector_misses() -> str:
    """Leftover packet whose extract / raw UTF-8 do not match leftover-text."""
    return (
        "\n".join(
            [
                "SERVICES AGREEMENT",
                "",
                "This consulting engagement is between Alpha Workshop and Beta Counsel LLC.",
                "",
                "1. SCOPE",
                "Provider delivers the stated consulting services.",
                "",
                "2. FEES",
                "Fees are due as stated in the engagement letter.",
                "",
                "3. TERM",
                "The engagement continues until the work is complete.",
            ]
        )
        + "\n\n"
        + _PAD
    ).strip()


def _leftover_eight_section_designer() -> str:
    """Leftover 8-section designer leftover purpose — leftover-text miss, longer than persist Review."""
    return (
        "\n".join(
            [
                "SERVICES AGREEMENT",
                "",
                "This consulting engagement is between Alpha Workshop and Beta Counsel LLC.",
                "",
                "1. Services and Deliverables",
                "Designer will provide the deliverables in commercially reasonable digital file "
                "formats suitable for normal brand use. If the parties later agree on additional "
                "deliverables, expanded file packages, extra concepts, social media templates, "
                "packaging, website assets, or other collateral, that additional work will be "
                "treated as a change in scope under this Agreement.",
                "",
                "2. Project Term and Timeline",
                "The engagement continues until the work is complete unless the parties agree "
                "in writing to a different schedule.",
                "",
                "3. Fees",
                "Fees are due as stated in the engagement letter.",
                "",
                "4. Revisions",
                "Reasonable revisions are included in the stated fee.",
                "",
                "5. Ownership",
                "Client owns the final deliverables upon full payment.",
                "",
                "6. Confidentiality",
                "Each party keeps non-public information confidential.",
                "",
                "7. Termination",
                "Either party may end the engagement on written notice.",
                "",
                "8. Signatures",
                "The parties may execute this Agreement in counterparts.",
            ]
        )
        + "\n\n"
        + (_PAD * 3)
    ).strip()


def _persist_review_seed_pdf_bytes() -> bytes | None:
    """#155 persist Review seed PDF — no leftover Draft Agreement chrome."""
    try:
        from backend.routers.agreements_v2_api import _render_persist_review_seed_html
        from backend.services.agreement_vs01_pdf_seed import agreement_rendered_html_to_pdf_bytes
    except Exception:
        return None

    html = _render_persist_review_seed_html(_certified_review())
    try:
        built = agreement_rendered_html_to_pdf_bytes(html, title="Services Agreement")
    except Exception:
        return None
    raw = built.pdf_bytes
    if not raw or not raw.startswith(b"%PDF"):
        return None
    return raw


def _leftover_story_banner_plus_persist_review_spans_packet_plain() -> str:
    """Leftover Story chrome + leftover 8-section + persist Review unique windows."""
    return (
        "Draft Agreement (non-binding template)\n"
        + _leftover_eight_section_designer()
        + "\n\n"
        + _certified_review()
    )


def _leftover_story_banner_plus_persist_review_spans_packet_bytes() -> bytes | None:
    """Leftover Story chrome wrapping leftover 8-section + persist Review spans."""
    try:
        from backend.services.agreement_vs01_pdf_seed import agreement_rendered_html_to_pdf_bytes
    except Exception:
        return None
    from html import escape

    mix = _leftover_eight_section_designer() + "\n\n" + _certified_review()
    html = (
        "<article><p>Draft Agreement (non-binding template)</p><pre>"
        + escape(mix)
        + "</pre></article>"
    )
    try:
        built = agreement_rendered_html_to_pdf_bytes(html, title="Services Agreement")
    except Exception:
        return None
    raw = built.pdf_bytes
    if not raw or not raw.startswith(b"%PDF"):
        return None
    return raw


def _persist_review_story_pdf_bytes() -> bytes | None:
    """Leftover Story chrome wrapping persist Review spans — not persist Review."""
    try:
        from backend.services.agreement_vs01_pdf_seed import agreement_rendered_html_to_pdf_bytes
    except Exception:
        return None
    from html import escape

    certified = _certified_review()
    html = (
        "<article><p>Draft Agreement (non-binding template)</p><pre>"
        + escape(certified)
        + "</pre></article>"
    )
    try:
        built = agreement_rendered_html_to_pdf_bytes(html, title="Services Agreement")
    except Exception:
        return None
    raw = built.pdf_bytes
    if not raw or not raw.startswith(b"%PDF"):
        return None
    return raw


def _leftover_clean_story_pdf_bytes() -> bytes | None:
    """Story PDF of leftover packet bytes that leftover-text does not classify."""
    try:
        from backend.services.agreement_vs01_pdf_seed import agreement_rendered_html_to_pdf_bytes
    except Exception:
        return None
    html = "<pre>" + _leftover_packet_detector_misses().replace("&", "&amp;").replace("<", "&lt;") + "</pre>"
    try:
        built = agreement_rendered_html_to_pdf_bytes(html, title="Services Agreement")
    except Exception:
        return None
    raw = built.pdf_bytes
    if not raw or not raw.startswith(b"%PDF"):
        return None
    return raw


def _leftover_compressed_pdf_bytes() -> bytes:
    """Compressed / Flate leftover packet: extract and raw UTF-8 do not look leftover."""
    stream = bytes((i * 37 + 11) & 0xFF for i in range(96))
    return (
        b"%PDF-1.4\n1 0 obj\n<< /Filter /FlateDecode /Length 96 >>\nstream\n"
        + stream
        + b"\nendstream\nendobj\n"
    )


def _leftover_fused() -> str:
    return (
        "\n".join(
            [
                "SERVICES AGREEMENT",
                "",
                "This Agreement is between Alpha Workshop (Client) and Beta Counsel LLC (Service Provider).",
                "",
                "10. LIABILITY",
                "Each party's aggregate liability is limited to fees paid under this Agreement.",
                "",
                "12. NOTICES",
                "If to Alpha Workshop Beta Counsel LLC:",
                "Alpha Workshop Beta Counsel LLC",
                "Attn: ________, ________",
                "If to Beta Counsel LLC:",
                "Address:",
                "30 days, Upon full execution by the parties unless otherwise specified.",
                "",
                "13. MISCELLANEOUS",
                "This Agreement is the entire agreement This Agreement is between Alpha Workshop Beta Counsel LLC "
                "('Service Provider') and Service Provider ('Service Provider').",
            ]
        )
        + "\n\n"
        + _PAD
    ).strip()


@pytest.fixture(autouse=True)
def _reset_usage_economics_singleton():
    try:
        from backend.usage_economics import store as usage_economics_store_mod
    except Exception:
        yield
        return
    usage_economics_store_mod._store = None  # noqa: SLF001
    yield
    usage_economics_store_mod._store = None  # noqa: SLF001


def _env(monkeypatch: pytest.MonkeyPatch, tmp_path) -> None:
    from backend.storage.artifact_repository import reset_artifact_repository_singleton

    monkeypatch.setenv("CLAW_ENVIRONMENT", "test")
    monkeypatch.setenv("CLAW_DATA_DIR", str(tmp_path / "data"))
    monkeypatch.setenv("CLAW_USAGE_ECONOMICS_DB_PATH", str(tmp_path / "usage.sqlite3"))
    monkeypatch.setenv("CLAW_ECONOMICS_DB_PATH", str(tmp_path / "economics.sqlite3"))
    monkeypatch.setenv("CLAW_BLOB_ROOT", str(tmp_path / "blobs"))
    monkeypatch.setenv("CLAW_ARTIFACT_REGISTRY_DB_PATH", str(tmp_path / "registry.sqlite3"))
    monkeypatch.setenv("CLAW_DOCUMENTS_DIR", str(tmp_path / "documents"))
    monkeypatch.setenv("CLAW_STORAGE_BACKEND", "local")
    monkeypatch.setenv("CLAW_USAGE_ECONOMICS_ENABLED", "0")
    monkeypatch.delenv("CLAW_COMMERCIAL_MODE", raising=False)
    reset_artifact_repository_singleton()


def test_leftover_detector_is_generic_and_misses_certified_review():
    leftover = _leftover_fused()
    certified = _certified_review()
    glued = (
        "If to Alpha Workshop Beta Counsel LLC: Alpha Workshop Beta Counsel LLC Attn: ________\n"
        "If to Beta Counsel LLC:\nAddress:\n30 days, Upon full execution by the parties unless otherwise specified."
    )
    assert review_corpus_looks_like_leftover_fused_notices(leftover) is True
    assert review_corpus_looks_like_leftover_fused_notices(glued) is True
    assert review_corpus_looks_like_leftover_fused_notices(certified) is False
    compact_persist_review = (
        "12. NOTICES\n"
        "If to Alpha Workshop:\n"
        "Address: 100 Workshop Lane 2. TERM This Agreement commences "
        "Upon full execution by the parties unless otherwise specified "
        "and continues for 30 days.\n"
        "13. MISCELLANEOUS\n"
        "Notices are effective 30 days after delivery."
    )
    assert review_corpus_looks_like_leftover_fused_notices(compact_persist_review) is False
    stuffed_blob = (
        "If to Beta Counsel LLC:\n"
        "Address: User-stated material terms:, 30-day term, Texas governing law"
    )
    assert review_corpus_looks_like_leftover_fused_notices(stuffed_blob) is True
    pdf = b"%PDF-1.4\n1 0 obj\n((If to Alpha Workshop Beta Counsel LLC: Address: 30 days, Upon full execution))\n"
    assert review_corpus_looks_like_leftover_fused_notices(extract_plain_from_document_bytes(pdf)) is True


def test_refuse_only_when_packet_is_not_persist_review(monkeypatch):
    leftover = _leftover_fused().encode("utf-8")
    leftover_clean = _leftover_packet_detector_misses().encode("utf-8")
    leftover_compressed = _leftover_compressed_pdf_bytes()
    certified = _certified_review().encode("utf-8")
    assert leftover_get_content_must_refuse(leftover, {"agreement_id": ""}) is False
    assert leftover_get_content_must_refuse(certified, {"agreement_id": "missing"}) is False
    assert review_corpus_looks_like_leftover_fused_notices(
        extract_plain_from_document_bytes(leftover_clean)
    ) is False
    assert review_corpus_looks_like_leftover_fused_notices(
        leftover_clean.decode("utf-8")
    ) is False
    assert review_corpus_looks_like_leftover_fused_notices(
        extract_plain_from_document_bytes(leftover_compressed)
    ) is False
    assert review_corpus_looks_like_leftover_fused_notices(
        leftover_compressed.decode("utf-8", errors="ignore")
    ) is False

    remount_persist = "dd37f0e4-feba-42e5-bb37-713218aaf346"
    leftover_create = "ag_leftover_create"
    monkeypatch.setattr(
        "backend.services.vs01_leftover_fused_content.persist_review_plain_for_agreement",
        lambda aid: _certified_review() if aid in {"ag_persist", remount_persist} else "",
    )
    leftover_pdf = (
        b"%PDF-1.4\n1 0 obj\n((If to Alpha Workshop Beta Counsel LLC: Address: 30 days, "
        b"Upon full execution by the parties unless otherwise specified))\n"
    )
    assert leftover_get_content_must_refuse(leftover, {"agreement_id": "ag_persist"}) is True
    assert leftover_get_content_must_refuse(leftover_pdf, {"agreement_id": "ag_persist"}) is True
    assert leftover_get_content_must_refuse(leftover_clean, {"agreement_id": "ag_persist"}) is True
    assert leftover_get_content_must_refuse(leftover_compressed, {"agreement_id": "ag_persist"}) is True
    assert leftover_get_content_must_refuse(certified, {"agreement_id": "ag_persist"}) is False
    assert packet_is_persist_review_corpus(certified, _certified_review()) is True
    assert packet_is_persist_review_corpus(leftover_clean, _certified_review()) is False
    leftover_story = _leftover_story_pdf_bytes()
    assert leftover_story is not None
    assert leftover_story.startswith(b"%PDF")
    assert leftover_get_content_must_refuse(leftover_story, {"agreement_id": "ag_persist"}) is True
    leftover_shared_10_11 = (
        "\n".join(
            [
                "SERVICES AGREEMENT",
                "",
                "This Agreement is between Alpha Workshop (Client) and Beta Counsel LLC (Service Provider).",
                "",
                "10. LIABILITY",
                "Each party's aggregate liability is limited to fees paid under this Agreement.",
                "",
                "11. GOVERNING LAW",
                "This Agreement is governed by the laws of the applicable jurisdiction.",
                "",
                "12. NOTICES",
                "If to Alpha Workshop Beta Counsel LLC:",
                "Alpha Workshop Beta Counsel LLC",
            ]
        )
        + "\n\n"
        + _PAD
    ).strip().encode("utf-8")
    assert leftover_get_content_must_refuse(leftover_shared_10_11, {"agreement_id": "ag_persist"}) is True
    assert packet_is_persist_review_corpus(leftover_shared_10_11, _certified_review()) is False
    leftover_mix_plain = _leftover_story_banner_plus_persist_review_spans_packet_plain().encode(
        "utf-8"
    )
    leftover_mix_extract = extract_plain_from_document_bytes(leftover_mix_plain)
    assert "Draft Agreement (non-binding template)" in leftover_mix_extract
    assert "Designer will provide the deliverables" in leftover_mix_extract
    assert "10. LIABILITY" in leftover_mix_extract
    assert "11. GOVERNING LAW" in leftover_mix_extract
    assert "12. NOTICES" in leftover_mix_extract
    assert packet_is_persist_review_corpus(leftover_mix_plain, _certified_review()) is False
    assert leftover_get_content_must_refuse(leftover_mix_plain, {"agreement_id": "ag_persist"}) is True
    leftover_mix_story = _leftover_story_banner_plus_persist_review_spans_packet_bytes()
    if leftover_mix_story is not None:
        leftover_mix_story_extract = extract_plain_from_document_bytes(leftover_mix_story)
        assert "Draft Agreement (non-binding template)" in leftover_mix_story_extract
        assert "10. LIABILITY" in leftover_mix_story_extract
        assert packet_is_persist_review_corpus(leftover_mix_story, _certified_review()) is False
        assert leftover_get_content_must_refuse(
            leftover_mix_story, {"agreement_id": "ag_persist"}
        ) is True
    persist_story = _persist_review_story_pdf_bytes()
    assert persist_story is not None
    assert persist_story.startswith(b"%PDF")
    persist_story_extract = extract_plain_from_document_bytes(persist_story)
    assert "Draft Agreement (non-binding template)" in persist_story_extract
    assert "10. LIABILITY" in persist_story_extract
    assert packet_is_persist_review_corpus(persist_story, _certified_review()) is False
    assert leftover_get_content_must_refuse(persist_story, {"agreement_id": "ag_persist"}) is True
    persist_seed = _persist_review_seed_pdf_bytes()
    if persist_seed is not None:
        persist_seed_extract = extract_plain_from_document_bytes(persist_seed)
        assert "Draft Agreement (non-binding template)" not in persist_seed_extract
        assert packet_is_persist_review_corpus(persist_seed, _certified_review()) is True
        assert leftover_get_content_must_refuse(persist_seed, {"agreement_id": "ag_persist"}) is False
    leftover_clean_story = _leftover_clean_story_pdf_bytes()
    assert leftover_clean_story is not None
    assert leftover_clean_story.startswith(b"%PDF")
    assert review_corpus_looks_like_leftover_fused_notices(
        extract_plain_from_document_bytes(leftover_clean_story)
    ) is False
    assert leftover_get_content_must_refuse(leftover_clean_story, {"agreement_id": "ag_persist"}) is True
    assert leftover_get_content_must_refuse(
        leftover, {"agreement_id": leftover_create}, remount_agreement_id=remount_persist
    ) is True
    assert leftover_get_content_must_refuse(
        leftover, {"agreement_id": ""}, remount_agreement_id=remount_persist
    ) is True
    assert leftover_get_content_must_refuse(
        leftover, {"agreement_id": leftover_create, "persist_uuid": remount_persist}
    ) is True
    monkeypatch.setattr(
        "backend.services.vs01_leftover_fused_content.persist_review_plain_for_agreement",
        lambda _aid: "",
    )
    assert leftover_get_content_must_refuse(leftover, {"agreement_id": "ag_empty"}) is False
    assert leftover_get_content_must_refuse(leftover_clean, {"agreement_id": "ag_empty"}) is False
    assert leftover_get_content_must_refuse(leftover_compressed, {"agreement_id": "ag_empty"}) is False
    assert leftover_get_content_must_refuse(leftover_story, {"agreement_id": "ag_empty"}) is False
    assert leftover_get_content_must_refuse(leftover_story, {"agreement_id": ""}) is False


def _create_agreement(client) -> str:
    from backend.tests.entitlement_test_support import ensure_headers_entitled

    headers = ensure_headers_entitled(dict(_ORG_H))
    create_res = client.post(
        "/api/agreements/draft",
        headers=headers,
        json={
            "title": "Services Agreement",
            "jurisdiction": "TX",
            "parties": [
                {"name": "Alpha Workshop", "role": "client", "email": "owner@example.test"},
                {"name": "Beta Counsel LLC", "role": "service_provider", "email": "signer@example.test"},
            ],
            "purpose": "Consulting services",
            "payment_terms": "Net 30",
        },
    )
    assert create_res.status_code == 200, create_res.text
    return create_res.json()["id"]


def _persist_and_accept(client, aid: str, corpus: str) -> dict:
    from backend.services.accepted_review_snapshot import sha256_hex_text
    from backend.tests.entitlement_test_support import ensure_headers_entitled

    headers = ensure_headers_entitled(dict(_ORG_H))
    create = client.post(
        f"/api/agreements/{aid}/canonical-review-snapshot",
        headers=headers,
        json={
            "corpus_plain": corpus,
            "generation_session_id": "gen_leftover_content",
            "claimed_digest": sha256_hex_text(corpus),
        },
    )
    assert create.status_code == 200, create.text
    snap = create.json()["snapshot"]
    accept = client.post(
        f"/api/agreements/{aid}/canonical-review-snapshot/accept",
        headers=headers,
        json={
            "snapshot_id": snap["snapshot_id"],
            "expected_digest": snap["corpus_sha256"],
            "expected_accepted_snapshot_id": "",
            "accepting_session": "gen_leftover_content",
        },
    )
    assert accept.status_code == 200, accept.text
    return accept.json()["accepted"]


def _put_document(aid: str, doc_id: str, body: bytes) -> None:
    from backend.services import document_service

    document_service.finalize_document(
        body,
        content_type="application/pdf",
        agreement_id=aid,
        owner_org_id=_ORG,
        document_id=doc_id,
    )


def test_leftover_get_content_409_when_persist_review_exists(monkeypatch, tmp_path):
    pytest.importorskip("openai")
    pytest.importorskip("eth_abi")
    from fastapi.testclient import TestClient
    from backend.main import app

    _env(monkeypatch, tmp_path)
    client = TestClient(app, raise_server_exceptions=False)
    aid = _create_agreement(client)
    certified = _certified_review()
    leftover = _leftover_fused()
    _persist_and_accept(client, aid, certified)
    doc_id = "doc_leftoveraaaaaaaaaaaaaaaaaaaaaa"
    _put_document(aid, doc_id, leftover.encode("utf-8"))

    refused = client.get(f"/v1/documents/{doc_id}/content", headers=_ORIGIN_H)
    assert refused.status_code == 409, refused.text
    body = refused.json()
    assert body["error"] == "leftover_fused_content"
    assert body["code"] == FIRST_FAILING_LEFTOVER_GET_CONTENT_PAINTS_BEFORE_PERSIST_REVIEW_REPLACE
    assert leftover.encode("utf-8") not in refused.content


def test_matching_certified_get_content_is_not_rewritten(monkeypatch, tmp_path):
    pytest.importorskip("openai")
    pytest.importorskip("eth_abi")
    from fastapi.testclient import TestClient
    from backend.main import app

    _env(monkeypatch, tmp_path)
    client = TestClient(app, raise_server_exceptions=False)
    aid = _create_agreement(client)
    certified = _certified_review()
    _persist_and_accept(client, aid, certified)
    doc_id = "doc_certifiedaaaaaaaaaaaaaaaaaaaa"
    raw = certified.encode("utf-8")
    _put_document(aid, doc_id, raw)

    got = client.get(f"/v1/documents/{doc_id}/content", headers=_ORIGIN_H)
    assert got.status_code == 200, got.text
    assert got.content == raw


def test_leftover_packet_detector_misses_409_when_persist_review_exists(monkeypatch, tmp_path):
    """Leftover GET /content 200 is FAIL even when leftover-text never fires."""
    pytest.importorskip("openai")
    pytest.importorskip("eth_abi")
    from fastapi.testclient import TestClient
    from backend.main import app

    _env(monkeypatch, tmp_path)
    client = TestClient(app, raise_server_exceptions=False)
    aid = _create_agreement(client)
    certified = _certified_review()
    leftover_clean = _leftover_packet_detector_misses().encode("utf-8")
    leftover_compressed = _leftover_compressed_pdf_bytes()
    leftover_story = _leftover_clean_story_pdf_bytes() or leftover_compressed
    assert review_corpus_looks_like_leftover_fused_notices(
        extract_plain_from_document_bytes(leftover_clean)
    ) is False
    assert review_corpus_looks_like_leftover_fused_notices(
        extract_plain_from_document_bytes(leftover_compressed)
    ) is False
    _persist_and_accept(client, aid, certified)

    for raw, suffix in (
        (leftover_clean, "cleanaaaaaaaaaaaaaaaaaaaaaaaa"),
        (leftover_compressed, "binpdfaaaaaaaaaaaaaaaaaaaaaa"),
        (leftover_story, "storyaaaaaaaaaaaaaaaaaaaaaaa"),
    ):
        doc_id = f"doc_{suffix}"
        _put_document(aid, doc_id, raw)
        refused = client.get(f"/v1/documents/{doc_id}/content", headers=_ORIGIN_H)
        assert refused.status_code == 409, refused.text
        body = refused.json()
        assert body["error"] == "leftover_fused_content"
        assert body["code"] == FIRST_FAILING_LEFTOVER_GET_CONTENT_PAINTS_BEFORE_PERSIST_REVIEW_REPLACE
        assert raw not in refused.content


def test_leftover_get_content_200_only_when_persist_review_missing(monkeypatch, tmp_path):
    pytest.importorskip("openai")
    pytest.importorskip("eth_abi")
    from fastapi.testclient import TestClient
    from backend.main import app

    _env(monkeypatch, tmp_path)
    client = TestClient(app, raise_server_exceptions=False)
    aid = _create_agreement(client)
    leftover = _leftover_fused().encode("utf-8")
    doc_id = "doc_npersistaaaaaaaaaaaaaaaaaaaaa"
    _put_document(aid, doc_id, leftover)

    got = client.get(f"/v1/documents/{doc_id}/content", headers=_ORIGIN_H)
    assert got.status_code == 200, got.text
    assert got.content == leftover


def _assert_extract_is_persist_review_pro(extract: str, certified: str) -> None:
    """Subsequent GET /content extract is persist Review Pro, not leftover 8-section / Story chrome."""
    assert extract
    assert "leftover_fused_content" not in extract
    assert FIRST_FAILING_LEFTOVER_GET_CONTENT_PAINTS_BEFORE_PERSIST_REVIEW_REPLACE not in extract
    assert "Draft Agreement (non-binding template)" not in extract
    assert "Designer will provide the deliverables" not in extract
    assert "Project Term and Timeline" not in extract
    assert "1. Scope of Services" not in extract
    assert "8. Signatures" not in extract
    assert re.search(r"(?:^|\n)\s*10\.\s+LIABILITY", extract, re.I)
    assert re.search(r"(?:^|\n)\s*11\.\s+GOVERNING LAW", extract, re.I)
    assert re.search(r"(?:^|\n)\s*12\.\s+NOTICES", extract, re.I)
    assert re.search(r"(?:^|\n)\s*13\.\s+MISCELLANEOUS", extract, re.I)
    assert re.search(r"If to\s+Alpha Workshop\s*:", extract)
    assert re.search(r"If to\s+Beta Counsel LLC\s*:", extract)
    assert not re.search(r"If to\s+Alpha Workshop\s+Beta Counsel LLC\s*:", extract)
    nums = [int(n) for n in re.findall(r"(?:^|\n)\s*(\d+)\.\s+[A-Za-z]", extract)]
    i10, i11, i12, i13 = nums.index(10), nums.index(11), nums.index(12), nums.index(13)
    assert i10 < i11 < i12 < i13


def test_render_persist_review_seed_html_is_not_leftover_story_chrome():
    from backend.routers.agreements_v2_api import (
        AgreementDraft,
        AgreementParty,
        _render_html,
        _render_persist_review_seed_html,
    )

    certified = _certified_review()
    leftover = _leftover_eight_section_designer()
    html = _render_persist_review_seed_html(certified)
    assert "Draft Agreement (non-binding template)" not in html
    assert "Designer will provide the deliverables" not in html
    assert "1. Scope of Services" not in html
    assert "ldg-persist-review-pro" in html
    assert "10. LIABILITY" in html
    assert "If to Alpha Workshop:" in html
    assert "If to Beta Counsel LLC:" in html

    leftover_draft = AgreementDraft(
        id="ag-leftover-purpose",
        created_at="c",
        updated_at="u",
        title="Services Agreement",
        jurisdiction="DE",
        parties=[
            AgreementParty(name="Alpha Workshop", role="client"),
            AgreementParty(name="Beta Counsel LLC", role="service_provider"),
        ],
        purpose=leftover,
        payment_terms="Net 30",
        duration="30 days",
        due_date=None,
        effective_date="2026-01-01",
        versions=[],
        audit_log=[],
    )
    leftover_html = _render_html(leftover_draft)
    assert "Draft Agreement (non-binding template)" in leftover_html
    assert "Designer will provide the deliverables" in leftover_html


def test_leftover_remount_seed_then_get_content_is_persist_review_200(monkeypatch, tmp_path):
    """Leftover GET 409 + seed persist Review → subsequent leftover-packet GET is persist Review Pro."""
    pytest.importorskip("openai")
    pytest.importorskip("eth_abi")
    pytest.importorskip("fitz")
    from fastapi.testclient import TestClient
    from backend.main import app
    from backend.services.agreement_draft_store import load_draft, save_draft
    from backend.tests.entitlement_test_support import ensure_headers_entitled

    _env(monkeypatch, tmp_path)
    client = TestClient(app, raise_server_exceptions=False)
    aid = _create_agreement(client)
    certified = _certified_review()
    leftover_designer = _leftover_eight_section_designer()
    assert len(leftover_designer) > len(certified)
    assert review_corpus_looks_like_leftover_fused_notices(leftover_designer) is False
    stored = load_draft(aid)
    stored["purpose"] = leftover_designer
    stored["premium_full_document_text"] = leftover_designer
    stored["server_full_document_text"] = leftover_designer
    save_draft(stored)
    leftover_clean = _leftover_packet_detector_misses().encode("utf-8")
    leftover_story = _leftover_clean_story_pdf_bytes() or leftover_clean
    leftover_designer_bytes = leftover_designer.encode("utf-8")
    assert review_corpus_looks_like_leftover_fused_notices(
        extract_plain_from_document_bytes(leftover_clean)
    ) is False
    assert review_corpus_looks_like_leftover_fused_notices(
        extract_plain_from_document_bytes(leftover_story)
    ) is False
    _persist_and_accept(client, aid, certified)

    seed_headers = ensure_headers_entitled(dict(_ORG_H))
    for raw, suffix in (
        (leftover_clean, "cleanaaaaaaaaaaaaaaaaaaaaaaaa"),
        (leftover_story, "storyaaaaaaaaaaaaaaaaaaaaaaa"),
        (leftover_designer_bytes, "designeraaaaaaaaaaaaaaaaaaaaa"),
    ):
        doc_id = f"doc_{suffix}"
        _put_document(aid, doc_id, raw)
        refused = client.get(f"/v1/documents/{doc_id}/content", headers=_ORIGIN_H)
        assert refused.status_code == 409, refused.text
        body = refused.json()
        assert body["error"] == "leftover_fused_content"
        assert body["code"] == FIRST_FAILING_LEFTOVER_GET_CONTENT_PAINTS_BEFORE_PERSIST_REVIEW_REPLACE
        assert raw not in refused.content

        seeded = client.post(
            f"/api/agreements/{aid}/vs01-signing-seed",
            headers=seed_headers,
            json={"signing_corpus_plain": leftover_designer, "document_id": doc_id},
        )
        assert seeded.status_code == 200, seeded.text
        assert seeded.json()["document_id"] == doc_id

        subsequent = client.get(f"/v1/documents/{doc_id}/content", headers=_ORIGIN_H)
        assert subsequent.status_code == 200, subsequent.text
        assert b"leftover_fused_content" not in subsequent.content
        assert FIRST_FAILING_LEFTOVER_GET_CONTENT_PAINTS_BEFORE_PERSIST_REVIEW_REPLACE.encode() not in subsequent.content
        extract = extract_plain_from_document_bytes(subsequent.content)
        _assert_extract_is_persist_review_pro(extract, certified)
        assert packet_is_persist_review_corpus(subsequent.content, certified) is True
        assert leftover_get_content_must_refuse(subsequent.content, {"agreement_id": aid}) is False

    after = load_draft(aid)
    pr = after.get("pro_redline_v1") if isinstance(after.get("pro_redline_v1"), dict) else {}
    rf = pr.get("review_first_final_corpus") if isinstance(pr, dict) else None
    if isinstance(rf, dict):
        assert str(rf.get("source") or "") != "vs01_signing_seed_persist_review"


def _public_fragment_denorm(accepted: dict) -> dict:
    """Live GET public-fragment shape — ids/digest only, no corpusPlain."""
    return {
        "status": "accepted",
        "snapshotId": accepted.get("snapshotId") or accepted.get("snapshot_id"),
        "corpusSha256": accepted.get("corpusSha256") or accepted.get("corpus_sha256"),
        "corpusLength": accepted.get("corpusLength") or accepted.get("corpus_length") or 0,
        "schemaVersion": accepted.get("schemaVersion") or accepted.get("schema_version"),
        "acceptedAt": accepted.get("acceptedAt") or accepted.get("accepted_at"),
    }


def _attach_sealed_persist_review(draft: dict, corpus: str) -> None:
    draft["vs01_signing_packet_v1"] = {
        "portable": {
            "seed": {
                "corpusPlain": corpus,
                "agreementId": str(draft.get("id") or ""),
            }
        }
    }


def test_persist_review_plain_reads_accepted_sealed_review_get_when_denorm_empty():
    """Empty/banner denorm corpusPlain is not persist Review — use registry / sealed / GET body."""
    certified = _certified_review()
    leftover_banner = (
        "Draft Agreement (non-binding template)\n" + _leftover_eight_section_designer()
    )
    registry = {
        "acceptedSnapshotId": "crs_live",
        "snapshots": {
            "crs_live": {
                "status": "accepted",
                "snapshotId": "crs_live",
                "corpusPlain": certified,
            }
        },
    }
    empty_denorm = {
        "id": "ag_empty_denorm",
        "accepted_review_snapshot_v1": _public_fragment_denorm(
            {"snapshotId": "crs_live", "corpusSha256": "x", "corpusLength": 12}
        ),
        "canonical_review_snapshots_v1": registry,
        "purpose": leftover_banner,
        "premium_full_document_text": leftover_banner,
        "server_full_document_text": leftover_banner,
    }
    _attach_sealed_persist_review(empty_denorm, certified)
    assert persist_review_corpus_from_draft(empty_denorm) == certified
    assert "Draft Agreement (non-binding template)" not in persist_review_corpus_from_draft(
        empty_denorm
    )

    short_review = (
        "\n".join(
            [
                "SERVICES AGREEMENT",
                "",
                "10. LIABILITY",
                "Each party's aggregate liability is limited to fees paid.",
                "",
                "11. GOVERNING LAW",
                "This Agreement is governed by the applicable jurisdiction.",
                "",
                "12. NOTICES",
                "If to Alpha Workshop:",
                "If to Beta Counsel LLC:",
                "",
                "13. MISCELLANEOUS",
                "This Agreement is the entire agreement of the parties.",
            ]
        )
        + "\n\n"
        + ("The parties agree to perform the stated obligations. " * 8)
    ).strip()
    assert 500 <= len(short_review) < 1500
    short_draft = {
        "id": "ag_short_get",
        "accepted_review_snapshot_v1": {
            "status": "accepted",
            "snapshotId": "crs_short",
            "corpusPlain": short_review,
        },
        "purpose": leftover_banner,
    }
    assert persist_review_corpus_from_draft(short_draft) == short_review

    sealed_only = {
        "id": "ag_sealed_only",
        "accepted_review_snapshot_v1": _public_fragment_denorm(
            {"snapshotId": "crs_missing", "corpusSha256": "x", "corpusLength": 12}
        ),
        "canonical_review_snapshots_v1": {
            "acceptedSnapshotId": "crs_missing",
            "snapshots": {
                "crs_missing": {
                    "status": "accepted",
                    "snapshotId": "crs_missing",
                }
            },
        },
        "purpose": leftover_banner,
    }
    _attach_sealed_persist_review(sealed_only, certified)
    assert persist_review_corpus_from_draft(sealed_only) == certified


def test_persist_review_plain_for_agreement_empty_denorm_uses_registry_sealed(
    monkeypatch, tmp_path
):
    _env(monkeypatch, tmp_path)
    from backend.services.agreement_draft_store import save_draft

    certified = _certified_review()
    leftover_banner = (
        "Draft Agreement (non-binding template)\n" + _leftover_eight_section_designer()
    )
    draft = {
        "id": "ag_persist_picker",
        "accepted_review_snapshot_v1": _public_fragment_denorm(
            {"snapshotId": "crs_live", "corpusSha256": "x", "corpusLength": 12}
        ),
        "canonical_review_snapshots_v1": {
            "acceptedSnapshotId": "crs_live",
            "snapshots": {
                "crs_live": {
                    "status": "accepted",
                    "snapshotId": "crs_live",
                    "corpusPlain": certified,
                }
            },
        },
        "purpose": leftover_banner,
        "premium_full_document_text": leftover_banner,
        "server_full_document_text": leftover_banner,
    }
    _attach_sealed_persist_review(draft, certified)
    save_draft(draft)
    plain = persist_review_plain_for_agreement("ag_persist_picker")
    assert plain == certified
    assert "Draft Agreement (non-binding template)" not in plain
    assert leftover_get_content_must_refuse(
        leftover_banner.encode("utf-8"), {"agreement_id": "ag_persist_picker"}
    ) is True


def test_leftover_get_409_uses_remount_persist_uuid_when_packet_aid_is_leftover_create(
    monkeypatch, tmp_path
):
    """Leftover packet agreement_id leftover-create is empty persist_plain — also use remount persist UUID."""
    pytest.importorskip("openai")
    pytest.importorskip("eth_abi")
    pytest.importorskip("fitz")
    from fastapi.testclient import TestClient
    from backend.main import app
    from backend.services.agreement_draft_store import load_draft, save_draft

    _env(monkeypatch, tmp_path)
    client = TestClient(app, raise_server_exceptions=False)
    remount_persist = "dd37f0e4-feba-42e5-bb37-713218aaf346"
    leftover_create = _create_agreement(client)
    persist_aid = _create_agreement(client)
    certified = _certified_review()
    leftover_designer = _leftover_eight_section_designer()
    leftover_banner = (
        "Draft Agreement (non-binding template)\n" + leftover_designer
    ).encode("utf-8")
    _persist_and_accept(client, persist_aid, certified)
    persist_draft = load_draft(persist_aid)
    persist_draft["id"] = remount_persist
    save_draft(persist_draft)
    assert persist_review_plain_for_agreement(remount_persist) == certified
    assert persist_review_plain_for_agreement(leftover_create) == ""

    doc_id = "doc_leftovercreateaaaaaaaaaaaaaaaa"
    _put_document(leftover_create, doc_id, leftover_banner)
    painted = client.get(f"/v1/documents/{doc_id}/content", headers=_ORIGIN_H)
    assert painted.status_code == 200, painted.text
    assert painted.content == leftover_banner

    refused = client.get(
        f"/v1/documents/{doc_id}/content",
        headers=_ORIGIN_H,
        params={"agreement_id": remount_persist},
    )
    assert refused.status_code == 409, refused.text
    body = refused.json()
    assert body["error"] == "leftover_fused_content"
    assert leftover_banner not in refused.content
    header_refused = client.get(
        f"/v1/documents/{doc_id}/content",
        headers={**_ORIGIN_H, "X-Claw-Agreement-Id": remount_persist},
    )
    assert header_refused.status_code == 409, header_refused.text
    assert leftover_banner not in header_refused.content


def test_leftover_story_banner_packet_seeds_persist_review_when_denorm_public_fragment(
    monkeypatch, tmp_path
):
    """Leftover 8-section + leftover Story banner packet, persist Review on accepted/sealed/GET."""
    pytest.importorskip("openai")
    pytest.importorskip("eth_abi")
    pytest.importorskip("fitz")
    from fastapi.testclient import TestClient
    from backend.main import app
    from backend.services.agreement_draft_store import load_draft, save_draft
    from backend.tests.entitlement_test_support import ensure_headers_entitled

    _env(monkeypatch, tmp_path)
    client = TestClient(app, raise_server_exceptions=False)
    aid = _create_agreement(client)
    certified = _certified_review()
    leftover_designer = _leftover_eight_section_designer()
    leftover_banner_plain = (
        "Draft Agreement (non-binding template)\n" + leftover_designer
    ).encode("utf-8")
    leftover_story_banner = _leftover_story_banner_packet_bytes() or leftover_banner_plain
    assert "Draft Agreement (non-binding template)" in leftover_banner_plain.decode("utf-8")
    assert review_corpus_looks_like_leftover_fused_notices(leftover_designer) is False

    _persist_and_accept(client, aid, certified)
    stored = load_draft(aid)
    accepted = stored.get("accepted_review_snapshot_v1")
    assert isinstance(accepted, dict)
    registry = stored.get("canonical_review_snapshots_v1")
    assert isinstance(registry, dict)
    sid = str(accepted.get("snapshotId") or registry.get("acceptedSnapshotId") or "").strip()
    snaps = registry.get("snapshots") if isinstance(registry.get("snapshots"), dict) else {}
    assert sid and isinstance(snaps.get(sid), dict)
    assert str(snaps[sid].get("corpusPlain") or "").strip() == certified
    stored["accepted_review_snapshot_v1"] = _public_fragment_denorm(accepted)
    assert not str(stored["accepted_review_snapshot_v1"].get("corpusPlain") or "").strip()
    _attach_sealed_persist_review(stored, certified)
    stored["purpose"] = leftover_designer
    stored["premium_full_document_text"] = leftover_designer
    stored["server_full_document_text"] = leftover_designer
    save_draft(stored)
    assert persist_review_plain_for_agreement(aid) == certified

    seed_headers = ensure_headers_entitled(dict(_ORG_H))
    for raw, suffix in (
        (leftover_banner_plain, "bannerplainaaaaaaaaaaaaaaaaaaaa"),
        (leftover_story_banner, "storybanneraaaaaaaaaaaaaaaaaaa"),
    ):
        doc_id = f"doc_{suffix}"
        _put_document(aid, doc_id, raw)
        refused = client.get(f"/v1/documents/{doc_id}/content", headers=_ORIGIN_H)
        assert refused.status_code == 409, refused.text
        body = refused.json()
        assert body["error"] == "leftover_fused_content"
        assert body["code"] == FIRST_FAILING_LEFTOVER_GET_CONTENT_PAINTS_BEFORE_PERSIST_REVIEW_REPLACE
        assert raw not in refused.content
        assert b"Draft Agreement (non-binding template)" not in refused.content

        seeded = client.post(
            f"/api/agreements/{aid}/vs01-signing-seed",
            headers=seed_headers,
            json={"signing_corpus_plain": leftover_designer, "document_id": doc_id},
        )
        assert seeded.status_code == 200, seeded.text
        assert seeded.json()["document_id"] == doc_id

        subsequent = client.get(f"/v1/documents/{doc_id}/content", headers=_ORIGIN_H)
        assert subsequent.status_code == 200, subsequent.text
        assert b"leftover_fused_content" not in subsequent.content
        extract = extract_plain_from_document_bytes(subsequent.content)
        _assert_extract_is_persist_review_pro(extract, certified)
        assert "Draft Agreement (non-binding template)" not in extract
        assert packet_is_persist_review_corpus(subsequent.content, certified) is True
        assert leftover_get_content_must_refuse(subsequent.content, {"agreement_id": aid}) is False

    after = load_draft(aid)
    pr = after.get("pro_redline_v1") if isinstance(after.get("pro_redline_v1"), dict) else {}
    rf = pr.get("review_first_final_corpus") if isinstance(pr, dict) else None
    if isinstance(rf, dict):
        assert str(rf.get("source") or "") != "vs01_signing_seed_persist_review"


def test_leftover_story_banner_plus_persist_review_spans_get_409_then_seed_200(
    monkeypatch, tmp_path
):
    """Leftover Story chrome + leftover 8-section + persist Review spans is leftover GET 409."""
    pytest.importorskip("openai")
    pytest.importorskip("eth_abi")
    pytest.importorskip("fitz")
    from fastapi.testclient import TestClient
    from backend.main import app
    from backend.services.agreement_draft_store import load_draft
    from backend.tests.entitlement_test_support import ensure_headers_entitled

    _env(monkeypatch, tmp_path)
    client = TestClient(app, raise_server_exceptions=False)
    aid = _create_agreement(client)
    certified = _certified_review()
    leftover_designer = _leftover_eight_section_designer()
    leftover_mix_plain = _leftover_story_banner_plus_persist_review_spans_packet_plain().encode(
        "utf-8"
    )
    leftover_mix_story = (
        _leftover_story_banner_plus_persist_review_spans_packet_bytes() or leftover_mix_plain
    )
    leftover_mix_extract = extract_plain_from_document_bytes(leftover_mix_plain)
    leftover_mix_story_extract = extract_plain_from_document_bytes(leftover_mix_story)
    assert "Draft Agreement (non-binding template)" in leftover_mix_extract
    assert "Designer will provide the deliverables" in leftover_mix_extract
    assert "10. LIABILITY" in leftover_mix_extract
    assert "11. GOVERNING LAW" in leftover_mix_extract
    assert "12. NOTICES" in leftover_mix_extract
    assert "Draft Agreement (non-binding template)" in leftover_mix_story_extract
    assert "10. LIABILITY" in leftover_mix_story_extract
    assert packet_is_persist_review_corpus(leftover_mix_plain, certified) is False
    assert leftover_get_content_must_refuse(leftover_mix_plain, {"agreement_id": aid}) is False
    _persist_and_accept(client, aid, certified)
    assert persist_review_plain_for_agreement(aid) == certified
    assert leftover_get_content_must_refuse(leftover_mix_plain, {"agreement_id": aid}) is True
    assert leftover_get_content_must_refuse(leftover_mix_story, {"agreement_id": aid}) is True
    assert packet_is_persist_review_corpus(leftover_mix_story, certified) is False

    seed_headers = ensure_headers_entitled(dict(_ORG_H))
    for raw, suffix in (
        (leftover_mix_plain, "mixplainaaaaaaaaaaaaaaaaaaaaaa"),
        (leftover_mix_story, "mixstoryaaaaaaaaaaaaaaaaaaaaaa"),
    ):
        doc_id = f"doc_{suffix}"
        _put_document(aid, doc_id, raw)
        refused = client.get(f"/v1/documents/{doc_id}/content", headers=_ORIGIN_H)
        assert refused.status_code == 409, refused.text
        body = refused.json()
        assert body["error"] == "leftover_fused_content"
        assert body["code"] == FIRST_FAILING_LEFTOVER_GET_CONTENT_PAINTS_BEFORE_PERSIST_REVIEW_REPLACE
        assert raw not in refused.content
        assert b"Draft Agreement (non-binding template)" not in refused.content

        seeded = client.post(
            f"/api/agreements/{aid}/vs01-signing-seed",
            headers=seed_headers,
            json={"signing_corpus_plain": leftover_designer, "document_id": doc_id},
        )
        assert seeded.status_code == 200, seeded.text
        assert seeded.json()["document_id"] == doc_id
        seed_extract = extract_plain_from_document_bytes(seeded.content)
        if seed_extract:
            assert "Draft Agreement (non-binding template)" not in seed_extract

        subsequent = client.get(f"/v1/documents/{doc_id}/content", headers=_ORIGIN_H)
        assert subsequent.status_code == 200, subsequent.text
        assert b"leftover_fused_content" not in subsequent.content
        extract = extract_plain_from_document_bytes(subsequent.content)
        _assert_extract_is_persist_review_pro(extract, certified)
        assert "Draft Agreement (non-binding template)" not in extract
        assert packet_is_persist_review_corpus(subsequent.content, certified) is True
        assert leftover_get_content_must_refuse(subsequent.content, {"agreement_id": aid}) is False

    after = load_draft(aid)
    pr = after.get("pro_redline_v1") if isinstance(after.get("pro_redline_v1"), dict) else {}
    rf = pr.get("review_first_final_corpus") if isinstance(pr, dict) else None
    if isinstance(rf, dict):
        assert str(rf.get("source") or "") != "vs01_signing_seed_persist_review"
