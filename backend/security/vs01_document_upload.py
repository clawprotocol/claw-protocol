"""Server-boundary checks for customer PDF finalize uploads.

Internal ``finalize_document`` remains byte-preserving for seeded/test paper.
``POST /v1/documents`` must reject empty, non-PDF, and oversized payloads with
stable codes — never provider/traceback text.
"""

from __future__ import annotations

from typing import Optional

MAX_FINALIZE_PDF_BYTES = 25 * 1024 * 1024
PDF_MAGIC = b"%PDF"
ALLOWED_PDF_CONTENT_TYPES = frozenset({"application/pdf", "application/x-pdf"})


class DocumentUploadRejected(ValueError):
    """Sanitized finalize rejection. ``str(exc)`` is the public error code."""


def validate_finalize_upload_bytes(
    raw: bytes,
    content_type: Optional[str] = None,
    *,
    max_bytes: Optional[int] = None,
) -> None:
    limit = MAX_FINALIZE_PDF_BYTES if max_bytes is None else max_bytes
    if not raw:
        raise DocumentUploadRejected("empty_document")
    if len(raw) > limit:
        raise DocumentUploadRejected("document_too_large")
    ct = (content_type or "").strip().lower()
    if ct and ct.split(";", 1)[0].strip() not in ALLOWED_PDF_CONTENT_TYPES:
        raise DocumentUploadRejected("document_not_pdf")
    if not raw.startswith(PDF_MAGIC):
        raise DocumentUploadRejected("document_not_pdf")
