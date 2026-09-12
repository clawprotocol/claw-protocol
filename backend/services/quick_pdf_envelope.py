"""Owner-guarded envelope for an uploaded final PDF.

This is not a LawDog drafting path. The uploaded bytes are the paper.
Identity is an uploaded_final_pdf authority record — never accepted-review
snapshot corpus, canonical snapshot corpus, or corpusPlain.
"""

from __future__ import annotations

import hashlib
import json
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
AUTHORITY_KIND = "uploaded_final_pdf"
AUTHORITY_MODE = "uploaded_final_pdf"
MAX_RECIPIENTS = 1
TOKEN_SECRET_KEYS = frozenset(
    {"recipient_token", "recipient_open_path", "raw_token", "token", "access_token"}
)


def _utc_now_iso() -> str:
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")


def sha256_hex(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest().lower()


def token_sha256(token: str) -> str:
    return sha256_hex((token or "").encode("utf-8"))


def count_pdf_pages(raw: bytes) -> int:
    if not raw or not raw.startswith(b"%PDF"):
        raise HTTPException(
            status_code=400,
            detail={"code": "invalid_pdf", "message": "This file is not a readable PDF."},
        )
    try:
        from pypdf import PdfReader

        reader = PdfReader(BytesIO(raw), strict=False)
        n = len(reader.pages)
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(
            status_code=400,
            detail={"code": "invalid_pdf", "message": "This PDF’s pages could not be read."},
        ) from exc
    if n < 1:
        raise HTTPException(
            status_code=400,
            detail={"code": "invalid_page_count", "message": "This PDF has no pages."},
        )
    if n > 200:
        raise HTTPException(
            status_code=400,
            detail={"code": "invalid_page_count", "message": "This PDF has too many pages for this workflow."},
        )
    return n


def field_manifest_digest(fields: List[Dict[str, Any]]) -> str:
    canon: List[Dict[str, Any]] = []
    for raw in fields or []:
        if not isinstance(raw, dict):
            continue
        canon.append(
            {
                "field_id": str(raw.get("field_id") or raw.get("id") or "").strip(),
                "h": float(raw.get("h") if raw.get("h") is not None else raw.get("height") or 0),
                "page_index": int(raw.get("page_index") if raw.get("page_index") is not None else raw.get("page") or 0),
                "signer_role_id": str(raw.get("signer_role_id") or raw.get("assignedSignerRoleId") or "").strip(),
                "w": float(raw.get("w") if raw.get("w") is not None else raw.get("width") or 0),
                "x": float(raw.get("x") or 0),
                "y": float(raw.get("y") or 0),
            }
        )
    canon.sort(key=lambda row: (row["page_index"], row["field_id"]))
    return sha256_hex(json.dumps(canon, sort_keys=True, separators=(",", ":")).encode("utf-8"))


def build_uploaded_final_pdf_authority(
    *,
    owner_org_id: str,
    owner_principal: str,
    agreement_id: str,
    document_id: str,
    content_sha256: str,
    size_bytes: int,
    content_type: str,
    page_count: int,
    owner_party_id: str,
    recipient_party_id: str,
    packet_revision: str,
    fields: Optional[List[Dict[str, Any]]] = None,
    authority_id: str = "",
) -> Dict[str, Any]:
    fields = list(fields or [])
    return {
        "kind": AUTHORITY_KIND,
        "authority_id": authority_id or f"ufp_{uuid.uuid4().hex[:20]}",
        "owner_org_id": owner_org_id,
        "owner_principal": owner_principal,
        "agreement_id": agreement_id,
        "document_id": document_id,
        "content_sha256": content_sha256.strip().lower(),
        "size_bytes": int(size_bytes),
        "content_type": (content_type or "application/pdf").strip(),
        "page_count": int(page_count),
        "packet_revision": packet_revision,
        "field_manifest": fields,
        "field_manifest_digest": field_manifest_digest(fields),
        "signer_roles": [
            {"role_id": OWNER_ROLE_ID, "party_id": owner_party_id, "kind": "owner"},
            {"role_id": RECIPIENT_ROLE_ID, "party_id": recipient_party_id, "kind": "recipient"},
        ],
        "max_recipients": MAX_RECIPIENTS,
        "created_at": _utc_now_iso(),
    }


def envelope_from_draft(draft: Any) -> Optional[Dict[str, Any]]:
    env = getattr(draft, "quick_pdf_envelope_v1", None)
    if isinstance(env, dict) and env.get("document_id"):
        return dict(env)
    dump = draft.model_dump() if hasattr(draft, "model_dump") else draft if isinstance(draft, dict) else {}
    stored = dump.get("quick_pdf_envelope_v1") if isinstance(dump, dict) else None
    return dict(stored) if isinstance(stored, dict) and stored.get("document_id") else None


def authority_from_draft(draft: Any) -> Optional[Dict[str, Any]]:
    if draft is None:
        return None
    raw = getattr(draft, "uploaded_final_pdf_authority_v1", None)
    if not isinstance(raw, dict):
        dump = draft.model_dump() if hasattr(draft, "model_dump") else draft if isinstance(draft, dict) else {}
        raw = dump.get("uploaded_final_pdf_authority_v1") if isinstance(dump, dict) else None
    if isinstance(raw, dict) and raw.get("kind") == AUTHORITY_KIND and raw.get("document_id"):
        return dict(raw)
    env = envelope_from_draft(draft)
    if env and env.get("kind") == AUTHORITY_KIND and env.get("document_id"):
        return {
            "kind": AUTHORITY_KIND,
            "authority_id": env.get("authority_id") or "",
            "owner_org_id": env.get("owner_org_id"),
            "agreement_id": env.get("agreement_id"),
            "document_id": env.get("document_id"),
            "content_sha256": env.get("content_sha256"),
            "size_bytes": env.get("size_bytes"),
            "content_type": env.get("content_type"),
            "page_count": env.get("page_count"),
            "packet_revision": env.get("packet_revision"),
            "field_manifest": env.get("fields") or [],
            "field_manifest_digest": env.get("field_manifest_digest") or field_manifest_digest(list(env.get("fields") or [])),
            "signer_roles": [
                {"role_id": env.get("owner_role_id") or OWNER_ROLE_ID, "party_id": env.get("owner_party_id"), "kind": "owner"},
                {"role_id": env.get("recipient_role_id") or RECIPIENT_ROLE_ID, "party_id": env.get("recipient_party_id"), "kind": "recipient"},
            ],
            "max_recipients": MAX_RECIPIENTS,
        }
    return None


def is_uploaded_final_pdf_authority(draft: Any) -> bool:
    return authority_from_draft(draft) is not None


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
            page = int(raw.get("page_index") if raw.get("page_index") is not None else raw.get("page"))
            x = float(raw.get("x"))
            y = float(raw.get("y"))
            w = float(raw.get("w") if raw.get("w") is not None else raw.get("width"))
            h = float(raw.get("h") if raw.get("h") is not None else raw.get("height"))
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
    if raw is None or sha256_hex(raw) != sha or len(raw) != size:
        raise HTTPException(
            status_code=409,
            detail={"code": "document_hash_mismatch", "message": "This PDF no longer matches the saved document."},
        )


def strip_raw_token_secrets(env: Dict[str, Any]) -> Dict[str, Any]:
    out = dict(env)
    for key in TOKEN_SECRET_KEYS:
        out.pop(key, None)
    path = str(env.get("recipient_open_path") or "")
    if "t=" in path:
        out["recipient_open_path"] = None
    out["recipient_link_ready"] = bool(env.get("recipient_token_jti") or env.get("recipient_link_ready"))
    return out


def public_envelope(env: Dict[str, Any], *, include_token: bool = False) -> Dict[str, Any]:
    out = strip_raw_token_secrets(env)
    if include_token:
        raise RuntimeError("raw tokens are never persisted on the envelope")
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


def build_portable_packet(env: Dict[str, Any]) -> Dict[str, Any]:
    """Packet for 4B.4 completion. PDF hash is the lock — never synthetic corpusPlain."""
    fields = _portable_fields(env)
    return {
        "v": 1,
        "schema": "vs01_signing_packet_v1",
        "kind": AUTHORITY_KIND,
        "authorityMode": AUTHORITY_MODE,
        "seed": {
            "v": 1,
            "documentId": env["document_id"],
            "agreementId": env["agreement_id"],
            "contentSha256": env["content_sha256"],
            "savedAt": env.get("updated_at") or _utc_now_iso(),
        },
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
        "fields": fields,
        "lockedContentSha256": env["content_sha256"],
        "pageCount": env.get("page_count") or 1,
        "fieldCount": len(fields),
        "fieldManifestDigest": env.get("field_manifest_digest") or field_manifest_digest(list(env.get("fields") or [])),
        "witnessPageIndex": 0,
        "initialsPolicy": {"enabled": False, "bodyPagesOnly": True},
        "maxRecipients": MAX_RECIPIENTS,
    }


def bind_uploaded_final_pdf_portable(
    *,
    agreement_id: str,
    draft: Any,
    portable: Dict[str, Any],
) -> Tuple[bool, Optional[str], Optional[Dict[str, Any]], Optional[str]]:
    auth = authority_from_draft(draft)
    if not auth:
        return False, "uploaded_final_pdf_required", None, AUTHORITY_MODE
    if str(auth.get("agreement_id") or "").strip() != (agreement_id or "").strip():
        return False, "uploaded_final_pdf_agreement_mismatch", None, AUTHORITY_MODE
    if not isinstance(portable, dict):
        return False, "portable_required", None, AUTHORITY_MODE
    kind = str(portable.get("kind") or "").strip()
    mode = str(portable.get("authorityMode") or portable.get("authority_mode") or "").strip()
    if kind and kind != AUTHORITY_KIND:
        return False, "uploaded_final_pdf_kind_mismatch", None, AUTHORITY_MODE
    if mode and mode not in {AUTHORITY_MODE, ""}:
        return False, "uploaded_final_pdf_authority_mismatch", None, AUTHORITY_MODE
    seed = portable.get("seed") if isinstance(portable.get("seed"), dict) else {}
    if seed.get("corpusPlain") or seed.get("corpus_plain") or portable.get("corpusPlain"):
        return False, "uploaded_final_pdf_rejects_corpus_plain", None, AUTHORITY_MODE
    if (
        portable.get("acceptedReviewSnapshotId")
        or portable.get("accepted_review_snapshot_id")
        or seed.get("acceptedReviewSnapshotId")
        or seed.get("accepted_review_snapshot_id")
    ):
        return False, "uploaded_final_pdf_rejects_accepted_snapshot", None, AUTHORITY_MODE
    claimed = str(portable.get("lockedContentSha256") or seed.get("contentSha256") or seed.get("corpusHash") or "").strip().lower()
    want = str(auth.get("content_sha256") or "").strip().lower()
    if claimed and claimed != want:
        return False, "uploaded_final_pdf_hash_mismatch", None, AUTHORITY_MODE
    if claimed and claimed == sha256_hex((seed.get("corpusPlain") or "").encode("utf-8")) and seed.get("corpusPlain"):
        return False, "uploaded_final_pdf_hash_is_not_corpus", None, AUTHORITY_MODE
    next_seed = {
        "v": 1,
        "documentId": auth["document_id"],
        "agreementId": auth["agreement_id"],
        "contentSha256": want,
        "savedAt": seed.get("savedAt") or _utc_now_iso(),
    }
    next_portable = {
        **portable,
        "kind": AUTHORITY_KIND,
        "authorityMode": AUTHORITY_MODE,
        "seed": next_seed,
        "lockedContentSha256": want,
        "pageCount": int(auth.get("page_count") or portable.get("pageCount") or 1),
    }
    next_portable.pop("acceptedReviewSnapshotId", None)
    next_portable.pop("acceptedReviewSnapshotDigest", None)
    next_portable.pop("accepted_review_snapshot_id", None)
    next_portable.pop("accepted_review_snapshot_digest", None)
    return True, None, next_portable, AUTHORITY_MODE


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


def completion_event_ids(audit: Any) -> List[str]:
    out: List[str] = []
    for event in audit or []:
        if not isinstance(event, dict):
            continue
        if str(event.get("event_type") or "") != "signature_completed":
            continue
        eid = str(event.get("id") or event.get("event_id") or "").strip()
        at = str(event.get("at") or "").strip()
        val = event.get("value") if isinstance(event.get("value"), dict) else {}
        role = str(val.get("signer_role_id") or "").strip()
        out.append(eid or f"{role}:{at}")
    return out


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
        "completion_event_ids": completion_event_ids(draft.get("audit_log")),
    }


