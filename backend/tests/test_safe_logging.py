"""Tests for backend.security.safe_logging."""

from __future__ import annotations

import json
import logging

import pytest

from backend.security.safe_logging import (
    FORBIDDEN_LOGGING_CONTENT,
    exception_summary,
    format_safe_json_payload,
    log_metadata,
    pick_safe_trace_context,
    safe_metadata_dict,
)


def test_forbidden_doc_nonempty() -> None:
    assert len(FORBIDDEN_LOGGING_CONTENT) >= 3
    assert any("prompt" in x.lower() for x in FORBIDDEN_LOGGING_CONTENT)


def test_pick_safe_trace_context_allowlist() -> None:
    ctx = {
        "agreement_id": "a1",
        "user_id": "u1",
        "prompt": "secret user text",
        "nested": {"x": 1},
    }
    out = pick_safe_trace_context(ctx)
    assert out == {"agreement_id": "a1", "user_id": "u1"}
    assert "prompt" not in out


def test_pick_safe_trace_context_truncates_long_strings() -> None:
    long_s = "x" * 400
    out = pick_safe_trace_context({"route": long_s})
    assert out["route"].endswith("…")
    assert len(out["route"]) <= 257


def test_policy_reason_codes_coercion() -> None:
    out = pick_safe_trace_context(
        {"policy_reason_codes": ["a" * 200, 3, "ok", {"bad": 1}]}
    )
    assert isinstance(out["policy_reason_codes"], list)
    assert out["policy_reason_codes"][0].endswith("…")
    assert out["policy_reason_codes"][1] == 3
    assert len(out["policy_reason_codes"]) == 3


def test_safe_metadata_dict_omits_unset() -> None:
    d = safe_metadata_dict(request_id="r1", action="verify")
    assert d == {"request_id": "r1", "action": "verify"}
    assert "user_id" not in d


def test_exception_summary_no_message() -> None:
    assert exception_summary(ValueError("do not log this")) == "ValueError"


def test_format_safe_json_payload_strips_unknown_keys() -> None:
    s = format_safe_json_payload(
        "test_evt", {"agreement_id": "x", "body_markdown": "leak"}
    )
    data = json.loads(s)
    assert data["event"] == "test_evt"
    assert data["agreement_id"] == "x"
    assert "body_markdown" not in data


def test_log_metadata_emits_json(caplog: pytest.LogCaptureFixture) -> None:
    caplog.set_level(logging.INFO)
    log = logging.getLogger("test_safe_logging_emit")
    log_metadata(log, logging.INFO, "unit_test", user_id="u42", message="short note")
    assert len(caplog.records) == 1
    row = json.loads(caplog.records[0].getMessage())
    assert row["event"] == "unit_test"
    assert row["user_id"] == "u42"
    assert row["message"] == "short note"
