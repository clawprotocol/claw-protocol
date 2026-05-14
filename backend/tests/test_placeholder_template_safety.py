"""Tests for universal agreement placeholder repair + validation."""

from backend.agreements.placeholder_template_safety import (
    repair_agreement_template_placeholders,
    validate_user_visible_agreement_text,
)


def test_case_id_repaired_to_any_party():
    raw = "Either [CASE_ID_1] may terminate upon notice."
    ok, text, diag = validate_user_visible_agreement_text(
        raw,
        party_names=[],
        intake_raw="",
        surface="pytest",
        agreement_family="employment",
    )
    assert ok
    assert "any Party" in text
    assert any("CASE_ID" in r for r in diag.get("repairs") or [])


def test_party_slots_repaired_from_party_list():
    raw = "This Agreement is between [PARTY_1] and [PARTY_2]."
    ok, text, _diag = validate_user_visible_agreement_text(
        raw,
        party_names=["Alice", "Bob"],
        intake_raw="",
        surface="pytest",
        agreement_family="nda",
    )
    assert ok
    assert "Alice" in text and "Bob" in text


def test_insert_address_rejected():
    raw = "Send notices to [INSERT ADDRESS]."
    ok, _text, diag = validate_user_visible_agreement_text(
        raw,
        party_names=[],
        intake_raw="",
        surface="pytest",
        agreement_family="reseller",
    )
    assert not ok
    assert diag.get("token_count", 0) >= 1


def test_vs01_surface_repair_then_accept():
    raw = "[CASE_ID_1] agrees to indemnify [PARTY_1]."
    ok, text, _diag = validate_user_visible_agreement_text(
        raw,
        party_names=["Solo Corp"],
        intake_raw="",
        surface="vs01_signing_seed",
        agreement_family="",
    )
    assert ok
    assert "any Party" in text
    assert "Solo Corp" in text


def test_intake_literal_allows_upper_bracket_token():
    token = "[RESERVED_TERM_X1]"
    raw = f"Defined term {token} applies."
    intake = f"Please preserve {token} exactly."
    ok, text, diag = validate_user_visible_agreement_text(
        raw,
        party_names=[],
        intake_raw=intake,
        surface="pytest",
        agreement_family="",
    )
    assert ok
    assert token in text
    assert diag.get("token_count") == 0
