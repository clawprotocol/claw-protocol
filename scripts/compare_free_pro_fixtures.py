#!/usr/bin/env python3
"""
Dry-run Free vs Pro fixture QA harness for LawDog.

Loads priority qa/fixtures/*.json prompts, prints manual checks, and runs
deterministic Pro intelligence-brief assertions. No OpenAI calls by default.

Usage:
  python3 scripts/compare_free_pro_fixtures.py
  CLAW_COMPARE_LIVE=1 CLAW_API_BASE=http://127.0.0.1:8000 python3 scripts/compare_free_pro_fixtures.py --live
"""

from __future__ import annotations

import argparse
import json
import os
import sys
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

ROOT = Path(__file__).resolve().parents[1]
FIXTURE_DIR = ROOT / "qa" / "fixtures"

# Top-priority side-by-side manual scenarios (recipient-sign is manual-only).
PRIORITY_FIXTURE_IDS: Tuple[str, ...] = (
    "creator-001",
    "messy-004",
    "short-002",  # SaaS one-liner; GTM saas-001 is similar
    "contra-001",
    "emo-001",
    "crypto-001",
    "short-001",
    "emo-003",  # settlement / mutual release
    "short-003",  # consulting / payment
)

MANUAL_ONLY = (
    ("recipient-sign", "MANUAL_QA_RUNBOOK.md Flow E — owner send → recipient link → sign/review"),
)

FREE_CHECKS = [
    "Starter preview only (no POST /premium-full-draft)",
    "Must NOT contain: This LawDog Pro agreement",
    "Must NOT contain Pro executive framing callout text",
    "Tier disclaimer may appear in UI chrome (proConversionCopy), not required in preview body",
]

PRO_CHECKS = [
    "Full document via premium-full-draft (live) or degraded fallback",
    "generation_intelligence_brief present on request payload (deterministic)",
    "No simplified starter preview disclaimer on readonly/PDF HTML",
    "Executive framing / contradiction callout when situation profile applies",
    "Score with docs/PREMIUM_AHA_RUBRIC.md",
]


def _load_fixtures() -> Dict[str, Dict[str, Any]]:
    by_id: Dict[str, Dict[str, Any]] = {}
    for path in sorted(FIXTURE_DIR.glob("*.json")):
        rows = json.loads(path.read_text(encoding="utf-8"))
        if not isinstance(rows, list):
            continue
        for row in rows:
            fid = str(row.get("id") or "").strip()
            if fid:
                by_id[fid] = {**row, "_file": path.name}
    return by_id


def _brief_checks(prompt: str) -> Dict[str, Any]:
    from backend.agreements.premium_generation_intelligence import build_premium_generation_intelligence_brief

    brief = build_premium_generation_intelligence_brief(prompt)
    low = prompt.lower()
    return {
        "situation_line": brief.get("situation_line", ""),
        "tone_has_calm": "calm" in (brief.get("tone_directive") or "").lower(),
        "contradiction_count": len(brief.get("contradiction_notes") or []),
        "must_address": brief.get("must_address") or [],
        "has_drafting_rule": bool(brief.get("drafting_rule")),
        "crypto_line": "crypto" in (brief.get("situation_line") or "").lower()
        or "web3" in (brief.get("situation_line") or "").lower(),
        "creator_line": any(
            k in (brief.get("situation_line") or "").lower()
            for k in ("creator", "brand", "ugc", "deliverable")
        ),
        "saas_line": any(
            k in (brief.get("situation_line") or "").lower()
            for k in ("software", "subscription", "saas", "b2b")
        ),
        "settlement_line": any(
            k in (brief.get("situation_line") or "").lower() for k in ("settlement", "release")
        ),
        "nda_line": any(
            k in (brief.get("situation_line") or "").lower() for k in ("confidential", "nda")
        ),
        "emotional_calm": "scared" in low or "ghost" in low,
    }


