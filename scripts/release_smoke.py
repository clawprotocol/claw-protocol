#!/usr/bin/env python3
"""
LawDog post-deploy release smoke (Genesis Referral + core availability).

No real Stripe payment. Safe to run against staging/production API + optional SPA.

Usage:
  export CLAW_API_BASE=https://api.example.com
  export CLAW_FRONTEND_URL=https://app.example.com   # optional
  export CLAW_ADMIN_SECRET=...                       # optional (ops + CSV checks)
  python3 scripts/release_smoke.py

Optional:
  CLAW_RELEASE_SMOKE_STRIPE_DEV=1   # POST unsigned invoice.paid (local/dev/test API only)
  CLAW_ENVIRONMENT=production       # blocks unsigned Stripe unless CLAW_STRIPE_WEBHOOK_DEV_UNSIGNED on API
"""
from __future__ import annotations

import json
import os
import sys
import uuid
from typing import Any, Dict, List, Optional

try:
    import requests
except ImportError:
    print("ERROR: pip install requests", file=sys.stderr)
    raise SystemExit(2)

DEFAULT_API = os.environ.get("CLAW_API_BASE", "http://127.0.0.1:8000").rstrip("/")
TIMEOUT = float(os.environ.get("CLAW_SMOKE_TIMEOUT", "25"))


def _fail(msg: str, **extra: Any) -> None:
    print("RELEASE_SMOKE_FAIL:", msg, file=sys.stderr)
    if extra:
        print(json.dumps(extra, indent=2), file=sys.stderr)
    raise SystemExit(1)


def _ok(msg: str) -> None:
    print("OK:", msg)


def _get(session: requests.Session, base: str, path: str, **kwargs: Any) -> requests.Response:
    try:
        return session.get(f"{base}{path}", timeout=TIMEOUT, **kwargs)
    except Exception as e:
        _fail(f"GET {path}: {e}")


def _post(session: requests.Session, base: str, path: str, body: Dict[str, Any], **kwargs: Any) -> requests.Response:
    try:
        h = {"Content-Type": "application/json"}
        h.update(kwargs.pop("headers", {}) or {})
        return session.post(f"{base}{path}", json=body, headers=h, timeout=TIMEOUT, **kwargs)
    except Exception as e:
        _fail(f"POST {path}: {e}")


def check_health(session: requests.Session, base: str) -> None:
    r = _get(session, base, "/health")
    if r.status_code != 200:
        _fail("/health status", status=r.status_code, text=r.text[:400])
    if not (r.json() or {}).get("ok"):
        _fail("/health ok=false", body=r.text[:400])
    _ok("GET /health")


def check_readyz(session: requests.Session, base: str) -> None:
    r = _get(session, base, "/v1/readyz")
    if r.status_code == 503:
        print("WARN: GET /v1/readyz returned 503 — Postgres domain not ready (see checks)", file=sys.stderr)
        return
    if r.status_code != 200 or not (r.json() or {}).get("ok"):
        _fail("/v1/readyz", status=r.status_code, text=r.text[:600])
    _ok("GET /v1/readyz")


def check_genesis_capture_soft_fail(session: requests.Session, base: str) -> None:
    r = _post(
        session,
        base,
        "/v1/genesis-referral/capture",
        {
            "referral_code": "NOTAREALCODE",
            "visitor_id": f"vis_release_smoke_{uuid.uuid4().hex[:12]}",
            "source_path": "/app/create",
        },
    )
    if r.status_code == 404:
        _fail(
            "POST /v1/genesis-referral/capture returned 404 — Genesis API router not deployed on this API",
            hint="Commit and deploy backend genesis_referral_api + dependencies",
        )
    if r.status_code != 200:
        _fail("capture status", status=r.status_code, text=r.text[:400])
    body = r.json()
    if body.get("ok") is not False:
        _fail("capture expected ok:false for unknown code", body=body)
    _ok("POST /v1/genesis-referral/capture soft-fail (unknown code)")


def check_checkout_metadata(session: requests.Session, base: str) -> None:
    r = _post(
        session,
        base,
        "/v1/genesis-referral/checkout-metadata",
        {
            "org_id": "release-smoke-org",
            "referral_code": "GENESISDOG",
            "visitor_id": "vis_release_smoke_checkout",
            "plan_code": "pro",
        },
    )
    if r.status_code == 404:
        _fail("POST /v1/genesis-referral/checkout-metadata 404 — backend not deployed")
    if r.status_code != 200:
        _fail("checkout-metadata", status=r.status_code, text=r.text[:400])
    md = (r.json() or {}).get("metadata") or {}
    for key in ("org_id", "claw_org_id", "plan_code", "visitor_id", "referral_code"):
        if key not in md:
            _fail(f"checkout-metadata missing {key}", metadata=md)
    if md.get("plan_code") != "pro":
        _fail("plan_code must be pro", metadata=md)
    _ok("POST /v1/genesis-referral/checkout-metadata (pro + referral fields)")


