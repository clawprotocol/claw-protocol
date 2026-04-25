#!/usr/bin/env python3
"""
Smoke test for CLAW Agreements v2 API.

Runs:
1) POST /api/agreements/parse
2) POST /api/agreements/draft
3) POST /api/agreements/{id}/update-field
4) POST /api/agreements/{id}/render  (assert no template leakage)
5) POST /api/agreements/{id}/export-docx (stub-safe: assert HTTP 200)
6) GET /api/agreements/{id} (sanity)

Usage:
  python3 scripts/smoke_agreements_v2.py

Optional env:
  CLAW_API_BASE=http://127.0.0.1:8000
  CLAW_SMOKE_TIMEOUT=20
"""
from __future__ import annotations

import json
import os
import sys
import time
from typing import Any, Dict, Optional

try:
    import requests
except ImportError:
    print(
        "ERROR: Missing dependency 'requests'. Install with: python -m pip install requests",
        file=sys.stderr,
    )
    sys.exit(2)


API_BASE = os.environ.get("CLAW_API_BASE", "http://127.0.0.1:8000").rstrip("/")
TIMEOUT = float(os.environ.get("CLAW_SMOKE_TIMEOUT", "20"))
WORKSPACE_HEADERS = {
    "X-Claw-Org-Id": (os.environ.get("CLAW_SMOKE_ORG_ID", "smoke-org").strip() or "smoke-org"),
}
JSON_HEADERS = {**WORKSPACE_HEADERS, "Content-Type": "application/json"}


def _die(msg: str, resp: Optional["requests.Response"] = None) -> None:
    print("\n❌ SMOKE FAILED:", msg, file=sys.stderr)
    if resp is not None:
        print(f"HTTP {resp.status_code} {resp.request.method} {resp.url}", file=sys.stderr)
        ct = resp.headers.get("content-type", "")
        print("Response headers:", dict(resp.headers), file=sys.stderr)
        if "application/json" in ct:
            try:
                print("Response JSON:", json.dumps(resp.json(), indent=2), file=sys.stderr)
            except Exception:
                print("Response text:", resp.text[:2000], file=sys.stderr)
        else:
            print("Response text:", resp.text[:2000], file=sys.stderr)
    sys.exit(1)


def _post(path: str, payload: Dict[str, Any]) -> "requests.Response":
    url = f"{API_BASE}{path}"
    try:
        return requests.post(url, json=payload, headers=JSON_HEADERS, timeout=TIMEOUT)
    except Exception as e:
        _die(f"Request error POST {url}: {e}")


def _get(path: str) -> "requests.Response":
    url = f"{API_BASE}{path}"
    try:
        return requests.get(url, headers=WORKSPACE_HEADERS, timeout=TIMEOUT)
    except Exception as e:
        _die(f"Request error GET {url}: {e}")


def _assert_status(resp: "requests.Response", expected: int, label: str) -> None:
    if resp.status_code != expected:
        _die(f"{label}: expected HTTP {expected}, got {resp.status_code}", resp)


def _json(resp: "requests.Response") -> Dict[str, Any]:
    try:
        return resp.json()
    except Exception:
        _die("Expected JSON response but could not parse JSON.", resp)
    raise RuntimeError("unreachable")


