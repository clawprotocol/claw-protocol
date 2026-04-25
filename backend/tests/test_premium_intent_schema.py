"""Unit tests for deterministic LawDog Pro intent schema validation."""

from __future__ import annotations

import pytest

from backend.agreements.premium_intent_schema import (
    PremiumIntentKey,
    build_premium_intent_skeleton,
    evaluate_premium_intent_schema,
    resolve_premium_intent_key,
)

pytestmark = pytest.mark.unit


def _long_generic_shell() -> str:
    return "\n\n".join(
        [
            "WHEREAS the parties wish to set forth their understanding.\n",
            "1. PARTIES. The parties identified above.\n",
            "2. SCOPE. Services and deliverables as described.\n",
            "3. COMPENSATION. Fees, invoicing, and payment.\n"
            * 1,
            "4. CONFIDENTIALITY. Mutual obligations.\n",
            "5. TERM. Term and termination with notice and cure.\n",
            "6. MISCELLANEOUS. Governing law; counterparts.\n",
        ]
        + (["Operative line. " * 800]),
    )


def test_logo_routes_away_from_commercial_review_framing():
    title = "Commercial Review and Vendor Services Agreement"
    body = _long_generic_shell() + " revision rounds and deliverables. "
    ok, reasons = evaluate_premium_intent_schema(
        PremiumIntentKey.LOGO_DESIGN,
        title,
        body,
    )
    assert ok is False
    assert any("logo_routed" in r or "misrouted" in r or "title" in r for r in reasons)

def test_logo_strong_draft_passes():
    body = _long_generic_shell() + " two revision rounds. Work for hire. $1,500 flat fee. Final deliverables. Client acceptance."
    ok, r = evaluate_premium_intent_schema(
        PremiumIntentKey.LOGO_DESIGN,
        "Logo Design Services Agreement",
        body,
    )
    assert ok is True, r


def test_founder_generic_shell_fails_without_equity_fabric():
    body = _long_generic_shell()
    ok, reasons = evaluate_premium_intent_schema(
        PremiumIntentKey.FOUNDER_EQUITY,
        "Service Agreement",
        body,
    )
    assert ok is False
    assert any("body_missing" in r or "title" in r for r in reasons)


def test_founder_category_native_passes():
    body = (
        "1. Vesting. Four-year vesting, one-year cliff, 60/40 split.\n"
        "2. IP. Assignment of pre-incorporation inventions and works.\n"
        "3. Departure. Good leaver and repurchase on termination.\n"
    ) * 3
    ok, r = evaluate_premium_intent_schema(
        PremiumIntentKey.FOUNDER_EQUITY,
        "Founder Vesting Agreement",
        body,
    )
    assert ok is True, r


def test_loan_remains_passing_on_typical_loan_corpus():
    body = (
        "The Lender shall advance the Principal. The Borrower shall repay in installments. "
        "Maturity in 12 months. Interest at stated rate. Default and demand.\n" * 30
    )
    ok, r = evaluate_premium_intent_schema(
        PremiumIntentKey.LOAN,
        "Promissory Note and Loan Agreement",
        body,
    )
    assert ok is True, r


def test_resolve_intent_from_deterministic_id():
    ctx = {"deterministic_intent_id": "logo_brand"}
    assert resolve_premium_intent_key("x", ctx) == PremiumIntentKey.LOGO_DESIGN
    assert build_premium_intent_skeleton(PremiumIntentKey.LOGO_DESIGN, "logo for $1k") is not None


def test_regression_logo_prompt_maps_and_validates():
    prompt = "Need a logo contract for $1,500 with 2 revisions"
    key = resolve_premium_intent_key(prompt, {"deterministic_intent_id": "logo_brand"})
    assert key == PremiumIntentKey.LOGO_DESIGN
    ok, reasons = evaluate_premium_intent_schema(
        key,
        "Logo Design Agreement",
        (
            "Deliverables include logo concepts and final source files. "
            "Client receives two revision rounds before acceptance. "
            "Ownership transfers on payment; license applies before full payment. "
            "Fee is $1,500 flat with invoicing terms."
        ),
    )
    assert ok is True, reasons


def test_regression_founder_6040_maps_and_validates():
    prompt = "Two founders 60/40 vesting"
    key = resolve_premium_intent_key(prompt, {"deterministic_intent_id": "founder_equity"})
    assert key == PremiumIntentKey.FOUNDER_EQUITY
    ok, reasons = evaluate_premium_intent_schema(
        key,
        "Founder Vesting Agreement",
        (
            "Ownership split is 60/40 between founders. "
            "Vesting schedule is four years with one-year cliff. "
            "IP assignment covers inventions and work product. "
            "Departure mechanics include repurchase and good/bad leaver treatment."
        ),
    )
    assert ok is True, reasons


def test_regression_loan_5000_monthly_keeps_principal_distinct():
    prompt = "Lent friend $5,000 repay monthly"
    key = resolve_premium_intent_key(prompt, {"deterministic_intent_id": "loan"})
    assert key == PremiumIntentKey.LOAN
    ok, reasons = evaluate_premium_intent_schema(
        key,
        "Loan Agreement",
        (
            "Principal amount is $5,000. Borrower shall repay in monthly installments "
            "according to Schedule A to be completed by the parties. "
            "Lender and Borrower roles, default, and notices are included."
        ),
    )
    assert ok is True, reasons
