"""Isolated provider tripwire self-test — not part of the zero-attempt production matrix."""

from __future__ import annotations

import pytest

from backend.tests.negotiation_review_test_helpers import (
    assert_slice3b_provider_isolation,
    record_real_provider_attempt,
    reset_real_provider_attempt_count,
)

pytestmark = pytest.mark.unit


def test_provider_tripwire_detects_recorded_attempt():
    reset_real_provider_attempt_count()
    with pytest.raises(RuntimeError, match="real_provider_attempt_blocked"):
        record_real_provider_attempt()
    with pytest.raises(AssertionError, match="zero real provider attempts"):
        assert_slice3b_provider_isolation()
