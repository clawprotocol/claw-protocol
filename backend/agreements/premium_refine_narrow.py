"""
Narrow premium-refine amendments: insert or anchor-patch without full-document replacement.

Stdlib only — safe to import from ``agreements_v2_api`` (no third-party deps here).
"""

from __future__ import annotations

import json
import re
from typing import Any, Callable, Dict, List, Optional, Tuple

LATE_FEE_PARAGRAPH_DEFAULT = (
    "Late Payment. Any undisputed amount not paid within ten (10) days after it becomes due may accrue "
    "a late fee equal to five percent (5%) of the overdue amount, unless prohibited by applicable law."
)

NARROW_PATCH_SYSTEM = (
    "You are a surgical contract editor in CLAW (a product, not a law firm). The user asked for a "
    "**small amendment** to an existing agreement. The full text is in JSON field `current_document_text`.\n"
    "Return ONLY valid JSON (no markdown fences) with **exact** keys:\n"
    '{ "anchor": string, "new_paragraph": string }\n'
    "Rules:\n"
    "- `anchor` MUST be an **exact** contiguous substring copied from `current_document_text`, length 40–320 characters, "
    "and it MUST appear **exactly once** in that document. Pick an anchor that ends at a natural boundary (end of a "
    "sentence or line) inside the most relevant existing section.\n"
    "- `new_paragraph` is plain text (no HTML) to insert **immediately after** the anchor. Do not repeat the anchor.\n"
    "- Do not summarize or replace the agreement. Do not return `updated_document_text`.\n"
    "- Stay faithful to the user's request and existing party names and economics.\n"
)


def _strip_code_fence_json(raw: str) -> str:
    text = (raw or "").strip()
    if text.startswith("```"):
        lines = text.splitlines()
        if lines:
            lines = lines[1:]
        if lines and lines[-1].strip().startswith("```"):
            lines = lines[:-1]
        text = "\n".join(lines).strip()
    if not text.startswith("{") or not text.endswith("}"):
        start = text.find("{")
        end = text.rfind("}")
        if start >= 0 and end > start:
            text = text[start : end + 1]
    return text


def _safe_json_dict(text: str) -> Optional[Dict[str, Any]]:
    try:
        d = json.loads(_strip_code_fence_json(text))
    except (json.JSONDecodeError, ValueError):
        return None
    if not isinstance(d, dict):
        return None
    return d


CLIENT_DELIVERABLES_FINAL_PAYMENT_CLAUSE = (
    "Final payment is due after final delivery and Client approval of the deliverables, "
    "or deemed acceptance under Section 3.4. Client may not unreasonably withhold approval "
    "for deliverables that materially conform to the agreed scope."
)


def _classify_payment_timing_pause(p: str) -> bool:
    """Net / invoice timing plus pause or overdue-days — narrow payment edit (not generic late-fee %)."""
    has_net = bool(re.search(r"\bnet\s*(?:\d+|thirty|forty[-\s]?five|sixty)\b", p))
    if not has_net:
        return False
    has_pause_work = bool(
        re.search(
            r"\bpause\b.*\b(work|services|performance)\b|\bsuspend\b.*\b(work|services|performance)\b",
            p,
        )
    )
    has_days_risk = bool(re.search(r"\b\d+\s*days?\b", p)) and bool(
        re.search(r"\b(late|overdue|unpaid|past\s+due|after)\b", p)
    )
    return bool(has_pause_work and (has_days_risk or "invoice" in p or "payment" in p))


def _parse_net_and_pause_days(user_prompt: str) -> Tuple[int, int]:
    p = user_prompt or ""
    net_m = re.search(r"net\s*(\d+)", p, re.I)
    if net_m:
        net_days = int(net_m.group(1))
    elif re.search(r"net\s+thirty\b", p, re.I):
        net_days = 30
    else:
        net_m2 = re.search(r"net\s*(?:forty[-\s]?five|45)\b", p, re.I)
        net_days = 45 if net_m2 else 30
    pause_m = re.search(
        r"(?:more\s+than\s+|after\s+)?(\d+)\s*days?\s*(?:late|past|overdue|unpaid)?",
        p,
        re.I,
    )
    pause_days = int(pause_m.group(1)) if pause_m else 15
    return net_days, pause_days


