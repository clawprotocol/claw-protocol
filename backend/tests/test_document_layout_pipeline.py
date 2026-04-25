from __future__ import annotations

import pytest

pytest.importorskip("fitz")


def test_layout_pipeline_signature_and_date_lines(monkeypatch, tmp_path) -> None:
    import fitz

    from backend.document_layout.localize import localize_query
    from backend.document_layout.pipeline import run_layout_analysis

    monkeypatch.setenv("CLAW_LAYOUT_ANALYSIS_DIR", str(tmp_path))

    doc = fitz.open()
    page = doc.new_page(width=612, height=792)
    page.insert_text((72, 120), "Signature: ___________________________", fontsize=12)
    page.insert_text((72, 160), "Date: _______________", fontsize=12)
    page.insert_text(
        (72, 220),
        "Please respond within fifteen (15) days of receipt of this letter.",
        fontsize=11,
    )
    raw = doc.tobytes()
    doc.close()

    out = run_layout_analysis(
        raw,
        content_type="application/pdf",
        assistive_llm=False,
        persist=True,
    )
    assert out["page_count"] == 1
    assert out.get("analysis_id", "").startswith("layout_")

    guesses = {c["field_type_guess"] for c in out["field_candidates"]}
    assert "signature_line" in guesses
    assert "date_line" in guesses

    loc = localize_query("find signature line", out)
    assert loc and loc[0].get("page_number") == 1
    assert loc[0].get("bbox_normalized")

    blanks = localize_query("find all fillable blanks", out)
    assert len(blanks) >= 1

    aid = out["analysis_id"]
    from backend.document_layout.store import load_layout_analysis

    disk = load_layout_analysis(aid)
    assert disk is not None
    assert disk["analysis_id"] == aid


def test_layout_rejects_empty() -> None:
    from backend.document_layout.pipeline import run_layout_analysis

    with pytest.raises(ValueError, match="empty"):
        run_layout_analysis(b"", assistive_llm=False, persist=False)
