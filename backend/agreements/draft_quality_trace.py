"""
Flag-gated draft-quality stage trace for premium-full-draft evals.

Security rules (non-negotiable):
- Disabled by default.
- Browser / client flags MUST NOT authorize server-side full-text dumps.
- Full prompts and agreement corpora are NEVER returned on the normal API response.
- Corpus dump requires ALL of:
    CLAW_DRAFT_QUALITY_TRACE=1
    CLAW_DRAFT_QUALITY_TRACE_DUMP=1
    non-production CLAW_ENVIRONMENT (or CLAW_DRAFT_QUALITY_EVAL_AUTHORIZED=1 with matching auth)
    CLAW_DRAFT_QUALITY_EVAL_AUTH == CLAW_DRAFT_QUALITY_EVAL_AUTH_EXPECTED (both set, equal, non-empty)
- Ordinary production users cannot enable dumps via request headers or localStorage.
- Application logs receive lengths/hashes/finish_reason/usage only — never raw agreement text.
"""

from __future__ import annotations

import hashlib
import json
import logging
import os
import re
import time
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Dict, List, Optional

log = logging.getLogger("claw.draft_quality_trace")

TRACE_ENV = "CLAW_DRAFT_QUALITY_TRACE"
DUMP_ENV = "CLAW_DRAFT_QUALITY_TRACE_DUMP"
DIR_ENV = "CLAW_DRAFT_QUALITY_TRACE_DIR"
EVAL_AUTH_ENV = "CLAW_DRAFT_QUALITY_EVAL_AUTH"
EVAL_AUTH_EXPECTED_ENV = "CLAW_DRAFT_QUALITY_EVAL_AUTH_EXPECTED"
EVAL_AUTHORIZED_ENV = "CLAW_DRAFT_QUALITY_EVAL_AUTHORIZED"

# Redact emails / phones / long digit runs before optional dump.
_EMAIL_RE = re.compile(r"[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}")
_PHONE_RE = re.compile(r"\b(?:\+?1[-.\s]?)?(?:\(?\d{3}\)?[-.\s]?)\d{3}[-.\s]?\d{4}\b")
_LONG_DIGIT_RE = re.compile(r"\b\d{6,}\b")

# Patterns that must never appear in ordinary log lines from this module.
_LOG_FORBIDDEN_MARKERS = (
    "AUTHORITATIVE_DRAFT_BODY=",
    "FULL_AGREEMENT_TEXT=",
    "RAW_PROMPT=",
)


def _env_truthy(name: str) -> bool:
    return (os.environ.get(name) or "").strip().lower() in {"1", "true", "yes", "on"}


def _claw_environment() -> str:
    return (os.environ.get("CLAW_ENVIRONMENT") or os.environ.get("ENVIRONMENT") or "").strip().lower()


def is_production_environment() -> bool:
    return _claw_environment() in {"production", "prod"}


def is_nonproduction_environment() -> bool:
    env = _claw_environment()
    return env in {"local", "dev", "development", "test", "staging", "eval", ""}


def draft_quality_trace_enabled() -> bool:
    """Metadata-only tracing (hashes/lengths). Server env only — never client-controlled."""
    return _env_truthy(TRACE_ENV)


def draft_quality_dump_authorized() -> bool:
    """
    Full redacted corpus dump authorization.

    Requires dump flag + eval auth match + (nonprod OR explicit EVAL_AUTHORIZED).
    Client headers / localStorage cannot satisfy this.
    """
    if not draft_quality_trace_enabled():
        return False
    if not _env_truthy(DUMP_ENV):
        return False
    auth = (os.environ.get(EVAL_AUTH_ENV) or "").strip()
    expected = (os.environ.get(EVAL_AUTH_EXPECTED_ENV) or "").strip()
    if not auth or not expected or auth != expected:
        return False
    if is_production_environment() and not _env_truthy(EVAL_AUTHORIZED_ENV):
        return False
    if is_production_environment() and _env_truthy(EVAL_AUTHORIZED_ENV):
        # Even with EVAL_AUTHORIZED, require auth match (already checked) and refuse
        # unless operators explicitly set both — still allowed only for break-glass eval.
        return True
    return is_nonproduction_environment() or _env_truthy(EVAL_AUTHORIZED_ENV)


