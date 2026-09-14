"""Opt-in, local-only cost guard for the authorized two-case quality evaluation.

This is not customer billing. Reservations are never refunded: timeouts and
process restarts cannot erase possibly billable work. No prompts or keys persist.
"""
from __future__ import annotations

import json
import os
import sqlite3
import uuid
from pathlib import Path
from typing import Any

ENV_PATH = "CLAW_QUALITY_EVAL_BUDGET_PATH"
# Official text prices checked 2026-09-13. Input upper bound is below long-context
# pricing thresholds; no caching discount is assumed. No regional/custom endpoint.
PRICES = {"gpt-4o": (5, 20), "gpt-5.4": (5, 30), "gpt-4o-mini": (1, 2)}
# Mini's actual list prices are $0.15/$0.60 per million. Round UP to
# $0.50/$1.00 here to preserve integer units and the existing approval ledger.
SNAPSHOTS = {"gpt-4o": {"gpt-4o-2024-08-06", "gpt-4o-2024-11-20"},
             "gpt-5.4": {"gpt-5.4-2026-03-05"}, "gpt-4o-mini": {"gpt-4o-mini-2024-07-18"}}
# Half-microdollars: input $2.50/M = 5 units/token; output $15/M = 30.
USD_UNITS = 2_000_000
MAX_USD = 8
LIMITS = {"parse": 4, "clarification": 4, "primary": 2, "repair": 2,
          "revision": 2, "negotiation": 1, "bootstrap_parse": 2, "bootstrap_one_pager": 4}
OUTPUT_LIMITS = {"parse": 1200, "clarification": 900, "primary": 8000,
                 "repair": 8000, "revision": 12000, "negotiation": 768,
                 "bootstrap_parse": 350, "bootstrap_one_pager": 1200}
PURPOSES = {"structured_extraction": "parse", "missing_facts": "clarification",
            "agreement_drafting": "primary", "conditional_repair": "repair",
            "explicit_revision": "revision", "structured_revision": "revision",
            "recipient_negotiation": "negotiation"}


class QualityEvalBlocked(RuntimeError):
    """Metadata-only error; never include request content or credentials."""


