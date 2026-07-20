"""Canonical completed signed agreement PDF export (fully executed snapshot only)."""

from __future__ import annotations

import html
import re
from typing import Any, Dict, List, Literal, Optional, Tuple

from fastapi import HTTPException
from starlette.responses import Response

from backend.agreements.placeholder_template_safety import (
    strip_html_agreement_scan_text,
    validate_user_visible_agreement_text,
)
from backend.services.agreement_pdf_story_capability import (
    RECIPIENT_PREVIEW_PDF_STORY_RENDER_MODES,
    assess_agreement_pdf_story_capability,
)
from backend.services.agreement_vs01_pdf_seed import agreement_rendered_html_to_pdf_bytes
from backend.services.vs01_signer_completion import read_fully_executed_snapshot_from_draft

_RECIPIENT_PDF_EXPORT_UNAVAILABLE_USER = (
    "PDF export is temporarily unavailable. Please use Copy or Download text for now."
)

BlockKind = Literal[
    "document_title",
    "main_section_heading",
    "legacy_section_heading",
    "subsection_heading",
    "witness_heading",
    "signature_party_start",
    "signature_entity_name",
    "signature_field",
    "body_paragraph",
]

_SUBSECTION_HEADING_RE = re.compile(r"^\d+\.\d+(?:\.\d+)*\.?\s+")
_GLUED_MAIN_HEADING_BODY_START_RE = re.compile(
    r"\s+(?:The|This|Each|Either|Any|Neither|Both|When|If|Unless|Upon|Where|As|An|A|In|For|"
    r"Client|Service\s+Provider|Neither\s+party|Either\s+party|During|Within|After|Before|One|Party|"
    r"All|Some|Such|Notwithstanding)\s+",
    re.I,
)
_MAIN_HEADING_BODY_VERB_RE = re.compile(
    r"\b(?:will|shall|must|may|should|are|is|was|were|have|has|had|agrees?|represents?)\b",
    re.I,
)
_SIGNATURE_PARTY_HEADER_RE = re.compile(r"^(?:CLIENT|SERVICE\s+PROVIDER|PARTY\s+\d+)\s*:?\s*$", re.I)
_SIGNATURE_ENTITY_LINE_RE = re.compile(
    r"\b(?:LLC|L\.L\.C\.|Inc\.?|Incorporated|Corp\.?|Corporation|Ltd\.?|Limited|LLP|PLLC|LP|L\.P\.)\b",
    re.I,
)
_WITNESS_RE = re.compile(r"\bIN WITNESS WHEREOF\b", re.I)
_CLIENT_BLOCK_RE = re.compile(r"\n\s*CLIENT\s*:\s*(?:\n|$)", re.I)
_SIG_HEADING_RE = re.compile(r"\n\s*SIGNATURES?\s*:?\s*(?:\n|$)", re.I)
_GLUED_BODY_START = (
    r"(?:The|This|Each|Either|Upon|Unless|If|When|Where|As|An|A|In|For|Client|Service\s+Provider|"
    r"Neither|During|Within|After|Before|One|Party|All|Any|Notwithstanding)\b"
)
_MAIN_SECTION_GLUE_RE = re.compile(
    rf"^(\d+\.\s+(?!\d+\.\d).+?)\s+({_GLUED_BODY_START}.+)",
    re.S,
)
_MAIN_PERIOD_GLUE_RE = re.compile(r"^(\d+\.\s+(?!\d+\.\d)[^.\n]{3,120}?)\.\s+([A-Z].+)$", re.S)
_SUBSECTION_PERIOD_GLUE_RE = re.compile(r"^(\d+\.\d+(?:\.\d+)*\s+[^.\n]{3,120}?)\.\s+(.+)$", re.S)
_BY_SIGNATURE_RE = re.compile(r"^(By:\s*)(.+)$", re.I)
_GLUED_MAIN_AND_SUBSECTION_HEADING_RE = re.compile(r"^\d+\.\s+(?!\d+\.\d).+\s+\d+\.\d+\s+")


def read_completed_signed_corpus_plain(draft: Dict[str, Any]) -> str:
    """Authoritative signed agreement text for completed PDF export."""
    from backend.services.vs01_completed_agreement_artifact import read_artifact_bound_corpus_plain

    artifact_corpus = read_artifact_bound_corpus_plain(draft)
    if artifact_corpus:
        return artifact_corpus
    snap = read_fully_executed_snapshot_from_draft(draft)
    return str((snap or {}).get("corpus_plain") or "").strip()


