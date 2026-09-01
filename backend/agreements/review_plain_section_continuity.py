"""Review/plain corpus section continuity after Pro draft / Review paint.

Customer-visible Review must not skip integers (12 then 14, 10 then 12) and must
not silently drop a governing-law term the intake already supplied.

Does not remint leftover 1..8 outlines into 10/11/12/13.
"""

from __future__ import annotations

import html
import re
from typing import List, Optional, Sequence, Tuple

# US jurisdictions commonly named in two-party intake. Not an exclusive allowlist —
# ``governing law {Name}`` also extracts an arbitrary supplied label.
_NAMED_JURISDICTIONS = (
    "Alabama",
    "Alaska",
    "Arizona",
    "Arkansas",
    "California",
    "Colorado",
    "Connecticut",
    "Delaware",
    "Florida",
    "Georgia",
    "Hawaii",
    "Idaho",
    "Illinois",
    "Indiana",
    "Iowa",
    "Kansas",
    "Kentucky",
    "Louisiana",
    "Maine",
    "Maryland",
    "Massachusetts",
    "Michigan",
    "Minnesota",
    "Mississippi",
    "Missouri",
    "Montana",
    "Nebraska",
    "Nevada",
    "New Hampshire",
    "New Jersey",
    "New Mexico",
    "New York",
    "North Carolina",
    "North Dakota",
    "Ohio",
    "Oklahoma",
    "Oregon",
    "Pennsylvania",
    "Rhode Island",
    "South Carolina",
    "South Dakota",
    "Tennessee",
    "Texas",
    "Utah",
    "Vermont",
    "Virginia",
    "Washington",
    "West Virginia",
    "Wisconsin",
    "Wyoming",
    "District of Columbia",
)

TOP_LEVEL_HEADING_RE = re.compile(r"^(\d{1,2})\.\s+(?!\d)(\S.*)$")
WITNESS_RE = re.compile(r"\bIN WITNESS WHEREOF\b", re.I)
NOTICES_HEADING_RE = re.compile(r"^(?P<n>\d{1,2})\.\s+NOTICES\b", re.I)
GOVERNING_HEADING_RE = re.compile(r"^\d{1,2}\.\s+GOVERNING LAW\b", re.I)
# Notices If-to / Attn / address field lines are not top-level sections, even when numbered.
_NOTICE_FIELD_TITLE_RE = re.compile(
    r"^(?:If\s+to\b|Attn\s*:|Attention\s*:|Address\b|Email\b)",
    re.I,
)
# Numbered notice-delivery methods after Notices (1. Email / 2. Personal delivery / 3. Overnight courier).
_NOTICE_DELIVERY_TITLE_RE = re.compile(
    r"^(?:Email|Personal\s+delivery|Overnight\s+courier|Hand\s+delivery|"
    r"Certified\s+mail|Registered\s+mail|Fax|Mail|Courier|Postal\s+mail)\b",
    re.I,
)
_STREET_ADDRESS_TITLE_RE = re.compile(
    r"\b(?:Street|St\.?|Avenue|Ave\.?|Road|Rd\.?|Boulevard|Blvd\.?|Lane|Ln\.?|Drive|Dr\.?|Suite|Ste\.?)\b",
    re.I,
)
_HEADING_MARKUP_RE = re.compile(r"^(?:\*+|_{2,})\s*|\s*(?:\*+|_{2,})$")
_HTML_HINT_RE = re.compile(r"</?(?:h[1-6]|p|div|br|strong|b|em|span|article|li)\b|&nbsp;|&#", re.I)
_HTML_BLOCK_CLOSE_RE = re.compile(
    r"</(?:p|div|section|article|h[1-6]|blockquote|li|tr|thead|tbody|table)\b[^>]*>",
    re.I,
)
_HTML_BR_RE = re.compile(r"<br\s*/?>", re.I)
_HTML_TAG_RE = re.compile(r"<[^>]+>")
_MARKDOWN_HEADING_PREFIX_RE = re.compile(r"^#{1,6}\s+")
GOVERNED_BY_RE = re.compile(r"\bgoverned\s+by\s+(?:the\s+)?laws?\s+of\b", re.I)
# Customer dump form: "governing law Texas" / "governing law: Oklahoma"
SUPPLIED_GOVERNING_LAW_RE = re.compile(
    r"\bgoverning\s+law\s*[:\-]?\s+([A-Za-z][A-Za-z]+(?:\s+[A-Za-z][A-Za-z]+)?)\b",
    re.I,
)
_BLOCKED_GOVERNING_LABELS = frozenset({"state", "the", "this", "that", "our", "their"})

