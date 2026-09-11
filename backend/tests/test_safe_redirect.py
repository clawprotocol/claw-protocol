"""Phase 4B.5 — router-aware post-auth redirect validation."""

from backend.security.safe_redirect import is_allowlisted_internal_path, resolve_safe_redirect_path


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
