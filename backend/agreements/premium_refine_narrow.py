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


def classify_narrow_amendment_prompt(prompt: str) -> Optional[str]:
    """
    Map a user refinement prompt to a narrow amendment kind, or None for generic refine.

    Kinds: late_fee, governing_law, delivery_acceptance, support_period, termination.
    """
    p = (prompt or "").strip().lower()
    if not p or len(p) < 8:
        return None
    if re.search(r"\b(no|not|without|remove|delete|drop|avoid)\b.*\b(late\s+fee|late\s+payment)\b", p):
        return None
    # Late fee: match "5% after 10 days", "five percent after ten days overdue", "Preserve all other terms", etc.
    if re.search(r"\b(late\s+fee|late\s+payment|overdue|past\s+due)\b", p) and (
        re.search(
            r"\b(5\s*%|five\s+percent|10\s+day|ten\s+\(?10\)?\s*day|days\s+overdue|after\s+10\s+days)\b",
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


def document_has_late_fee_language(doc: str) -> bool:
    """Idempotent check: document already contains late-fee style language with 5% / five percent."""
    low = doc.lower()
    if ("late payment" in low or "late fee" in low) and ("5%" in doc or "five percent" in low):
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
        r"(?m)^#{1,3}\s+(?:\d+\.\s*)?(?:Payment|Fees|Compensation|Compensation\s+and\s+Payment|Pricing\s+and\s+Payment|Invoicing|Billing|Financial\s+Terms)(?:\s+Terms)?\s*$",
        r"(?m)^#{1,3}\s+(?:\d+\.\s*)?(?:Payment\s+and\s+Fees|Fees\s+and\s+Payment)\s*$",
        r"(?m)^(?:\d+\.){1,3}\s+(?:Payment|Fees|Compensation|Pricing)(?:\s+Terms)?\s*$",
        r"(?m)^(?:\d+\.){1,3}\s+(?:Payment\s+and\s+Fees|Fees\s+and\s+Payment)\s*$",
    ]
    for pat in patterns:
        m = re.compile(pat, re.I).search(doc)
        if not m:
            continue
        head_end = m.end()
        tail_before = doc[head_end:]
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

    if kind == "late_fee":
        if document_has_late_fee_language(doc):
            if validate_narrow_refined_document(original=doc, updated=doc, kind="late_fee"):
                return ok_response(
                    doc,
                    ["Your agreement already includes late payment / late fee language in line with this request."],
                )
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
    "try_apply_narrow_amendment",
    "validate_narrow_refined_document",
]