# Late-section holes (10 then 12, 12 then 14). Do not remint 1..8 leftovers.
LATE_SECTION_SKIP_FLOOR = 10


def _split_before_witness(text: str) -> Tuple[str, str]:
    raw = (text or "").replace("\r\n", "\n")
    m = WITNESS_RE.search(raw)
    if not m:
        return raw, ""
    return raw[: m.start()], raw[m.start() :]


def _normalize_review_plain_for_section_scan(plain: str) -> str:
    """Persist Review may be HTML or markup. Scan line-oriented plain, keep true holes.

    Review paint wraps headings in ``<h2 class="premium-doc-section-heading">`` and may
    join notice-delivery lines with ``<br />``. Signer-save persist can also wrap the
    Notices title (``<strong>12. Notices</strong>`` / ``12.&nbsp;Notices``). Convert
    those to plain lines before skip detection so sequential 1..12 is not 11-then-2.
    """
    text = (plain or "").replace("\r\n", "\n")
    if _HTML_HINT_RE.search(text):
        text = _HTML_BLOCK_CLOSE_RE.sub("\n", text)
        text = _HTML_BR_RE.sub("\n", text)
        text = _HTML_TAG_RE.sub("", text)
        text = html.unescape(text)
    return text.replace("\xa0", " ")


def _strip_heading_markup(line: str) -> str:
    """Drop HTML/markdown wrappers so a wrapped/bold heading still parses as N. Title."""
    trimmed = _HTML_TAG_RE.sub("", (line or "").strip())
    trimmed = html.unescape(trimmed).replace("\xa0", " ").strip()
    trimmed = _MARKDOWN_HEADING_PREFIX_RE.sub("", trimmed)
    trimmed = _HEADING_MARKUP_RE.sub("", trimmed).strip()
    trimmed = trimmed.replace("**", "").replace("__", "").strip()
    return trimmed


def _parse_collectable_top_level_heading(line: str) -> Optional[Tuple[int, str]]:
    """True top-level heading for skip detection. Not subsections, If-to/Attn, or street lines."""
    trimmed = _strip_heading_markup(line)
    if not trimmed or re.match(r"^\d+\.\d+", trimmed):
        return None
    m = TOP_LEVEL_HEADING_RE.match(trimmed)
    if not m:
        return None
    title = m.group(2).strip()
    if _NOTICE_FIELD_TITLE_RE.match(title):
        return None
    if _NOTICE_DELIVERY_TITLE_RE.match(title):
        return None
    if _STREET_ADDRESS_TITLE_RE.search(title):
        return None
    return int(m.group(1)), title


def collect_review_plain_top_level_section_numbers(plain: str) -> List[int]:
    """Collect first-occurrence top-level integers through the Notices heading.

    Wrapped title remnants (``2. Revisions,`` after 12 Notices), If-to / Attn blocks,
    numbered notice-delivery lines (``1. Email`` / ``2. Personal delivery``), HTML/markup
    heading wrappers, and subsections ``4.1`` / ``5.1`` are not skipped integers. Stop
    at Notices so signer-save notice body cannot restart the sequence. Real holes
    (12 then 14) still collect 14 when 14 is the later heading.
    """
    head, _ = _split_before_witness(_normalize_review_plain_for_section_scan(plain or ""))
    nums: List[int] = []
    seen = set()
    for line in head.split("\n"):
        parsed = _parse_collectable_top_level_heading(line)
        if not parsed:
            continue
        number, _title = parsed
        if number in seen:
            continue
        nums.append(number)
        seen.add(number)
        if NOTICES_HEADING_RE.match(_strip_heading_markup(line)):
            break
    return nums


def review_plain_has_skipped_section_numbers(plain: str) -> bool:
    """True when Review/plain top-level headings skip or jump (N then N+2 is FAIL)."""
    nums = collect_review_plain_top_level_section_numbers(plain)
    if len(nums) < 2:
        return False
    for i in range(1, len(nums)):
        prev = nums[i - 1]
        curr = nums[i]
        if curr <= prev:
            return True
        if curr >= prev + 2:
            return True
    return False


def review_plain_has_late_skipped_section_numbers(plain: str) -> bool:
    """True for the live skip class: 10 then 12, 12 then 14 (prev >= late floor).

    Persist Review seeds with an early hole (2 then 10) are a different fixture class
    and must not be reminted or refused here.
    """
    nums = collect_review_plain_top_level_section_numbers(plain)
    if len(nums) < 2:
        return False
    for i in range(1, len(nums)):
        prev = nums[i - 1]
        curr = nums[i]
        if prev < LATE_SECTION_SKIP_FLOOR:
            continue
        if curr <= prev:
            return True
        if curr >= prev + 2:
            return True
    return False