def _print_scenario(fid: str, row: Dict[str, Any], brief_info: Dict[str, Any]) -> None:
    print(f"\n{'=' * 72}")
    print(f"  {fid} — {row.get('title', '')}")
    print(f"  Source: qa/fixtures/{row.get('_file', '?')}")
    print(f"  Tags: {', '.join(row.get('tags') or [])}")
    print(f"{'=' * 72}")
    prompt = (row.get("prompt") or "").strip()
    print(f"\nPrompt ({len(prompt)} chars):\n  {prompt[:280]}{'…' if len(prompt) > 280 else ''}\n")
    print("Expected premium_expectations:")
    for exp in row.get("premium_expectations") or []:
        print(f"  • {exp}")
    print("\n--- Free path checks (manual) ---")
    for c in FREE_CHECKS:
        print(f"  [ ] {c}")
    print("\n--- Pro path checks (manual + brief) ---")
    for c in PRO_CHECKS:
        print(f"  [ ] {c}")
    print("\n--- Deterministic intelligence brief (no LLM) ---")
    print(f"  situation_line: {brief_info.get('situation_line', '')[:120]}…")
    print(f"  must_address: {', '.join(brief_info.get('must_address') or []) or '(none)'}")
    print(f"  contradictions: {brief_info.get('contradiction_count', 0)}")
    if brief_info.get("has_drafting_rule"):
        print("  drafting_rule: yes")
    if brief_info.get("emotional_calm"):
        print(f"  tone_calm_expected: {brief_info.get('tone_has_calm')}")


def _maybe_live_compare(api_base: str, fixture_id: str, prompt: str) -> None:
    """Optional: POST parse basic + premium-full-draft. Requires running API + key."""
    try:
        import urllib.request

        base = api_base.rstrip("/")
        parse_body = json.dumps({"intake_text": prompt, "ai_model_class": "basic"}).encode()
        req = urllib.request.Request(
            f"{base}/api/agreements/parse",
            data=parse_body,
            headers={"Content-Type": "application/json"},
            method="POST",
        )
        with urllib.request.urlopen(req, timeout=120) as resp:
            parse_data = json.loads(resp.read().decode())
        print(f"  [live] basic parse OK — title: {(parse_data.get('title') or '')[:60]}")
        # Full draft omitted by default in --live to avoid surprise spend; enable with CLAW_COMPARE_LIVE_FULL=1
        if os.environ.get("CLAW_COMPARE_LIVE_FULL") == "1":
            print("  [live] premium-full-draft skipped in script — use app UI for Pro body QA")
    except Exception as e:
        print(f"  [live] skipped ({fixture_id}): {e}")


def main() -> int:
    parser = argparse.ArgumentParser(description="Free vs Pro fixture QA harness (dry-run default)")
    parser.add_argument(
        "--live",
        action="store_true",
        help="Call local /parse basic only when CLAW_COMPARE_LIVE=1 or flag set",
    )
    parser.add_argument(
        "--ids",
        nargs="*",
        default=list(PRIORITY_FIXTURE_IDS),
        help="Fixture IDs to include (default: priority list)",
    )
    args = parser.parse_args()
    live = args.live or os.environ.get("CLAW_COMPARE_LIVE") == "1"
    api_base = os.environ.get("CLAW_API_BASE", "http://127.0.0.1:8000")

    if str(ROOT) not in sys.path:
        sys.path.insert(0, str(ROOT))

    fixtures = _load_fixtures()
    print("LawDog Free vs Pro — fixture QA harness (dry-run)")
    print(f"Fixtures loaded: {len(fixtures)} from {FIXTURE_DIR}")
    print(f"Mode: {'live parse (basic only)' if live else 'dry-run — no API calls'}\n")

    missing = [fid for fid in args.ids if fid not in fixtures]
    if missing:
        print(f"WARNING: missing fixture IDs: {', '.join(missing)}", file=sys.stderr)

    for fid in args.ids:
        row = fixtures.get(fid)
        if not row:
            continue
        brief_info = _brief_checks(row["prompt"])
        _print_scenario(fid, row, brief_info)
        if live:
            _maybe_live_compare(api_base, fid, row["prompt"])

    print(f"\n{'=' * 72}")
    print("Manual-only scenarios:")
    for mid, note in MANUAL_ONLY:
        print(f"  • {mid}: {note}")
    print("\nLog results: copy qa/FREE_VS_PRO_RESULTS_TEMPLATE.md → qa/results/")
    print("Runbook: docs/FREE_VS_PRO_OUTPUT_QA.md")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
