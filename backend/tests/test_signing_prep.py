from __future__ import annotations

import pytest


def test_attach_signing_placement_metadata_order_and_placement_ready() -> None:
    from backend.document_layout.signing_prep import attach_signing_placement_metadata

    fields = [
        {
            "page_number": 1,
            "bbox_normalized": {"x": 0.5, "y": 0.1, "width": 0.1, "height": 0.02},
            "field_type": "text_field",
            "review_state": "suggested",
            "inclusion_reason": "non_critical_autopass",
            "signer_role": "unknown",
        },
        {
            "page_number": 1,
            "bbox_normalized": {"x": 0.1, "y": 0.2, "width": 0.1, "height": 0.02},
            "field_type": "signature_line",
            "review_state": "confirmed",
            "inclusion_reason": "user_confirmed",
            "signer_role": "signer",
        },
    ]
    out = attach_signing_placement_metadata(fields)
    # Sorted by page, then y, x — lower y (earlier on page) first
    assert out[0]["field_order"] == 0
    assert out[0]["field_type"] == "text_field"
    assert out[0]["required"] is False
    assert out[0]["optional"] is True
    assert out[0]["source"] == "suggested_autopass"
    assert out[0]["placement_ready"] is False

    assert out[1]["field_order"] == 1
    assert out[1]["required"] is True
    assert out[1]["source"] == "confirmed"
    assert out[1]["placement_ready"] is True
    assert out[1]["signer_role"] == "signer"


def test_compute_signing_readiness_blocked_vs_ready(monkeypatch, tmp_path) -> None:
    monkeypatch.setenv("CLAW_LAYOUT_ANALYSIS_DIR", str(tmp_path))
    from backend.document_layout.review_manifest import (
        apply_review_actions,
        rebuild_downstream_field_manifest,
    )
    from backend.document_layout.signing_prep import compute_signing_readiness

    base = {
        "analysis_id": "layout_sigprep01",
        "field_candidates": [
            {
                "candidate_id": "c_sig",
                "page_number": 1,
                "field_type_guess": "signature_line",
                "label_text": "Sign here",
                "confidence": 0.55,
                "bbox_normalized": {"x": 0.1, "y": 0.75, "width": 0.35, "height": 0.03},
                "bbox_pdf": {},
            },
            {
                "candidate_id": "c_date",
                "page_number": 1,
                "field_type_guess": "date_line",
                "label_text": "Date",
                "confidence": 0.55,
                "bbox_normalized": {"x": 0.55, "y": 0.75, "width": 0.2, "height": 0.03},
                "bbox_pdf": {},
            },
        ],
    }

    data_blocked = {**base, "review_manifest": {"candidate_resolutions": {}}}
    rebuild_downstream_field_manifest(data_blocked)
    rb = compute_signing_readiness(data_blocked)
    assert rb["signing_ready"] is False
    assert rb["headline"] == "Not ready for signing prep"
    assert rb["critical_fields_missing_count"] >= 1
    assert any("review" in m.lower() or "confirm" in m.lower() for m in rb["summary_messages"])
    assert rb["blockers"]

    data_ok = {**base, "review_manifest": {"candidate_resolutions": {}}}
    apply_review_actions(
        data_ok,
        [
            {
                "action": "confirm",
                "candidate_id": "c_sig",
                "signer_role": "signer",
                "acknowledge_low_confidence": True,
            },
            {
                "action": "confirm",
                "candidate_id": "c_date",
                "signer_role": "unknown",
                "acknowledge_low_confidence": True,
            },
        ],
        emit=lambda *a, **k: None,
    )
    rebuild_downstream_field_manifest(data_ok)
    ro = compute_signing_readiness(data_ok)
    assert ro["signing_ready"] is True
    assert ro["headline"] == "Ready for signing prep"
    assert ro["placement_ready_count"] == 2
    msg = " ".join(ro["summary_messages"])
    assert "Signature" in msg and "mapped" in msg
    assert "Date" in msg and "mapped" in msg
    assert ro.get("role_clarity_note")


def test_build_signing_prep_response_emits_events(monkeypatch, tmp_path) -> None:
    monkeypatch.setenv("CLAW_LAYOUT_ANALYSIS_DIR", str(tmp_path))
    from backend.document_layout.review_manifest import apply_review_actions, rebuild_downstream_field_manifest
    from backend.document_layout.signing_prep import build_signing_prep_response

    captured: list[tuple[str, dict]] = []

    def cap(event: str, **fields):
        captured.append((event, dict(fields)))

    monkeypatch.setattr(
        "backend.document_layout.signing_prep.emit_document_layout_event",
        cap,
    )

    data = {
        "analysis_id": "layout_ev01",
        "content_sha256_analyzed": "dead",
        "page_count": 1,
        "schema_version": 1,
        "field_candidates": [
            {
                "candidate_id": "only",
                "page_number": 1,
                "field_type_guess": "text_field",
                "confidence": 0.92,
                "bbox_normalized": {"x": 0.1, "y": 0.5, "width": 0.2, "height": 0.02},
                "bbox_pdf": {},
            }
        ],
        "review_manifest": {"candidate_resolutions": {}},
    }
    rebuild_downstream_field_manifest(data)
    apply_review_actions(
        data,
        [{"action": "confirm", "candidate_id": "only"}],
        emit=lambda *a, **k: None,
    )
    rebuild_downstream_field_manifest(data)

    payload = build_signing_prep_response(data, analysis_id="layout_ev01")
    assert payload["ok"] is True
    assert payload["signing_ready"] is True
    assert payload["document"]["analysis_id"] == "layout_ev01"
    assert isinstance(payload["placement_manifest"], list)
    assert any(row.get("placement_ready") for row in payload["placement_manifest"])
    names = [e for e, _ in captured]
    assert "signing_prep_requested" in names
    assert "signing_prep_ready" in names
    assert "signing_prep_blocked" not in names


def test_build_signing_prep_blocked_event(monkeypatch) -> None:
    from backend.document_layout.signing_prep import build_signing_prep_response

    captured: list[str] = []

    monkeypatch.setattr(
        "backend.document_layout.signing_prep.emit_document_layout_event",
        lambda e, **kw: captured.append(e),
    )

    data = {
        "analysis_id": "layout_blk",
        "field_candidates": [
            {
                "candidate_id": "sig",
                "page_number": 1,
                "field_type_guess": "signature_line",
                "confidence": 0.4,
                "bbox_normalized": {"x": 0, "y": 0, "width": 0.1, "height": 0.02},
                "bbox_pdf": {},
            }
        ],
        "review_manifest": {
            "candidate_resolutions": {},
            "downstream_field_manifest": {"fields": []},
        },
    }
    payload = build_signing_prep_response(data, analysis_id="layout_blk")
    assert payload["signing_ready"] is False
    assert "signing_prep_blocked" in captured
