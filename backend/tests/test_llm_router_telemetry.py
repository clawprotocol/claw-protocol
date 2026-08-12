"""Privacy-safe per-call LLM telemetry — no prompts, completions, or PII."""

from typing import Any, Dict, List
from unittest.mock import MagicMock

from backend.llm_router import call_legal_llm


def test_usage_sink_records_purpose_tokens_latency_and_finish_reason(monkeypatch, caplog) -> None:
    class _Details:
        cached_tokens = 4

    class _Usage:
        prompt_tokens = 11
        completion_tokens = 22
        total_tokens = 33
        prompt_tokens_details = _Details()

    class _Choice:
        finish_reason = "stop"
        message = MagicMock(content='{"ok":true}')

    class _Resp:
        id = "chatcmpl-gtm"
        model = "gpt-4o-mini-2024-07-18"
        usage = _Usage()
        choices = [_Choice()]
        system_fingerprint = "fp_gtm"

    fake_client = MagicMock()
    fake_client.chat.completions.create.return_value = _Resp()
    monkeypatch.setattr("backend.llm_router._get_client", lambda: fake_client)
    monkeypatch.setattr(
        "backend.llm_router._messages_after_user_airlock",
        lambda messages, **kwargs: messages,
    )
    sink: List[Dict[str, Any]] = []
    with caplog.at_level("INFO", logger="claw.backend.llm_router"):
        out = call_legal_llm(
            messages=[{"role": "user", "content": "SECRET_AGREEMENT_TEXT"}],
            model="gpt-4o-mini",
            max_tokens=100,
            usage_sink=sink,
            call_purpose="structured_extraction",
            repair_status="none",
        )
    assert out == '{"ok":true}'
    rec = sink[0]
    assert rec["call_purpose"] == "structured_extraction"
    assert rec["requested_model"] == "gpt-4o-mini"
    assert rec["returned_model"] == "gpt-4o-mini-2024-07-18"
    assert rec["prompt_tokens"] == 11
    assert rec["completion_tokens"] == 22
    assert rec["total_tokens"] == 33
    assert rec["cached_tokens"] == 4
    assert rec["finish_reason"] == "stop"
    assert rec["repair_status"] == "none"
    assert rec["status"] == "ok"
    assert isinstance(rec["latency_ms"], int)
    joined = " ".join(r.message for r in caplog.records)
    assert "SECRET_AGREEMENT_TEXT" not in joined
    assert "[claw-llm-telemetry]" in joined
    assert "structured_extraction" in joined


def test_failed_call_still_emits_privacy_safe_telemetry(monkeypatch) -> None:
    fake_client = MagicMock()
    fake_client.chat.completions.create.side_effect = TimeoutError("upstream")
    monkeypatch.setattr("backend.llm_router._get_client", lambda: fake_client)
    monkeypatch.setattr(
        "backend.llm_router._messages_after_user_airlock",
        lambda messages, **kwargs: messages,
    )
    sink: List[Dict[str, Any]] = []
    try:
        call_legal_llm(
            messages=[{"role": "user", "content": "do-not-log-me"}],
            model="gpt-4o",
            usage_sink=sink,
            call_purpose="agreement_drafting",
        )
        raise AssertionError("expected TimeoutError")
    except TimeoutError:
        pass
    rec = sink[0]
    assert rec["status"] == "fail"
    assert rec["call_purpose"] == "agreement_drafting"
    assert rec["requested_model"] == "gpt-4o"
    assert rec["error_type"] == "TimeoutError"
    assert "do-not-log-me" not in str(rec)
