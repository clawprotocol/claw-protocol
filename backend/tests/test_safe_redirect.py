"""Post-auth destination pinning — keep the claimed checkout agreement ID."""

from backend.security.safe_redirect import (
    CREATE_FLOW_CHECKOUT_AGREEMENT_ID,
    build_destination_with_agreement,
    extract_agreement_id_from_app_path,
)


def test_extract_real_checkout_agreement_id():
    aid = "5e79c874-91bd-4d43-95f1-80a827e8b26a"
    assert (
        extract_agreement_id_from_app_path(f"/app/checkout/{aid}?tier=pro&cadence=monthly")
        == aid
    )


def test_extract_ignores_create_flow_sentinel():
    assert (
        extract_agreement_id_from_app_path(
            f"/app/checkout/{CREATE_FLOW_CHECKOUT_AGREEMENT_ID}?tier=pro"
        )
        is None
    )


def test_stale_checkout_url_is_restored_to_pre_auth_id():
    claimed = "5e79c874-91bd-4d43-95f1-80a827e8b26a"
    stale = "36568b4c-1300-4d62-97eb-826bdf2dd6c0"
    dest = build_destination_with_agreement(
        destination_path=f"/app/checkout/{stale}?tier=pro&cadence=monthly",
        agreement_id=claimed,
    )
    assert dest == f"/app/checkout/{claimed}?tier=pro&cadence=monthly"
    assert stale not in dest


def test_pin_replaces_sentinel_checkout_with_claimed_id():
    claimed = "5e79c874-91bd-4d43-95f1-80a827e8b26a"
    dest = build_destination_with_agreement(
        destination_path=f"/app/checkout/{CREATE_FLOW_CHECKOUT_AGREEMENT_ID}?tier=pro&cadence=monthly",
        agreement_id=claimed,
    )
    assert dest == f"/app/checkout/{claimed}?tier=pro&cadence=monthly"
    assert CREATE_FLOW_CHECKOUT_AGREEMENT_ID not in dest


def test_dashboard_destination_is_not_rewritten_to_checkout():
    dest = build_destination_with_agreement(
        destination_path="/app",
        agreement_id="5e79c874-91bd-4d43-95f1-80a827e8b26a",
    )
    assert dest == "/app"
