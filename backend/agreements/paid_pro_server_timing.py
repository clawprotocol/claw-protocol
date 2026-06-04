"""
Paid Pro premium-full-draft server timing — QA/dev only.

Emits compact span data in X-Claw-Paid-Pro-Server-Timing when the client sends
X-Claw-Paid-Pro-Perf-Trace: 1 or CLAW_PAID_PRO_PERF_TRACE=1.
"""

from __future__ import annotations

import json
import os
import time
from dataclasses import dataclass, field
from typing import Any, Dict, List, Optional

from starlette.requests import Request

PAID_PRO_PERF_TRACE_REQUEST_HEADER = "X-Claw-Paid-Pro-Perf-Trace"
PAID_PRO_SERVER_TIMING_RESPONSE_HEADER = "X-Claw-Paid-Pro-Server-Timing"
CORS_EXPOSE_PAID_PRO_HEADERS = [PAID_PRO_SERVER_TIMING_RESPONSE_HEADER]


def paid_pro_perf_trace_requested(request: Request) -> bool:
    hdr = (request.headers.get("x-claw-paid-pro-perf-trace") or "").strip()
    if hdr == "1":
        return True
    return os.environ.get("CLAW_PAID_PRO_PERF_TRACE", "").strip() == "1"


@dataclass
class PaidProServerTiming:
    trace_id: str = ""
    session_generation_id: str = ""
    intake_fingerprint: str = ""
    _t0: float = field(default_factory=time.perf_counter)
    spans: List[Dict[str, Any]] = field(default_factory=list)

    def mark_instant(self, name: str, **meta: Any) -> None:
        at_ms = round((time.perf_counter() - self._t0) * 1000)
        row: Dict[str, Any] = {"name": name, "startMs": at_ms, "durationMs": 0}
        for k, v in meta.items():
            if v is not None:
                row[k] = v
        self.spans.append(row)

    def record(self, name: str, duration_ms: float, **meta: Any) -> None:
        dur = max(0, round(duration_ms))
        end_ms = round((time.perf_counter() - self._t0) * 1000)
        start_ms = max(0, end_ms - dur)
        row: Dict[str, Any] = {"name": name, "startMs": start_ms, "durationMs": dur}
        for k, v in meta.items():
            if v is not None:
                row[k] = v
        self.spans.append(row)

    def to_wire(self) -> Dict[str, Any]:
        total_ms = round((time.perf_counter() - self._t0) * 1000)
        dom = self.dominant_span()
        out: Dict[str, Any] = {
            "traceId": self.trace_id,
            "sessionGenerationId": self.session_generation_id,
            "intakeFingerprint": self.intake_fingerprint,
            "totalMs": total_ms,
            "spans": self.spans,
        }
        if dom is not None:
            out["dominantSpan"] = {
                "name": dom.get("name"),
                "durationMs": dom.get("durationMs"),
            }
        return out

    def response_header_value(self) -> str:
        return json.dumps(self.to_wire(), ensure_ascii=False, separators=(",", ":"))

    def dominant_span(self) -> Optional[Dict[str, Any]]:
        """Longest duration span (excludes zero-duration instants and request total)."""
        skip = {"backend_request_total", "backend_request_received", "backend_llm_api_call_start"}
        best: Optional[Dict[str, Any]] = None
        best_dur = -1
        for s in self.spans:
            name = str(s.get("name") or "")
            if name in skip:
                continue
            dur = int(s.get("durationMs") or 0)
            if dur > best_dur:
                best_dur = dur
                best = s
        return best

    def finalize_request_total(self) -> None:
        """Wall-clock for the premium-full-draft handler (record once before response)."""
        total_ms = round((time.perf_counter() - self._t0) * 1000)
        if any(s.get("name") == "backend_request_total" for s in self.spans):
            return
        self.record("backend_request_total", total_ms)


def maybe_attach_server_timing_header(
    response: Any,
    timing: Optional[PaidProServerTiming],
) -> Any:
    if timing is None:
        return response
    try:
        timing.finalize_request_total()
        response.headers[PAID_PRO_SERVER_TIMING_RESPONSE_HEADER] = timing.response_header_value()
    except Exception:
        pass
    return response
