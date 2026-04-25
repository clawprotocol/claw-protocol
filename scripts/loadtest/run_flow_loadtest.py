#!/usr/bin/env python3
"""
Flow-based load test against a running LawDog API (staging / pre-launch).

Uses ``requests`` (same optional dependency pattern as ``scripts/deploy_smoke.py``).
This is not a benchmark framework — it drives realistic HTTP sequences and prints
p50/p95/p99 + error rates for operator review.

Usage:
  export CLAW_API_BASE=https://staging.example.com
  export CLAW_SMOKE_ORG_ID=loadtest-org
  python3 scripts/loadtest/run_flow_loadtest.py --scenario read --workers 20 --requests 200

  # Writes (avoid production unless explicitly allowed)
  export CLAW_LOAD_ALLOW_WRITES=1
  python3 scripts/loadtest/run_flow_loadtest.py --scenario quick_send --workers 8 --requests 40

See docs/ops/PRE_LAUNCH_LOAD_TEST_PLAN.md and scripts/loadtest/README.md.

Exit codes (when thresholds enabled): 0 = survival + good_ux pass; 1 = survival ok, good_ux miss;
2 = survival miss (treat as instability / not launch-ready). Use ``--no-thresholds`` to always exit 0.
"""
from __future__ import annotations

import argparse
import json
import os
import random
import sys
import time
from concurrent.futures import ThreadPoolExecutor, as_completed
from typing import Any, Callable, Dict, List, Optional, Tuple

_SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
if _SCRIPT_DIR not in sys.path:
    sys.path.insert(0, _SCRIPT_DIR)

try:
    import requests
except ImportError:
    print("ERROR: pip install requests", file=sys.stderr)
    raise SystemExit(2)

from harness import RunStats, Sample, check_two_tier_thresholds

DEFAULT_BASE = os.environ.get("CLAW_API_BASE", "http://127.0.0.1:8000").rstrip("/")
TIMEOUT = float(os.environ.get("CLAW_LOAD_TIMEOUT", os.environ.get("CLAW_SMOKE_TIMEOUT", "45")))


def _env_float(*keys: str, default: float) -> float:
    for k in keys:
        raw = os.environ.get(k, "").strip()
        if raw:
            return float(raw)
    return default


def _survival_p95_limits() -> Dict[str, float]:
    """Loose ceilings: process stayed up; dependencies mostly answered."""
    r = _env_float("CLAW_LOAD_SURVIVAL_P95_MS_READ", default=12_000.0)
    a = _env_float("CLAW_LOAD_SURVIVAL_P95_MS_AGREEMENT", default=45_000.0)
    o = _env_float("CLAW_LOAD_SURVIVAL_P95_MS_OPERATOR", default=45_000.0)
    return {"read:": r, "agreement:": a, "operator:": o}


def _ux_p95_limits() -> Dict[str, float]:
    """
    Product-realistic targets (not vanity). Longer prefixes win in harness matching.

    Legacy ``CLAW_LOAD_P95_MS_READ`` / ``_AGREEMENT`` / ``_OPERATOR`` still override UX defaults
    when the newer ``CLAW_LOAD_UX_*`` vars are unset.
    """
    read_fallback = _env_float(
        "CLAW_LOAD_UX_P95_MS_READ",
        "CLAW_LOAD_P95_MS_READ",
        default=2500.0,
    )
    light = _env_float("CLAW_LOAD_UX_P95_MS_READ_LIGHT", default=1000.0)
    readyz = _env_float("CLAW_LOAD_UX_P95_MS_READ_READYZ", default=2500.0)
    agree = _env_float(
        "CLAW_LOAD_UX_P95_MS_AGREEMENT",
        "CLAW_LOAD_P95_MS_AGREEMENT",
        default=12_000.0,
    )
    render = _env_float(
        "CLAW_LOAD_UX_P95_MS_RENDER",
        default=max(agree, 18_000.0),
    )
    proof = _env_float("CLAW_LOAD_UX_P95_MS_PROOF", default=8000.0)
    get_ms = _env_float("CLAW_LOAD_UX_P95_MS_AGREEMENT_GET", default=5000.0)
    op = _env_float(
        "CLAW_LOAD_UX_P95_MS_OPERATOR",
        "CLAW_LOAD_P95_MS_OPERATOR",
        default=15_000.0,
    )
    return {
        "read:/v1/readyz": readyz,
        "read:/v1/healthz": light,
        "read:/v1/version": light,
        "read:": read_fallback,
        "agreement:render": render,
        "agreement:proof-status": proof,
        "agreement:get": get_ms,
        "agreement:": agree,
        "operator:": op,
    }
