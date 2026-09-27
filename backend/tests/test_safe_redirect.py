"""Phase 4B.5 — router-aware post-auth redirect validation and destination pinning."""

from backend.security.safe_redirect import (
    CREATE_FLOW_CHECKOUT_AGREEMENT_ID,
    build_destination_with_agreement,
    extract_agreement_id_from_app_path,
    is_allowlisted_internal_path,
    is_approved_server_quick_pdf_return,
    resolve_safe_redirect_path,
    resolve_server_auth_destination,
)


def test_valid_owner_workflow_destinations_are_preserved() -> None:
    allowed = [
        "/app",
        "/app/create",
        "/app/create?agreementId=ag-1",
        "/app/create?restore=starterReview",
        "/app/settings",
        "/app/billing",
        "/app/send/ag-1",
        "/app/send/ag-1?phase=send",
        "/app/done/ag-1",
        "/app/checkout/ag-1",
        "/app?join=genesis-dogs",
        "/app/checkout/__claw_create_checkout__?tier=pro&cadence=monthly&returnTo=%2Fapp%2Fcreate",
    ]
    for path in allowed:
        assert is_allowlisted_internal_path(path), path
        assert resolve_safe_redirect_path(path, "/dashboard") == path
    assert is_allowlisted_internal_path("/dashboard") is True
    assert resolve_safe_redirect_path("/dashboard", "/app/billing") == "/app"


def test_prefix_tricks_and_open_redirects_fail_closed() -> None:
    rejected = [
        "https://evil.example/phish",
        "//evil.example",
        "/app.evil",
        "/app/evil",
        "/reviewevil",
        "/signature",
        "/review",
        "/sign",
        "/app/quick",
        "/app/quick?start=pdf",
        "/app/admin",
        "/app/create?t=secret-token",
        "/agreements/ag-1/sign?t=secret-token",
        "javascript:alert(1)",
        r"/\\evil",
        "/%2f%2fevil.example",
        "/app/create/../../evil",
    ]
    for path in rejected:
        assert is_allowlisted_internal_path(path) is False, path
        assert resolve_safe_redirect_path(path, "/app") == "/app", path


def test_server_quick_pdf_return_does_not_open_caller_next() -> None:
    assert is_approved_server_quick_pdf_return("/app/quick?start=pdf") is True
    assert resolve_server_auth_destination("/app/quick?start=pdf", "/app") == "/app/quick?start=pdf"
    assert resolve_safe_redirect_path("/app/quick?start=pdf", "/app") == "/app"


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