def _insert_payment_timing_pause_fallback(doc: str, user_prompt: str) -> Optional[str]:
    """Deterministic insert after Payment Schedule (or Fees and Payment) when structure matches."""
    net_days, pause_days = _parse_net_and_pause_days(user_prompt)
    low = doc.lower()
    if "may pause work if undisputed invoices remain unpaid" in low:
        return None
    sched = re.search(
        r"(?m)^(?:#{1,4}\s*)?(?:Payment\s+Schedule|\d+\.\d+\s+Payment\s+Schedule)\s*$",
        doc,
        re.I,
    )
    anchor_region_start = sched.end() if sched else None
    if anchor_region_start is None:
        fp = re.search(r"(?m)^(?:#{1,4}\s*)?(?:Fees\s+and\s+Payment|Payment\s+and\s+Fees)\s*$", doc, re.I)
        if not fp:
            return None
        anchor_region_start = fp.end()
    tail2 = doc[anchor_region_start:]
    mnext = re.search(r"\n##\s+\S", tail2)
    sub = tail2[: mnext.start()] if mnext else tail2[: min(len(tail2), 8000)]
    insert_at = anchor_region_start + len(sub.rstrip())
    block = (
        f"\n\nUnless otherwise agreed in writing, undisputed invoices are payable within {net_days} calendar days "
        f"of the invoice date.\n\n"
        f"The developer may pause work if undisputed invoices remain unpaid more than {pause_days} calendar days "
        "after written notice.\n"
    )
    return doc[:insert_at] + block + doc[insert_at:]


def validate_payment_timing_pause_document(*, original: str, updated: str) -> bool:
    if not updated or not original:
        return False
    lo, lu = len(original), len(updated)
    if lu < lo:
        return False
    if lu > int(lo * 1.55):
        return False
    if not _anchors_preserved(original, updated):
        return False
    low = updated.lower()
    if "pause" not in low:
        return False
    if "invoice" not in low and "invoices" not in low:
        return False
    return True


_QUOTED_INSERT_CUE_RE = re.compile(
    r"\badd\s+this\s+exact\s+sentence\b|\badd\s+the\s+exact\s+sentence\b|"
    r"\badd\s+this\s+exact\b|\badd\s+the\s+following\s+sentence\b|"
    r"\badd\s+this\s+sentence\s+as\b",
    re.IGNORECASE,
)
_QUOTED_SPAN_RE = re.compile(r"[\"“”](.{16,800}?)[\"“”]", re.DOTALL)
_SECTION_IN_RE = re.compile(r"\bin\s+the\s+([A-Za-z][A-Za-z0-9\s]{1,40}?)\s+section\b", re.IGNORECASE)


def parse_quoted_sentence_insert(prompt: str) -> Optional[Tuple[str, Optional[str]]]:
    """Return ``(sentence, optional_section)`` for an exact-sentence surgical insert."""
    raw = prompt or ""
    if not _QUOTED_INSERT_CUE_RE.search(raw):
        return None
    qm = _QUOTED_SPAN_RE.search(raw)
    if not qm:
        return None
    sentence = " ".join((qm.group(1) or "").split()).strip()
    if len(sentence) < 16:
        return None
    sm = _SECTION_IN_RE.search(raw)
    section = " ".join((sm.group(1) or "").split()).strip() if sm else None
    if section and len(section) > 48:
        section = None
    return sentence, section or None


def _next_section_cut(tail: str) -> Optional[int]:
    """Next top-level heading or witness — subsections stay inside the current section."""
    nxt = re.search(r"(?m)^(?:#{1,4}\s+)?\d{1,2}\.\s+(?!\d)[A-Z].+$", tail)
    md = re.search(r"(?m)^#{1,4}\s+(?!\d)[A-Z].+$", tail)
    wit = re.search(r"(?im)^\s*(IN WITNESS WHEREOF|EXECUTED AS OF|EXECUTION PAGE|SIGNATURES?)\b", tail)
    cuts = [m.start() for m in (nxt, md, wit) if m]
    return min(cuts) if cuts else None


