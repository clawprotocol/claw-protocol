from __future__ import annotations

import pytest

from backend.document_layout.confidence_policy import (
    annotate_candidate,
    compute_effective_confidence,
    is_critical_field_type,
    placement_threshold_for_type,
)


def test_critical_types_and_thresholds() -> None:
    assert is_critical_field_type("signature_line")
    assert is_critical_field_type("initials_line")
    assert not is_critical_field_type("freeform_blank_line")
    assert placement_threshold_for_type("signature_line") == pytest.approx(0.70)
    assert placement_threshold_for_type("amount_blank") < placement_threshold_for_type("signature_line")


def test_assist_cannot_lift_weak_geometry_for_automation() -> None:
    row = {
        "candidate_id": "y",
        "field_type_guess": "signature_line",
        "confidence": 0.55,
        "assist_confidence": 0.95,
        "ambiguous_overlap": False,
    }
    annotate_candidate(row)
    assert row["confidence_score"] == pytest.approx(0.55)
    assert row["auto_usable"] is False


def test_pessimistic_effective_confidence() -> None:
    c = {"confidence": 0.8, "assist_confidence": 0.55}
    assert compute_effective_confidence(c) == pytest.approx(0.55)
    c2 = {"confidence": 0.72}
    assert compute_effective_confidence(c2) == pytest.approx(0.72)


def test_annotate_flags_critical_below_bar() -> None:
    row = {
        "candidate_id": "x",
        "field_type_guess": "signature_line",
        "confidence": 0.55,
    }
    row.setdefault("ambiguous_overlap", False)
    annotate_candidate(row)
    assert row["critical_field"] is True
    assert row["meets_placement_threshold"] is False
    assert row["auto_usable"] is False
    assert row["confidence_band"] == "low"
    assert row["review_required"] is True
    g = row["confidence_user_guidance"].lower()
    assert "not treating" in g or "review" in g


def test_apply_review_low_confidence_critical_blocks_without_ack(monkeypatch, tmp_path) -> None:
    monkeypatch.setenv("CLAW_LAYOUT_ANALYSIS_DIR", str(tmp_path))
    from backend.document_layout.review_manifest import apply_review_actions

    data = {
        "field_candidates": [
            {
                "candidate_id": "c_low",
                "page_number": 1,
                "field_type_guess": "signature_line",
                "confidence": 0.55,
                "bbox_normalized": {"x": 0.1, "y": 0.1, "width": 0.2, "height": 0.02, "space": "normalized_page"},
                "bbox_pdf": {},
            }
        ],
    }
    with pytest.raises(ValueError, match="low_confidence_critical_ack_required"):
        apply_review_actions(
            data,
            [{"action": "confirm", "candidate_id": "c_low", "field_type": "signature_line"}],
            emit=lambda *a, **k: None,
        )

    apply_review_actions(
        data,
        [
            {
                "action": "confirm",
                "candidate_id": "c_low",
                "field_type": "signature_line",
                "acknowledge_low_confidence": True,
            }
        ],
        emit=lambda *a, **k: None,
    )
    assert data["review_manifest"]["candidate_resolutions"]["c_low"]["state"] == "confirmed"
