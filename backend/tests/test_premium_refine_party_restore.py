"""Unit tests: restore [ORG_n] only when the pre-refine corpus was already resolved."""

from backend.agreements.premium_refine_party_restore import (
    corpus_has_identity_placeholders,
    extract_resolved_party_names,
    restore_refine_party_placeholders,
)


def _resolved_cedar_blue_doc() -> str:
    return (
        "MUTUAL CONSULTING AGREEMENT\n"
        "This Agreement is entered into as of the Effective Date by and between "
        "Cedar Peak Advisors LLC (\"Client\") and Blue Harbor Logistics LLC (\"Service Provider\").\n"
        "1. SCOPE OF SERVICES\n"
        "Cedar Peak Advisors LLC shall receive implementation services.\n"
        "2. PAYMENT\n"
        "Blue Harbor Logistics LLC invoices monthly.\n"
        "8. NOTICES\n"
        "Notices shall be delivered as set forth herein.\n"
        "IN WITNESS WHEREOF\n"
        "CLIENT:\nCedar Peak Advisors LLC\n"
        "SERVICE PROVIDER:\nBlue Harbor Logistics LLC\n"
    )


def test_extracts_resolved_party_names_from_between_clause():
    names = extract_resolved_party_names(_resolved_cedar_blue_doc())
    assert "Cedar Peak Advisors LLC" in names
    assert "Blue Harbor Logistics LLC" in names


def test_restore_replaces_org_slots_when_original_was_resolved():
    orig = _resolved_cedar_blue_doc()
    remint = orig.replace("Cedar Peak Advisors LLC", "[ORG_1]").replace(
        "Blue Harbor Logistics LLC", "[ORG_2]"
    )
    assert corpus_has_identity_placeholders(remint)
    assert not corpus_has_identity_placeholders(orig)
    out, did = restore_refine_party_placeholders(original=orig, candidate=remint)
    assert did is True
    assert "[ORG_1]" not in out
    assert "[ORG_2]" not in out
    assert "Cedar Peak Advisors LLC" in out
    assert "Blue Harbor Logistics LLC" in out


def test_restore_is_noop_for_hollow_placeholder_starter():
    hollow = (
        "This Agreement is between [ORG_1] (\"Client\") and [ORG_2] (\"Service Provider\").\n"
        "[ORG_1] shall pay [ORG_2].\n"
    )
    out, did = restore_refine_party_placeholders(original=hollow, candidate=hollow)
    assert did is False
    assert out == hollow
    assert "[ORG_1]" in out
    assert "[ORG_2]" in out


def test_restore_is_noop_when_candidate_already_resolved():
    orig = _resolved_cedar_blue_doc()
    out, did = restore_refine_party_placeholders(original=orig, candidate=orig)
    assert did is False
    assert out == orig