def _find_named_section_heading(doc: str, section: str) -> Optional[re.Match[str]]:
    sec = re.escape(section)
    patterns = [
        rf"(?im)^(?:#{{1,4}}\s+)?(?:\d+\.)+\s+{sec}\b[^\n]*$",
        rf"(?im)^#{{1,4}}\s+{sec}\b[^\n]*$",
        rf"(?im)^(?:#{{1,4}}\s+)?(?:\d+\.)+\s+[A-Z][^\n]{{0,60}}\b{sec}\b[^\n]*$",
        rf"(?im)(?<=[a-z.])((?:\d+\.)+\s+{sec}\b[^\n]*)$",
    ]
    if section.lower() == "notices":
        patterns.append(r"(?im)^(?:#{1,4}\s+)?(?:\d+\.)+\s+Notice\b(?!\s+shall)[^\n]*$")
    for pat in patterns:
        heading = re.search(pat, doc)
        if heading:
            return heading
    return None


def _last_top_level_section_body_end(doc: str) -> Optional[int]:
    last = None
    for m in re.finditer(r"(?m)^(?:#{1,4}\s+)?\d{1,2}\.\s+(?!\d)[A-Z].+$", doc):
        last = m
    if last is None:
        return None
    after = last.end()
    cut = _next_section_cut(doc[after:])
    return after + (cut if cut is not None else len(doc[after:].rstrip()))


def _insert_quoted_sentence(doc: str, sentence: str, section: Optional[str]) -> Optional[str]:
    """Insert ``sentence`` as its own paragraph inside the named section when possible."""
    if not doc or not sentence:
        return None
    if sentence in doc:
        return None
    block = "\n\n" + sentence + "\n\n"

    def apply_at(insert_at: int) -> str:
        return doc[:insert_at].rstrip() + block + doc[insert_at:].lstrip("\n")

    if section:
        heading = _find_named_section_heading(doc, section)
        if heading:
            after = heading.end()
            tail = doc[after:]
            cut = _next_section_cut(tail)
            insert_at = after + (cut if cut is not None else len(tail.rstrip()))
            return apply_at(insert_at)
        last_body_end = _last_top_level_section_body_end(doc)
        if last_body_end is not None:
            return apply_at(last_body_end)
    wit = re.search(r"(?im)^\s*(IN WITNESS WHEREOF|EXECUTED AS OF|EXECUTION PAGE|SIGNATURES?)\b", doc)
    if wit:
        return apply_at(wit.start())
    return doc.rstrip() + block


def classify_narrow_amendment_prompt(prompt: str) -> Optional[str]:
    """
    Map a user refinement prompt to a narrow amendment kind, or None for generic refine.

    Kinds: quoted_sentence_insert, payment_timing_pause, late_fee, governing_law,
    delivery_acceptance, support_period, termination, client_deliverables_final_payment.
    """
    raw = prompt or ""
    if parse_quoted_sentence_insert(raw):
        return "quoted_sentence_insert"
    p = raw.strip().lower()
    if not p or len(p) < 8:
        return None
    if _classify_payment_timing_pause(p):
        return "payment_timing_pause"
    if re.search(r"\b(no|not|without|remove|delete|drop|avoid)\b.*\b(late\s+fee|late\s+payment)\b", p):
        return None
    if re.search(r"\b(final\s+payment|before\s+final\s+payment|payment\s+is\s+due)\b", p) and re.search(
        r"\b(deliverable|deliverables)\b", p
    ) and re.search(r"\b(approve|approval|accept|acceptance)\b", p):
        return "client_deliverables_final_payment"
    # Late fee: match "5% after 10 days", "five percent after ten days overdue", "Preserve all other terms", etc.
    if re.search(r"\b(late\s+fees?|late\s+payment|overdue|past\s+due)\b", p) and (
        re.search(
            r"\b(5\s*%|five\s+percent|10\s+day|ten\s+\(?10\)?\s*day|days\s+overdue|after\s+10\s+days|after\s+ten\s+days)\b",
            p,
        )
        or ("fee" in p and "day" in p)
        or (re.search(r"\b5\s*%", p) and re.search(r"\b10\b", p) and "day" in p)
    ):
        return "late_fee"
    if re.search(r"\b(governing\s+law|choice\s+of\s+law|applicable\s+law)\b", p):
        return "governing_law"
    if re.search(r"\b(delivery\s+acceptance|acceptance\s+criteria|inspection\s+and\s+acceptance)\b", p):
        return "delivery_acceptance"
    if re.search(r"\b(support\s+period|warranty\s+period|maintenance\s+period|maintenance\s+window)\b", p):
        return "support_period"
    if re.search(
        r"\b(add\s+)?termination\b|\btermination\s+language\b|\bnotice\s+to\s+terminate\b|\btermination\s+for\s+convenience\b",
        p,
    ):
        return "termination"
    return None


