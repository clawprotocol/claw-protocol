"""Owner-guarded envelope for an uploaded final PDF.

Binds a VS01 document to a durable agreement so Phase 4B.4 packet/token
contracts can run. This is not a LawDog drafting path and does not claim
legal or commercial review of the uploaded paper.
"""

from __future__ import annotations

import hashlib
import re
import uuid
import zipfile
from datetime import datetime, timezone
from io import BytesIO
from typing import Any, Dict, List, Optional, Tuple

from fastapi import HTTPException

PLACEHOLDER_NAMES = frozenset(
    {"", "owner", "recipient", "party", "you", "me", "name", "signer", "counterparty", "n/a", "na", "tbd"}
)
EMAIL_RE = re.compile(r"^[A-Z0-9._%+\-]+@[A-Z0-9.\-]+\.[A-Z]{2,}$", re.IGNORECASE)
PLACEHOLDER_EMAILS = frozenset(
    {
        "you@email.com",
        "name@email.com",
        "owner@example.com",
        "recipient@example.com",
        "party@example.com",
        "test@test.com",
        "user@email.com",
    }
)

OWNER_ROLE_ID = "qs_owner"
RECIPIENT_ROLE_ID = "qs_recipient"


def _utc_now_iso() -> str:
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")


def build_quick_pdf_lock_corpus(
    *,
    document_id: str,
    content_sha256: str,
    size_bytes: int,
    content_type: str,
) -> str:
    head = (
        "LAWDOG_QUICK_PDF_ENVELOPE_V1\n"
        "This record identifies an uploaded final PDF. LawDog did not draft this paper "
        "and does not review its legal or commercial sufficiency.\n"
        f"document_id={document_id.strip()}\n"
        f"content_sha256={content_sha256.strip().lower()}\n"
        f"size_bytes={int(size_bytes)}\n"
        f"content_type={(content_type or '').strip()}\n"
    )
    pad = ("locked-uploaded-final-pdf-identity\n" * 16)
    body = head + pad
    if len(body) < 500:
        body = body + ("x" * (500 - len(body)))
    return body


def validate_party_identity(name: str, email: str, *, label: str) -> Tuple[str, str]:
    nm = (name or "").strip()
    em = (email or "").strip().lower()
    if nm.lower() in PLACEHOLDER_NAMES or len(nm) < 2:
        raise HTTPException(
            status_code=400,
            detail={"code": "invalid_party_name", "message": f"Enter the {label}'s real name."},
        )
    if em in PLACEHOLDER_EMAILS or not EMAIL_RE.match(em):
        raise HTTPException(
            status_code=400,
            detail={"code": "invalid_party_email", "message": f"Enter a valid {label} email."},
        )
    return nm, em


def validate_fields(
    fields: List[Dict[str, Any]],
    *,
    owner_role_id: str,
    recipient_role_id: str,
    page_count: int,
) -> List[Dict[str, Any]]:
    if page_count < 1:
        raise HTTPException(status_code=400, detail={"code": "invalid_page_count", "message": "PDF page count is missing."})
    out: List[Dict[str, Any]] = []
    boxes: List[Tuple[int, float, float, float, float]] = []
    owner_sig = 0
    recip_sig = 0
    for raw in fields or []:
        if not isinstance(raw, dict):
            continue
        fid = str(raw.get("field_id") or raw.get("id") or "").strip() or f"fld_{uuid.uuid4().hex[:12]}"
        role = str(raw.get("signer_role_id") or "").strip()
        ftype = str(raw.get("field_type") or "signature").strip().lower()
        try:
            page = int(raw.get("page_index"))
            x = float(raw.get("x"))
            y = float(raw.get("y"))
            w = float(raw.get("w"))
            h = float(raw.get("h"))
        except (TypeError, ValueError) as exc:
            raise HTTPException(
                status_code=400,
                detail={"code": "malformed_field", "message": "A signature field is missing page or position."},
            ) from exc
        if role not in {owner_role_id, recipient_role_id}:
            raise HTTPException(
                status_code=400,
                detail={"code": "unassigned_field", "message": "Every field must belong to the owner or recipient."},
            )
        if page < 0 or page >= page_count:
            raise HTTPException(
                status_code=400,
                detail={"code": "off_page_field", "message": "A field sits outside the PDF pages."},
            )
        if w <= 0 or h <= 0 or x < 0 or y < 0 or x + w > 1.0001 or y + h > 1.0001:
            raise HTTPException(
                status_code=400,
                detail={"code": "malformed_field", "message": "A field is off the page or has no size."},
            )
        for op, ox, oy, ow, oh in boxes:
            if op == page and not (x + w <= ox or ox + ow <= x or y + h <= oy or oy + oh <= y):
                raise HTTPException(
                    status_code=400,
                    detail={"code": "overlapping_field", "message": "Required fields cannot overlap."},
                )
        boxes.append((page, x, y, w, h))
        if ftype == "signature":
            if role == owner_role_id:
                owner_sig += 1
            if role == recipient_role_id:
                recip_sig += 1
        out.append(
            {
                "field_id": fid,
                "signer_role_id": role,
                "field_type": ftype,
                "page_index": page,
                "x": x,
                "y": y,
                "w": w,
                "h": h,
                "required": True,
            }
        )
    if owner_sig < 1 or recip_sig < 1:
        raise HTTPException(
            status_code=400,
            detail={"code": "missing_required_signature", "message": "Place a signature field for you and for the recipient."},
        )
    return out


