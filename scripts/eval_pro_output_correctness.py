#!/usr/bin/env python3
"""
Semi-automated Pro output correctness QA from GTM fixtures.

Default: inspect generation_intelligence_brief + degraded fallback document (no OpenAI).
Set CLAW_EVAL_LIVE_PRO=1 and OPENAI_API_KEY to attempt live premium-full-draft (optional).

Writes: qa/results/pro_output_correctness_<YYYY-MM-DD>.md
"""

from __future__ import annotations

import json
import os
import re
import sys
from datetime import date
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

ROOT = Path(__file__).resolve().parents[1]
FIXTURE_DIR = ROOT / "qa" / "fixtures"
RESULTS_DIR = ROOT / "qa" / "results"

SCENARIOS: Tuple[Tuple[str, str], ...] = (
    ("creator-001", "creator-economy-prompts.json"),
    ("messy-004", "messy-prompts.json"),
    ("short-002", "short-prompts.json"),  # saas-001 proxy
    ("contra-001", "contradictory-prompts.json"),
    ("emo-001", "emotional-prompts.json"),
    ("crypto-001", "crypto-prompts.json"),
    ("short-001", "short-prompts.json"),
    ("emo-003", "emotional-prompts.json"),
    ("short-003", "short-prompts.json"),
)


def _load_fixture(fid: str, fname: str) -> Dict[str, Any]:
    rows = json.loads((FIXTURE_DIR / fname).read_text(encoding="utf-8"))
    for row in rows:
        if row.get("id") == fid:
            return row
    raise KeyError(fid)


def _ctx_for_prompt(prompt: str, title: str = ""):
    from backend.routers.agreements_v2_api import AgreementParty, PremiumFullDraftContext

    return PremiumFullDraftContext(
        title=title or "Agreement",
        jurisdiction="",
        parties=[
            AgreementParty(name="Party A", role="party"),
            AgreementParty(name="Party B", role="party"),
        ],
        purpose=prompt[:500],
        payment_terms="",
        duration="",
        agreement_family="services_agreement",
    )


def _infer_title(fid: str, prompt: str, brief: Dict[str, Any]) -> str:
    low = prompt.lower()
    if fid.startswith("creator") or "creator" in (brief.get("situation_line") or "").lower():
        return "Influencer Marketing Agreement"
    if "saas" in fid or "subscription" in low:
        return "SaaS Subscription Agreement"
    if "crypto" in fid or "nft" in low:
        return "Digital Asset License Agreement"
    if "nda" in low or "non-disclosure" in low:
        return "Mutual Non-Disclosure Agreement"
    if "settlement" in (brief.get("situation_line") or "").lower() or "mutual release" in low:
        return "Settlement and Mutual Release Agreement"
    if "consulting" in low:
        return "Consulting Services Agreement"
    return "Commercial Agreement"


