"""Fail-closed explicit acceptance binding tests (commercial P0)."""

from __future__ import annotations

import pytest

from backend.agreements.explicit_acceptance_authority import (
    ExplicitAcceptanceError,
    assert_acceptance_covers_corpus,
    establish_explicit_acceptance,
)
from backend.agreements.semantic_term_authority import assert_persistable_paid_pro_corpus

SLA = "target monthly uptime availability of 99.5%, excluding scheduled maintenance"
FEES = (
    "prevailing Party in any action or proceeding arising out of this Agreement "
    "shall be entitled to recover its reasonable attorneys' fees"
)


def _record(**overrides):
    kwargs = dict(
        tenant_id="org-a",
        actor_id="user-a",
        agreement_id="agr-1",
        agreement_version="3",
        accepted_text=SLA,
        source_action="pro_redline_accept_import",
        source_proposal_id="prop-1",
    )
    kwargs.update(overrides)
    return establish_explicit_acceptance(**kwargs)


def test_boolean_owner_explicit_accept_fail_closed() -> None:
    r = assert_persistable_paid_pro_corpus(
        corpus=SLA,
        intake_text="no sla",
        owner_explicit_accept=True,
    )
    assert r.blocked is True
    assert any(f.code == "acceptance_record_required" for f in r.findings)


def test_bound_acceptance_allows_covered_fingerprints() -> None:
    rec = _record()
    r = assert_persistable_paid_pro_corpus(
        corpus=SLA,
        intake_text="no sla",
        explicit_acceptance=rec,
    )
    assert r.blocked is False


def test_cross_tenant_replay_rejected() -> None:
    rec = _record(tenant_id="org-a")
    with pytest.raises(ExplicitAcceptanceError) as ei:
        assert_acceptance_covers_corpus(
            rec,
            tenant_id="org-b",
            actor_id="user-a",
            agreement_id="agr-1",
            agreement_version="3",
            corpus=SLA,
            source_action="pro_redline_accept_import",
            source_proposal_id="prop-1",
        )
    assert ei.value.code == "acceptance_tenant_mismatch"


def test_different_user_replay_rejected() -> None:
    rec = _record(actor_id="user-a")
    with pytest.raises(ExplicitAcceptanceError) as ei:
        assert_acceptance_covers_corpus(
            rec,
            tenant_id="org-a",
            actor_id="user-b",
            agreement_id="agr-1",
            agreement_version="3",
            corpus=SLA,
            source_action="pro_redline_accept_import",
            source_proposal_id="prop-1",
        )
    assert ei.value.code == "acceptance_actor_mismatch"


def test_modified_text_after_acceptance_rejected() -> None:
    rec = _record(accepted_text=SLA)
    with pytest.raises(ExplicitAcceptanceError) as ei:
        assert_acceptance_covers_corpus(
            rec,
            tenant_id="org-a",
            actor_id="user-a",
            agreement_id="agr-1",
            agreement_version="3",
            corpus=SLA + " and additional invented liability language",
            source_action="pro_redline_accept_import",
            source_proposal_id="prop-1",
        )
    assert ei.value.code == "acceptance_content_mismatch"


def test_stale_agreement_version_rejected() -> None:
    rec = _record(agreement_version="3")
    with pytest.raises(ExplicitAcceptanceError) as ei:
        assert_acceptance_covers_corpus(
            rec,
            tenant_id="org-a",
            actor_id="user-a",
            agreement_id="agr-1",
            agreement_version="4",
            corpus=SLA,
            source_action="pro_redline_accept_import",
            source_proposal_id="prop-1",
        )
    assert ei.value.code == "acceptance_version_mismatch"


def test_reused_proposal_id_mismatch_rejected() -> None:
    rec = _record(source_proposal_id="prop-1")
    with pytest.raises(ExplicitAcceptanceError) as ei:
        assert_acceptance_covers_corpus(
            rec,
            tenant_id="org-a",
            actor_id="user-a",
            agreement_id="agr-1",
            agreement_version="3",
            corpus=SLA,
            source_action="pro_redline_accept_import",
            source_proposal_id="prop-2",
        )
    assert ei.value.code == "acceptance_proposal_mismatch"


def test_partial_acceptance_extra_fingerprint_rejected() -> None:
    rec = _record(accepted_text=SLA)
    mixed = f"{SLA}. {FEES}."
    with pytest.raises(ExplicitAcceptanceError) as ei:
        assert_acceptance_covers_corpus(
            rec,
            tenant_id="org-a",
            actor_id="user-a",
            agreement_id="agr-1",
            agreement_version="3",
            corpus=mixed,
            source_action="pro_redline_accept_import",
            source_proposal_id="prop-1",
        )
    # Content hash fails first when text differs; if somehow hash matched, fingerprints would.
    assert ei.value.code in {
        "acceptance_content_mismatch",
        "acceptance_partial_fingerprints",
    }


def test_partial_acceptance_fingerprint_subset_via_persist_gate() -> None:
    """Acceptance covering only SLA cannot authorize a corpus with fees fingerprint."""
    rec = _record(accepted_text=SLA)
    # Force fingerprint check path: mutate record content hash to match mixed corpus
    # while keeping accepted fingerprints from SLA only — simulates forged/partial record.
    mixed = f"{SLA}. {FEES}."
    forged = establish_explicit_acceptance(
        tenant_id="org-a",
        actor_id="user-a",
        agreement_id="agr-1",
        agreement_version="3",
        accepted_text=mixed,
        source_action="pro_redline_accept_import",
        source_proposal_id="prop-1",
    )
    # Replace fingerprint list with SLA-only (partial accept).
    from dataclasses import replace

    partial = replace(forged, accepted_fingerprint_codes=rec.accepted_fingerprint_codes)
    with pytest.raises(ExplicitAcceptanceError) as ei:
        assert_acceptance_covers_corpus(
            partial,
            tenant_id="org-a",
            actor_id="user-a",
            agreement_id="agr-1",
            agreement_version="3",
            corpus=mixed,
            source_action="pro_redline_accept_import",
            source_proposal_id="prop-1",
        )
    assert ei.value.code == "acceptance_partial_fingerprints"


def test_missing_record_fail_closed() -> None:
    with pytest.raises(ExplicitAcceptanceError) as ei:
        assert_acceptance_covers_corpus(
            None,
            tenant_id="org-a",
            actor_id="user-a",
            agreement_id="agr-1",
            agreement_version="3",
            corpus=SLA,
        )
    assert ei.value.code == "acceptance_record_required"


def test_acceptance_record_includes_audit_fields() -> None:
    rec = _record()
    d = rec.as_dict()
    for key in (
        "tenant_id",
        "actor_id",
        "agreement_id",
        "agreement_version",
        "content_sha256",
        "accepted_fingerprint_codes",
        "accepted_at",
        "source_action",
        "source_proposal_id",
        "record_id",
    ):
        assert key in d
        assert d[key] not in (None, "")
    assert isinstance(d["accepted_fingerprint_codes"], list)
    assert "uptime_99_5" in d["accepted_fingerprint_codes"]


def test_empty_binding_rejected() -> None:
    with pytest.raises(ExplicitAcceptanceError) as ei:
        establish_explicit_acceptance(
            tenant_id="",
            actor_id="u",
            agreement_id="a",
            agreement_version="1",
            accepted_text=SLA,
            source_action="x",
        )
    assert ei.value.code == "acceptance_binding_incomplete"