def extract_supplied_governing_law(intake: str, *, jurisdiction: str = "") -> str:
    """Extract a customer-supplied governing-law label. Never invents a default state."""
    hinted = (jurisdiction or "").strip()
    if hinted and not re.match(r"^\[", hinted):
        return hinted
    text = intake or ""
    labeled = SUPPLIED_GOVERNING_LAW_RE.search(text)
    if labeled:
        value = labeled.group(1).strip().rstrip(".;,")
        if value and value.lower() not in _BLOCKED_GOVERNING_LABELS:
            return value
    for state in _NAMED_JURISDICTIONS:
        if re.search(rf"\b{re.escape(state)}\b\s+(?:governing\s+)?law\b", text, re.I):
            return state
        if re.search(rf"\bgoverned\s+by\s+(?:the\s+laws?\s+of\s+(?:the\s+state\s+of\s+)?)?{re.escape(state)}\b", text, re.I):
            return state
        if re.search(rf"\blaws?\s+of(?:\s+the\s+state\s+of)?\s+{re.escape(state)}\b", text, re.I):
            return state
    return ""


def _plain_outside_notice_addresses(plain: str) -> str:
    out: List[str] = []
    for line in (plain or "").splitlines():
        if re.search(r"^\s*(?:Address|Attn|Email)\s*:", line, re.I):
            continue
        if re.search(r"\bAddress:\s+", line, re.I) and re.search(r"governing\s+law", line, re.I):
            line = re.sub(r"Address:.*", "", line, flags=re.I)
        out.append(line)
    return "\n".join(out)


def review_plain_has_operative_governing_law(plain: str, jurisdiction: str = "") -> bool:
    body = _plain_outside_notice_addresses(plain or "")
    if GOVERNING_HEADING_RE.search(body) or GOVERNED_BY_RE.search(body):
        return True
    juris = (jurisdiction or "").strip()
    if juris and re.search(rf"\b{re.escape(juris)}\s+law\s+governs?\b", body, re.I):
        return True
    if juris and re.search(rf"\blaws?\s+of(?:\s+the\s+state\s+of)?\s+{re.escape(juris)}\b", body, re.I):
        return True
    return False


def _heading_line_indexes(head: str) -> List[Tuple[int, int, str]]:
    found: List[Tuple[int, int, str]] = []
    for i, line in enumerate(head.split("\n")):
        m = TOP_LEVEL_HEADING_RE.match(line.strip())
        if not m:
            continue
        found.append((i, int(m.group(1)), m.group(2).strip()))
    return found


def _unused_integers_between(prev: int, curr: int, used: Sequence[int]) -> List[int]:
    used_set = set(used)
    return [n for n in range(prev + 1, curr) if n not in used_set]


def _insert_governing_law_section(plain: str, jurisdiction: str) -> Tuple[str, List[str]]:
    repairs: List[str] = []
    raw = (plain or "").replace("\r\n", "\n")
    head, tail = _split_before_witness(raw)
    headings = _heading_line_indexes(head)
    used = [n for _, n, _ in headings]
    insert_at = len(head)
    section_num: Optional[int] = None

    notices_idx = None
    notices_num = None
    for i, line in enumerate(head.split("\n")):
        m = NOTICES_HEADING_RE.match(line.strip())
        if m:
            notices_idx = i
            notices_num = int(m.group("n"))
            break

    if notices_idx is not None and notices_num is not None:
        prior = [n for n in used if n < notices_num]
        prev = prior[-1] if prior else notices_num - 1
        hole = _unused_integers_between(prev, notices_num, used)
        section_num = hole[0] if hole else max(prev, 0) + 1 if prev >= 0 else notices_num
        # Character offset of the Notices heading line.
        lines = head.split("\n")
        insert_at = sum(len(lines[j]) + 1 for j in range(notices_idx))
    else:
        last = used[-1] if used else 0
        section_num = last + 1
        insert_at = len(head.rstrip())

    if section_num is None or section_num < 1:
        section_num = 1

    block = (
        f"{section_num}. Governing Law\n\n"
        f"This Agreement is governed by the laws of {jurisdiction}, "
        "without regard to conflict-of-laws principles.\n\n"
    )
    prefix = head[:insert_at].rstrip()
    suffix = head[insert_at:].lstrip()
    parts = [p for p in (prefix, block.strip(), suffix) if p]
    merged_head = "\n\n".join(parts).replace("\n\n\n", "\n\n")
    out = f"{merged_head}\n\n{tail}".replace("\n\n\n", "\n\n").strip() if tail else merged_head.strip()
    repairs.append(f"review_plain:restore_governing_law:{jurisdiction}")
    return out, repairs


