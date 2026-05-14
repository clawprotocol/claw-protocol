"""
Universal placeholder / template-token repair + validation for user-visible agreement text.

Used by VS01 signing seed, recipient PDF export, and other server-side gates. Mirrors the
frontend module `agreementTemplatePlaceholderSafety.ts` rules.
"""

from __future__ import annotations

import logging
import re
from typing import Any, Dict, List, Optional, Sequence, Tuple

log = logging.getLogger("claw.placeholder_safety")

_LOG_SCAN = "[placeholder-scan]"
_LOG_REPAIR = "[placeholder-repair]"
_LOG_REJECT = "[placeholder-reject]"

_BRACKET_UPPER_INTERNAL_RE = re.compile(r"\[[A-Z][A-Z0-9_]*(?:_\d+)?\]")
_INSERT_BRACKET_RE = re.compile(r"\[[^\]\n]{0,200}\binsert[^\]\n]{0,200}\]", re.I)
_MUSTACHE_RE = re.compile(r"\{\{[\s\S]*?\}\}")
_SINGLE_BRACE_RE = re.compile(r"\{[a-z][a-z0-9_]*\}", re.I)
_ANGLE_INSERT_RE = re.compile(r"<\s*insert\b[^>]{0,200}>", re.I)
_ANGLE_LEGAL_STUB_RE = re.compile(
    r"<\s*[^>\n]{0,200}(?:customer|legal\s*name|tbd|placeholder|to\s+be\s+(?:completed|filled)|insert\s+here)[^>\n]{0,200}\s*>",
    re.I,
)
_TRIPLE_UNDERSCORE_RE = re.compile(r"___[A-Z][A-Z0-9_]*___")
_DRAFTING_STUB_RE = re.compile(
    r"\b(?:fill\s+in\s+later|to\s+be\s+completed|insert\s+here|fill\s+in\s+with\s+counsel)\b",
    re.I,
)
_SCHEDULE_STUB_RE = re.compile(
    r"\bschedule\s+a\b[^.\n]{0,120}\b(?:tbd|placeholder|to\s+be\s+completed|\[)\b",
    re.I,
)
_ALLOWED_NOT_YET = re.compile(r"^\[not yet specified\]$", re.I)


def strip_html_agreement_scan_text(html: str) -> str:
    t = re.sub(r"(?is)<script.*?</script>", " ", html or "")
    return re.sub(r"<[^>]+>", " ", t)


def coalesce_agreement_body_corpus(draft: Any) -> str:
    """Longest non-trivial prose field wins (typical Pro corpus location)."""
    parts: List[str] = []
    for key in (
        "premium_full_document_text",
        "server_full_document_text",
        "document_text",
        "rendered_document_text",
        "purpose",
    ):
        raw = getattr(draft, key, None)
        s = str(raw or "").strip()
        if s:
            parts.append(s)
    if not parts:
        return ""
    parts.sort(key=len, reverse=True)
    return parts[0]


def primary_agreement_plain_field_and_value(draft: Any) -> Tuple[str, str]:
    """Field name + value for the longest stored plain agreement body."""
    best_k = "purpose"
    best_v = ""
    for key in (
        "premium_full_document_text",
        "server_full_document_text",
        "document_text",
        "rendered_document_text",
        "purpose",
    ):
        v = str(getattr(draft, key, None) or "").strip()
        if len(v) > len(best_v):
            best_v, best_k = v, key
    return best_k, best_v


def _intake_allows(intake_raw: str, token: str) -> bool:
    i = (intake_raw or "").strip()
    t = (token or "").strip()
    return bool(i and t and t in i)