def _evaluate(
    fid: str,
    row: Dict[str, Any],
    *,
    live_doc: Optional[str] = None,
    live_meta: Optional[Dict[str, Any]] = None,
) -> Dict[str, Any]:
    if str(ROOT) not in sys.path:
        sys.path.insert(0, str(ROOT))

    from backend.agreements.premium_generation_intelligence import build_premium_generation_intelligence_brief
    from backend.routers.agreements_v2_api import (
        PremiumFullDraftRequest,
        _build_premium_full_draft_fallback_document,
        build_premium_full_draft_user_payload_for_airlock,
    )

    prompt = (row.get("prompt") or "").strip()
    brief = build_premium_generation_intelligence_brief(prompt)
    title = _infer_title(fid, prompt, brief)
    ctx = _ctx_for_prompt(prompt, title)
    body = PremiumFullDraftRequest(intake_text=prompt, context=ctx)
    payload, ctx_dict = build_premium_full_draft_user_payload_for_airlock(body)
    degraded = _build_premium_full_draft_fallback_document(prompt, ctx_dict, "eval_no_llm")

    doc = (live_doc or degraded).strip()
    llm_reviewed = bool(live_doc and live_doc.strip())
    review_mode = "live_pro_llm" if llm_reviewed else "payload_and_degraded_fallback"

    failures: List[str] = []
    fixes: List[str] = []
    low_doc = doc.lower()

    # --- knockout checks ---
    if re.search(r"\[party\s*[ab]\]|\[not yet specified\]|tbd\s*—\s*tbd", doc, re.I):
        failures.append("Placeholder soup in document body")
    if "simplified starter preview" in low_doc:
        failures.append("Starter disclaimer leaked into Pro document")
    if "automated full pass was not available" in low_doc and not llm_reviewed:
        failures.append("Degraded fallback only — not representative of paid Pro LLM output")

    # --- brief vs expectations ---
    sit = (brief.get("situation_line") or "").lower()
    if fid in ("creator-001", "messy-004") and not any(k in sit for k in ("creator", "brand", "ugc")):
        failures.append("Brief situation_line not creator-shaped")
    if fid == "short-002" and not any(k in sit for k in ("software", "subscription", "saas", "b2b")):
        failures.append("Brief situation_line not SaaS-shaped")
    if fid == "crypto-001":
        if not any(k in sit for k in ("crypto", "web3")):
            failures.append("Brief missing cautious crypto/Web3 situation line")
        if re.search(r"\b(guaranteed returns?|investment advice|sec registered)\b", low_doc):
            failures.append("Crypto doc overclaims securities/investment")
    if fid == "emo-001":
        if "calm" not in (brief.get("tone_directive") or "").lower():
            failures.append("Emotional prompt missing calm tone_directive")
        if re.search(r"\b(destroy|ruin|prosecuted to the fullest)\b", low_doc):
            failures.append("Threatening language in document")
    if fid == "contra-001":
        if not brief.get("contradiction_notes"):
            failures.append("Contradiction not surfaced in intelligence brief")
        elif not brief.get("drafting_rule"):
            failures.append("Contradiction without drafting_rule")
        if llm_reviewed and "exclusive" in low_doc and "non-exclusive" in low_doc:
            failures.append("Both exclusive and non-exclusive may be encoded operatively")
    if fid == "emo-003":
        if "settlement" not in sit and "release" not in sit:
            failures.append("Settlement/release situation not detected")
    if fid == "short-001":
        if "confidential" not in sit and "nda" not in sit:
            failures.append("NDA situation not detected in brief")

    # --- title ---
    doc_title_ok = title.lower() in low_doc or low_doc.startswith("#")
    if not doc_title_ok and llm_reviewed:
        failures.append("Inferred title not reflected in document heading")

    # --- executive framing (payload) ---
    exec_line = (payload.get("generation_intelligence_brief") or {}).get("situation_line", "")
    if not exec_line:
        failures.append("Missing situation_line in generation_intelligence_brief")

    # --- degraded substance ---
    if not llm_reviewed:
        if len(doc) < 400:
            failures.append("Degraded document very short")
        if "complete operative commercial terms" in low_doc:
            fixes.append("Run live Pro pass with OPENAI_API_KEY for operative clauses")

    # --- scoring (cap when not live LLM) ---
    correctness = 5
    aha = 5
    if failures:
        correctness = max(1, 5 - min(4, len(failures)))
        aha = max(1, 5 - min(3, len(failures)))
    if not llm_reviewed:
        correctness = min(correctness, 2)
        aha = min(aha, 2)
        would_pay = "no"
    else:
        would_pay = "yes" if correctness >= 4 and aha >= 4 else ("maybe" if correctness >= 3 else "no")

    if not fixes and not llm_reviewed:
        fixes.append("Manual UI pass: same prompt through Pro checkout + rubric scoring")

    return {
        "fixture_id": fid,
        "title": row.get("title", ""),
        "prompt_summary": prompt[:120] + ("…" if len(prompt) > 120 else ""),
        "pro_output_reviewed": "yes" if llm_reviewed else "partial (degraded)",
        "review_mode": review_mode,
        "inferred_title": title,
        "situation_line": brief.get("situation_line", ""),
        "tone_directive": brief.get("tone_directive", ""),
        "contradiction_notes": brief.get("contradiction_notes") or [],
        "must_address": brief.get("must_address") or [],
        "scenario_category": payload.get("scenario_category"),
        "scenario_signals": payload.get("scenario_category_signals") or [],
        "doc_len": len(doc),
        "correctness_score": correctness,
        "aha_score": aha,
        "would_pay_39": would_pay,
        "failures": failures,
        "recommended_fix": "; ".join(fixes[:3]) if fixes else "None for deterministic layer",
        "premium_expectations": row.get("premium_expectations") or [],
        "risk_notes": row.get("risk_notes") or [],
    }


