"""
Tiny helpers for flow timing + percentiles (stdlib only; no framework).
"""

from __future__ import annotations

import statistics
import time
from dataclasses import dataclass, field
from typing import Any, Dict, List, Optional, Tuple


@dataclass
class Sample:
    label: str
    latency_ms: float
    ok: bool
    status_code: Optional[int] = None
    detail: str = ""


@dataclass
class RunStats:
    samples: List[Sample] = field(default_factory=list)

    def add(self, s: Sample) -> None:
        self.samples.append(s)

    def by_label(self) -> Dict[str, List[Sample]]:
        out: Dict[str, List[Sample]] = {}
        for s in self.samples:
            out.setdefault(s.label, []).append(s)
        return out

    def summary_rows(self) -> List[Dict[str, Any]]:
        rows: List[Dict[str, Any]] = []
        for label, lst in sorted(self.by_label().items()):
            lat = [x.latency_ms for x in lst]
            oks = [x for x in lst if x.ok]
            errs = [x for x in lst if not x.ok]
            lat.sort()
            rows.append(
                {
                    "label": label,
                    "n": len(lst),
                    "ok": len(oks),
                    "err": len(errs),
                    "error_rate": (len(errs) / len(lst)) if lst else 0.0,
                    "p50_ms": _percentile(lat, 50),
                    "p95_ms": _percentile(lat, 95),
                    "p99_ms": _percentile(lat, 99),
                    "mean_ms": statistics.mean(lat) if lat else 0.0,
                }
            )
        return rows


def _percentile(sorted_vals: List[float], p: int) -> float:
    if not sorted_vals:
        return 0.0
    if p <= 0:
        return float(sorted_vals[0])
    if p >= 100:
        return float(sorted_vals[-1])
    k = (len(sorted_vals) - 1) * (p / 100.0)
    f = int(k)
    c = min(f + 1, len(sorted_vals) - 1)
    if f == c:
        return float(sorted_vals[f])
    return float(sorted_vals[f] + (sorted_vals[c] - sorted_vals[f]) * (k - f))


def timed_ms(fn) -> Tuple[Any, float]:
    t0 = time.perf_counter()
    try:
        out = fn()
        return out, (time.perf_counter() - t0) * 1000.0
    except Exception:
        raise


def _p95_limit_for_label(label: str, p95_limits: Dict[str, float]) -> Optional[float]:
    """First matching limit wins; longer prefixes beat shorter (route-specific > bucket)."""
    for prefix, limit in sorted(p95_limits.items(), key=lambda kv: len(kv[0]), reverse=True):
        if label == prefix or label.startswith(prefix):
            return float(limit)
    return None


def check_thresholds(
    rows: List[Dict[str, Any]],
    *,
    max_error_rate: float,
    p95_limits: Dict[str, float],
) -> Tuple[bool, List[str]]:
    """
    p95_limits: label prefix or exact label -> max p95 ms.
    Labels in rows are exact; longest matching prefix wins (e.g. ``read:/v1/readyz`` before ``read:``).
    """
    problems: List[str] = []
    for row in rows:
        label = str(row["label"])
        er = float(row["error_rate"])
        if er > max_error_rate:
            problems.append(f"{label}: error_rate {er:.3f} > {max_error_rate}")
        p95 = float(row["p95_ms"])
        limit = _p95_limit_for_label(label, p95_limits)
        if limit is not None and p95 > limit:
            problems.append(f"{label}: p95 {p95:.0f}ms > {limit:.0f}ms")
    return (len(problems) == 0, problems)


def check_two_tier_thresholds(
    rows: List[Dict[str, Any]],
    *,
    survival_max_error_rate: float,
    survival_p95_limits: Dict[str, float],
    ux_max_error_rate: float,
    ux_p95_limits: Dict[str, float],
) -> Tuple[bool, bool, List[str], List[str]]:
    """
    Survival = no collapse (looser ceilings). Good-UX = product-realistic latency/error budget.

    Returns ``(survival_ok, ux_ok, survival_problems, ux_problems)``.
    """
    s_ok, s_p = check_thresholds(
        rows, max_error_rate=survival_max_error_rate, p95_limits=survival_p95_limits
    )
    u_ok, u_p = check_thresholds(rows, max_error_rate=ux_max_error_rate, p95_limits=ux_p95_limits)
    return s_ok, u_ok, s_p, u_p
