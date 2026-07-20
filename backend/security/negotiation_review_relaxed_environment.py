"""Exact negotiation-review environment relaxation (GTM Security Slice 3B)."""

from __future__ import annotations

import os

_RELAXED_ENVIRONMENTS = frozenset({"local", "dev", "test"})


def raw_claw_environment() -> str:
    """Return the raw CLAW_ENVIRONMENT value without normalization."""
    return os.getenv("CLAW_ENVIRONMENT", "")


def is_negotiation_review_relaxed_environment() -> bool:
    """
    Relaxed only for exact raw values: local, dev, test.
    Unset, blank, whitespace, case variants, and all other values fail closed.
    """
    return raw_claw_environment() in _RELAXED_ENVIRONMENTS


def is_negotiation_review_production_like_cookie_environment() -> bool:
    """
    Production-strength cookie naming everywhere except exact relaxed environments.
    Unknown, unset, CI, preview, staging, production, and all other values use __Host-.
    """
    return not is_negotiation_review_relaxed_environment()
