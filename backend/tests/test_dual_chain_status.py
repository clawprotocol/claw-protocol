from __future__ import annotations

from backend.anchoring.dual_chain_status import (
    dual_chain_aggregate_from_jobs,
    dual_chain_aggregate_phase,
)


def test_fully_anchored() -> None:
    assert (
        dual_chain_aggregate_phase(
            {"status": "confirmed"}, {"status": "confirmed"}
        )
        == "fully_anchored"
    )


def test_queued_pair() -> None:
    assert dual_chain_aggregate_phase({"status": "queued"}, {"status": "queued"}) == "queued"


def test_canonical_failed_blocks_mirror() -> None:
    assert (
        dual_chain_aggregate_phase({"status": "failed_retryable"}, {"status": "queued"})
        == "canonical_failed_retryable"
    )


def test_from_jobs_list() -> None:
    jobs = [
        {"chain": "doge", "status": "queued"},
        {"chain": "btc", "status": "submitted_unconfirmed"},
    ]
    assert dual_chain_aggregate_from_jobs(jobs) == "bitcoin_submitted_dogecoin_queued"


def test_bitcoin_confirmed_dogecoin_queued() -> None:
    assert (
        dual_chain_aggregate_phase({"status": "confirmed"}, {"status": "queued"})
        == "bitcoin_confirmed_dogecoin_queued"
    )


def test_bitcoin_confirmed_mirror_not_enqueued() -> None:
    assert (
        dual_chain_aggregate_phase({"status": "confirmed"}, None)
        == "bitcoin_confirmed_mirror_not_enqueued"
    )


def test_from_jobs_btc_only_confirmed() -> None:
    jobs = [{"chain": "btc", "status": "confirmed"}]
    assert dual_chain_aggregate_from_jobs(jobs) == "bitcoin_confirmed_mirror_not_enqueued"


def test_bitcoin_confirmed_mirror_failed_retryable() -> None:
    assert (
        dual_chain_aggregate_phase(
            {"status": "confirmed"}, {"status": "failed_retryable"}
        )
        == "bitcoin_confirmed_mirror_failed_retryable"
    )