def draft_quality_dump_enabled() -> bool:
    """Back-compat alias — dumps are never enabled without full authorization."""
    return draft_quality_dump_authorized()


def api_trace_summary_allowed() -> bool:
    """
    Whether a metadata-only summary may be attached to the HTTP response.

    Never in production. Never includes corpora. Client cannot enable this.
    """
    if is_production_environment():
        return False
    return draft_quality_trace_enabled()


def corpus_sha256(text: str) -> str:
    return hashlib.sha256((text or "").encode("utf-8")).hexdigest()


def redact_corpus_for_eval(text: str) -> str:
    """Lightweight sanitizer for local eval dumps — not a substitute for airlock."""
    out = text or ""
    out = _EMAIL_RE.sub("[REDACTED_EMAIL]", out)
    out = _PHONE_RE.sub("[REDACTED_PHONE]", out)
    out = _LONG_DIGIT_RE.sub("[REDACTED_DIGITS]", out)
    return out


def assert_log_line_has_no_raw_corpus(line: str) -> None:
    for marker in _LOG_FORBIDDEN_MARKERS:
        if marker in line:
            raise AssertionError(f"forbidden corpus marker in log line: {marker}")


@dataclass
class DraftQualityStageTrace:
    """Accumulates stage metadata for one premium-full-draft request."""

    trace_id: str
    enabled: bool = True
    model_id: str = ""
    temperature: float = 0.0
    max_tokens: int = 0
    sim_regen: bool = False
    intake_len: int = 0
    intake_sha256: str = ""
    payload_json_len: int = 0
    post_airlock_input_sha256: str = ""
    prompt_hash: str = ""
    schema_version: str = "draft_quality_trace.v1"
    code_commit: str = ""
    fixture_version: str = ""
    correlation_id: str = ""
    stages: List[Dict[str, Any]] = field(default_factory=list)
    llm_calls: List[Dict[str, Any]] = field(default_factory=list)
    gate_reasons: List[str] = field(default_factory=list)
    generation_outcome: str = ""
    started_mono: float = field(default_factory=time.perf_counter)
    _corpora: Dict[str, str] = field(default_factory=dict, repr=False)

    def record_stage(
        self,
        name: str,
        corpus: str = "",
        *,
        extra: Optional[Dict[str, Any]] = None,
    ) -> None:
        if not self.enabled:
            return
        body = corpus or ""
        entry: Dict[str, Any] = {
            "stage": name,
            "len": len(body),
            "sha256": corpus_sha256(body) if body else "",
            "t_ms": round((time.perf_counter() - self.started_mono) * 1000, 2),
        }
        if extra:
            # Strip any accidental corpus fields from extras.
            safe_extra = {k: v for k, v in extra.items() if k not in {"corpus", "text", "body", "prompt"}}
            entry["extra"] = safe_extra
        self.stages.append(entry)
        if body and draft_quality_dump_authorized():
            self._corpora[name] = body

    def record_llm_call(
        self,
        *,
        label: str,
        usage: Optional[Dict[str, Any]] = None,
        finish_reason: str = "",
        response_chars: int = 0,
        temperature: Optional[float] = None,
        max_tokens: Optional[int] = None,
        model: str = "",
        request_id: str = "",
        response_id: str = "",
        retry_count: int = 0,
        latency_ms: Optional[float] = None,
        draft_chars: Optional[int] = None,
        intelligence_chars: Optional[int] = None,
    ) -> None:
        if not self.enabled:
            return
        self.llm_calls.append(
            {
                "label": label,
                "model": model or self.model_id,
                "temperature": self.temperature if temperature is None else temperature,
                "max_tokens": self.max_tokens if max_tokens is None else max_tokens,
                "finish_reason": finish_reason or "",
                "response_chars": int(response_chars),
                "usage": dict(usage or {}),
                "request_id": request_id or "",
                "response_id": response_id or "",
                "retry_count": int(retry_count),
                "latency_ms": latency_ms,
                "draft_chars": draft_chars,
                "intelligence_chars": intelligence_chars,
                "t_ms": round((time.perf_counter() - self.started_mono) * 1000, 2),
                "note": (
                    "finish_reason=stop does not disprove output-budget pressure; "
                    "measure draft_chars, intelligence_chars, missing sections, and rubric separately."
                ),
            }
        )

    def summary(self) -> Dict[str, Any]:
        """Safe metadata summary — no full corpus, no full prompts."""
        return {
            "schema_version": self.schema_version,
            "trace_id": self.trace_id,
            "correlation_id": self.correlation_id or self.trace_id,
            "model_id": self.model_id,
            "temperature": self.temperature,
            "max_tokens": self.max_tokens,
            "sim_regen": self.sim_regen,
            "intake_len": self.intake_len,
            "intake_sha256": self.intake_sha256,
            "payload_json_len": self.payload_json_len,
            "post_airlock_input_sha256": self.post_airlock_input_sha256,
            "prompt_hash": self.prompt_hash,
            "code_commit": self.code_commit,
            "fixture_version": self.fixture_version,
            "generation_outcome": self.generation_outcome,
            "gate_reasons": list(self.gate_reasons)[:32],
            "llm_calls": list(self.llm_calls),
            "stages": list(self.stages),
            "elapsed_ms": round((time.perf_counter() - self.started_mono) * 1000, 2),
            "dump_authorized": draft_quality_dump_authorized(),
        }

    def persist_local(self) -> Optional[Path]:
        """Write summary (+ optional redacted corpora) only when dump is authorized."""
        if not self.enabled:
            return None
        if not draft_quality_dump_authorized():
            # Still allow metadata-only persist under TRACE without DUMP in nonprod.
            if not (draft_quality_trace_enabled() and is_nonproduction_environment()):
                return None
        root = Path(
            (os.environ.get(DIR_ENV) or "").strip()
            or "evals/draft-quality/traces/local"
        )
        root.mkdir(parents=True, exist_ok=True)
        out_path = root / f"{self.trace_id}.json"
        payload: Dict[str, Any] = {"summary": self.summary()}
        if draft_quality_dump_authorized() and self._corpora:
            payload["corpora_redacted"] = {
                k: redact_corpus_for_eval(v) for k, v in self._corpora.items()
            }
        text = json.dumps(payload, indent=2, ensure_ascii=False) + "\n"
        out_path.write_text(text, encoding="utf-8")
        return out_path

    def safe_log_event(self, event: str) -> None:
        line = (
            f"[draft-quality-trace] event={event} trace_id={self.trace_id} "
            f"stages={len(self.stages)} llm_calls={len(self.llm_calls)} "
            f"dump_authorized={int(draft_quality_dump_authorized())}"
        )
        assert_log_line_has_no_raw_corpus(line)
        log.info("%s", line)