def _find_signature_region_start(text: str) -> int:
    raw = text or ""
    length = len(raw)
    if length < 80:
        return -1
    min_fraction = 0.45 if length >= 2000 else 0.12
    min_pos = int(length * min_fraction)

    witness_matches = list(_WITNESS_RE.finditer(raw))
    for match in reversed(witness_matches):
        idx = match.start()
        if idx >= min_pos:
            return idx
    for match in reversed(witness_matches):
        idx = match.start()
        if idx >= int(length * 0.72):
            return idx

    client_match = _CLIENT_BLOCK_RE.search(raw)
    if client_match and client_match.start() >= min_pos:
        return client_match.start()

    for match in reversed(list(_SIG_HEADING_RE.finditer(raw))):
        idx = match.start()
        if idx >= min_pos:
            return idx
    return -1


def _is_standalone_all_caps_title_line(line: str) -> bool:
    t = line.strip()
    if len(t) < 4 or len(t) > 96:
        return False
    if re.match(r"^\d+\.", t):
        return False
    if re.search(r"[a-z]", t):
        return False
    return bool(re.match(r"^[A-Z]", t))


def _is_first_block_document_title(first_line: str) -> bool:
    t = first_line.strip()
    if len(t) < 8 or len(t) > 160:
        return False
    if re.match(r"^\d+\.", t):
        return False
    return t == t.upper() or bool(re.match(r"^[A-Z][^.!?]{12,}$", t))


def _is_main_section_heading_line(line: str) -> bool:
    t = line.strip()
    if not t or _SUBSECTION_HEADING_RE.match(t):
        return False
    match = re.match(r"^(\d+)\.\s+(.+)$", t)
    if not match:
        return False
    body = match.group(2).strip()
    if len(body) < 3 or len(body) > 160:
        return False
    if re.search(r"\.\s+[A-Za-z]", body):
        return False
    if _MAIN_HEADING_BODY_VERB_RE.search(body):
        return False
    if _GLUED_MAIN_HEADING_BODY_START_RE.search(body):
        return False
    if re.match(r"^[A-Z0-9 ·/—–'\-,&();:]+$", body):
        return True
    if re.match(r"^[A-Z][a-zA-Z0-9\s/&,\-'—–().;:]+$", body):
        if re.search(r"\.\s+[a-z]", body):
            return False
        return len(body.split()) <= 16
    return False


def _is_subsection_heading_line(line: str) -> bool:
    t = line.strip()
    if not _SUBSECTION_HEADING_RE.match(t):
        return False
    remainder = re.sub(r"^\d+\.\d+(?:\.\d+)*\.?\s+", "", t).strip()
    if not remainder or len(remainder) > 120:
        return False
    if re.search(r"\.\s+[a-z]", remainder):
        return False
    if _MAIN_HEADING_BODY_VERB_RE.search(remainder):
        return False
    if _GLUED_MAIN_HEADING_BODY_START_RE.search(remainder):
        return False
    return len(remainder.split()) <= 14


def _split_glued_section_heading_from_line(line: str) -> str:
    trimmed = line.strip()
    if len(trimmed) < 24 or not re.match(r"^\d+\.", trimmed):
        return line

    sub_period = _SUBSECTION_PERIOD_GLUE_RE.match(trimmed)
    if sub_period:
        return f"{sub_period.group(1)}.\n{sub_period.group(2).strip()}"

    main_period = _MAIN_PERIOD_GLUE_RE.match(trimmed)
    if main_period and not re.match(r"^\d+\.\d", main_period.group(2)):
        return f"{main_period.group(1)}.\n{main_period.group(2).strip()}"

    glued = _MAIN_SECTION_GLUE_RE.match(trimmed)
    if glued:
        heading = glued.group(1).strip()
        body = glued.group(2).strip()
        if 6 <= len(heading) <= 110 and len(body) >= 8:
            return f"{heading}\n{body}"
    return line