def document_has_client_deliverables_final_payment_language(doc: str) -> bool:
    low = (doc or "").lower()
    return "deliverables" in low and "final payment" in low and ("approval" in low or "approve" in low or "acceptance" in low)


def _insert_client_deliverables_final_payment_clause(doc: str) -> Optional[str]:
    """Insert deliverables / final payment approval clause; preserve full document and signature block."""
    if document_has_client_deliverables_final_payment_language(doc):
        return None
    block = "\n\n### Client approval of deliverables before final payment\n\n" + CLIENT_DELIVERABLES_FINAL_PAYMENT_CLAUSE + "\n\n"
    witness = re.search(r"\n\s*(IN WITNESS WHEREOF|EXECUTED AS OF|EXECUTION PAGE|SIGNATURES?)\b", doc, re.I)
    if witness:
        return doc[: witness.start()].rstrip() + block + doc[witness.start() :]
    pay_m = re.search(
        r"(?m)^(?:#{1,3}\s*|\d+\.)?\s*(?:4[\.\s][^\n]*Final[^\n]*Payment|Final\s+Payment)[^\n]*\s*$",
        doc,
        re.I,
    )
    if pay_m:
        pos = pay_m.end()
        tail = doc[pos:]
        dbl = tail.find("\n\n")
        insert_at = pos + (dbl + 2 if dbl >= 0 else 0)
        return doc[:insert_at].rstrip() + block + doc[insert_at:]
    acc_m = re.search(r"(?m)^(?:#{1,3}\s*|\d+\.)?\s*3\.4[^\n]*Acceptance[^\n]*\s*$", doc, re.I)
    if acc_m:
        pos = acc_m.end()
        tail = doc[pos:]
        dbl = tail.find("\n\n")
        insert_at = pos + (dbl + 2 if dbl >= 0 else min(len(tail), 400))
        return doc[:insert_at].rstrip() + block + doc[insert_at:]
    return (doc or "").rstrip() + block


def document_has_late_fee_language(doc: str) -> bool:
    """
    Idempotent check: document already has a dedicated late-fee / late-payment penalty clause.

    Intentionally strict — generic payment percentages must not block inserting a late-fee paragraph.
    """
    low = (doc or "").lower()
    if ("late fee" in low or "late payment" in low) and (
        "five percent (5%)" in low
        or "five percent" in low
        or ("5%" in doc and ("overdue" in low or "past due" in low or "late payment" in low))
    ):
        return True
    return False


def _anchors_preserved(original: str, updated: str) -> bool:
    o = (original or "").strip()
    u = updated or ""
    if not o:
        return False
    L = len(o)
    if L < 500:
        head = o[: min(200, L)]
        return head in u if head else True
    for frac in (0.06, 0.18, 0.34, 0.52, 0.68, 0.84):
        s = int(L * frac)
        frag = o[s : s + 52]
        if len(frag) < 28:
            continue
        if frag not in u:
            return False
    return True


def validate_narrow_refined_document(*, original: str, updated: str, kind: str) -> bool:
    """
    Server-side guard: updated text must stay within 90–135% of original length and preserve anchors.

    ``kind`` is one of the narrow kinds from ``classify_narrow_amendment_prompt``.
    """
    if not updated or not original:
        return False
    lo, lu = len(original), len(updated)
    if lu < int(lo * 0.9):
        return False
    if lu > int(lo * 1.35):
        return False
    if not _anchors_preserved(original, updated):
        return False
    low = updated.lower()
    if kind == "late_fee":
        if ("five percent (5%)" not in low) and ("5%" not in updated):
            return False
        if "late" not in low:
            return False
    elif kind == "governing_law":
        if not re.search(r"(?i)\b(law|jurisdiction|venue|govern)\b", updated):
            return False
    elif kind == "delivery_acceptance":
        if not re.search(r"(?i)\b(accept|delivery|inspect)\b", updated):
            return False
    elif kind == "support_period":
        if not re.search(r"(?i)\b(support|warranty|maintenance)\b", updated):
            return False
    elif kind == "termination":
        if not re.search(r"(?i)\b(terminat|notice)\b", updated):
            return False
    elif kind == "client_deliverables_final_payment":
        low = updated.lower()
        if "deliverables" not in low or "final payment" not in low:
            return False
        if not re.search(r"(?i)\b(approval|approve|acceptance)\b", updated):
            return False
    elif kind == "quoted_sentence_insert":
        if lu < lo:
            return False
    return True