def _try_live_pro(prompt: str, ctx_title: str) -> Tuple[Optional[str], Optional[Dict[str, Any]]]:
    if os.environ.get("CLAW_EVAL_LIVE_PRO") != "1" or not os.environ.get("OPENAI_API_KEY"):
        return None, None
    try:
        from backend.routers.agreements_v2_api import (
            PremiumFullDraftContext,
            PremiumFullDraftRequest,
            premium_full_draft,
        )
        from starlette.requests import Request

        body = PremiumFullDraftRequest(intake_text=prompt, context=_ctx_for_prompt(prompt, ctx_title))
        scope = {"type": "http", "method": "POST", "path": "/api/agreements/premium-full-draft", "headers": []}
        req = Request(scope)
        resp = premium_full_draft(req, body)
        if hasattr(resp, "body"):
            data = json.loads(resp.body)
        else:
            data = resp  # type: ignore
        return str(data.get("document_text") or ""), data
    except Exception as e:
        return None, {"error": str(e)[:200]}


def _render_markdown(results: List[Dict[str, Any]], *, live_available: bool) -> str:
    today = date.today().isoformat()
    lines = [
        f"# Pro Agreement Output Correctness QA — {today}",
        "",
        "## Run metadata",
        "",
        f"| Field | Value |",
        f"|-------|-------|",
        f"| Review mode | {'Live LLM attempted' if live_available else '**Payload + degraded fallback only** (no OPENAI_API_KEY / CLAW_EVAL_LIVE_PRO)'} |",
        f"| Rubric | `docs/PREMIUM_AHA_RUBRIC.md` |",
        f"| Fixtures | `qa/fixtures/` |",
        f"| Scenarios | {len(results)} + recipient-sign (manual) |",
        "",
        "> **Important:** Scores below cap at 2 for correctness/AHA when only degraded fallback was reviewed. "
        "Re-score after live Pro generation in staging.",
        "",
        "## Summary table",
        "",
        "| Fixture | Prompt summary | Pro reviewed? | Correctness | AHA | $39? | Top failure |",
        "|---------|----------------|---------------|-------------|-----|------|-------------|",
    ]
    for r in results:
        fail = (r["failures"] or ["—"])[0][:60]
        lines.append(
            f"| {r['fixture_id']} | {r['prompt_summary'][:50]}… | {r['pro_output_reviewed']} | "
            f"{r['correctness_score']} | {r['aha_score']} | {r['would_pay_39']} | {fail} |"
        )
    lines.extend(["", "## Per-scenario detail", ""])
    for r in results:
        lines.extend(
            [
                f"### {r['fixture_id']} — {r['title']}",
                "",
                f"- **Prompt:** {r['prompt_summary']}",
                f"- **Pro output reviewed:** {r['pro_output_reviewed']} (`{r['review_mode']}`)",
                f"- **Inferred title:** {r['inferred_title']}",
                f"- **Situation line:** {r['situation_line']}",
                f"- **Tone directive:** {r['tone_directive'][:100]}…",
                f"- **Contradictions in brief:** {', '.join(r['contradiction_notes']) or '—'}",
                f"- **must_address:** {', '.join(r['must_address']) or '—'}",
                f"- **scenario:** {r['scenario_category']} / {r['scenario_signals']}",
                f"- **Document length:** {r['doc_len']} chars",
                f"- **Premium expectations:** {', '.join(r['premium_expectations'])}",
                f"- **Correctness (1–5):** {r['correctness_score']}",
                f"- **AHA (1–5):** {r['aha_score']}",
                f"- **Would pay $39?** {r['would_pay_39']}",
                f"- **Failures:**",
            ]
        )
        for f in r["failures"] or ["None noted for deterministic layer"]:
            lines.append(f"  - {f}")
        lines.append(f"- **Recommended fix:** {r['recommended_fix']}")
        lines.append("")
    return "\n".join(lines)


