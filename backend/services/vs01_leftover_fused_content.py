"""Refuse leftover fused GET /content when persist Review exists.

Leftover remount must not hand off stale fused packet bytes (concatenated
If-to, stuffed Address, fused Misc) as a successful GET /content paint.
When persist Review GET (accepted / pending canonical-review-snapshot) exists,
leftover fused is never a 200.
"""

from __future__ import annotations

import logging
import re
from typing import Any, Dict, Optional

_log = logging.getLogger("claw.vs01_leftover_fused_content")

FIRST_FAILING_LEFTOVER_GET_CONTENT_PAINTS_BEFORE_PERSIST_REVIEW_REPLACE = (
    "esign_leftover_get_content_paints_before_persist_review_replace"
)

_SIGNING_CORPUS_MIN_LEN = 1500
_NON_BINDING_TEMPLATE_BANNER_RE = re.compile(
    r"Draft Agreement\s*\(\s*non[- ]binding template\s*\)",
    re.IGNORECASE,
)
_FUSED_MISC_OPENING_RE = re.compile(
    r"This Agreement is the entire agreement\s+This Agreement is between",
    re.IGNORECASE,
)
# Leftover stuffed Address is the Address *field* (term/execution prose), not a
# later Term/Misc clause. Crossing a numbered heading or the next If-to is
# persist Review, not leftover.
_STUFFED_NOTICE_TERM_RE = re.compile(
    r"(?:30\s*-?\s*days?|Upon full execution by the parties unless otherwise specified)",
    re.IGNORECASE,
)
_ADDRESS_LABEL_RE = re.compile(r"Address:", re.IGNORECASE)
_ADDRESS_FIELD_CUT_RE = re.compile(
    r"(?:^\s*\d+\.\s+[A-Za-z]|\n\s*\d+\.\s+[A-Za-z]|\s+\d+\.\s+[A-Za-z]"
    r"|If to\s+|This Agreement commences|Notices are effective)",
    re.IGNORECASE,
)
_IF_TO_HEADING_RE = re.compile(r"If to\s+(.+?)\s*:", re.IGNORECASE)
_PDF_LITERAL_RE = re.compile(r"\(((?:\\.|[^\\)])*)\)")
_ADDRESS_FIELD_WINDOW = 80


def _address_field_is_stuffed_leftover(body: str) -> bool:
    """True only when leftover term/execution is inside the Address field."""
    for match in _ADDRESS_LABEL_RE.finditer(body):
        window = body[match.end() : match.end() + _ADDRESS_FIELD_WINDOW]
        cut = _ADDRESS_FIELD_CUT_RE.search(window)
        field = window[: cut.start()] if cut else window
        if _STUFFED_NOTICE_TERM_RE.search(field):
            return True
    return False


def extract_plain_from_document_bytes(raw: bytes | None) -> str:
    """Plain extract from leftover GET /content: fitz, pypdf, PDF literals, or UTF-8."""
    if not raw:
        return ""
    text = ""
    try:
        import fitz  # type: ignore[import-not-found,import-untyped]

        doc = fitz.open(stream=raw, filetype="pdf")
        try:
            text = "\n".join((page.get_text() or "") for page in doc).strip()
        finally:
            doc.close()
    except Exception:
        text = ""
    if not text or text.startswith("%PDF"):
        try:
            from pypdf import PdfReader  # type: ignore[import-not-found]
            import io

            reader = PdfReader(io.BytesIO(raw))
            pages = [page.extract_text() or "" for page in reader.pages]
            text = "\n".join(pages).strip()
        except Exception:
            text = text if text and not text.startswith("%PDF") else ""
    if not text or text.startswith("%PDF"):
        utf8 = raw.decode("utf-8", errors="ignore").replace("\x00", "")
        if utf8.startswith("%PDF"):
            strings: list[str] = []
            for match in _PDF_LITERAL_RE.finditer(utf8):
                lit = (
                    match.group(1)
                    .replace("\\n", "\n")
                    .replace("\\r", "\n")
                    .replace("\\t", "\t")
                    .replace("\\(", "(")
                    .replace("\\)", ")")
                    .replace("\\\\", "\\")
                )
                if lit.strip():
                    strings.append(lit)
            glued = "\n".join(strings).strip()
            if glued:
                text = glued
            elif not text:
                text = utf8
        elif not text:
            text = utf8
    return (text or "").replace("\r\n", "\n").strip()