def sign_packet_field_manifest(fields: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    out: List[Dict[str, Any]] = []
    for raw in fields or []:
        if not isinstance(raw, dict):
            continue
        out.append(
            {
                "field_id": str(raw.get("field_id") or raw.get("id") or "").strip(),
                "page_index": int(raw.get("page_index") if raw.get("page_index") is not None else raw.get("page") or 0),
                "x": float(raw.get("x") or 0),
                "y": float(raw.get("y") or 0),
                "w": float(raw.get("w") if raw.get("w") is not None else raw.get("width") or 0),
                "h": float(raw.get("h") if raw.get("h") is not None else raw.get("height") or 0),
            }
        )
    return out


def issue_uploaded_pdf_receipt(
    *,
    env: Dict[str, Any],
    status: Dict[str, Any],
    signed_at: str,
) -> Dict[str, Any]:
    from backend.services.receipt_service import issue_and_persist_receipt

    existing_id = str(env.get("final_receipt_id") or "").strip()
    if existing_id and env.get("final_receipt"):
        return dict(env["final_receipt"])
    packet = {
        "schema_version": "sign_packet.v1",
        "document_id": env["document_id"],
        "document_content_sha256": env["content_sha256"],
        "signer_ref": "uploaded_final_pdf_required_set",
        "intent": "fully_executed_uploaded_final_pdf",
        "signed_at": signed_at,
        "field_manifest": sign_packet_field_manifest(list(env.get("fields") or [])),
    }
    receipt = issue_and_persist_receipt(sign_packet=packet, protocol_version="1.0.0", receipt_id=existing_id or None)
    evidence = {
        **receipt,
        "kind": "uploaded_final_pdf_receipt_v1",
        "document_kind": AUTHORITY_KIND,
        "agreement_id": env["agreement_id"],
        "packet_revision": env.get("packet_revision"),
        "field_manifest_digest": env.get("field_manifest_digest") or field_manifest_digest(list(env.get("fields") or [])),
        "required_signers": [env.get("owner_role_id") or OWNER_ROLE_ID, env.get("recipient_role_id") or RECIPIENT_ROLE_ID],
        "completion_event_ids": list(status.get("completion_event_ids") or []),
        "page_count": env.get("page_count"),
        "size_bytes": env.get("size_bytes"),
        "content_type": env.get("content_type"),
        "label": "Uploaded final PDF signed through LawDog",
    }
    return evidence


def public_receipt_fragment(evidence: Optional[Dict[str, Any]]) -> Optional[Dict[str, Any]]:
    if not isinstance(evidence, dict):
        return None
    return {
        "receipt_id": evidence.get("receipt_id"),
        "receipt_digest": evidence.get("receipt_hash_sha256"),
        "kind": evidence.get("kind") or "uploaded_final_pdf_receipt_v1",
        "document_kind": AUTHORITY_KIND,
        "content_sha256": evidence.get("document_content_sha256") or evidence.get("content_sha256"),
        "packet_revision": evidence.get("packet_revision"),
        "field_manifest_digest": evidence.get("field_manifest_digest"),
        "required_signers": evidence.get("required_signers"),
        "completion_event_ids": evidence.get("completion_event_ids"),
        "label": "Uploaded final PDF signed through LawDog",
    }


def build_verification_bundle(*, pdf: bytes, evidence: Dict[str, Any], manifest: Optional[Dict[str, Any]] = None) -> bytes:
    buf = BytesIO()
    with zipfile.ZipFile(buf, "w", compression=zipfile.ZIP_DEFLATED) as zf:
        zf.writestr("document.pdf", pdf)
        zf.writestr(
            "receipt.json",
            json.dumps(evidence, sort_keys=True, indent=2, ensure_ascii=False),
        )
        zf.writestr(
            "manifest.json",
            json.dumps(manifest or {
                "kind": AUTHORITY_KIND,
                "content_sha256": evidence.get("document_content_sha256") or evidence.get("content_sha256"),
                "field_manifest_digest": evidence.get("field_manifest_digest"),
                "packet_revision": evidence.get("packet_revision"),
                "receipt_id": evidence.get("receipt_id"),
                "receipt_digest": evidence.get("receipt_hash_sha256"),
            }, sort_keys=True, indent=2, ensure_ascii=False),
        )
    return buf.getvalue()


def public_uploaded_pdf_verify_fragment(env: Optional[Dict[str, Any]]) -> Optional[Dict[str, Any]]:
    if not isinstance(env, dict) or env.get("kind") != AUTHORITY_KIND:
        return None
    return {
        "kind": AUTHORITY_KIND,
        "document_id": env.get("document_id"),
        "content_sha256": env.get("content_sha256"),
        "page_count": env.get("page_count"),
        "size_bytes": env.get("size_bytes"),
        "packet_revision": env.get("packet_revision"),
        "label": "Uploaded final PDF signed through LawDog — not a LawDog-drafted agreement.",
    }
