"""Shared CLAW_ENVIRONMENT classification for fail-closed security boundaries."""

from __future__ import annotations

import os

_RELAXED_ENVIRONMENT_VALUES = frozenset({"local", "dev", "test"})


def claw_environment_raw() -> str | None:
    """Return the raw ``CLAW_ENVIRONMENT`` value, or ``None`` when unset."""
    raw = os.environ.get("CLAW_ENVIRONMENT")
    if raw is None:
        return None
    return raw


def is_relaxed_claw_environment() -> bool:
    """
    True only for exact raw ``CLAW_ENVIRONMENT`` values local, dev, or test.

    Unset, empty, whitespace, mixed case, malformed, unknown, ci, preview, stage,
    staging, prod, and production are strict/fail-closed.
    """
    return os.environ.get("CLAW_ENVIRONMENT") in _RELAXED_ENVIRONMENT_VALUES


def is_strict_claw_environment() -> bool:
    """Production-like posture: every value except exact local/dev/test."""
    return not is_relaxed_claw_environment()


__all__ = [
    "claw_environment_raw",
    "is_relaxed_claw_environment",
    "is_strict_claw_environment",
]
