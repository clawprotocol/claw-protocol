from __future__ import annotations

import json
from pathlib import Path

from backend.agreements.date_meaning_guard import (
    apply_date_meaning_guard,
    extract_date_meanings,
    unconfirmed_effective_date_question,
)
from backend.agreements.premium_full_draft_quality_gate import apply_unconfirmed_payment_timing_guard

HARBOR_INTAKE = (
    "Draft a consulting services agreement between Harbor Peak Analytics LLC (Consultant) "
    "and Ironvale Manufacturing Inc. (Client). Scope is AI workflow implementation. "
    "Fixed fee $48,000. Term twelve months starting October 1, 2026. Governing law Delaware. "
    "Consultant owns pre-existing tools; Client owns deliverables after payment. "
    "Consultant signer Maya Chen, maya.chen@harborpeak.test. "
    "Client signer Jordan Hale, jordan.hale@ironvale.test."
)
FIXTURE = (
    Path(__file__).resolve().parents[2]
    / "evals/commercial-readiness/fixtures/consulting-unconfirmed-payment-replay.json"
)
DATE_QUESTION = unconfirmed_effective_date_question("October 1, 2026")


def _replay() -> dict:
    return json.loads(FIXTURE.read_text())


def test_only_service_start_strips_undefined_and_interchanged_effective_dates() -> None:
    raw = _replay()
    visible, missing = apply_date_meaning_guard(
        intake=HARBOR_INTAKE,
        user_gap_answers="",
        document_text=raw["visible_agreement"],
        missing_material_info=[],
    )
    assert DATE_QUESTION in missing
    assert "as of the Effective Date" not in visible
    assert "begins on October 1, 2026" in visible
    assert "$48,000" in visible
    authoritative, auth_missing = apply_date_meaning_guard(
        intake=HARBOR_INTAKE,
        user_gap_answers="",
        document_text=raw["authoritative_draft"],
        missing_material_info=[],
    )
    assert DATE_QUESTION in auth_missing
    assert "effective as of October 1, 2026" not in authoritative.split("1. Services")[0]
    assert "begins on October 1, 2026" in authoritative


def test_live_comma_opening_writes_labeled_effective_date() -> None:
    live = (
        'This AI Workflow Implementation Consulting Services Agreement (the "Agreement") '
        'is entered into as of October 1, 2026, by and between Harbor Peak Analytics LLC, '
        'as "Consultant," and Ironvale Manufacturing Inc, as "Client."\n\n'
        "1. Services\nConsultant will perform AI workflow implementation.\n\n"
        "2. Term\nThe term of this Agreement begins on October 1, 2026."
    )
    cleaned, missing = apply_date_meaning_guard(
        intake=HARBOR_INTAKE,
        user_gap_answers="The agreement effective date is the same as the October 1, 2026 service start.",
        document_text=live,
        missing_material_info=[],
    )
    opening = cleaned.split("1. Services")[0]
    assert 'as of October 1, 2026 (the "Effective Date") by and between' in opening
    assert DATE_QUESTION not in missing


def test_explicit_same_date_writes_labeled_effective_date() -> None:
    raw = _replay()
    cleaned, missing = apply_date_meaning_guard(
        intake=HARBOR_INTAKE,
        user_gap_answers="The agreement effective date is the same as the October 1, 2026 service start.",
        document_text=raw["authoritative_draft"],
        missing_material_info=[],
    )
    opening = cleaned.split("1. Services")[0]
    assert 'as of October 1, 2026 (the "Effective Date")' in opening or (
        'effective as of October 1, 2026 (the "Effective Date")' in opening
    )
    assert "begins on October 1, 2026" in cleaned
    assert DATE_QUESTION not in missing
    again, again_missing = apply_date_meaning_guard(
        intake=HARBOR_INTAKE,
        user_gap_answers="",
        document_text=cleaned,
        missing_material_info=[],
    )
    assert DATE_QUESTION not in again_missing
    assert 'October 1, 2026 (the "Effective Date")' in again


def test_explicitly_different_dates_are_preserved() -> None:
    raw = _replay()
    cleaned, missing = apply_date_meaning_guard(
        intake=HARBOR_INTAKE,
        user_gap_answers="The agreement is effective September 15, 2026. Services start October 1, 2026.",
        document_text=raw["authoritative_draft"],
        missing_material_info=[],
    )
    opening = cleaned.split("1. Services")[0]
    assert "September 15, 2026" in opening
    assert "begins on October 1, 2026" in cleaned
    assert DATE_QUESTION not in missing


def test_tbd_and_invoice_date_do_not_invent_an_effective_date() -> None:
    raw = _replay()
    tbd, missing = apply_date_meaning_guard(
        intake=HARBOR_INTAKE,
        user_gap_answers="The effective date is TBD.",
        document_text=raw["visible_agreement"],
        missing_material_info=[],
    )
    assert DATE_QUESTION in missing
    assert "as of the Effective Date" not in tbd
    facts = extract_date_meanings(
        HARBOR_INTAKE,
        "Invoice once on October 1, 2026. Payment due net 60.",
        raw["authoritative_draft"],
    )
    assert facts.effective_date is None
    assert facts.invoice_date == "October 1, 2026"
    paid, paid_missing = apply_unconfirmed_payment_timing_guard(
        intake=HARBOR_INTAKE,
        user_gap_answers="Invoice once on October 1, 2026. Payment due net 60.",
        document_text=raw["authoritative_draft"],
        missing_material_info=[],
    )
    dated, date_missing = apply_date_meaning_guard(
        intake=HARBOR_INTAKE,
        user_gap_answers="Invoice once on October 1, 2026. Payment due net 60.",
        document_text=paid,
        missing_material_info=paid_missing,
    )
    assert DATE_QUESTION in date_missing
    assert "net 60" in dated.lower() or "net sixty" in dated.lower()
    visible = raw["visible_agreement"]
    untouched, _ = apply_date_meaning_guard(
        intake=HARBOR_INTAKE,
        user_gap_answers="",
        document_text=visible,
        missing_material_info=[],
    )
    assert untouched.index("13. NOTICES") < untouched.index("11. Governing Law")