class QualityEvalBudget:
    def __init__(self, path: str | Path):
        self.path = Path(path)

    @classmethod
    def create(cls, path: str | Path, *, approved_usd: int = MAX_USD,
               model: str = "gpt-4o") -> "QualityEvalBudget":
        if type(approved_usd) is not int or not 0 < approved_usd <= MAX_USD:
            raise QualityEvalBlocked("invalid_approval_ceiling")
        if model not in PRICES:
            raise QualityEvalBlocked("unpriced_model")
        result = cls(path)
        # Explicit one-time initialization. Never reset an existing approval.
        fd = os.open(result.path, os.O_CREAT | os.O_EXCL | os.O_WRONLY, 0o600)
        os.close(fd)
        with sqlite3.connect(result.path) as db:
            db.execute("CREATE TABLE approval (ceiling INTEGER NOT NULL, halted INTEGER NOT NULL, model TEXT NOT NULL)")
            db.execute("INSERT INTO approval VALUES (?, 0, ?)", (approved_usd * USD_UNITS, model))
            db.execute("""CREATE TABLE attempts (
                id TEXT PRIMARY KEY, bucket TEXT NOT NULL, model TEXT NOT NULL,
                purpose TEXT NOT NULL, reserved INTEGER NOT NULL,
                state TEXT NOT NULL, usage_json TEXT,
                created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)""")
        return result

    def _connect(self) -> sqlite3.Connection:
        if not self.path.is_file():
            raise QualityEvalBlocked("approval_ledger_missing")
        db = sqlite3.connect(f"{self.path.resolve().as_uri()}?mode=rw", uri=True, timeout=10)
        db.execute("PRAGMA synchronous=FULL")
        return db

    def reserve(self, *, model: str, messages: list[dict[str, Any]],
                max_tokens: int, purpose: str, repair: str = "none") -> str:
        if model not in PRICES:
            raise QualityEvalBlocked("unpriced_model")
        bucket = PURPOSES.get(purpose)
        # Actual paid Create shares this preliminary basic endpoint with the
        # public utility. Count its existing calls; never change product routing
        # to accommodate an incomplete evaluation call inventory.
        bootstrap = model == "gpt-4o-mini" and repair == "none"
        if bootstrap:
            bucket = {"structured_extraction": "bootstrap_parse",
                      "free_one_pager": "bootstrap_one_pager"}.get(purpose)
        if not bucket or repair not in {"none", "repair", "retry", "regen"}:
            raise QualityEvalBlocked("unapproved_purpose")
        if repair != "none":
            if bucket not in {"primary", "repair"}:
                raise QualityEvalBlocked("unexpected_repair_purpose")
            bucket = "repair"
        if type(max_tokens) is not int or not 0 < max_tokens <= OUTPUT_LIMITS[bucket]:
            raise QualityEvalBlocked("output_limit")
        if not messages:
            raise QualityEvalBlocked("empty_input")
        # Conservative bound for the supported text-only chat requests: at most
        # one token per UTF-8 byte, with generous per-message framing allowance.
        input_upper = 256
        for message in messages:
            if (not isinstance(message, dict) or set(message) - {"role", "content"}
                    or message.get("role") not in {"system", "user", "assistant"}
                    or not isinstance(message.get("content"), str)):
                raise QualityEvalBlocked("unsupported_input_shape")
            input_upper += len(message["content"].encode("utf-8")) + 128
        if input_upper + max_tokens > 120_000:
            raise QualityEvalBlocked("input_limit")
        input_rate, output_rate = PRICES[model]
        reservation = input_upper * input_rate + max_tokens * output_rate
        attempt_id = uuid.uuid4().hex
        with self._connect() as db:
            db.execute("BEGIN IMMEDIATE")
            ceiling, halted, approved_model = db.execute("SELECT ceiling, halted, model FROM approval").fetchone()
            if model != approved_model and not (bootstrap and approved_model == "gpt-5.4"):
                raise QualityEvalBlocked("model_differs_from_approval")
            count, reserved = db.execute("SELECT COUNT(*), COALESCE(SUM(reserved),0) FROM attempts").fetchone()
            bucket_count = db.execute("SELECT COUNT(*) FROM attempts WHERE bucket=?", (bucket,)).fetchone()[0]
            if halted or ceiling > MAX_USD * USD_UNITS:
                raise QualityEvalBlocked("approval_halted")
            from backend.quality_eval_increment import increment_reservation_gate, load_increment_policy
            increment_reservation_gate(
                purpose=purpose,
                bucket=bucket,
                count=count,
                bucket_count=bucket_count,
                reserved=reserved,
                reservation=reservation,
                ceiling=ceiling,
                policy=load_increment_policy(),
            )
            db.execute("INSERT INTO attempts (id,bucket,model,purpose,reserved,state) VALUES (?,?,?,?,?,?)",
                       (attempt_id, bucket, model, purpose, reservation, "reserved"))
        return attempt_id

    def finish(self, attempt_id: str, *, usage: Any = None, model: str | None = None,
               failed: bool = False) -> None:
        def read(name: str) -> Any:
            return usage.get(name) if isinstance(usage, dict) else getattr(usage, name, None)
        inp, out = read("prompt_tokens"), read("completion_tokens")
        known = type(inp) is int and type(out) is int and inp >= 0 and out >= 0
        with self._connect() as db:
            db.execute("BEGIN IMMEDIATE")
            row = db.execute("SELECT reserved,state,model FROM attempts WHERE id=?", (attempt_id,)).fetchone()
            if not row or row[1] != "reserved":
                raise QualityEvalBlocked("invalid_attempt_settlement")
            input_rate, output_rate = PRICES[row[2]]
            actual = inp * input_rate + out * output_rate if known else None
            model_ok = model in {row[2], *SNAPSHOTS[row[2]]} or (failed and model is None)
            breach = not model_ok or (actual is not None and actual > row[0])
            if breach:
                db.execute("UPDATE approval SET halted=1")
            record = {"returned_model": model, "prompt_tokens": inp if known else None,
                      "completion_tokens": out if known else None,
                      "uncached_cost_upper_usd": actual / USD_UNITS if known else None}
            db.execute("UPDATE attempts SET state=?, usage_json=? WHERE id=?",
                       ("failed" if failed else "unknown" if not known else "complete",
                        json.dumps(record), attempt_id))
        if breach:
            raise QualityEvalBlocked("usage_or_model_exceeded_reservation")

    def summary(self) -> dict[str, Any]:
        with self._connect() as db:
            ceiling, halted, model = db.execute("SELECT ceiling,halted,model FROM approval").fetchone()
            count, reserved = db.execute("SELECT COUNT(*),COALESCE(SUM(reserved),0) FROM attempts").fetchone()
            uses = [json.loads(r[0]) for r in db.execute("SELECT usage_json FROM attempts WHERE usage_json IS NOT NULL")]
            known = [r['uncached_cost_upper_usd'] for r in uses if r['uncached_cost_upper_usd'] is not None]
        return {"ceiling_usd": ceiling / USD_UNITS, "model": model, "attempts": count,
                "reserved_upper_usd": reserved / USD_UNITS, "halted": bool(halted),
                "known_usage_cost_upper_usd": sum(known), "unknown_usage_attempts": count-len(known)}


def configured_budget() -> QualityEvalBudget | None:
    path = os.getenv(ENV_PATH, "").strip()
    increment = os.getenv("CLAW_QUALITY_EVAL_INCREMENT_PATH", "").strip()
    if not path and not increment:
        return None
    if os.getenv("CLAW_ENVIRONMENT", "").strip().lower() not in {"test", "local"}:
        raise QualityEvalBlocked("evaluation_is_local_only")
    if not path:
        return None
    return QualityEvalBudget(path)
