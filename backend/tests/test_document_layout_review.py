from __future__ import annotations


def test_review_manifest_confirm_and_manual(monkeypatch, tmp_path) -> None:
    monkeypatch.setenv("CLAW_LAYOUT_ANALYSIS_DIR", str(tmp_path))

    from backend.document_layout.review_manifest import (
        apply_review_actions,
        enrich_analysis_for_api,
        persist_analysis,
    )

    data = {
        "analysis_id": "layout_abcd1234ef56",
        "field_candidates": [
            {
                "candidate_id": "cand_a",
                "page_number": 1,
                "field_type_guess": "signature_line",
                "label_text": "Signature",
                "confidence": 0.7,
                "bbox_normalized": {"x": 0.1, "y": 0.8, "width": 0.4, "height": 0.02, "space": "normalized_page"},
                "bbox_pdf": {"x0": 0, "y0": 0, "x1": 1, "y1": 1},
            }
        ],
    }

    events: list[tuple[str, dict]] = []

    def emit(name: str, **kw):
        events.append((name, kw))

    apply_review_actions(
        data,
        [{"action": "confirm", "candidate_id": "cand_a"}],
        emit=emit,
    )
    apply_review_actions(
        data,
        [
            {
                "action": "add_manual",
                "page_number": 1,
                "field_type": "date_line",
                "bbox_normalized": {"x": 0.2, "y": 0.5, "width": 0.2, "height": 0.02},
                "label": "Sign date",
            }
        ],
        emit=emit,
    )

    enriched = enrich_analysis_for_api(data)
    assert enriched["field_candidates_enriched"][0]["review_state"] == "confirmed"
    dm = enriched["downstream_field_manifest"]
    assert dm["field_count"] == 2
    assert any(f["ref"].startswith("candidate:") for f in dm["fields"])
    assert any(f["ref"].startswith("manual:") for f in dm["fields"])

    persist_analysis("layout_abcd1234ef56", data)
    from backend.document_layout.store import load_layout_analysis

    loaded = load_layout_analysis("layout_abcd1234ef56")
    assert loaded is not None
    assert loaded["review_manifest"]["candidate_resolutions"]["cand_a"]["state"] == "confirmed"


def test_reject_excludes_from_downstream(monkeypatch, tmp_path) -> None:
    monkeypatch.setenv("CLAW_LAYOUT_ANALYSIS_DIR", str(tmp_path))
    from backend.document_layout.review_manifest import apply_review_actions, enrich_analysis_for_api

    data = {
        "analysis_id": "layout_abcd1234ef99",
        "field_candidates": [
            {
                "candidate_id": "cand_b",
                "page_number": 1,
                "field_type_guess": "date_line",
                "confidence": 0.5,
                "bbox_normalized": {"x": 0, "y": 0, "width": 0.1, "height": 0.1, "space": "normalized_page"},
                "bbox_pdf": {},
            }
        ],
    }

    apply_review_actions(data, [{"action": "reject", "candidate_id": "cand_b"}], emit=lambda *a, **k: None)
    enriched = enrich_analysis_for_api(data)
    assert enriched["downstream_field_manifest"]["field_count"] == 0