def assert_document_matches_claim(
    meta: Dict[str, Any],
    raw: Optional[bytes],
    *,
    document_id: str,
    content_sha256: str,
    size_bytes: int,
    content_type: str,
) -> None:
    did = str(meta.get("document_id") or "").strip()
    sha = str(meta.get("content_sha256") or "").strip().lower()
    claim = (content_sha256 or "").strip().lower()
    ct = str(meta.get("content_type") or "").strip().lower()
    want_ct = (content_type or "").strip().lower()
    size = int(meta.get("size_bytes") or 0)
    if did != document_id.strip() or sha != claim or size != int(size_bytes) or (want_ct and ct != want_ct):
        raise HTTPException(
            status_code=409,
            detail={"code": "document_hash_mismatch", "message": "This PDF no longer matches the saved document."},
        )
    if raw is None or hashlib.sha256(raw).hexdigest() != sha or len(raw) != size:
        raise HTTPException(
            status_code=409,
            detail={"code": "document_hash_mismatch", "message": "This PDF no longer matches the saved document."},
        )


def public_envelope(env: Dict[str, Any], *, include_token: bool = False) -> Dict[str, Any]:
    out = dict(env)
    out.pop("recipient_token", None)
    if include_token and env.get("recipient_token"):
        out["recipient_open_path"] = env.get("recipient_open_path")
    else:
        path = str(env.get("recipient_open_path") or "")
        if "t=" in path:
            out["recipient_open_path"] = None
            out["recipient_link_ready"] = True
        else:
            out["recipient_link_ready"] = bool(env.get("recipient_link_ready"))
    return out


def _portable_fields(env: Dict[str, Any]) -> List[Dict[str, Any]]:
    out: List[Dict[str, Any]] = []
    for raw in env.get("fields") or []:
        if not isinstance(raw, dict):
            continue
        role = str(raw.get("signer_role_id") or "").strip()
        party_id = env["owner_party_id"] if role == env.get("owner_role_id") else env["recipient_party_id"]
        party_index = 0 if role == env.get("owner_role_id") else 1
        out.append(
            {
                "id": str(raw.get("field_id") or raw.get("id") or "").strip(),
                "type": "signature",
                "page": int(raw.get("page_index") if raw.get("page_index") is not None else raw.get("page") or 0),
                "x": float(raw.get("x") or 0),
                "y": float(raw.get("y") or 0),
                "width": float(raw.get("w") if raw.get("w") is not None else raw.get("width") or 0),
                "height": float(raw.get("h") if raw.get("h") is not None else raw.get("height") or 0),
                "assignedSignerRoleId": role,
                "assignedPartyIndex": party_index,
                "counterpartyId": party_id,
                "required": True,
            }
        )
    return out