def _renumber_heading_line(line: str, new_num: int, title: str) -> str:
    leading = line[: len(line) - len(line.lstrip())]
    return f"{leading}{new_num}. {title}"


def _compress_late_unused_skips(plain: str) -> Tuple[str, List[str]]:
    """Fill unused late-section holes (10 then 12, 12 then 14) without reminting 1..8."""
    repairs: List[str] = []
    raw = (plain or "").replace("\r\n", "\n")
    head, tail = _split_before_witness(raw)
    lines = head.split("\n")

    def headings() -> List[Tuple[int, int, str]]:
        return _heading_line_indexes("\n".join(lines))

    changed = True
    while changed:
        changed = False
        found = headings()
        used = [n for _, n, _ in found]
        for i in range(1, len(found)):
            _prev_idx, prev_num, _ = found[i - 1]
            _curr_idx, curr_num, _curr_title = found[i]
            if prev_num < LATE_SECTION_SKIP_FLOOR:
                continue
            if curr_num < prev_num + 2:
                continue
            hole = _unused_integers_between(prev_num, curr_num, used)
            if not hole:
                continue
            shift = curr_num - prev_num - 1
            for j in range(i, len(found)):
                line_idx, old_num, title = found[j]
                new_num = old_num - shift
                if new_num == old_num:
                    continue
                lines[line_idx] = _renumber_heading_line(lines[line_idx], new_num, title)
                repairs.append(f"review_plain:section_renumber:{old_num}->{new_num}")
            changed = True
            break

    merged_head = "\n".join(lines).replace("\n\n\n", "\n\n").rstrip()
    out = f"{merged_head}\n\n{tail.strip()}".replace("\n\n\n", "\n\n").strip() if tail.strip() else merged_head
    return out, repairs


def _renumber_all_top_level_sequential(plain: str) -> Tuple[str, List[str]]:
    """Renumber existing headings 1..N. Does not invent 10/11/12/13."""
    repairs: List[str] = []
    raw = (plain or "").replace("\r\n", "\n")
    head, tail = _split_before_witness(raw)
    lines = head.split("\n")
    found = _heading_line_indexes(head)
    if len(found) < 2:
        return raw, repairs
    nums = [n for _, n, _ in found]
    expected = list(range(1, len(nums) + 1))
    if nums == expected:
        return raw, repairs
    next_num = 1
    for line_idx, old_num, title in found:
        if old_num != next_num:
            lines[line_idx] = _renumber_heading_line(lines[line_idx], next_num, title)
            repairs.append(f"review_plain:section_renumber:{old_num}->{next_num}")
        next_num += 1
    merged_head = "\n".join(lines).replace("\n\n\n", "\n\n").rstrip()
    out = f"{merged_head}\n\n{tail.strip()}".replace("\n\n\n", "\n\n").strip() if tail.strip() else merged_head
    return out, repairs


def repair_review_plain_section_continuity(
    plain: str,
    *,
    original_intake: str = "",
    jurisdiction: str = "",
    remint_all_top_level: bool = False,
) -> dict:
    """Restore supplied governing law (if dropped) and fill skipped late section integers.

    ``remint_all_top_level`` is for newly generated Pro drafts only. Paint/persist of
    an existing Review must not remint leftover 1..8 into 10/11/12/13.
    """
    repairs: List[str] = []
    working = (plain or "").replace("\r\n", "\n")
    if not working.strip():
        return {"text": working, "repairs": repairs}

    gov = extract_supplied_governing_law(original_intake, jurisdiction=jurisdiction)
    if gov and not review_plain_has_operative_governing_law(working, gov):
        inserted, extra = _insert_governing_law_section(working, gov)
        working = inserted
        repairs.extend(extra)

    # Do not close an unused late hole (12 then 14) before governing law is restored;
    # compressing first would leave Notices as 13 and a later insert would duplicate 13.
    if review_plain_has_operative_governing_law(working, gov):
        late, extra = _compress_late_unused_skips(working)
        working = late
        repairs.extend(extra)

    if remint_all_top_level:
        reminted, extra = _renumber_all_top_level_sequential(working)
        working = reminted
        repairs.extend(extra)

    return {"text": working.replace("\n\n\n", "\n\n").strip(), "repairs": repairs}