def check_ops_protected(session: requests.Session, base: str, admin_secret: Optional[str]) -> None:
    r = _get(session, base, "/v1/genesis-referral/ops/summary")
    if r.status_code != 403:
        _fail("ops/summary must be 403 without admin secret", status=r.status_code)
    _ok("GET /v1/genesis-referral/ops/summary forbidden without secret")
    if admin_secret:
        r2 = _get(
            session,
            base,
            "/v1/genesis-referral/ops/summary",
            headers={"x-claw-admin-secret": admin_secret},
        )
        if r2.status_code != 200:
            _fail("ops/summary with secret", status=r2.status_code, text=r2.text[:400])
        _ok("GET /v1/genesis-referral/ops/summary with admin secret")
        r3 = _get(
            session,
            base,
            "/v1/genesis-referral/ops/commissions/export.csv",
            headers={"x-claw-admin-secret": admin_secret},
        )
        if r3.status_code != 200 or "text/csv" not in (r3.headers.get("content-type") or ""):
            _fail("ops CSV export", status=r3.status_code, content_type=r3.headers.get("content-type"))
        if "referrer_user_id" not in (r3.text.split("\n")[0] if r3.text else ""):
            _fail("CSV missing expected headers")
        _ok("GET /v1/genesis-referral/ops/commissions/export.csv")


def check_stripe_webhook_dev(session: requests.Session, base: str) -> None:
    if os.getenv("CLAW_RELEASE_SMOKE_STRIPE_DEV", "").strip() not in ("1", "true", "yes"):
        print("SKIP: Stripe webhook simulation (set CLAW_RELEASE_SMOKE_STRIPE_DEV=1)")
        return
    inv_id = f"in_release_smoke_{uuid.uuid4().hex[:8]}"
    event = {
        "id": f"evt_release_{uuid.uuid4().hex[:8]}",
        "type": "invoice.paid",
        "data": {
            "object": {
                "id": inv_id,
                "customer": "cus_release_smoke",
                "amount_paid": 3900,
                "metadata": {
                    "org_id": "org_release_smoke",
                    "referral_code": "GENESISDOG",
                    "plan_code": "pro",
                },
                "subscription": None,
            }
        },
    }
    r = _post(session, base, "/webhook/stripe", event)
    if r.status_code == 503:
        print("SKIP: Stripe webhook not configured (STRIPE_WEBHOOK_SECRET unset on API)")
        return
    if r.status_code not in (200, 401):
        _fail("POST /webhook/stripe", status=r.status_code, text=r.text[:400])
    if r.status_code == 401:
        print("SKIP: Stripe webhook requires signature (expected in production)")
        return
    _ok("POST /webhook/stripe accepted (dev/unsigned or signed)")


def check_frontend_routes(session: requests.Session, frontend: str) -> None:
    paths = ["/", "/app/create", "/app/genesis-referral", "/app/ops/genesis-referral"]
    for path in paths:
        url = f"{frontend.rstrip('/')}{path}"
        try:
            r = session.get(url, timeout=TIMEOUT, allow_redirects=True)
        except Exception as e:
            _fail(f"frontend GET {path}: {e}")
        if r.status_code >= 500:
            _fail(f"frontend {path} status {r.status_code}")
    _ok(f"frontend routes reachable: {', '.join(paths)}")


def main() -> int:
    base = os.environ.get("CLAW_API_BASE", DEFAULT_API).rstrip("/")
    frontend = os.environ.get("CLAW_FRONTEND_URL", "").strip() or None
    admin = os.environ.get("CLAW_ADMIN_SECRET", "").strip() or None
    session = requests.Session()

    print(f"Release smoke API: {base}")
    check_health(session, base)
    check_readyz(session, base)
    check_genesis_capture_soft_fail(session, base)
    check_checkout_metadata(session, base)
    check_ops_protected(session, base, admin)
    check_stripe_webhook_dev(session, base)
    if frontend:
        print(f"Release smoke frontend: {frontend}")
        check_frontend_routes(session, frontend)
    else:
        print("SKIP: frontend routes (set CLAW_FRONTEND_URL)")
    print("RELEASE_SMOKE_PASS")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