def review_corpus_looks_like_leftover_fused_notices(text: str | None) -> bool:
    """Generic leftover fused Notices / Misc — no party or venue fixtures."""
    body = (text or "").replace("\r\n", "\n")
    if not body.strip():
        return False
    if _FUSED_MISC_OPENING_RE.search(body):
        return True
    if _address_field_is_stuffed_leftover(body):
        return True
    headings: list[str] = []
    seen: set[str] = set()
    for match in _IF_TO_HEADING_RE.finditer(body):
        entity = (match.group(1) or "").strip()
        if not entity:
            continue
        key = entity.lower()
        if key in seen:
            continue
        seen.add(key)
        headings.append(entity)
    for i, longer in enumerate(headings):
        for j, shorter in enumerate(headings):
            if i == j:
                continue
            if len(longer) > len(shorter) and shorter.lower() in longer.lower():
                return True
    return False


def persist_review_corpus_from_draft(draft: Any) -> str:
    """Same persist Review GET body Review already painted (accepted, else pending)."""
    from backend.services.accepted_review_snapshot import (
        get_accepted_snapshot_record,
        get_registry,
    )

    accepted = get_accepted_snapshot_record(draft)
    if isinstance(accepted, dict):
        plain = str(accepted.get("corpusPlain") or accepted.get("corpus_plain") or "").strip()
        if plain:
            return plain
    reg = get_registry(draft)
    snaps = reg.get("snapshots") if isinstance(reg.get("snapshots"), dict) else {}
    pending = [
        s
        for s in snaps.values()
        if isinstance(s, dict) and str(s.get("status") or "").strip() == "pending"
    ]
    pending.sort(key=lambda s: str(s.get("createdAt") or ""), reverse=True)
    latest = pending[0] if pending else None
    if isinstance(latest, dict):
        return str(latest.get("corpusPlain") or latest.get("corpus_plain") or "").strip()
    return ""


def persist_review_exists_for_agreement(agreement_id: str) -> bool:
    aid = (agreement_id or "").strip()
    if not aid:
        return False
    try:
        from backend.services.agreement_draft_store import load_draft

        draft = load_draft(aid)
    except Exception:
        return False
    return bool(persist_review_corpus_from_draft(draft).strip())


def certified_persist_review_plain(text: str | None) -> str:
    plain = (text or "").strip()
    if len(plain) < _SIGNING_CORPUS_MIN_LEN:
        return ""
    if _NON_BINDING_TEMPLATE_BANNER_RE.search(plain):
        return ""
    if review_corpus_looks_like_leftover_fused_notices(plain):
        return ""
    return plain


def _agreement_id_from_meta_or_artifact(
    meta: Optional[Dict[str, Any]],
    document_id: str | None = None,
) -> str:
    """Same agreement identity already bound to this vs01 document — never a second id."""
    if isinstance(meta, dict):
        aid = str(meta.get("agreement_id") or "").strip()
        if aid:
            return aid
    did = (document_id or "").strip()
    if not did:
        return ""
    try:
        from backend.storage.artifact_repository import get_artifact_repository

        rec = get_artifact_repository().get_latest_by_logical_ref(
            artifact_type="vs01_document",
            logical_ref=did,
        )
        if rec is not None and rec.agreement_id:
            return str(rec.agreement_id).strip()
    except Exception:
        return ""
    return ""


def leftover_get_content_must_refuse(
    raw: bytes | None,
    meta: Optional[Dict[str, Any]] = None,
    document_id: str | None = None,
) -> bool:
    """True when leftover fused GET /content would paint and persist Review exists.

    Do not assume extract already classifies leftover. Search extract and raw
    UTF-8. Matching certified Review GET /content stays a 200.
    """
    extracted = extract_plain_from_document_bytes(raw)
    raw_plain = (raw or b"").decode("utf-8", errors="ignore").replace("\x00", "")
    leftover_looking = review_corpus_looks_like_leftover_fused_notices(
        extracted
    ) or review_corpus_looks_like_leftover_fused_notices(raw_plain)
    if not leftover_looking:
        return False
    agreement_id = _agreement_id_from_meta_or_artifact(meta, document_id)
    if not persist_review_exists_for_agreement(agreement_id):
        return False
    _log.info(
        "[vs01-leftover-get-content-refuse] agreement_id=%s size_bytes=%s predicate=%s",
        agreement_id,
        len(raw or b""),
        FIRST_FAILING_LEFTOVER_GET_CONTENT_PAINTS_BEFORE_PERSIST_REVIEW_REPLACE,
    )
    return True
