"""
In-memory LLM usage limits for agreement routes (V1: cost containment, no billing).
Recipients are capped per agreement + hashed client IP; owners are not limited here.
"""

from __future__ import annotations

import hashlib
import json
import time
from dataclasses import dataclass, field
from typing import Any, Dict, Literal, Optional, Tuple

from fastapi import Request

SessionType = Literal["owner", "recipient"]

RECIPIENT_SESSION_MAX = 15
BURST_MAX = 5
BURST_WINDOW_SEC = 12.0
COOLDOWN_SEC = 35.0

MAX_INSTRUCTION_OWNER = 14_000
MAX_INSTRUCTION_RECIPIENT = 6_000
MAX_NEGOTIATE_TEXT_OWNER = 12_000
MAX_NEGOTIATE_TEXT_RECIPIENT = 6_000
# Bound total user JSON sent to the model for recipients (serialized snapshots + instruction).
MAX_NEGOTIATE_PAYLOAD_RECIPIENT = 72_000

# Basic abuse resistance for unauthenticated recipient sessions (not foolproof).
_RECIPIENT_INJECTION_MARKERS = (
    "ignore previous instructions",
    "ignore all previous",
    "system prompt",
    "you are now a",
    "bypass safety",
    "api key",
)


@dataclass
class _RecipientBucket:
    total_calls: int = 0
    burst_ts: list[float] = field(default_factory=list)
    cooldown_until: float = 0.0


_recipient_store: Dict[str, _RecipientBucket] = {}


def client_fingerprint(request: Request) -> str:
    fwd = (request.headers.get("x-forwarded-for") or "").strip()
    ip = fwd.split(",")[0].strip() if fwd else (request.client.host if request.client else "unknown")
    return hashlib.sha256(ip.encode("utf-8")).hexdigest()[:16]


def build_llm_trace_context(
    *,
    session_type: SessionType,
    agreement_id: str,
    request: Request,
    user_id: Optional[str] = None,
) -> Dict[str, Any]:
    return {
        "session_type": session_type,
        "agreement_id": agreement_id,
        "user_id": user_id,
        "ip_hash": client_fingerprint(request),
    }


def _recipient_key(agreement_id: str, fingerprint: str) -> str:
    return f"r:{agreement_id}:{fingerprint}"


def validate_instruction_size(instruction: str, session_type: SessionType) -> Tuple[bool, str]:
    lim = MAX_INSTRUCTION_RECIPIENT if session_type == "recipient" else MAX_INSTRUCTION_OWNER
    if len(instruction) > lim:
        return False, "Input too large for this action"
    return True, ""


def validate_negotiate_text(text: str, session_type: SessionType) -> Tuple[bool, str]:
    lim = MAX_NEGOTIATE_TEXT_RECIPIENT if session_type == "recipient" else MAX_NEGOTIATE_TEXT_OWNER
    if len(text) > lim:
        return False, "Input too large for this action"
    return True, ""


def recipient_prompt_allowed(text: str) -> bool:
    """Reject obvious prompt-injection patterns for recipient-facing routes."""
    low = (text or "").lower()
    return not any(m in low for m in _RECIPIENT_INJECTION_MARKERS)


def validate_negotiate_payload_size(payload_chars: int, session_type: SessionType) -> Tuple[bool, str]:
    if session_type != "recipient":
        return True, ""
    if payload_chars > MAX_NEGOTIATE_PAYLOAD_RECIPIENT:
        return False, "Input too large for this action"
    return True, ""


def recipient_try_acquire_llm_slot(agreement_id: str, fingerprint: str) -> Tuple[bool, int]:
    """
    Reserve one recipient LLM slot. Returns (ok, remaining_calls_after_this_one_if_ok_else_0).
    """
    key = _recipient_key(agreement_id, fingerprint)
    now = time.time()
    b = _recipient_store.setdefault(key, _RecipientBucket())

    if now < b.cooldown_until:
        return False, 0

    b.burst_ts = [t for t in b.burst_ts if now - t <= BURST_WINDOW_SEC]

    if len(b.burst_ts) >= BURST_MAX:
        b.cooldown_until = now + COOLDOWN_SEC
        return False, 0

    if b.total_calls >= RECIPIENT_SESSION_MAX:
        return False, 0

    b.total_calls += 1
    b.burst_ts.append(now)
    remaining = max(0, RECIPIENT_SESSION_MAX - b.total_calls)
    return True, remaining


def peek_recipient_remaining(agreement_id: str, fingerprint: str) -> int:
    key = _recipient_key(agreement_id, fingerprint)
    b = _recipient_store.get(key)
    if not b:
        return RECIPIENT_SESSION_MAX
    return max(0, RECIPIENT_SESSION_MAX - b.total_calls)


def usage_response_header(remaining_calls: int) -> Dict[str, str]:
    return {"X-Claw-Usage": json.dumps({"remaining_calls": remaining_calls})}