def _extract_main_section_heading_prefix(line: str) -> Optional[Tuple[str, str]]:
    t = line.strip()
    if not t or _SUBSECTION_HEADING_RE.match(t):
        return None
    numbered = re.match(r"^(\d+)\.\s+(.+)$", t)
    if numbered:
        dot_split = re.match(r"^(.+?)\.\s+(.+)$", numbered.group(2), re.S)
        if dot_split:
            heading = f"{numbered.group(1)}. {dot_split.group(1).strip()}"
            remainder = dot_split.group(2).strip()
            if remainder and _is_main_section_heading_line(heading):
                return heading, remainder
        glued = _split_glued_section_heading_from_line(t)
        if "\n" in glued:
            parts = [p.strip() for p in glued.split("\n") if p.strip()]
            if parts:
                heading_line = parts[0]
                remainder = "\n".join(parts[1:]).strip()
                if remainder and _is_main_section_heading_line(heading_line):
                    return heading_line, remainder
    if _is_main_section_heading_line(t):
        return t, ""
    return None


def _split_glued_main_and_subsection_heading_line(line: str) -> Optional[Tuple[str, str]]:
    t = line.strip()
    if not _GLUED_MAIN_AND_SUBSECTION_HEADING_RE.match(t):
        return None
    match = re.match(r"^(\d+\.\s+(?!\d+\.\d).+?)\s+(\d+\.\d+\s+.*)$", t)
    if not match:
        return None
    return match.group(1).strip(), match.group(2).strip()


def _split_single_document_block(block: str) -> List[str]:
    trimmed = block.strip()
    if not trimmed:
        return []

    if "\n" not in trimmed:
        glued = _split_glued_main_and_subsection_heading_line(trimmed)
        if glued:
            return [glued[0], glued[1]]
        embedded = _extract_main_section_heading_prefix(trimmed)
        if embedded and embedded[1]:
            return [embedded[0], embedded[1]]
        if embedded and embedded[0]:
            return [embedded[0]]
        return [trimmed]

    lines = trimmed.split("\n")
    first_t = (lines[0] or "").strip()
    if _is_subsection_heading_line(first_t) and len(lines) > 1:
        rest = "\n".join(lines[1:]).strip()
        return [first_t, rest] if rest else [first_t]
    if _is_main_section_heading_line(first_t) and len(lines) > 1:
        rest = "\n".join(lines[1:]).strip()
        return [first_t, rest] if rest else [first_t]

    lines = trimmed.split("\n")
    segments: List[str] = []
    current: List[str] = []

    def flush_current() -> None:
        text = "\n".join(current).strip()
        if text:
            segments.append(text)
        current.clear()

    for line in lines:
        t = line.strip()
        repaired_line = _split_glued_section_heading_from_line(t)
        if repaired_line != t:
            flush_current()
            for part in [p.strip() for p in repaired_line.split("\n") if p.strip()]:
                segments.extend(_split_single_document_block(part))
            continue
        glued = _split_glued_main_and_subsection_heading_line(t)
        if glued:
            flush_current()
            segments.append(glued[0])
            current.append(glued[1])
            continue
        if _is_main_section_heading_line(t):
            flush_current()
            segments.append(t)
            continue
        embedded = _extract_main_section_heading_prefix(t)
        if embedded and embedded[1]:
            flush_current()
            segments.append(embedded[0])
            current.append(embedded[1])
            continue
        if embedded and embedded[0] and not embedded[1]:
            flush_current()
            segments.append(embedded[0])
            continue
        current.append(line)

    flush_current()
    return segments or [trimmed]


def _split_document_blocks(raw: str) -> List[str]:
    text = (raw or "").replace("\r\n", "\n")
    out: List[str] = []
    for part in re.split(r"\n\n+", text):
        block = part.strip()
        if not block:
            continue
        out.extend(_split_single_document_block(block))
    return out


def _classify_signature_line(first_line: str) -> Optional[BlockKind]:
    t = first_line.strip()
    if _SIGNATURE_PARTY_HEADER_RE.match(t):
        return "signature_party_start"
    if (
        4 <= len(t) <= 120
        and _SIGNATURE_ENTITY_LINE_RE.search(t)
        and not re.match(r"^(?:by|name|title|date|email|address|signature)\s*:", t, re.I)
    ):
        return "signature_entity_name"
    if re.match(r"^email(?:\s+for\s+notices?)?\s*:", t, re.I):
        return "signature_field"
    if re.match(r"^(?:by|name|title|date|address|signature)\s*:", t, re.I):
        return "signature_field"
    return None