def main() -> None:
    print("🔎 CLAW Agreements v2 smoke test")
    print(f"API_BASE={API_BASE}")

    intake = (
        "Consulting Agreement between Acme Inc (hiring company) and John Smith (consultant). "
        "Jurisdiction Oklahoma. Purpose: financial modeling work. "
        "Payment: $500 due on signing, $2000 upon delivery. Weekly email updates required. "
        "Due date March 31, 2026."
    )

    # 1) parse
    print("\n1) POST /api/agreements/parse")
    # IMPORTANT: API expects 'intake_text' (not 'text')
    r_parse = _post("/api/agreements/parse", {"intake_text": intake})
    _assert_status(r_parse, 200, "parse")
    parsed = _json(r_parse)

    # Many implementations return either {draft:{...}} or the fields directly.
    draft_in = parsed.get("draft", parsed)
    if not isinstance(draft_in, dict):
        _die("parse: expected object or {draft:{...}} response shape", r_parse)

    # Minimal required keys (best-effort; allow TBD/null)
    for k in ("title", "jurisdiction", "parties", "purpose"):
        if k not in draft_in:
            _die(f"parse: missing key '{k}' in parsed draft", r_parse)

    # 2) draft create
    print("\n2) POST /api/agreements/draft")
    r_draft = _post("/api/agreements/draft", draft_in)
    _assert_status(r_draft, 200, "draft")
    created = _json(r_draft)

    agreement_id = created.get("id") or created.get("agreement_id") or created.get("draft", {}).get("id")
    if not agreement_id:
        _die("draft: could not find agreement id in response", r_draft)

    print(f"   ✅ created id={agreement_id}")

    # 3) update-field (due_date)
    print("\n3) POST /api/agreements/{id}/update-field (due_date)")
    new_due = "2026-03-15"
    r_upd = _post(f"/api/agreements/{agreement_id}/update-field", {"field": "due_date", "value": new_due})
    _assert_status(r_upd, 200, "update-field")
    upd = _json(r_upd)

    # Validate update stuck (best-effort)
    upd_draft = upd.get("draft", upd)
    if isinstance(upd_draft, dict):
        got_due = upd_draft.get("due_date")
        if got_due is not None and str(got_due) != new_due:
            _die(f"update-field: due_date mismatch. expected {new_due}, got {got_due}", r_upd)

    print("   ✅ updated due_date")

    # 4) render (no leakage)
    print("\n4) POST /api/agreements/{id}/render")
    r_render = _post(f"/api/agreements/{agreement_id}/render", {})
    _assert_status(r_render, 200, "render")
    rendered = _json(r_render)

    # Common shapes: {rendered_html:"..."} or {html:"..."} or {rendered:"..."} or {content:"..."}
    html = (
        rendered.get("rendered_html")
        or rendered.get("html")
        or rendered.get("rendered")
        or rendered.get("content")
    )
    if not isinstance(html, str) or not html.strip():
        _die("render: could not find rendered html/content string in response", r_render)

    bad_markers = [
        "Template Body:",
        "template_body",
        "Template Body: true",
        "Template Body: false",
    ]
    for m in bad_markers:
        if m.lower() in html.lower():
            _die(f"render: leakage marker found in output: {m}", r_render)

    print("   ✅ render ok (no template leakage markers)")

    # 5) export-docx (stub-safe)
    print("\n5) POST /api/agreements/{id}/export-docx")
    r_docx = _post(f"/api/agreements/{agreement_id}/export-docx", {})
    if r_docx.status_code != 200:
        _die("export-docx: expected HTTP 200", r_docx)

    ct = r_docx.headers.get("content-type", "").lower()
    if "application/json" in ct:
        data = _json(r_docx)
        # allow stub-safe responses
        ok_keys = ("download_url", "path", "note", "status")
        if not any(k in data for k in ok_keys):
            print("   ⚠️ export-docx returned JSON but without expected keys; still HTTP 200 (ok for stub).")
        else:
            print("   ✅ export-docx ok (json response)")
    else:
        # likely a file stream
        size = len(r_docx.content or b"")
        if size < 50:
            print("   ⚠️ export-docx returned non-JSON but very small payload; check implementation.")
        else:
            print(f"   ✅ export-docx ok (non-json payload, {size} bytes)")

    # 6) GET fetch check
    print("\n6) GET /api/agreements/{id} (sanity)")
    r_get = _get(f"/api/agreements/{agreement_id}")
    _assert_status(r_get, 200, "get")
    _json(r_get)
    print("   ✅ get ok")

    print("\n✅ SMOKE PASSED")
    print(f"Agreement ID: {agreement_id}")
    print("Next: polish Review UX + add finalize validation gating + wire this into scripts/test.sh")


if __name__ == "__main__":
    t0 = time.time()
    main()
    dt = time.time() - t0
    print(f"\n⏱️ Done in {dt:.2f}s")