def new_trace(
    *,
    trace_id: str,
    model_id: str,
    temperature: float,
    max_tokens: int,
    intake_text: str,
    payload_json_len: int,
    sim_regen: bool = False,
    post_airlock_input: str = "",
    prompt_text_for_hash: str = "",
    correlation_id: str = "",
    fixture_version: str = "",
) -> DraftQualityStageTrace:
    enabled = draft_quality_trace_enabled()
    intake = intake_text or ""
    commit = (os.environ.get("RAILWAY_GIT_COMMIT_SHA") or os.environ.get("GIT_COMMIT") or "").strip()
    return DraftQualityStageTrace(
        trace_id=trace_id or corpus_sha256(intake)[:16],
        enabled=enabled,
        model_id=model_id or "",
        temperature=float(temperature),
        max_tokens=int(max_tokens),
        sim_regen=bool(sim_regen),
        intake_len=len(intake),
        intake_sha256=corpus_sha256(intake) if intake else "",
        payload_json_len=int(payload_json_len),
        post_airlock_input_sha256=corpus_sha256(post_airlock_input) if post_airlock_input else "",
        prompt_hash=corpus_sha256(prompt_text_for_hash) if prompt_text_for_hash else "",
        code_commit=commit[:40],
        fixture_version=fixture_version or "",
        correlation_id=correlation_id or "",
    )