INTAKE = (
    "Consulting Agreement between Acme Inc and Jane Doe. Jurisdiction Texas. "
    "Purpose: integration testing. Payment: $1000 on delivery. Due date April 30, 2026."
)


def _org_headers(worker_id: int, seq: int) -> Dict[str, str]:
    base = os.environ.get("CLAW_SMOKE_ORG_ID", "loadtest-org").strip() or "loadtest-org"
    oid = f"{base}-w{worker_id}-s{seq}"
    return {"X-Claw-Org-Id": oid}


def _json_headers(worker_id: int, seq: int) -> Dict[str, str]:
    return {**_org_headers(worker_id, seq), "Content-Type": "application/json"}


def _sample(label: str, ms: float, resp: Optional[requests.Response]) -> Sample:
    ok = resp is not None and resp.status_code < 400
    code = resp.status_code if resp is not None else None
    detail = ""
    if resp is not None and not ok:
        detail = (resp.text or "")[:200]
    return Sample(label=label, latency_ms=ms, ok=ok, status_code=code, detail=detail)


def _get(session: requests.Session, base: str, path: str, headers: Dict[str, str]) -> Tuple[str, float, requests.Response]:
    url = f"{base}{path}"
    t0 = time.perf_counter()
    r = session.get(url, headers=headers, timeout=TIMEOUT)
    return path, (time.perf_counter() - t0) * 1000.0, r


def _post(
    session: requests.Session, base: str, path: str, body: Any, headers: Dict[str, str]
) -> Tuple[str, float, requests.Response]:
    url = f"{base}{path}"
    t0 = time.perf_counter()
    r = session.post(url, json=body, headers=headers, timeout=TIMEOUT)
    return path, (time.perf_counter() - t0) * 1000.0, r


def flow_read(
    base: str, worker_id: int, seq: int, session: requests.Session, stats: RunStats
) -> None:
    h = _org_headers(worker_id, seq)
    paths = [
        "/v1/healthz",
        "/v1/version",
        "/v1/readyz",
    ]
    pub = os.environ.get("CLAW_LOAD_PUBLIC_AGREEMENT_ID", "").strip()
    if pub:
        paths.append(f"/api/agreements/public/{pub}/verify")
    fe = os.environ.get("CLAW_FRONTEND_URL", "").strip()
    for path in paths:
        try:
            _, ms, r = _get(session, base, path, h if path.startswith("/api") else {})
            stats.add(_sample(f"read:{path}", ms, r))
        except Exception as e:
            stats.add(Sample(label=f"read:{path}", latency_ms=0.0, ok=False, detail=str(e)[:200]))


def flow_operator(base: str, worker_id: int, seq: int, session: requests.Session, stats: RunStats) -> None:
    secret = os.environ.get("CLAW_ADMIN_SECRET", "").strip()
    if not secret:
        stats.add(
            Sample(
                label="operator:skipped",
                latency_ms=0.0,
                ok=True,
                detail="no CLAW_ADMIN_SECRET",
            )
        )
        return
    path = "/admin/deploy-readiness"
    url = f"{base}{path}"
    t0 = time.perf_counter()
    try:
        r = session.get(
            url,
            headers={"x-claw-admin-secret": secret},
            timeout=TIMEOUT,
        )
        ms = (time.perf_counter() - t0) * 1000.0
        stats.add(_sample("operator:deploy-readiness", ms, r))
    except Exception as e:
        stats.add(Sample(label="operator:deploy-readiness", latency_ms=0.0, ok=False, detail=str(e)[:200]))


def _parse_and_draft(session: requests.Session, base: str, worker_id: int, seq: int, stats: RunStats) -> Optional[str]:
    hj = _json_headers(worker_id, seq)
    try:
        _, ms, r = _post(session, base, "/api/agreements/parse", {"intake_text": INTAKE}, hj)
        stats.add(_sample("agreement:parse", ms, r))
        if r.status_code != 200:
            return None
        parsed = r.json()
        draft_in = parsed.get("draft", parsed)
        if not isinstance(draft_in, dict):
            return None
        _, ms2, r2 = _post(session, base, "/api/agreements/draft", draft_in, hj)
        stats.add(_sample("agreement:draft", ms2, r2))
        if r2.status_code != 200:
            return None
        created = r2.json()
        aid = created.get("id") or created.get("agreement_id") or created.get("draft", {}).get("id")
        return str(aid) if aid else None
    except Exception as e:
        stats.add(Sample(label="agreement:parse", latency_ms=0.0, ok=False, detail=str(e)[:200]))
        return None