def repair_agreement_template_placeholders(
    text: str,
    *,
    party_names: Optional[Sequence[str]] = None,
    intake_raw: str = "",
) -> Tuple[str, List[str]]:
    out = text or ""
    repaired: List[str] = []
    names = [str(n).strip() for n in (party_names or ()) if str(n).strip()]

    if re.search(r"\[\s*CASE_ID_\d+\s*\]", out, flags=re.I):
        out = re.sub(r"\[\s*CASE_ID_\d+\s*\]", "any Party", out, flags=re.I)
        repaired.append("CASE_ID→any Party")

    def party_repl(m: re.Match[str]) -> str:
        idx = int(m.group(1))
        if 1 <= idx <= len(names):
            repaired.append(f"PARTY_{idx}→resolved")
            return names[idx - 1]
        repaired.append(f"PARTY_{idx}→applicable Party")
        return "the applicable Party"

    if re.search(r"\[\s*PARTY_\d+\s*\]", out, flags=re.I):
        out = re.sub(r"\[\s*PARTY_(\d+)\s*\]", party_repl, out, flags=re.I)

    if re.search(r"\[\s*CLIENT\s*\]", out, flags=re.I):
        out = re.sub(r"\[\s*CLIENT\s*\]", "the receiving Party", out, flags=re.I)
        repaired.append("[CLIENT]→the receiving Party")
    if re.search(r"\[\s*PROVIDER\s*\]", out, flags=re.I):
        out = re.sub(r"\[\s*PROVIDER\s*\]", "the providing Party", out, flags=re.I)
        repaired.append("[PROVIDER]→the providing Party")
    if re.search(r"\[\s*COMPANY_NAME\s*\]", out, flags=re.I):
        rep = names[0] if len(names) == 1 else "the applicable Party"
        out = re.sub(r"\[\s*COMPANY_NAME\s*\]", rep, out, flags=re.I)
        repaired.append("[COMPANY_NAME]→" + ("resolved" if len(names) == 1 else "applicable Party"))

    return out, repaired


def collect_forbidden_template_fragments(text: str, intake_raw: str = "") -> List[str]:
    t = text or ""
    found: List[str] = []

    def push(s: str) -> None:
        x = s.strip()
        if len(x) < 2 or len(x) > 220:
            return
        if _intake_allows(intake_raw, x):
            return
        if x not in found:
            found.append(x)

    for m in _BRACKET_UPPER_INTERNAL_RE.finditer(t):
        raw = m.group(0)
        if _ALLOWED_NOT_YET.match(raw.strip()):
            continue
        push(raw)
    for rx in (
        _INSERT_BRACKET_RE,
        _MUSTACHE_RE,
        _SINGLE_BRACE_RE,
        _ANGLE_INSERT_RE,
        _ANGLE_LEGAL_STUB_RE,
        _TRIPLE_UNDERSCORE_RE,
    ):
        for m in rx.finditer(t):
            push(m.group(0))
    for line in t.splitlines():
        if re.match(r"^\s*(TODO|FIXME)\s*:", line, flags=re.I):
            push(line.strip()[:120])
    for m in _DRAFTING_STUB_RE.finditer(t):
        push(m.group(0))
    for m in _SCHEDULE_STUB_RE.finditer(t):
        push(m.group(0).strip()[:160])
    return found[:40]


def validate_user_visible_agreement_text(
    text: str,
    *,
    party_names: Optional[Sequence[str]] = None,
    intake_raw: str = "",
    surface: str,
    agreement_family: str = "",
) -> Tuple[bool, str, Dict[str, Any]]:
    repaired_text, repairs = repair_agreement_template_placeholders(
        text, party_names=party_names, intake_raw=intake_raw
    )
    remaining = collect_forbidden_template_fragments(repaired_text, intake_raw)
    ok = len(remaining) == 0
    diag: Dict[str, Any] = {
        "remaining": remaining[:12],
        "repairs": repairs,
        "token_count": len(remaining),
        "surface": surface,
        "agreement_family": agreement_family,
    }
    log.info(
        "%s surface=%s family=%s token_count=%d repaired_count=%d ok=%s types=%s",
        _LOG_SCAN,
        surface,
        agreement_family,
        len(remaining),
        len(repairs),
        int(ok),
        remaining[:8],
    )
    if repairs:
        log.info("%s surface=%s repairs=%s", _LOG_REPAIR, surface, repairs)
    if not ok:
        log.warning("%s surface=%s remaining=%s", _LOG_REJECT, surface, remaining[:12])
    return ok, repaired_text, diag