def main() -> int:
    if str(ROOT) not in sys.path:
        sys.path.insert(0, str(ROOT))

    RESULTS_DIR.mkdir(parents=True, exist_ok=True)
    results: List[Dict[str, Any]] = []
    live_any = False

    for fid, fname in SCENARIOS:
        row = _load_fixture(fid, fname)
        brief_pre = {"situation_line": ""}
        title = _infer_title(fid, row["prompt"], brief_pre)
        live_doc, live_meta = _try_live_pro(row["prompt"], title)
        if live_doc:
            live_any = True
        r = _evaluate(fid, row, live_doc=live_doc, live_meta=live_meta)
        results.append(r)

    # Recipient-sign manual placeholder
    results.append(
        {
            "fixture_id": "recipient-sign",
            "title": "Owner send → recipient review/sign",
            "prompt_summary": "MANUAL_QA_RUNBOOK Flow E — requires live deploy",
            "pro_output_reviewed": "no",
            "review_mode": "manual_only",
            "inferred_title": "—",
            "situation_line": "—",
            "tone_directive": "—",
            "contradiction_notes": [],
            "must_address": [],
            "scenario_category": "—",
            "scenario_signals": [],
            "doc_len": 0,
            "correctness_score": "—",
            "aha_score": "—",
            "would_pay_39": "—",
            "failures": ["Not run — requires two devices / incognito recipient link"],
            "recommended_fix": "Execute Flow E; score trust/shareable on recipient readonly",
            "premium_expectations": ["Trust chips", "Inviter context", "Safe-area mobile"],
            "risk_notes": [],
        }
    )

    md = _render_markdown(results, live_available=live_any)
    # Recurring failures appendix
    all_failures: List[str] = []
    for r in results:
        all_failures.extend(r.get("failures") or [])
    md += "\n## Top recurring failures\n\n"
    from collections import Counter

    for msg, count in Counter(all_failures).most_common(8):
        if msg and msg != "None noted for deterministic layer":
            md += f"- ({count}×) {msg}\n"

    md += "\n## Failure taxonomy\n\n"
    md += (
        "| Category | Examples this run |\n"
        "|----------|-------------------|\n"
        "| **Deterministic** | Starter disclaimer leak; placeholder soup; brief detection gaps |\n"
        "| **Prompt/generation instructions** | Contradiction drafting_rule ignored by model; thin crypto calibration |\n"
        "| **Model compliance** | Cannot verify without live LLM — re-run with API key |\n"
        "| **Manual/legal review** | emo-003 HR sensitivity; crypto-001 securities; moral rights nuance |\n"
    )

    md += "\n## Top 3 surgical fixes (recommended, not implemented)\n\n"
    md += (
        "1. **Live Pro scoring pass** — Run `CLAW_EVAL_LIVE_PRO=1` with staging API key; fill scores in this file.\n"
        "2. **Contradiction → model compliance** — Add quality-gate check that operative doc does not contain both exclusive and non-exclusive grants when `contradiction_notes` present.\n"
        "3. **Degraded UX labeling** — Ensure checkout return clearly distinguishes degraded fallback from full Pro so QA/users do not score fallback as $39 value.\n"
    )

    out = RESULTS_DIR / f"pro_output_correctness_{date.today().isoformat()}.md"
    out.write_text(md, encoding="utf-8")
    print(f"Wrote {out}")
    print(f"Live LLM used: {live_any}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
