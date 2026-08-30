"""Refuse leftover GET /content when persist Review exists.

Leftover remount must not hand off leftover packet bytes as a successful
GET /content paint. Refuse because those bytes are not the persist Review
corpus for this document's agreement_id (meta or artifact). Do not decide
leftover by leftover-text classification of extract / raw UTF-8. Matching
certified Review GET /content stays a 200.
"""

from __future__ import annotations

import hashlib
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


def persist_review_plain_for_agreement(agreement_id: str) -> str:
    """Persist Review GET body for this agreement — never leftover-text filtered."""
    aid = (agreement_id or "").strip()
    if not aid:
        return ""
    try:
        from backend.services.agreement_draft_store import load_draft

        draft = load_draft(aid)
    except Exception:
        return ""
    plain = persist_review_corpus_from_draft(draft).strip()
    if len(plain) < _SIGNING_CORPUS_MIN_LEN:
        return ""
    if _NON_BINDING_TEMPLATE_BANNER_RE.search(plain):
        return ""
    return plain


def persist_review_exists_for_agreement(agreement_id: str) -> bool:
    return bool(persist_review_plain_for_agreement(agreement_id))


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


def _ws_collapse(text: str) -> str:
    return re.sub(r"\s+", " ", (text or "").strip()).lower()


def _looks_unreadable_extract(text: str) -> bool:
    t = (text or "").strip()
    if not t:
        return True
    if t.startswith("%PDF"):
        return True
    letters = sum(1 for ch in t if ch.isalpha())
    return len(t) >= 64 and letters / len(t) < 0.2


def _sha256_text(text: str) -> str:
    return hashlib.sha256((text or "").encode("utf-8")).hexdigest()


_PERSIST_IDENTITY_SPAN = 200
_PERSIST_IDENTITY_SPAN_STEP = 40


def _unique_persist_span_present(persist_norm: str, cand_norm: str) -> bool:
    """True when a unique persist Review span is present in the packet extract.

    Seed Story PDFs extract a truncated persist Review page (bottom-margin
    clip / wrap cut). Full-string containment then misses, and leftover refuse
    409s the persist Review PDF. Two spans that each occur once in persist
    Review are identity, not leftover-text — leftover that only shares one
    section must not pass.
    """
    persist = persist_norm or ""
    cand = cand_norm or ""
    span = _PERSIST_IDENTITY_SPAN
    if len(persist) < span or len(cand) < 80:
        return False
    step = _PERSIST_IDENTITY_SPAN_STEP
    hits = 0
    for i in range(0, len(persist) - span + 1, step):
        window = persist[i : i + span]
        if persist.count(window) != 1:
            continue
        if window in cand:
            hits += 1
            if hits >= 2:
                return True
    return False


def packet_is_persist_review_corpus(raw: bytes | None, persist_plain: str | None) -> bool:
    """True when GET /content packet bytes are this agreement's persist Review.

    Identity only — digest, collapsed-whitespace containment, or a unique
    persist Review span in the extract. Do not decide leftover by leftover-text
    classification of extract / raw UTF-8.
    """
    persist = (persist_plain or "").strip()
    if len(persist) < _SIGNING_CORPUS_MIN_LEN:
        return False
    persist_norm = _ws_collapse(persist)
    persist_digest = _sha256_text(persist)
    persist_norm_digest = _sha256_text(persist_norm)
    extracted = extract_plain_from_document_bytes(raw)
    raw_plain = (raw or b"").decode("utf-8", errors="ignore").replace("\x00", "")
    for candidate in (extracted, raw_plain):
        cand = (candidate or "").strip()
        if not cand or _looks_unreadable_extract(cand):
            continue
        if _sha256_text(cand) == persist_digest:
            return True
        cand_norm = _ws_collapse(cand)
        if _sha256_text(cand_norm) == persist_norm_digest:
            return True
        if persist_norm and persist_norm in cand_norm:
            return True
        if (
            cand_norm
            and len(cand_norm) >= _SIGNING_CORPUS_MIN_LEN
            and cand_norm in persist_norm
        ):
            return True
        if _unique_persist_span_present(persist_norm, cand_norm):
            return True
    return False


def leftover_get_content_must_refuse(
    raw: bytes | None,
    meta: Optional[Dict[str, Any]] = None,
    document_id: str | None = None,
) -> bool:
    """True when GET /content packet is not persist Review and persist Review exists.

    Refuse leftover packet bytes because they are not the persist Review corpus
    for this document's agreement_id (meta or artifact). Do not decide leftover
    by leftover-text classification of extract / raw UTF-8 — a compressed
    leftover PDF can extract without leftover fused markers. Matching certified
    Review GET /content stays a 200. Leftover 200 is FAIL when persist Review
    exists.
    """
    agreement_id = _agreement_id_from_meta_or_artifact(meta, document_id)
    persist_plain = persist_review_plain_for_agreement(agreement_id)
    if not persist_plain:
        return False
    if packet_is_persist_review_corpus(raw, persist_plain):
        return False
    _log.info(
        "[vs01-leftover-get-content-refuse] agreement_id=%s size_bytes=%s predicate=%s",
        agreement_id,
        len(raw or b""),
        FIRST_FAILING_LEFTOVER_GET_CONTENT_PAINTS_BEFORE_PERSIST_REVIEW_REPLACE,
    )
    return True
