"""Bounded acceptance matrix: an unresolved previous purchase must never mint B.

Written before the shared expire/retrieve fault-handling change. Each row goes
through production ``POST /v1/billing/checkout-session``. Stripe is simulated.
The mock does **not** auto-succeed expiration; each row sets the expire/retrieve
outcome explicitly.

Rows
----
A  Expire 503 while changing monthly A → annual.
   A stays pending. No session B. 409 purchase_unresolved. Not entitled.

B  Local TTL of A has passed. Provider completed A. Retrieve raises 503.
   A is not marked expired. No session B. Honest unresolved/processing.
   Not a pay-again URL. Not entitled.

C  Confirmed unpaid expiration (expire returns status=expired).
   A is retired. Replacement B is the only payable session.

D  Completion during plan change (retrieve shows A complete).
   Reconcile A. already_subscribed or payment_processing. No B.

D2 Completion races expiration (expire returns status=complete).
   Reconcile A. No B.

E  Repeat the annual request after A (expire still 503).
   Still no B. Same honest unresolved status. A still pending.

F  Refresh / retry the original monthly purchase after A (expire 503 on annual).
   Still no B. Continue A or stay unresolved. Not entitled.

G  Retrieve returns a malformed body (no status) on the annual request.
   Do not retire A. No B. purchase_unresolved.

H  Expire returns 200 but status is still open (nonconfirming).
   Do not supersede A. No B. purchase_unresolved.

I  Expire returns an empty/malformed body.
   Do not retire A. No B. purchase_unresolved.

J  Expire raises stripe_api_400; retrieve also 503.
   Outcome unknown. Preserve A. No B. purchase_unresolved.
"""

from __future__ import annotations

from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional

import pytest
from fastapi.testclient import TestClient

from backend.economics.store import get_economics_store, reset_economics_store_for_tests
from backend.main import app
from backend.tests.auth_fixtures import (
    configure_production_like_jwt,
    owner_headers_production_like,
)


UNRESOLVED_PURCHASE_MATRIX = (
    "A expire_503_no_replacement",
    "B local_ttl_retrieve_503_completed_provider",
    "C confirmed_unpaid_expiration_allows_replacement",
    "D completion_during_plan_change",
    "D2 expire_returns_complete_reconciles_original",
    "E repeated_annual_retry_after_expire_fail",
    "F refresh_original_monthly_after_expire_fail",
    "G retrieve_malformed_no_status",
    "H expire_nonconfirming_still_open",
    "I expire_malformed_empty_body",
    "J expire_400_and_retrieve_503",
)


