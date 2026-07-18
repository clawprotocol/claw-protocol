#!/usr/bin/env python3
"""
Post-deploy smoke checks against a running CLAW API (HTTP + optional admin readiness).

Canonical **launch validation order** (automated):

1. ``GET /health`` — process liveness
2. ``GET /v1/readyz`` — configured Postgres domains (503 = not ready)
3. ``GET /admin/deploy-readiness`` — aggregate DB/RPC/queues (needs admin secret)
4. Optional: agreement parse + draft (+ edit when ``CLAW_DEPLOY_SMOKE_EXTENDED=1``)
5. Optional: timeline create + list events (same ``EXTENDED`` flag)
6. Operator/anchor summary: asserted from deploy-readiness payload (step 3)

Then: ``/version``, feed, access policy, public verify, optional frontend HEAD.

Does not broadcast anchor transactions.

Usage:
  export CLAW_API_BASE=https://api.example.com
  export CLAW_ADMIN_SECRET=...   # recommended for steps 3 + 6
  python3 scripts/deploy_smoke.py

Optional:
  CLAW_FRONTEND_URL=https://app.example.com   # HEAD request
  CLAW_SMOKE_TIMEOUT=25
  CLAW_DEPLOY_SMOKE_AGREEMENT_WRITE=1        # non-production: parse + draft only
  CLAW_DEPLOY_SMOKE_EXTENDED=1               # non-production: agreement + update-field + timeline API
  CLAW_ENVIRONMENT=production
  CLAW_DEPLOY_SMOKE_I_UNDERSTAND_PRODUCTION_WRITES=1
  CLAW_DEPLOY_SMOKE_FAIL_ON_OPERATOR_SUMMARY=1  # exit 1 if anchoring_operator_summary is error

See docs/ops/DEPLOY_SMOKE_TEST.md.
"""
from __future__ import annotations

import argparse
import json
import os
import sys
from typing import Any, Dict, List, Optional

try:
    import requests
except ImportError:
    print("ERROR: pip install requests", file=sys.stderr)
    raise SystemExit(2)

DEFAULT_API = os.environ.get("CLAW_API_BASE", "http://127.0.0.1:8000").rstrip("/")
TIMEOUT = float(os.environ.get("CLAW_SMOKE_TIMEOUT", "25"))


def _die(msg: str, **extra: Any) -> None:
    print("DEPLOY_SMOKE_FAIL:", msg, file=sys.stderr)
    if extra:
        print(json.dumps(extra, indent=2), file=sys.stderr)
    raise SystemExit(1)


def _get(
    session: requests.Session, base: str, path: str, *, headers: Optional[Dict[str, str]] = None
) -> requests.Response:
    url = f"{base}{path}"
    try:
        return session.get(url, timeout=TIMEOUT, headers=headers or {})
    except Exception as e:
        _die(f"GET failed {url}: {e}")


def _post_json(
    session: requests.Session,
    base: str,
    path: str,
    body: Dict[str, Any],
    *,
    extra_headers: Optional[Dict[str, str]] = None,
) -> requests.Response:
    url = f"{base}{path}"
    h = {"Content-Type": "application/json"}
    if extra_headers:
        h.update(extra_headers)
    try:
        return session.post(url, json=body, headers=h, timeout=TIMEOUT)
    except Exception as e:
        _die(f"POST failed {url}: {e}")


def _agreement_write_headers() -> Dict[str, str]:
    oid = os.getenv("CLAW_SMOKE_ORG_ID", "deploy-smoke-org").strip() or "deploy-smoke-org"
    return {"X-Claw-Org-Id": oid}


def _post_agreement(
    session: requests.Session, base: str, path: str, body: Dict[str, Any]
) -> requests.Response:
    return _post_json(session, base, path, body, extra_headers=_agreement_write_headers())


def _is_prod() -> bool:
    return os.getenv("CLAW_ENVIRONMENT", "local").strip().lower() in ("production", "prod")


def _truthy(name: str) -> bool:
    return os.getenv(name, "").strip().lower() in ("1", "true", "yes")


