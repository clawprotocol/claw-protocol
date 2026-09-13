"""Failing-first regressions for unconfirmed payment facts vs invented draft terms."""

from __future__ import annotations

import json
from pathlib import Path

from backend.agreements.premium_full_draft_quality_gate import (
    UNCONFIRMED_INVOICE_CADENCE_QUESTION,
    UNCONFIRMED_PAYMENT_DUE_QUESTION,
    UNCONFIRMED_PAYMENT_TIMING_QUESTION,
    apply_unconfirmed_payment_timing_guard,
    unconfirmed_payment_questions_present,
)


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

SECTION_BOUNDARY_DRAFT = (
    "3. FEES AND PAYMENT\n"
    "Client will pay the fixed fee of $48,000, net 30.\n"
    "4. TERM\n"
    "Twelve months.\n"
)


def _replay() -> dict:
    return json.loads(FIXTURE.read_text())


def _missing_asks(missing: list[str]) -> str:
    return " ".join(missing).lower()


def test_payment_timing_tbd_remains_unresolved() -> None:
    raw = _replay()
    cleaned, missing = apply_unconfirmed_payment_timing_guard(
        intake=HARBOR_INTAKE,
        user_gap_answers="Payment timing is TBD",
        document_text=raw["authoritative_draft"],
        missing_material_info=[],
    )
    asked = _missing_asks(missing)
    assert "tbd" not in asked
    assert UNCONFIRMED_PAYMENT_TIMING_QUESTION in missing or (
        UNCONFIRMED_INVOICE_CADENCE_QUESTION in missing and UNCONFIRMED_PAYMENT_DUE_QUESTION in missing
    )
    assert "installment" not in cleaned.lower()
    assert "after receipt of invoice" not in cleaned.lower()
    assert "$48,000" in cleaned


def test_invoice_monthly_asks_only_for_missing_deadline() -> None:
    raw = _replay()
    cleaned, missing = apply_unconfirmed_payment_timing_guard(
        intake=HARBOR_INTAKE,
        user_gap_answers="Invoice monthly",
        document_text=raw["authoritative_draft"],
        missing_material_info=[],
    )
    assert UNCONFIRMED_PAYMENT_DUE_QUESTION in missing
    assert UNCONFIRMED_PAYMENT_TIMING_QUESTION not in missing
    assert UNCONFIRMED_INVOICE_CADENCE_QUESTION not in missing
    assert "after receipt of invoice" not in cleaned.lower()
    assert "one or more installments" not in cleaned.lower()
    assert "$48,000" in cleaned


def test_net_60_does_not_authorize_saved_net_30_or_installments() -> None:
    raw = _replay()
    cleaned, missing = apply_unconfirmed_payment_timing_guard(
        intake=HARBOR_INTAKE,
        user_gap_answers="Payment is due net 60.",
        document_text=raw["authoritative_draft"],
        missing_material_info=[],
    )
    assert "one or more installments" not in cleaned.lower()
    assert "thirty (30) days after receipt of invoice" not in cleaned.lower()
    assert "net 30" not in cleaned.lower()
    assert "net thirty" not in cleaned.lower()
    assert "$48,000" in cleaned
    assert UNCONFIRMED_INVOICE_CADENCE_QUESTION in missing
    assert UNCONFIRMED_PAYMENT_DUE_QUESTION not in missing
    assert UNCONFIRMED_PAYMENT_TIMING_QUESTION not in missing


def test_unconfirmed_timing_strip_preserves_fee_heading_and_next_section() -> None:
    cleaned, missing = apply_unconfirmed_payment_timing_guard(
        intake=HARBOR_INTAKE,
        user_gap_answers="",
        document_text=SECTION_BOUNDARY_DRAFT,
        missing_material_info=[],
    )
    assert UNCONFIRMED_PAYMENT_TIMING_QUESTION in missing or (
        UNCONFIRMED_INVOICE_CADENCE_QUESTION in missing and UNCONFIRMED_PAYMENT_DUE_QUESTION in missing
    )
    assert cleaned.startswith("3. FEES AND PAYMENT\n")
    assert "$48,000" in cleaned
    assert "\n4. TERM\n" in cleaned
    assert "Twelve months." in cleaned
    fees = cleaned.split("\n4. TERM\n", 1)[0]
    assert "net 30" not in fees.lower()
    assert "net thirty" not in fees.lower()


def test_unconfirmed_sixty_day_wording_is_detected() -> None:
    draft = (
        "3. Fees and Payment\n"
        "Client will pay Consultant a fixed fee of $48,000 for the services under this Agreement. "
        "Invoices are payable within sixty (60) days after receipt of invoice.\n"
        "4. Term\n"
        "Twelve months.\n"
        "10. Termination\n"
        "Cure within thirty (30) days after written notice.\n"
    )
    cleaned, missing = apply_unconfirmed_payment_timing_guard(
        intake=HARBOR_INTAKE,
        user_gap_answers="",
        document_text=draft,
        missing_material_info=[],
    )
    assert UNCONFIRMED_PAYMENT_TIMING_QUESTION in missing or UNCONFIRMED_PAYMENT_DUE_QUESTION in missing
    fees = cleaned.split("\n4. Term\n", 1)[0]
    assert "sixty" not in fees.lower()
    assert "60" not in fees
    assert "$48,000" in cleaned
    assert "Cure within thirty (30) days after written notice." in cleaned


def test_complete_answers_reach_the_working_draft() -> None:
    raw = _replay()
    cleaned, missing = apply_unconfirmed_payment_timing_guard(
        intake=HARBOR_INTAKE,
        user_gap_answers="Invoice once on October 1, 2026. Payment due net 30.",
        document_text=raw["authoritative_draft"],
        missing_material_info=[],
    )
    assert not unconfirmed_payment_questions_present(missing)
    assert "one installment" in cleaned.lower()
    assert "net 30" in cleaned.lower()
    assert "one or more installments" not in cleaned.lower()
    assert "$48,000" in cleaned
    assert "3. Fees and Payment" in cleaned or "3. FEES AND PAYMENT" in cleaned


def test_sanitized_replay_fixture_is_committed() -> None:
    assert FIXTURE.is_file()
    raw = _replay()
    assert "$48,000" in raw["authoritative_draft"]
    assert "sk-" not in json.dumps(raw).lower()
    assert "api_key" not in json.dumps(raw).lower()