@pytest.fixture
def client(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> TestClient:
    monkeypatch.setenv("CLAW_ECONOMICS_DB_PATH", str(tmp_path / "economics.sqlite"))
    monkeypatch.setenv("CLAW_ENVIRONMENT", "production")
    monkeypatch.setenv("CLAW_RATE_LIMIT_RPS", "1000")
    monkeypatch.setenv("CLAW_RATE_LIMIT_BURST", "1000")
    monkeypatch.setenv("STRIPE_SECRET_KEY", "sk_test_unresolved_matrix")
    monkeypatch.setenv("STRIPE_PRICE_PRO_MONTHLY", "price_test_monthly")
    monkeypatch.setenv("STRIPE_PRICE_PRO_ANNUAL", "price_test_annual")
    configure_production_like_jwt(monkeypatch)
    reset_economics_store_for_tests()
    import backend.main as main_mod

    main_mod._rate_state.clear()
    yield TestClient(app, raise_server_exceptions=False)
    reset_economics_store_for_tests()


def _checkout_body(*, cadence: str = "monthly") -> dict:
    return {
        "agreement_id": "__claw_create_checkout__",
        "cadence": cadence,
        "return_to": "/app/send/ag-unresolved-orion?phase=send",
    }


def _canonical_params(data: Dict[str, Any]) -> str:
    items = sorted((str(k), str(v)) for k, v in data.items())
    return repr(items)


def _public_session(rec: Dict[str, Any]) -> Dict[str, Any]:
    return {k: v for k, v in rec.items() if not str(k).startswith("_")}


def _install_matrix_stripe(monkeypatch: pytest.MonkeyPatch) -> Dict[str, Any]:
    """Stripe stand-in that refuses expiration unless the row configures it."""

    state: Dict[str, Any] = {
        "creates": [],
        "retrieves": [],
        "expires": [],
        "sessions": {},
        "by_key": {},
        "seq": 0,
        "mismatches": [],
        "expire_outcomes": {},
        "expire_default": "unset",
        "retrieve_outcomes": {},
        "retrieve_default": "succeed",
    }

    def _expire_result(sid: str, rec: Optional[Dict[str, Any]]) -> Dict[str, Any]:
        outcome = state["expire_outcomes"].get(sid, state["expire_default"])
        if outcome == "unset":
            raise AssertionError(f"expire of {sid} was not configured for this matrix row")
        if outcome == "error_503":
            raise RuntimeError("stripe_api_503")
        if outcome == "error_400":
            raise RuntimeError("stripe_api_400")
        if rec is None:
            raise RuntimeError("stripe_api_404")
        if outcome == "malformed":
            return {}
        if outcome == "return_open":
            rec["status"] = "open"
            return _public_session(rec)
        if outcome == "return_complete":
            rec["status"] = "complete"
            rec["payment_status"] = "paid"
            return _public_session(rec)
        if outcome == "succeed":
            rec["status"] = "expired"
            return _public_session(rec)
        raise AssertionError(f"unknown expire outcome {outcome}")

    def _retrieve_result(sid: str, rec: Optional[Dict[str, Any]]) -> Dict[str, Any]:
        outcome = state["retrieve_outcomes"].get(sid, state["retrieve_default"])
        if outcome == "error_503":
            raise RuntimeError("stripe_api_503")
        if outcome == "error_404":
            raise RuntimeError("stripe_api_404")
        if rec is None:
            raise RuntimeError("stripe_api_404")
        if outcome == "malformed":
            return {"id": sid}
        if outcome == "succeed":
            return _public_session(rec)
        raise AssertionError(f"unknown retrieve outcome {outcome}")

    def _fake_stripe(method: str, path: str, data: Dict[str, Any], **kwargs: Any) -> Dict[str, Any]:
        if method == "POST" and path.endswith("/expire"):
            sid = path.split("/")[-2]
            state["expires"].append(sid)
            return _expire_result(sid, state["sessions"].get(sid))
        if method == "POST" and path == "/checkout/sessions":
            key = str(kwargs.get("idempotency_key") or "").strip()
            params = _canonical_params(data)
            state["creates"].append({"idempotency_key": key, "data": dict(data), "params": params})
            if key and key in state["by_key"]:
                existing = state["by_key"][key]
                stored = existing.get("_params")
                if stored is None:
                    existing["_params"] = params
                elif stored != params:
                    state["mismatches"].append({"key": key, "stored": stored, "got": params})
                    raise RuntimeError("stripe_api_400")
                return _public_session(existing)
            state["seq"] += 1
            sid = f"cs_matrix_{state['seq']}"
            rec = {
                "id": sid,
                "url": f"https://checkout.stripe.com/c/pay/{sid}",
                "status": "open",
                "expires_at": int((datetime.now(timezone.utc) + timedelta(hours=23)).timestamp()),
                "_params": params,
            }
            state["sessions"][sid] = rec
            if key:
                state["by_key"][key] = rec
            return _public_session(rec)
        if method == "GET" and path.startswith("/checkout/sessions/"):
            sid = path.rsplit("/", 1)[-1]
            state["retrieves"].append(sid)
            return _retrieve_result(sid, state["sessions"].get(sid))
        raise AssertionError(f"unexpected Stripe call {method} {path}")

    monkeypatch.setattr("backend.billing.stripe_client._stripe_request", _fake_stripe)
    return state


def _post(client: TestClient, headers: dict, *, cadence: str) -> Any:
    return client.post(
        "/v1/billing/checkout-session",
        headers={**headers, "Content-Type": "application/json"},
        json=_checkout_body(cadence=cadence),
    )


def _attempts(org_id: str) -> List[Dict[str, Any]]:
    eco = get_economics_store()
    with eco._conn() as con:
        rows = con.execute(
            """
            SELECT id, cadence, status, stripe_session_id, checkout_url, expires_at
            FROM billing_checkout_attempts
            WHERE org_id = ?
            ORDER BY created_at
            """,
            (org_id,),
        ).fetchall()
    return [dict(row) for row in rows]


def _open_provider_ids(state: Dict[str, Any]) -> set[str]:
    return {
        str(rec["id"])
        for rec in state["sessions"].values()
        if str(rec.get("status") or "") == "open"
    }


def _assert_no_entitlement(org_id: str) -> None:
    assert get_economics_store().get_subscription_by_org(org_id) is None


def _assert_only_original_attempt(org_id: str, session_id: str, *, allowed_statuses: set[str]) -> Dict[str, Any]:
    rows = _attempts(org_id)
    assert len(rows) == 1, rows
    row = rows[0]
    assert row["stripe_session_id"] == session_id
    assert row["status"] in allowed_statuses
    return row


def test_matrix_row_a_expire_503_does_not_authorize_replacement(
    client: TestClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    state = _install_matrix_stripe(monkeypatch)
    headers = owner_headers_production_like(user_id="matrix-a")
    monthly = _post(client, headers, cadence="monthly")
    assert monthly.status_code == 200, monthly.text
    sid_a = monthly.json()["session_id"]
    state["expire_outcomes"][sid_a] = "error_503"

    annual = _post(client, headers, cadence="annual")
    assert annual.status_code == 409, annual.text
    detail = annual.json()["detail"]
    assert detail["code"] == "purchase_unresolved"
    assert "do not pay again" in str(detail["message"]).lower()
    assert "checkout_url" not in annual.json()
    assert len(state["creates"]) == 1
    assert _open_provider_ids(state) == {sid_a}
    row = _assert_only_original_attempt(
        headers["X-Claw-Org-Id"], sid_a, allowed_statuses={"open", "creating"}
    )
    assert row["cadence"] == "monthly"
    _assert_no_entitlement(headers["X-Claw-Org-Id"])


def test_matrix_row_b_local_ttl_plus_retrieve_503_is_not_unpaid_expiry(
    client: TestClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    state = _install_matrix_stripe(monkeypatch)
    headers = owner_headers_production_like(user_id="matrix-b")
    first = _post(client, headers, cadence="monthly")
    assert first.status_code == 200, first.text
    sid_a = first.json()["session_id"]
    org_id = headers["X-Claw-Org-Id"]
    state["sessions"][sid_a]["status"] = "complete"
    state["sessions"][sid_a]["payment_status"] = "paid"
    state["retrieve_outcomes"][sid_a] = "error_503"
    pending = get_economics_store().get_pending_checkout_attempt_for_org(org_id)
    assert pending is not None
    past = (datetime.now(timezone.utc) - timedelta(hours=2)).isoformat().replace("+00:00", "Z")
    with get_economics_store()._conn() as con:
        con.execute(
            "UPDATE billing_checkout_attempts SET expires_at = ? WHERE id = ?",
            (past, pending["id"]),
        )

    second = _post(client, headers, cadence="monthly")
    assert second.status_code == 409, second.text
    detail = second.json()["detail"]
    assert detail["code"] in {"purchase_unresolved", "payment_processing"}
    assert "do not pay again" in str(detail["message"]).lower()
    assert len(state["creates"]) == 1
    row = _assert_only_original_attempt(
        org_id, sid_a, allowed_statuses={"open", "creating", "complete", "reconciling"}
    )
    assert row["status"] != "expired"
    assert row["status"] != "superseded"
    _assert_no_entitlement(org_id)


def test_matrix_row_c_confirmed_unpaid_expiration_allows_replacement(
    client: TestClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    state = _install_matrix_stripe(monkeypatch)
    headers = owner_headers_production_like(user_id="matrix-c")
    monthly = _post(client, headers, cadence="monthly")
    assert monthly.status_code == 200, monthly.text
    sid_a = monthly.json()["session_id"]
    state["expire_outcomes"][sid_a] = "succeed"

    annual = _post(client, headers, cadence="annual")
    assert annual.status_code == 200, annual.text
    sid_b = annual.json()["session_id"]
    assert sid_b != sid_a
    assert sid_a in state["expires"]
    assert state["sessions"][sid_a]["status"] == "expired"
    assert state["sessions"][sid_b]["status"] == "open"
    assert _open_provider_ids(state) == {sid_b}
    pending = get_economics_store().get_pending_checkout_attempt_for_org(headers["X-Claw-Org-Id"])
    assert pending is not None
    assert pending["cadence"] == "annual"
    assert pending["stripe_session_id"] == sid_b
    rows = _attempts(headers["X-Claw-Org-Id"])
    assert len(rows) == 2
    assert {row["status"] for row in rows} == {"superseded", "open"}


def test_matrix_row_d_completion_during_plan_change_reconciles_original(
    client: TestClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    state = _install_matrix_stripe(monkeypatch)
    headers = owner_headers_production_like(user_id="matrix-d")
    monthly = _post(client, headers, cadence="monthly")
    assert monthly.status_code == 200, monthly.text
    sid_a = monthly.json()["session_id"]
    org_id = headers["X-Claw-Org-Id"]
    period_ts = int((datetime.now(timezone.utc) + timedelta(days=30)).timestamp())
    state["sessions"][sid_a].update(
        {
            "status": "complete",
            "payment_status": "paid",
            "customer": "cus_matrix_d",
            "metadata": {
                "org_id": org_id,
                "claw_org_id": org_id,
                "plan_code": "pro",
                "agreement_id": "__claw_create_checkout__",
            },
            "subscription": {
                "id": "sub_matrix_d",
                "status": "active",
                "customer": "cus_matrix_d",
                "current_period_end": period_ts,
                "metadata": {"org_id": org_id, "plan_code": "pro"},
            },
        }
    )

    annual = _post(client, headers, cadence="annual")
    assert annual.status_code == 409, annual.text
    assert annual.json()["detail"]["code"] in {"already_subscribed", "payment_processing"}
    assert len(state["creates"]) == 1
    assert state["expires"] == []
    _assert_only_original_attempt(
        org_id, sid_a, allowed_statuses={"complete", "reconciling"}
    )
    row = get_economics_store().get_subscription_by_org(org_id)
    if annual.json()["detail"]["code"] == "already_subscribed":
        assert row is not None
        assert row["status"] == "active"
    else:
        assert row is None


def test_matrix_row_d2_expire_complete_reconciles_original(
    client: TestClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    state = _install_matrix_stripe(monkeypatch)
    headers = owner_headers_production_like(user_id="matrix-d2")
    monthly = _post(client, headers, cadence="monthly")
    assert monthly.status_code == 200, monthly.text
    sid_a = monthly.json()["session_id"]
    org_id = headers["X-Claw-Org-Id"]
    period_ts = int((datetime.now(timezone.utc) + timedelta(days=30)).timestamp())
    state["expire_outcomes"][sid_a] = "return_complete"
    state["sessions"][sid_a].update(
        {
            "customer": "cus_matrix_d2",
            "metadata": {
                "org_id": org_id,
                "claw_org_id": org_id,
                "plan_code": "pro",
                "agreement_id": "__claw_create_checkout__",
            },
            "subscription": {
                "id": "sub_matrix_d2",
                "status": "active",
                "customer": "cus_matrix_d2",
                "current_period_end": period_ts,
                "metadata": {"org_id": org_id, "plan_code": "pro"},
            },
        }
    )

    annual = _post(client, headers, cadence="annual")
    assert annual.status_code == 409, annual.text
    assert annual.json()["detail"]["code"] in {"already_subscribed", "payment_processing"}
    assert len(state["creates"]) == 1
    assert sid_a in state["expires"]
    _assert_only_original_attempt(
        org_id, sid_a, allowed_statuses={"complete", "reconciling"}
    )


def test_matrix_row_e_repeated_annual_retry_stays_unresolved(
    client: TestClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    state = _install_matrix_stripe(monkeypatch)
    headers = owner_headers_production_like(user_id="matrix-e")
    monthly = _post(client, headers, cadence="monthly")
    sid_a = monthly.json()["session_id"]
    state["expire_outcomes"][sid_a] = "error_503"

    first = _post(client, headers, cadence="annual")
    second = _post(client, headers, cadence="annual")
    assert first.status_code == 409
    assert second.status_code == 409
    assert first.json()["detail"]["code"] == "purchase_unresolved"
    assert second.json()["detail"]["code"] == "purchase_unresolved"
    assert len(state["creates"]) == 1
    _assert_only_original_attempt(
        headers["X-Claw-Org-Id"], sid_a, allowed_statuses={"open", "creating"}
    )
    _assert_no_entitlement(headers["X-Claw-Org-Id"])


def test_matrix_row_f_refresh_original_monthly_does_not_mint_b(
    client: TestClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    state = _install_matrix_stripe(monkeypatch)
    headers = owner_headers_production_like(user_id="matrix-f")
    monthly = _post(client, headers, cadence="monthly")
    sid_a = monthly.json()["session_id"]
    state["expire_outcomes"][sid_a] = "error_503"
    blocked = _post(client, headers, cadence="annual")
    assert blocked.status_code == 409
    assert blocked.json()["detail"]["code"] == "purchase_unresolved"

    refresh = _post(client, headers, cadence="monthly")
    assert refresh.status_code in {200, 409}, refresh.text
    if refresh.status_code == 200:
        assert refresh.json()["session_id"] == sid_a
        assert refresh.json()["checkout_url"] == monthly.json()["checkout_url"]
    else:
        assert refresh.json()["detail"]["code"] in {"purchase_unresolved", "payment_processing"}
        assert "checkout_url" not in refresh.json()
    assert len(state["creates"]) == 1
    _assert_only_original_attempt(
        headers["X-Claw-Org-Id"], sid_a, allowed_statuses={"open", "creating"}
    )
    _assert_no_entitlement(headers["X-Claw-Org-Id"])


def test_matrix_row_g_retrieve_malformed_does_not_retire(
    client: TestClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    state = _install_matrix_stripe(monkeypatch)
    headers = owner_headers_production_like(user_id="matrix-g")
    monthly = _post(client, headers, cadence="monthly")
    sid_a = monthly.json()["session_id"]
    state["retrieve_outcomes"][sid_a] = "malformed"
    state["expire_outcomes"][sid_a] = "error_503"

    annual = _post(client, headers, cadence="annual")
    assert annual.status_code == 409, annual.text
    assert annual.json()["detail"]["code"] == "purchase_unresolved"
    assert len(state["creates"]) == 1
    row = _assert_only_original_attempt(
        headers["X-Claw-Org-Id"], sid_a, allowed_statuses={"open", "creating"}
    )
    assert row["status"] != "superseded"
    _assert_no_entitlement(headers["X-Claw-Org-Id"])


def test_matrix_row_h_expire_still_open_is_not_confirmation(
    client: TestClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    state = _install_matrix_stripe(monkeypatch)
    headers = owner_headers_production_like(user_id="matrix-h")
    monthly = _post(client, headers, cadence="monthly")
    sid_a = monthly.json()["session_id"]
    state["expire_outcomes"][sid_a] = "return_open"

    annual = _post(client, headers, cadence="annual")
    assert annual.status_code == 409, annual.text
    assert annual.json()["detail"]["code"] == "purchase_unresolved"
    assert state["sessions"][sid_a]["status"] == "open"
    assert len(state["creates"]) == 1
    _assert_only_original_attempt(
        headers["X-Claw-Org-Id"], sid_a, allowed_statuses={"open", "creating"}
    )
    _assert_no_entitlement(headers["X-Claw-Org-Id"])


def test_matrix_row_i_expire_malformed_does_not_retire(
    client: TestClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    state = _install_matrix_stripe(monkeypatch)
    headers = owner_headers_production_like(user_id="matrix-i")
    monthly = _post(client, headers, cadence="monthly")
    sid_a = monthly.json()["session_id"]
    state["expire_outcomes"][sid_a] = "malformed"

    annual = _post(client, headers, cadence="annual")
    assert annual.status_code == 409, annual.text
    assert annual.json()["detail"]["code"] == "purchase_unresolved"
    assert state["sessions"][sid_a]["status"] == "open"
    assert len(state["creates"]) == 1
    _assert_only_original_attempt(
        headers["X-Claw-Org-Id"], sid_a, allowed_statuses={"open", "creating"}
    )


def test_matrix_row_j_expire_400_and_retrieve_503_stay_unresolved(
    client: TestClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    state = _install_matrix_stripe(monkeypatch)
    headers = owner_headers_production_like(user_id="matrix-j")
    monthly = _post(client, headers, cadence="monthly")
    sid_a = monthly.json()["session_id"]
    state["expire_outcomes"][sid_a] = "error_400"
    state["retrieve_outcomes"][sid_a] = "error_503"

    annual = _post(client, headers, cadence="annual")
    assert annual.status_code == 409, annual.text
    assert annual.json()["detail"]["code"] == "purchase_unresolved"
    assert len(state["creates"]) == 1
    _assert_only_original_attempt(
        headers["X-Claw-Org-Id"], sid_a, allowed_statuses={"open", "creating"}
    )
    _assert_no_entitlement(headers["X-Claw-Org-Id"])


def test_matrix_inventory_is_complete() -> None:
    assert len(UNRESOLVED_PURCHASE_MATRIX) == 11