def main(argv: List[str]) -> int:
    p = argparse.ArgumentParser(description="CLAW deploy smoke (HTTP checks, canonical launch order).")
    p.add_argument("--api-base", default=DEFAULT_API, help="API origin (default CLAW_API_BASE)")
    p.add_argument(
        "--admin-secret",
        default=os.getenv("CLAW_ADMIN_SECRET", "").strip() or None,
        help="x-claw-admin-secret (default CLAW_ADMIN_SECRET)",
    )
    p.add_argument(
        "--frontend-url",
        default=os.getenv("CLAW_FRONTEND_URL", "").strip() or None,
        help="Optional SPA origin for HEAD check",
    )
    args = p.parse_args(argv)
    base = args.api_base.rstrip("/")
    session = requests.Session()

    deploy_checks: Dict[str, Any] = {}

    # --- STEP 1/6: liveness
    h = _get(session, base, "/health")
    if h.status_code != 200 or not (h.json() or {}).get("ok"):
        _die("step 1/6 GET /health", status=h.status_code, text=h.text[:500])
    print("STEP 1/6 OK: GET /health")

    # --- STEP 2/6: readiness (Postgres domains when configured)
    rz = _get(session, base, "/v1/readyz")
    if rz.status_code != 200:
        _die("step 2/6 GET /v1/readyz", status=rz.status_code, text=rz.text[:800])
    try:
        rz_ok = bool(rz.json().get("ok"))
    except Exception:
        rz_ok = False
    if not rz_ok:
        _die("step 2/6 GET /v1/readyz ok=false", status=rz.status_code, text=rz.text[:800])
    print("STEP 2/6 OK: GET /v1/readyz")

    # --- STEP 3/6 + 6: deploy-readiness (aggregate); operator summary lives here
    if args.admin_secret:
        dr = _get(
            session,
            base,
            "/admin/deploy-readiness",
            headers={"x-claw-admin-secret": args.admin_secret},
        )
        if dr.status_code != 200:
            _die("step 3/6 GET /admin/deploy-readiness", status=dr.status_code, text=dr.text[:2000])
        payload = dr.json()
        deploy_checks = payload.get("checks") or {}
        print("STEP 3/6 OK: GET /admin/deploy-readiness")
        print(json.dumps(deploy_checks, indent=2, sort_keys=True))
        if not payload.get("ok"):
            print(
                "DEPLOY_SMOKE_FAIL: failed_critical_checks:",
                payload.get("failed_critical_checks"),
                file=sys.stderr,
            )
            return 2
    else:
        print(
            "STEP 3/6 SKIP: GET /admin/deploy-readiness (set CLAW_ADMIN_SECRET for full launch validation)"
        )

    # --- STEP 4/6 / 5/6: optional writes (staging)
    agree = _truthy("CLAW_DEPLOY_SMOKE_AGREEMENT_WRITE")
    extended = _truthy("CLAW_DEPLOY_SMOKE_EXTENDED")
    force = os.getenv("CLAW_DEPLOY_SMOKE_I_UNDERSTAND_PRODUCTION_WRITES", "").strip() == "1"
    write_any = agree or extended
    if write_any and _is_prod() and not force:
        print(
            "STEP 4-5/6 SKIP: agreement/timeline writes disabled in production "
            "(set CLAW_DEPLOY_SMOKE_I_UNDERSTAND_PRODUCTION_WRITES=1 to allow)"
        )
    elif extended:
        parse = _post_agreement(
            session,
            base,
            "/api/agreements/parse",
            {
                "intake_text": "CLAW deploy smoke: Acme and Bob agree to 1 USD nominal in Texas for testing."
            },
        )
        if parse.status_code != 200:
            _die("step 4/6 agreements/parse", status=parse.status_code, text=parse.text[:800])
        parsed = parse.json() or {}
        draft_in = parsed.get("draft", parsed)
        if not isinstance(draft_in, dict):
            _die("step 4/6 parse: expected draft object", text=parse.text[:800])
        draft = _post_agreement(session, base, "/api/agreements/draft", draft_in)
        if draft.status_code != 200:
            _die("step 4/6 agreements/draft", status=draft.status_code, text=draft.text[:800])
        aid = (draft.json() or {}).get("id")
        print("STEP 4/6 OK: agreement parse + draft", aid)
        up = _post_agreement(
            session,
            base,
            f"/api/agreements/{aid}/update-field",
            {"field": "due_date", "value": "2026-12-31"},
        )
        if up.status_code != 200:
            _die("step 4/6 agreements/update-field", status=up.status_code, text=up.text[:800])
        print("STEP 4/6 OK: agreement update-field (extended)")

        tl_body = {
            "title": "CLAW deploy smoke timeline",
            "parties": [{"role": "sender", "id": "smoke1", "display_name": "Smoke Party"}],
            "network": "testnet",
        }
        tlr = _post_json(session, base, "/v1/timelines", tl_body)
        if tlr.status_code != 200:
            _die("step 5/6 POST /v1/timelines", status=tlr.status_code, text=tlr.text[:800])
        tl_id = (tlr.json() or {}).get("timeline_id")
        if not tl_id:
            _die("step 5/6 timelines: missing timeline_id", text=tlr.text[:800])
        ev = _get(session, base, f"/v1/timelines/{tl_id}/events")
        if ev.status_code != 200:
            _die("step 5/6 GET timeline events", status=ev.status_code, text=ev.text[:800])
        print("STEP 5/6 OK: timeline create + list events", tl_id)
    elif agree:
        parse = _post_agreement(
            session,
            base,
            "/api/agreements/parse",
            {
                "intake_text": "CLAW deploy smoke: Acme and Bob agree to 1 USD nominal in Texas for testing."
            },
        )
        if parse.status_code != 200:
            _die("step 4/6 agreements/parse", status=parse.status_code, text=parse.text[:800])
        parsed = parse.json() or {}
        draft_in = parsed.get("draft", parsed)
        if not isinstance(draft_in, dict):
            _die("step 4/6 parse: expected draft object", text=parse.text[:800])
        draft = _post_agreement(session, base, "/api/agreements/draft", draft_in)
        if draft.status_code != 200:
            _die("step 4/6 agreements/draft", status=draft.status_code, text=draft.text[:800])
        aid = (draft.json() or {}).get("id")
        print("STEP 4/6 OK: agreement parse + draft", aid)
        print("STEP 5/6 SKIP: set CLAW_DEPLOY_SMOKE_EXTENDED=1 for timeline/proof-spine API smoke")
    else:
        print(
            "STEP 4/6 SKIP: set CLAW_DEPLOY_SMOKE_AGREEMENT_WRITE=1 or CLAW_DEPLOY_SMOKE_EXTENDED=1"
        )
        print("STEP 5/6 SKIP: (requires CLAW_DEPLOY_SMOKE_EXTENDED=1)")

    # --- STEP 6/6: operator / anchor summary (from step 3 payload)
    if args.admin_secret:
        aos = deploy_checks.get("anchoring_operator_summary")
        ok_summary = isinstance(aos, dict) and aos.get("status") != "error"
        if ok_summary:
            print("STEP 6/6 OK: checks.anchoring_operator_summary present (no error status)")
        else:
            msg = "STEP 6/6 WARN: anchoring_operator_summary missing or error — inspect JSON above"
            print(msg, file=sys.stderr)
            if _truthy("CLAW_DEPLOY_SMOKE_FAIL_ON_OPERATOR_SUMMARY"):
                return 1
    else:
        print("STEP 6/6 SKIP: requires CLAW_ADMIN_SECRET (same as step 3)")

    # --- Build fingerprint (after numbered gates 1–6)
    v = _get(session, base, "/version")
    if v.status_code != 200:
        _die("GET /version", status=v.status_code)
    print("OK: GET /version")

    # --- Additional surface checks (after canonical steps)
    fr = _get(session, base, "/api/feed/public")
    if fr.status_code == 200:
        print("OK: /api/feed/public (enabled)")
    elif fr.status_code == 404:
        print("SKIP: /api/feed/public (disabled or not_found — expected if CLAW_FEED_PUBLIC_API_ENABLED=0)")
    else:
        _die("feed public unexpected status", status=fr.status_code, text=fr.text[:500])

    pol = _get(session, base, "/api/agreements/access/policy")
    if pol.status_code != 200:
        _die("access policy", status=pol.status_code)
    print("OK: /api/agreements/access/policy")

    bad = _get(session, base, "/api/agreements/access/validate?token=not-a-valid-token")
    if bad.status_code == 503:
        _die("signing token secret not configured on server", status=503)
    if bad.status_code not in (400, 401, 403, 422):
        _die(
            "access validate should reject garbage token with client error",
            status=bad.status_code,
            text=bad.text[:500],
        )
    print("OK: /api/agreements/access/validate rejects invalid token")

    pv = _get(session, base, "/api/agreements/public/__smoke_missing__/verify")
    if pv.status_code not in (200, 404):
        _die("public verify route", status=pv.status_code, text=pv.text[:500])
    print("OK: /api/agreements/public/{id}/verify reachable")

    # --- Optional: v1 healthz alias (load balancers often use this path)
    hz = _get(session, base, "/v1/healthz")
    if hz.status_code != 200 or not (hz.json() or {}).get("ok"):
        _die("GET /v1/healthz", status=hz.status_code, text=hz.text[:300])
    print("OK: GET /v1/healthz (alias liveness)")

    if args.frontend_url:
        try:
            fh = session.head(args.frontend_url.rstrip("/"), timeout=TIMEOUT, allow_redirects=True)
            if fh.status_code >= 400:
                _die("frontend HEAD", url=args.frontend_url, status=fh.status_code)
            print("OK: frontend HEAD", args.frontend_url)
        except Exception as e:
            _die(f"frontend HEAD {e}", url=args.frontend_url)

    if _is_prod():
        legacy_checks = [
            ("POST", "/v1/workflow/demo/run", {"timeline_id": "smoke-legacy"}),
            ("POST", "/v1/agreements/create", {"title": "smoke"}),
            ("POST", "/v1/esign/create", {"document_title": "smoke"}),
            ("POST", "/agent/propose", {"clauses": [], "role": "sender"}),
        ]
        for method, path, body in legacy_checks:
            if method == "POST":
                resp = _post_json(session, base, path, body)
            else:
                resp = _get(session, base, path)
            if resp.status_code != 404:
                _die(
                    "production legacy/demo containment",
                    method=method,
                    path=path,
                    status=resp.status_code,
                    text=resp.text[:500],
                )
        print("OK: production rejects representative legacy/demo writes (404)")

    print("DEPLOY_SMOKE_DONE: automated launch sequence complete")
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