def _first_numbered_subclause_after(tail: str) -> Optional[Tuple[int, int]]:
    """First ``M.m`` clause heading at line start in ``tail`` (e.g. 3.4 Expenses)."""
    m = re.search(r"(?m)^\s*(\d+)\.(\d+)\s+", tail)
    if not m:
        return None
    return int(m.group(1)), int(m.group(2))


def _ensure_monotonic_major_subclauses(doc: str, major: int) -> str:
    """
    Walk top-to-bottom; for line-start ``major.N`` headings, enforce strictly increasing ``N``.

    Fixes duplicate ``2.4`` / ``2.4`` after inserting a late-fee line that reused the first subclause number.
    """
    maj_s = str(int(major))
    rx = re.compile(rf"^(\s*)({re.escape(maj_s)})\.(\d+)(\s.*)$")
    last = 0
    out: List[str] = []
    for line in doc.splitlines(True):
        bare = line.rstrip("\r\n")
        trailing = line[len(bare) :]
        m = rx.match(bare)
        if not m:
            out.append(line)
            continue
        k = int(m.group(3))
        if k <= last:
            k = last + 1
        last = k
        new_bare = f"{m.group(1)}{maj_s}.{k}{m.group(4)}"
        out.append(new_bare + trailing)
    return "".join(out)


def _bump_numbered_subclause_lines(suffix: str, major: int, min_from: int) -> str:
    """
    Renumber line-start ``major.k`` headings where ``k >= min_from`` to **unique** sequential
    ``major.(min_from+1)``, ``major.(min_from+2)``, … in document order.

    A plain ``k -> k+1`` bump is wrong when two siblings already share the same ``k`` (both become
    ``k+1``). Late-fee insert relies on strict monotonic subclause numbering.
    """
    out: List[str] = []
    maj_s = str(int(major))
    rx = re.compile(rf"^(\s*)({re.escape(maj_s)})\.(\d+)(\s.*)$")
    next_k = min_from + 1
    for line in suffix.splitlines(True):
        bare = line.rstrip("\r\n")
        trailing = line[len(bare) :]
        m = rx.match(bare)
        if not m:
            out.append(line)
            continue
        k = int(m.group(3))
        if k < min_from:
            out.append(line)
            continue
        new_bare = f"{m.group(1)}{maj_s}.{next_k}{m.group(4)}"
        next_k += 1
        out.append(new_bare + trailing)
    return "".join(out)