def flow_quick_send(base: str, worker_id: int, seq: int, session: requests.Session, stats: RunStats) -> None:
    hj = _json_headers(worker_id, seq)
    aid = _parse_and_draft(session, base, worker_id, seq, stats)
    if not aid:
        return
    updates = [
        ("due_date", "2026-06-01"),
        ("title", "Load test agreement title"),
    ]
    for field, value in updates[:1]:
        try:
            _, ms, r = _post(
                session,
                base,
                f"/api/agreements/{aid}/update-field",
                {"field": field, "value": value},
                hj,
            )
            stats.add(_sample("agreement:update-field", ms, r))
        except Exception as e:
            stats.add(Sample(label="agreement:update-field", latency_ms=0.0, ok=False, detail=str(e)[:200]))
    try:
        _, ms, r = _post(session, base, f"/api/agreements/{aid}/render", {}, hj)
        stats.add(_sample("agreement:render", ms, r))
    except Exception as e:
        stats.add(Sample(label="agreement:render", latency_ms=0.0, ok=False, detail=str(e)[:200]))
    try:
        _, ms, r = _get(session, base, f"/api/agreements/{aid}", hj)
        stats.add(_sample("agreement:get", ms, r))
    except Exception as e:
        stats.add(Sample(label="agreement:get", latency_ms=0.0, ok=False, detail=str(e)[:200]))


def flow_builder(base: str, worker_id: int, seq: int, session: requests.Session, stats: RunStats) -> None:
    hj = _json_headers(worker_id, seq)
    aid = _parse_and_draft(session, base, worker_id, seq, stats)
    if not aid:
        return
    fields = [
        ("due_date", "2026-07-01"),
        ("title", "Builder flow title"),
        ("purpose", "Extended load-test purpose text."),
        ("payment_terms", "Net 30 after invoice."),
        ("jurisdiction", "Delaware"),
    ]
    for field, value in fields:
        try:
            _, ms, r = _post(
                session,
                base,
                f"/api/agreements/{aid}/update-field",
                {"field": field, "value": value},
                hj,
            )
            stats.add(_sample("agreement:update-field", ms, r))
        except Exception as e:
            stats.add(Sample(label="agreement:update-field", latency_ms=0.0, ok=False, detail=str(e)[:200]))
    try:
        _, ms, r = _post(session, base, f"/api/agreements/{aid}/render", {}, hj)
        stats.add(_sample("agreement:render", ms, r))
    except Exception as e:
        stats.add(Sample(label="agreement:render", latency_ms=0.0, ok=False, detail=str(e)[:200]))
    try:
        _, ms, r = _get(session, base, f"/api/agreements/{aid}/proof-status", hj)
        stats.add(_sample("agreement:proof-status", ms, r))
    except Exception as e:
        stats.add(Sample(label="agreement:proof-status", latency_ms=0.0, ok=False, detail=str(e)[:200]))


def flow_mixed(base: str, worker_id: int, seq: int, session: requests.Session, stats: RunStats) -> None:
    r = random.random()
    if r < 0.65:
        flow_read(base, worker_id, seq, session, stats)
    elif r < 0.9:
        flow_quick_send(base, worker_id, seq, session, stats)
    else:
        flow_operator(base, worker_id, seq, session, stats)


def flow_campaign(base: str, worker_id: int, seq: int, session: requests.Session, stats: RunStats) -> None:
    """Many readers, occasional writers (same process; use --mix-read-ratio)."""
    ratio = float(os.environ.get("CLAW_LOAD_CAMPAIGN_READ_RATIO", "0.92"))
    if random.random() < ratio:
        flow_read(base, worker_id, seq, session, stats)
    else:
        flow_quick_send(base, worker_id, seq, session, stats)


SCENARIOS: Dict[str, Callable[..., None]] = {
    "read": flow_read,
    "quick_send": flow_quick_send,
    "builder": flow_builder,
    "operator": flow_operator,
    "mixed": flow_mixed,
    "campaign": flow_campaign,
}


def _one_job(
    base: str,
    scenario: str,
    worker_id: int,
    seq: int,
) -> RunStats:
    stats = RunStats()
    session = requests.Session()
    fn = SCENARIOS[scenario]
    fn(base, worker_id, seq, session, stats)
    return stats