def _classify_block(block: str, block_index: int, in_signature_region: bool) -> BlockKind:
    text = block.strip()
    lines = text.split("\n")
    single_line = len(lines) == 1
    first_line = (lines[0] or "").strip()

    if in_signature_region and single_line and _SIGNATURE_PARTY_HEADER_RE.match(first_line):
        return "signature_party_start"
    if single_line and _is_main_section_heading_line(first_line):
        return "main_section_heading"
    if single_line and re.match(r"^Section\s+\d+\.", first_line, re.I):
        return "legacy_section_heading"
    if single_line and _is_subsection_heading_line(first_line):
        return "subsection_heading"
    if single_line and _WITNESS_RE.search(first_line):
        return "witness_heading"

    is_title = (
        block_index == 0
        and single_line
        and _is_first_block_document_title(first_line)
    ) or (
        block_index != 0
        and single_line
        and _is_standalone_all_caps_title_line(first_line)
        and not _SIGNATURE_PARTY_HEADER_RE.match(first_line)
    )
    if is_title:
        return "document_title"

    if in_signature_region:
        sig_kind = _classify_signature_line(first_line)
        if sig_kind and sig_kind != "signature_party_start":
            return sig_kind

    return "body_paragraph"


def _format_signature_line_html(line: str) -> str:
    match = _BY_SIGNATURE_RE.match(line.strip())
    if match:
        value = match.group(2).strip()
        if value and not re.match(r"^_{2,}$", value) and value.lower() not in {"[signature]"}:
            return (
                f"{html.escape(match.group(1))}"
                f'<span class="completed-signed-signature-script">{html.escape(value)}</span>'
            )
    return html.escape(line)


def _render_block_html(block: str, kind: BlockKind, in_signature_region: bool) -> str:
    chunk = block.strip()
    if not chunk:
        return ""
    lines = chunk.split("\n")

    if kind == "document_title":
        return f'<h1 class="completed-signed-doc-title">{html.escape(chunk)}</h1>'
    if kind in {"main_section_heading", "legacy_section_heading"}:
        return f'<h2 class="completed-signed-section-heading">{html.escape(chunk)}</h2>'
    if kind == "subsection_heading":
        return f'<h3 class="completed-signed-subsection-heading">{html.escape(chunk)}</h3>'
    if kind == "witness_heading":
        return f'<p class="completed-signed-witness">{html.escape(chunk)}</p>'
    if kind == "signature_party_start":
        return f'<p class="completed-signed-signature-party">{html.escape(chunk)}</p>'

    inner = (
        "<br />".join(_format_signature_line_html(ln) for ln in lines)
        if in_signature_region
        else "<br />".join(html.escape(ln) for ln in lines)
    )
    if kind == "signature_entity_name":
        return f'<p class="completed-signed-signature-entity">{inner}</p>'
    if kind == "signature_field":
        return f'<p class="completed-signed-signature-field">{inner}</p>'
    return f'<p class="completed-signed-body">{inner}</p>'


def _expand_signature_region_blocks(raw: str, blocks: List[str]) -> List[str]:
    signature_region_start = _find_signature_region_start(raw)
    if signature_region_start < 0:
        return blocks
    expanded: List[str] = []
    chunk_offset = 0
    for block in blocks:
        block_start = raw.find(block, chunk_offset)
        if block_start >= 0:
            chunk_offset = block_start
        in_signature_region = chunk_offset >= signature_region_start
        if in_signature_region and "\n" in block:
            lines = [ln.strip() for ln in block.split("\n") if ln.strip()]
            if any(_SIGNATURE_PARTY_HEADER_RE.match(ln) for ln in lines):
                expanded.extend(lines)
                chunk_offset += len(block) + 2
                continue
        expanded.append(block)
        chunk_offset += len(block) + 2
    return expanded


def completed_signed_corpus_to_export_html(corpus_plain: str) -> str:
    """
    Structured HTML for completed signed PDF export.

    Reads only ``corpus_plain`` — presentation mapping only; corpus bytes are never mutated.
    """
    raw = (corpus_plain or "").replace("\r\n", "\n").strip()
    if not raw:
        return ""

    signature_region_start = _find_signature_region_start(raw)
    split_blocks = _expand_signature_region_blocks(raw, _split_document_blocks(raw))
    parts: List[str] = []
    chunk_offset = 0

    for block_index, block in enumerate(split_blocks):
        if not block:
            continue
        block_start = raw.find(block, chunk_offset)
        if block_start >= 0:
            chunk_offset = block_start
        in_signature_region = signature_region_start >= 0 and chunk_offset >= signature_region_start
        kind = _classify_block(block, block_index, in_signature_region)
        rendered = _render_block_html(block, kind, in_signature_region)
        if rendered:
            parts.append(rendered)
        chunk_offset += len(block) + 2

    return f'<article class="completed-signed-doc">{"".join(parts)}</article>'