def _insert_late_fee_paragraph(doc: str) -> Optional[str]:
    """Insert late-fee after Payment-style heading, or before Confidentiality. No LLM. Renumbers ``M.m`` siblings."""
    patterns = [
        r"(?m)^#{1,3}\s+(?:\d+\.[\s]*)?(?:Fees\s+and\s+Payment|Compensation\s+and\s+Payment|Payment\s+and\s+Fees)\s*$",
        r"(?m)^#{1,3}\s+(?:\d+\.\s*)?(?:Payment|Fees|Compensation|Compensation\s+and\s+Payment|Pricing\s+and\s+Payment|Invoicing|Billing|Financial\s+Terms)(?:\s+Terms)?\s*$",
        r"(?m)^#{1,3}\s+(?:\d+\.\s*)?(?:Payment\s+and\s+Fees|Fees\s+and\s+Payment)\s*$",
        r"(?m)^(?:\d+\.){1,3}\s+(?:Fees\s+and\s+Payment|Compensation\s+and\s+Payment|Payment\s+and\s+Fees)\s*$",
        r"(?m)^(?:\d+\.){1,3}\s+(?:Payment|Fees|Compensation|Pricing)(?:\s+Terms)?\s*$",
        r"(?m)^(?:\d+\.){1,3}\s+(?:Payment\s+and\s+Fees|Fees\s+and\s+Payment)\s*$",
    ]
    for pat in patterns:
        m = re.compile(pat, re.I).search(doc)
        if not m:
            continue
        head_end = m.end()
        tail_before = doc[head_end:]
        sched_m = re.search(r"(?m)^\s*(?:#{1,4}\s+|\d+\.\d+\s+)?Payment\s+Schedule\b", tail_before)
        if sched_m:
            insert_at = head_end + sched_m.start()
        else:
            dbl = tail_before.find("\n\n")
            if dbl == -1:
                insert_at = len(doc)
            else:
                insert_at = head_end + dbl + 2
        window = doc[head_end : min(len(doc), insert_at + 500)].lower()
        if "five percent (5%)" in window or (
            "late payment" in window and "5%" in doc[head_end : min(len(doc), head_end + 2000)]
        ):
            return None
        tail_orig = doc[insert_at:]
        if sched_m:
            block = LATE_FEE_PARAGRAPH_DEFAULT.strip() + "\n\n"
            return doc[:insert_at] + block + tail_orig
        num = _first_numbered_subclause_after(tail_orig)
        if num:
            maj, m0 = num
            block = f"{maj}.{m0} {LATE_FEE_PARAGRAPH_DEFAULT.strip()}\n\n"
            tail_new = _bump_numbered_subclause_lines(tail_orig, maj, m0)
        else:
            block = LATE_FEE_PARAGRAPH_DEFAULT.strip() + "\n\n"
            tail_new = tail_orig
        merged = doc[:insert_at] + block + tail_new
        if num:
            return _ensure_monotonic_major_subclauses(merged, maj)
        return merged

    cf = re.search(r"(?m)^#{1,3}\s+Confidentiality\b", doc, re.I)
    if cf:
        pos = cf.start()
        block = "### Late payment\n\n" + LATE_FEE_PARAGRAPH_DEFAULT.strip() + "\n\n"
        return doc[:pos].rstrip() + "\n\n" + block + doc[pos:]
    return None


def _try_llm_narrow_anchor_patch(
    *,
    kind: str,
    doc: str,
    user_prompt: str,
    call_legal_llm_fn: Callable[..., str],
    llm_model: Optional[str],
) -> Optional[str]:
    """
    Ask the model for ``{ "anchor", "new_paragraph" }`` only; apply server-side if anchor is unique.

    ``call_legal_llm_fn`` must match ``call_legal_llm(messages, model=..., max_tokens=..., temperature=...)``.
    """
    payload = json.dumps(
        {
            "narrow_amendment_kind": kind,
            "user_refinement_prompt": user_prompt,
            "current_document_text": doc,
        },
        ensure_ascii=False,
    )
    if len(payload) > 265_000:
        return None
    try:
        raw = call_legal_llm_fn(
            [
                {"role": "system", "content": NARROW_PATCH_SYSTEM},
                {"role": "user", "content": payload},
            ],
            model=llm_model,
            max_tokens=1800,
            temperature=0.12,
        )
    except Exception:
        return None
    parsed = _safe_json_dict(raw or "")
    if not parsed:
        return None
    anchor = str(parsed.get("anchor") or "").strip()
    new_para = str(parsed.get("new_paragraph") or parsed.get("insertion") or "").strip()
    if not anchor or not new_para or len(anchor) < 24 or len(anchor) > 420:
        return None
    if doc.count(anchor) != 1:
        return None
    insertion = "\n\n" + new_para + "\n\n"
    return doc.replace(anchor, anchor + insertion, 1)


_SUMMARY_FOR_KIND: Dict[str, List[str]] = {
    "late_fee": ["Added late payment fee for amounts overdue beyond ten days."],
    "governing_law": ["Added governing law / dispute resolution language as requested."],
    "delivery_acceptance": ["Added delivery and acceptance language as requested."],
    "support_period": ["Added support or warranty period language as requested."],
    "termination": ["Added termination / notice language as requested."],
    "client_deliverables_final_payment": [
        "Added client approval of deliverables before final payment, preserving the full agreement."
    ],
    "payment_timing_pause": [
        "Localized payment timing (net days) and a narrow pause-for-nonpayment sentence; preserved the rest verbatim."
    ],
    "quoted_sentence_insert": ["Inserted the requested sentence without rewriting other sections."],
}