def main(argv: Optional[List[str]] = None) -> int:
    ap = argparse.ArgumentParser(description="LawDog flow-based load test")
    ap.add_argument("--api-base", default=DEFAULT_BASE, help="API origin (default CLAW_API_BASE)")
    ap.add_argument(
        "--scenario",
        choices=sorted(SCENARIOS.keys()),
        required=True,
        help="Flow scenario name",
    )
    ap.add_argument("--workers", type=int, default=10, help="Concurrent workers")
    ap.add_argument("--requests", type=int, default=100, help="Total scenario invocations")
    ap.add_argument(
        "--json-out",
        default="",
        help="Optional path to write summary JSON",
    )
    ap.add_argument(
        "--no-thresholds",
        action="store_true",
        help="Do not fail process on threshold violations (still print)",
    )
    args = ap.parse_args(argv)

    _WRITE_SCENARIOS = {"quick_send", "builder", "mixed", "campaign"}
    if args.scenario in _WRITE_SCENARIOS:
        if os.environ.get("CLAW_LOAD_ALLOW_WRITES", "").strip() not in ("1", "true", "yes"):
            print(
                "Refusing write scenarios without CLAW_LOAD_ALLOW_WRITES=1 "
                "(use staging or explicit non-prod).",
                file=sys.stderr,
            )
            return 2

    base = args.api_base.rstrip("/")
    stats = RunStats()
    t0 = time.perf_counter()

    with ThreadPoolExecutor(max_workers=max(1, args.workers)) as ex:
        futs = []
        for i in range(args.requests):
            wid = i % max(1, args.workers)
            futs.append(ex.submit(_one_job, base, args.scenario, wid, i))
        for fut in as_completed(futs):
            part = fut.result()
            for s in part.samples:
                stats.add(s)

    elapsed = time.perf_counter() - t0
    rows = stats.summary_rows()

    print(f"api_base={base} scenario={args.scenario} workers={args.workers} requests={args.requests}")
    print(f"wall_s={elapsed:.2f} throughput_rps={args.requests / elapsed:.2f} (scenario invocations / wall)")
    print()
    hdr = f"{'label':<40} {'n':>6} {'err%':>7} {'p50':>8} {'p95':>8} {'p99':>8}"
    print(hdr)
    print("-" * len(hdr))
    for row in rows:
        print(
            f"{row['label']:<40} {row['n']:>6} {row['error_rate'] * 100:>6.1f}% "
            f"{row['p50_ms']:>7.0f}ms {row['p95_ms']:>7.0f}ms {row['p99_ms']:>7.0f}ms"
        )

    survival_er = _env_float("CLAW_LOAD_SURVIVAL_MAX_ERROR_RATE", default=0.05)
    ux_er = _env_float(
        "CLAW_LOAD_UX_MAX_ERROR_RATE",
        "CLAW_LOAD_MAX_ERROR_RATE",
        default=0.02,
    )
    survival_limits = _survival_p95_limits()
    ux_limits = _ux_p95_limits()
    surv_ok, ux_ok, surv_p, ux_p = check_two_tier_thresholds(
        rows,
        survival_max_error_rate=survival_er,
        survival_p95_limits=survival_limits,
        ux_max_error_rate=ux_er,
        ux_p95_limits=ux_limits,
    )
    print()
    print("THRESHOLDS (two tiers — survival = stayed up; good_ux = reasonable product feel)")
    if surv_p:
        print("  survival: FAIL")
        for p in surv_p:
            print("   ", p)
    else:
        print("  survival: OK")
    if ux_p:
        print("  good_ux: FAIL (review before launch; not necessarily a crash)")
        for p in ux_p:
            print("   ", p)
    else:
        print("  good_ux: OK")
    print("  Tune: CLAW_LOAD_SURVIVAL_* / CLAW_LOAD_UX_* (legacy CLAW_LOAD_MAX_ERROR_RATE, CLAW_LOAD_P95_MS_* apply to good_ux)")

    out: Dict[str, Any] = {
        "api_base": base,
        "scenario": args.scenario,
        "workers": args.workers,
        "requests": args.requests,
        "wall_s": elapsed,
        "rows": rows,
        "survival_ok": surv_ok,
        "good_ux_ok": ux_ok,
        "survival_problems": surv_p,
        "good_ux_problems": ux_p,
        "threshold_ok": surv_ok and ux_ok,
        "threshold_problems": surv_p + ux_p,
    }
    if args.json_out:
        with open(args.json_out, "w", encoding="utf-8") as f:
            json.dump(out, f, indent=2)
        print(f"\nWrote {args.json_out}")

    if args.no_thresholds:
        return 0
    if not surv_ok:
        return 2
    if not ux_ok:
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