def build_portable_packet(env: Dict[str, Any], *, lock_corpus: str) -> Dict[str, Any]:
    return {
        "v": 1,
        "schema": "vs01_signing_packet_v1",
        "kind": "uploaded_final_pdf",
        "seed": {
            "v": 1,
            "documentId": env["document_id"],
            "agreementId": env["agreement_id"],
            "corpusPlain": lock_corpus,
            "corpus_plain": lock_corpus,
            "corpusHash": env["content_sha256"],
            "savedAt": env.get("updated_at") or _utc_now_iso(),
            "acceptedReviewSnapshotId": env.get("snapshot_id"),
            "acceptedReviewSnapshotDigest": env.get("snapshot_digest"),
        },
        "acceptedReviewSnapshotId": env.get("snapshot_id"),
        "acceptedReviewSnapshotDigest": env.get("snapshot_digest"),
        "authorityMode": "accepted_review_snapshot",
        "roles": [
            {
                "roleId": env["owner_role_id"],
                "partyId": env["owner_party_id"],
                "partyIndex": 0,
                "kind": "owner",
                "vs01CounterpartyId": env["owner_party_id"],
                "participantId": env["owner_party_id"],
                "entityName": env["owner_name"],
                "partyName": env["owner_name"],
                "displayName": env["owner_name"],
                "email": env["owner_email"],
                "requiresSignature": True,
            },
            {
                "roleId": env["recipient_role_id"],
                "partyId": env["recipient_party_id"],
                "partyIndex": 1,
                "kind": "counterparty",
                "vs01CounterpartyId": env["recipient_party_id"],
                "participantId": env["recipient_party_id"],
                "entityName": env["recipient_name"],
                "partyName": env["recipient_name"],
                "displayName": env["recipient_name"],
                "email": env["recipient_email"],
                "requiresSignature": True,
            },
        ],
        "fields": _portable_fields(env),
        "lockedContentSha256": env["content_sha256"],
        "pageCount": env.get("page_count") or 1,
        "fieldCount": len(_portable_fields(env)),
        "witnessPageIndex": 0,
        "initialsPolicy": {"enabled": False, "bodyPagesOnly": True},
    }


def recipient_open_path(document_id: str, agreement_id: str, token: str, *, counterparty_id: str = "") -> str:
    from urllib.parse import urlencode

    q: Dict[str, str] = {
        "vs01_recipient_sign": "1",
        "document_id": document_id,
        "agreement_id": agreement_id,
        "recipient_index": "0",
        "signer_role_id": RECIPIENT_ROLE_ID,
        "t": token,
    }
    pid = (counterparty_id or "").strip()
    if pid:
        q["counterparty_id"] = pid
    return f"/app/esign/{document_id}?{urlencode(q)}"


def completion_status(draft: Dict[str, Any], env: Dict[str, Any]) -> Dict[str, Any]:
    from backend.services.vs01_signer_completion import (
        completed_vs01_signer_role_ids,
        required_vs01_signer_role_ids,
    )

    required = required_vs01_signer_role_ids(draft) or {env.get("owner_role_id"), env.get("recipient_role_id")}
    done = completed_vs01_signer_role_ids(draft.get("audit_log"))
    owner_done = env.get("owner_role_id") in done
    recip_done = env.get("recipient_role_id") in done
    fully = bool(required) and required <= done
    return {
        "owner_signed": owner_done,
        "recipient_signed": recip_done,
        "fully_executed": fully,
        "required_signer_count": len(required),
        "completed_signer_count": len(done & required),
        "status": "fully_executed" if fully else ("awaiting_recipient" if owner_done else "preparing"),
    }


def build_verification_bundle(*, pdf: bytes, evidence: Dict[str, Any]) -> bytes:
    buf = BytesIO()
    with zipfile.ZipFile(buf, "w", compression=zipfile.ZIP_DEFLATED) as zf:
        zf.writestr("document.pdf", pdf)
        import json

        zf.writestr(
            "receipt.json",
            json.dumps(evidence, sort_keys=True, indent=2, ensure_ascii=False),
        )
    return buf.getvalue()