def try_apply_narrow_amendment(
    *,
    kind: str,
    current_document_text: str,
    user_refinement_prompt: str,
    call_legal_llm_fn: Callable[..., str],
    llm_model: Optional[str],
) -> Optional[Dict[str, Any]]:
    """
    Apply a narrow amendment if validation passes.

    Returns a dict suitable for building ``PremiumRefineResponse``, or None to fall back to full refine.
    """
    doc = (current_document_text or "").strip()
    if len(doc) < 200:
        return None

    def ok_response(updated: str, summary: List[str]) -> Dict[str, Any]:
        return {
            "updated_document_text": updated,
            "summary_changes": summary,
            "readiness_score": 82,
            "suggested_next_step": "review",
        }

    if kind == "quoted_sentence_insert":
        parsed = parse_quoted_sentence_insert(user_refinement_prompt)
        if not parsed:
            return None
        sentence, section = parsed
        patched = _insert_quoted_sentence(doc, sentence, section)
        if patched and sentence in patched and validate_narrow_refined_document(
            original=doc, updated=patched, kind="quoted_sentence_insert"
        ):
            return ok_response(patched, _SUMMARY_FOR_KIND["quoted_sentence_insert"])
        return None

    if kind == "client_deliverables_final_payment":
        patched = _insert_client_deliverables_final_payment_clause(doc)
        if patched and validate_narrow_refined_document(
            original=doc, updated=patched, kind="client_deliverables_final_payment"
        ):
            return ok_response(patched, _SUMMARY_FOR_KIND["client_deliverables_final_payment"])
        return None

    if kind == "payment_timing_pause":
        fb = _insert_payment_timing_pause_fallback(doc, user_refinement_prompt)
        if fb and validate_payment_timing_pause_document(original=doc, updated=fb):
            return ok_response(fb, _SUMMARY_FOR_KIND["payment_timing_pause"])
        alt = _try_llm_narrow_anchor_patch(
            kind=kind,
            doc=doc,
            user_prompt=user_refinement_prompt,
            call_legal_llm_fn=call_legal_llm_fn,
            llm_model=llm_model,
        )
        if alt and validate_payment_timing_pause_document(original=doc, updated=alt):
            return ok_response(alt, _SUMMARY_FOR_KIND["payment_timing_pause"])
        return None

    if kind == "late_fee":
        if document_has_late_fee_language(doc):
            # Do not return "success" with an unchanged body — let full refine run; API layer rejects identical output.
            return None
        patched = _insert_late_fee_paragraph(doc)
        if patched and validate_narrow_refined_document(original=doc, updated=patched, kind="late_fee"):
            return ok_response(patched, _SUMMARY_FOR_KIND["late_fee"])
        alt = _try_llm_narrow_anchor_patch(
            kind=kind,
            doc=doc,
            user_prompt=user_refinement_prompt,
            call_legal_llm_fn=call_legal_llm_fn,
            llm_model=llm_model,
        )
        if alt and validate_narrow_refined_document(original=doc, updated=alt, kind="late_fee"):
            return ok_response(alt, _SUMMARY_FOR_KIND["late_fee"])
        return None

    alt = _try_llm_narrow_anchor_patch(
        kind=kind,
        doc=doc,
        user_prompt=user_refinement_prompt,
        call_legal_llm_fn=call_legal_llm_fn,
        llm_model=llm_model,
    )
    if alt and validate_narrow_refined_document(original=doc, updated=alt, kind=kind):
        return ok_response(alt, _SUMMARY_FOR_KIND.get(kind, ["Applied requested narrow amendment."]))
    return None


__all__ = [
    "LATE_FEE_PARAGRAPH_DEFAULT",
    "classify_narrow_amendment_prompt",
    "document_has_late_fee_language",
    "parse_quoted_sentence_insert",
    "try_apply_narrow_amendment",
    "validate_narrow_refined_document",
]
