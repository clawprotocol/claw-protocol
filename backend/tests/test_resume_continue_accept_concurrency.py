"""Unit tests: resume Continue accept of latest pending over commercial accepted.

Does not import backend.main — keep this file runnable without the full app stack.
"""

from __future__ import annotations

import pytest

from backend.services.accepted_review_snapshot import (
    accept_snapshot,
    create_pending_snapshot,
    leftover_accepted_vs_new_pending_continue,
    owner_revision_empty_token_latest_pending,
    sha256_hex_text,
)

pytestmark = pytest.mark.unit


def _corpus(tag: str) -> str:
    return (f"SERVICES AGREEMENT\n{tag}\n" + "x" * 600).strip()


def _pending(aid: str, sid: str, corpus: str, created_at: str) -> dict:
    digest = sha256_hex_text(corpus)
    return {
        "schemaVersion": "claw.canonical_review_snapshot/v1",
        "snapshotId": sid,
        "agreementId": aid,
        "corpusPlain": corpus,
        "corpusSha256": digest,
        "corpusLength": len(corpus),
        "createdAt": created_at,
        "status": "pending",
    }


def test_owner_revision_empty_token_latest_pending_is_not_leftover():
    aid = "4e18814c-c8fe-4eb9-85ae-a3e694cb596e"
    commercial = _pending(aid, "crs_commercial", _corpus("COMMERCIAL"), "2026-08-01T00:00:00Z")
    commercial["status"] = "accepted"
    painted = _pending(aid, "crs_pending", _corpus("SIGNER_APPLIED"), "2026-09-01T00:00:00Z")
    reg = {
        "acceptedSnapshotId": "crs_commercial",
        "snapshots": {
            "crs_commercial": commercial,
            "crs_pending": painted,
        },
    }
    assert leftover_accepted_vs_new_pending_continue(registry=reg, accepting_snapshot=painted) is False
    assert (
        owner_revision_empty_token_latest_pending(
            registry=reg,
            accepting_snapshot=painted,
            allow_revision=True,
            expected_token="",
        )
        is True
    )
    assert (
        owner_revision_empty_token_latest_pending(
            registry=reg,
            accepting_snapshot=painted,
            allow_revision=False,
            expected_token="",
        )
        is False
    )


def test_accept_snapshot_recovers_empty_token_with_allow_revision():
    aid = "4e18814c-c8fe-4eb9-85ae-a3e694cb596e"
    first = _corpus("COMMERCIAL")
    later = _corpus("SIGNER_APPLIED")
    ok, err, first_snap, reg = create_pending_snapshot(
        agreement_id=aid,
        corpus_plain=first,
        created_by_principal="owner",
    )
    assert ok and first_snap and reg and err is None
    ok, err, accepted, reg = accept_snapshot(
        agreement_id=aid,
        snapshot_id=first_snap["snapshotId"],
        expected_digest=first_snap["corpusSha256"],
        accepting_principal="owner",
        registry=reg,
        expected_accepted_snapshot_id="",
    )
    assert ok and accepted and reg and err is None

    ok, err, later_snap, reg = create_pending_snapshot(
        agreement_id=aid,
        corpus_plain=later,
        created_by_principal="owner",
        registry=reg,
    )
    assert ok and later_snap and reg and err is None
    assert later_snap["status"] == "pending"

    blocked, blocked_err, _, _ = accept_snapshot(
        agreement_id=aid,
        snapshot_id=later_snap["snapshotId"],
        expected_digest=later_snap["corpusSha256"],
        accepting_principal="owner",
        registry=reg,
        expected_accepted_snapshot_id="",
        allow_revision=False,
    )
    assert blocked is False
    assert blocked_err == "accept_concurrency_conflict"

    ok, err, recovered, _ = accept_snapshot(
        agreement_id=aid,
        snapshot_id=later_snap["snapshotId"],
        expected_digest=later_snap["corpusSha256"],
        accepting_principal="owner",
        registry=reg,
        expected_accepted_snapshot_id="",
        allow_revision=True,
        display_snapshot_id=later_snap["snapshotId"],
        display_digest=later_snap["corpusSha256"],
        display_length=later_snap["corpusLength"],
    )
    assert ok and recovered and err is None
    assert recovered["snapshotId"] == later_snap["snapshotId"]
    assert recovered["status"] == "accepted"


def test_accept_snapshot_empty_token_without_allow_revision_stays_fail_closed():
    aid = "ag_commercial"
    first = _corpus("COMMERCIAL")
    later = _corpus("REVISION")
    ok, _, first_snap, reg = create_pending_snapshot(
        agreement_id=aid,
        corpus_plain=first,
        created_by_principal="owner",
    )
    assert ok and first_snap and reg
    ok, _, _, reg = accept_snapshot(
        agreement_id=aid,
        snapshot_id=first_snap["snapshotId"],
        expected_digest=first_snap["corpusSha256"],
        accepting_principal="owner",
        registry=reg,
        expected_accepted_snapshot_id="",
    )
    assert ok and reg
    ok, _, later_snap, reg = create_pending_snapshot(
        agreement_id=aid,
        corpus_plain=later,
        created_by_principal="owner",
        registry=reg,
    )
    assert ok and later_snap and reg
    blocked, err, _, _ = accept_snapshot(
        agreement_id=aid,
        snapshot_id=later_snap["snapshotId"],
        expected_digest=later_snap["corpusSha256"],
        accepting_principal="owner",
        registry=reg,
        expected_accepted_snapshot_id="",
        allow_revision=False,
    )
    assert blocked is False
    assert err == "accept_concurrency_conflict"


def test_stale_pending_still_409s_even_with_allow_revision():
    aid = "ag_stale"
    first = _corpus("COMMERCIAL")
    mid = _corpus("MID")
    latest = _corpus("LATEST")
    ok, _, first_snap, reg = create_pending_snapshot(
        agreement_id=aid,
        corpus_plain=first,
        created_by_principal="owner",
    )
    assert ok and first_snap and reg
    ok, _, _, reg = accept_snapshot(
        agreement_id=aid,
        snapshot_id=first_snap["snapshotId"],
        expected_digest=first_snap["corpusSha256"],
        accepting_principal="owner",
        registry=reg,
        expected_accepted_snapshot_id="",
    )
    assert ok and reg
    ok, _, mid_snap, reg = create_pending_snapshot(
        agreement_id=aid,
        corpus_plain=mid,
        created_by_principal="owner",
        registry=reg,
    )
    assert ok and mid_snap and reg
    ok, _, later_snap, reg = create_pending_snapshot(
        agreement_id=aid,
        corpus_plain=latest,
        created_by_principal="owner",
        registry=reg,
    )
    assert ok and later_snap and reg
    blocked, err, accepted_mid, _ = accept_snapshot(
        agreement_id=aid,
        snapshot_id=mid_snap["snapshotId"],
        expected_digest=mid_snap["corpusSha256"],
        accepting_principal="owner",
        registry=reg,
        expected_accepted_snapshot_id="",
        allow_revision=True,
    )
    assert blocked is False, accepted_mid
    assert err == "accept_concurrency_conflict"
    assert later_snap["snapshotId"] != mid_snap["snapshotId"]