def _draft_placeholder_intake_corpus(draft: Any) -> str:
    parts: list[str] = []
    for p in getattr(draft, "parties", None) or []:
        nm = str(getattr(p, "name", None) or "").strip()
        em = str(getattr(p, "email", None) or "").strip()
        if nm:
            parts.append(nm)
        if em:
            parts.append(em)
    for key in ("purpose", "payment_terms", "title", "jurisdiction"):
        seg = str(getattr(draft, key, None) or "").strip()
        if seg:
            parts.append(seg)
    return "\n".join(parts)


def _completed_signed_pdf_filename(draft: Any) -> str:
    title = str(getattr(draft, "title", None) or "").strip() or "agreement"
    slug = re.sub(r"[^a-z0-9]+", "-", title.lower()).strip("-")[:80] or "agreement"
    return f"{slug}-signed.pdf"


def build_completed_signed_pdf_bytes(*, agreement_id: str, draft: Any) -> Tuple[bytes, str]:
    """
    Build canonical completed signed PDF bytes from stored fully_executed_snapshot only.

    Ignores any client/dashboard HTML so signature blocks stay identical across surfaces.
    Lazily rebuilds missing snapshot from audit/portable when fully executed.
    """
    draft_dict = draft.model_dump() if hasattr(draft, "model_dump") else dict(draft)
    corpus_plain = read_completed_signed_corpus_plain(draft_dict)
    if len(corpus_plain) < 80:
        from backend.services.vs01_fully_executed_snapshot import ensure_fully_executed_snapshot_on_draft

        ensured = ensure_fully_executed_snapshot_on_draft(draft_dict, agreement_id=agreement_id)
        if ensured.snapshot_ready:
            corpus_plain = read_completed_signed_corpus_plain(ensured.draft_dict)
    if len(corpus_plain) < 80:
        raise HTTPException(status_code=409, detail="signed_snapshot_unavailable")

    html_for_export = completed_signed_corpus_to_export_html(corpus_plain)

    cap = assess_agreement_pdf_story_capability()
    if not cap.get("available"):
        raise HTTPException(
            status_code=503,
            detail={
                "code": "completed_signed_pdf_export_unavailable",
                "message": _RECIPIENT_PDF_EXPORT_UNAVAILABLE_USER,
            },
        )

    party_names_pdf = [
        str(getattr(p, "name", None) or "").strip()
        for p in (getattr(draft, "parties", None) or [])
        if str(getattr(p, "name", None) or "").strip()
    ]
    scan_plain = strip_html_agreement_scan_text(html_for_export or "")
    ok_ph_pdf, _, ph_diag_pdf = validate_user_visible_agreement_text(
        scan_plain,
        party_names=party_names_pdf,
        intake_raw=_draft_placeholder_intake_corpus(draft),
        surface="completed_signed_export_pdf",
        agreement_family="",
    )
    if not ok_ph_pdf:
        raise HTTPException(
            status_code=422,
            detail={
                "code": "agreement_placeholder_blocked",
                "message": "This export still contains drafting placeholders. Resolve them before creating a PDF.",
                "placeholder": ph_diag_pdf,
            },
        )

    title = str(getattr(draft, "title", None) or "").strip() or "Agreement"
    built = agreement_rendered_html_to_pdf_bytes(
        html_for_export,
        title=title,
        story_css_profile="completed_signed",
    )
    if built.render_mode not in RECIPIENT_PREVIEW_PDF_STORY_RENDER_MODES:
        raise HTTPException(
            status_code=503,
            detail={
                "code": "completed_signed_pdf_export_unavailable",
                "message": _RECIPIENT_PDF_EXPORT_UNAVAILABLE_USER,
            },
        )

    return built.pdf_bytes, _completed_signed_pdf_filename(draft)


def build_completed_signed_pdf_response(*, agreement_id: str, draft: Any) -> Response:
    pdf_bytes, filename = build_completed_signed_pdf_bytes(agreement_id=agreement_id, draft=draft)
    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )
