"""
Metadata-only logging helpers for CLAW.

Goal: reduce subpoena / discovery surface by avoiding persistence of user content,
model I/O, and rich exception payloads in application logs.

This module does not alter redaction policy or request handling — it only helps
callers emit safer log lines.
"""

from __future__ import annotations

import json
import logging
from typing import Any, Dict, Final, Mapping, Optional, Sequence, Union

# ---------------------------------------------------------------------------
# Forbidden logging content (do not log these, even at DEBUG)
# ---------------------------------------------------------------------------

FORBIDDEN_LOGGING_CONTENT: Final[tuple[str, ...]] = (
    "Prompt bodies, system prompts, and chat message arrays sent to LLM providers.",
    "Model responses, completion text, embeddings vectors, and tool outputs.",
    "Raw uploaded document bytes or full extracted document / attachment text.",
    "OCR or layout pipelines' full text snippets tied to a document (beyond opaque ids/hashes/counts).",
    "Raw exception messages or stack traces when they may echo request bodies, prompts, or document text.",
    "Secrets: API keys, tokens, cookies, HMAC secrets, private keys, and full webhook signatures.",
)

# Allowlisted keys for optional LLM/router trace bags. Unknown keys are dropped
# so callers cannot accidentally log arbitrary payloads via trace_context.
_SAFE_TRACE_CONTEXT_KEYS: Final[frozenset[str]] = frozenset(
    {
        "request_id",
        "route",
        "user_id",
        "matter_id",
        "action",
        "blocked",
        "policy_reason_codes",
        "token_count",
        "duration_ms",
        "session_type",
        "agreement_id",
        "ip_hash",
        "task",
        "feature",
        "surface",
        "output_type",
        "mode",
    }
)

_MAX_TRACE_STRING_LEN: Final[int] = 256
_MAX_REASON_CODES: Final[int] = 32


def _truncate_str(s: str, max_len: int = _MAX_TRACE_STRING_LEN) -> str:
    if len(s) <= max_len:
        return s
    return s[:max_len] + "…"


def _coerce_trace_value(key: str, value: Any) -> Any:
    if value is None or isinstance(value, bool):
        return value
    if isinstance(value, int):
        return value
    if isinstance(value, float):
        return value
    if isinstance(value, str):
        return _truncate_str(value)
    if key == "policy_reason_codes" and isinstance(value, Sequence) and not isinstance(value, (str, bytes)):
        out: list[Union[str, int]] = []
        for i, item in enumerate(value):
            if i >= _MAX_REASON_CODES:
                break
            if isinstance(item, str):
                out.append(_truncate_str(item, 128))
            elif isinstance(item, int):
                out.append(item)
        return out
    # Drop unsupported structures (dicts, arbitrary objects) to avoid leaking nested content.
    return None


def pick_safe_trace_context(ctx: Optional[Mapping[str, Any]]) -> Dict[str, Any]:
    """
    Return a copy of trace_context with only allowlisted keys and safe scalar shapes.

    Use before logging LLM/router diagnostics. Do not pass prompt or document text
    through trace_context — it will be dropped only if keys are not allowlisted,
    but callers should never put content in trace_context at all.
    """
    if not ctx:
        return {}
    out: Dict[str, Any] = {}
    for key in _SAFE_TRACE_CONTEXT_KEYS:
        if key not in ctx:
            continue
        coerced = _coerce_trace_value(key, ctx.get(key))
        if coerced is not None or (key in ctx and ctx[key] is None):
            if coerced is None and ctx.get(key) is not None:
                continue
            out[key] = coerced
    return out


def exception_summary(exc: BaseException) -> str:
    """
    Safe one-line exception identifier for logs: exception type name only.

    Avoids logging str(exc), which may contain echoed user input or provider errors
    that repeat prompt fragments.
    """
    return type(exc).__name__


def safe_metadata_dict(
    *,
    request_id: Optional[str] = None,
    route: Optional[str] = None,
    user_id: Optional[str] = None,
    matter_id: Optional[str] = None,
    action: Optional[str] = None,
    blocked: Optional[bool] = None,
    policy_reason_codes: Optional[Sequence[Union[str, int]]] = None,
    token_count: Optional[int] = None,
    duration_ms: Optional[int] = None,
    **extra: Any,
) -> Dict[str, Any]:
    """
    Build a JSON-friendly metadata dict for structured logs.

    Explicit keyword args are preferred. Additional ``extra`` keys are only
    included if they are in ``_SAFE_TRACE_CONTEXT_KEYS`` and survive coercion
    (same rules as pick_safe_trace_context). Omitted optional args are left out
    of the returned dict (not emitted as null).
    """
    raw: Dict[str, Any] = {}
    if request_id is not None:
        raw["request_id"] = request_id
    if route is not None:
        raw["route"] = route
    if user_id is not None:
        raw["user_id"] = user_id
    if matter_id is not None:
        raw["matter_id"] = matter_id
    if action is not None:
        raw["action"] = action
    if blocked is not None:
        raw["blocked"] = blocked
    if policy_reason_codes is not None:
        raw["policy_reason_codes"] = list(policy_reason_codes)
    if token_count is not None:
        raw["token_count"] = token_count
    if duration_ms is not None:
        raw["duration_ms"] = duration_ms
    raw.update(extra)
    return pick_safe_trace_context(raw)


def format_safe_json_payload(event: str, fields: Mapping[str, Any]) -> str:
    """Serialize event + allowlisted/coerced metadata for a single log line."""
    safe_fields = pick_safe_trace_context(fields)
    body: Dict[str, Any] = {"event": event, **safe_fields}
    return json.dumps(body, default=str, ensure_ascii=False, separators=(",", ":"))


def log_metadata(
    logger: logging.Logger,
    level: int,
    event: str,
    *,
    message: Optional[str] = None,
    **fields: Any,
) -> None:
    """
    Log one structured JSON line: event, optional short message, and allowlisted metadata.

    ``fields`` are filtered through the same key allowlist as trace context.
    """
    meta = pick_safe_trace_context(fields)
    payload: Dict[str, Any] = {"event": event, **meta}
    if message is not None:
        payload["message"] = _truncate_str(str(message), 512)
    logger.log(
        level,
        "%s",
        json.dumps(payload, default=str, ensure_ascii=False, separators=(",", ":")),
    )


__all__ = [
    "FORBIDDEN_LOGGING_CONTENT",
    "exception_summary",
    "format_safe_json_payload",
    "log_metadata",
    "pick_safe_trace_context",
    "safe_metadata_dict",
]
