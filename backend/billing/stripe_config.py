"""Stripe API configuration for LawDog Pro checkout."""

from __future__ import annotations

import os


def stripe_secret_key() -> str:
    return os.getenv("STRIPE_SECRET_KEY", "").strip()


def stripe_price_pro_monthly() -> str:
    return os.getenv("STRIPE_PRICE_PRO_MONTHLY", "").strip()


def stripe_price_pro_annual() -> str:
    return os.getenv("STRIPE_PRICE_PRO_ANNUAL", "").strip()


def is_stripe_checkout_configured() -> bool:
    return bool(stripe_secret_key() and stripe_price_pro_monthly())
