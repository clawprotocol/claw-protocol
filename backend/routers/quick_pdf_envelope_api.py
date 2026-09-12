"""Owner-guarded Quick PDF envelope — Phase 4C.2.1.

Creates a durable uploaded_final_pdf authority for an uploaded PDF and reuses
Phase 4B.4 packet / token / signer-complete contracts. Client IDs are not authority.
Accepted review snapshots are never used for this paper.
"""

from __future__ import annotations

import hashlib
import logging
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel, Field

from backend.security.commercial_auth import require_commercial_owner_principal
from backend.utils.enforce import resolve_subject_from_request
from backend.security.vs01_document_ownership import require_vs01_document_access
from backend.services import document_service
from backend.services.quick_pdf_envelope import (
    AUTHORITY_KIND,
    OWNER_ROLE_ID,
    RECIPIENT_ROLE_ID,
    assert_document_matches_claim,
    authority_from_draft,
    build_portable_packet,
    build_uploaded_final_pdf_authority,
    build_verification_bundle,
    completion_status,
    count_pdf_pages,
    envelope_from_draft,
    field_manifest_digest,
    issue_uploaded_pdf_receipt,
    public_envelope,
    public_receipt_fragment,
    recipient_open_path,
    token_sha256,
    validate_fields,
    validate_party_identity,
)
from backend.usage_economics.policy import require_claw_org_id_header

log = logging.getLogger(__name__)

router = APIRouter(prefix="/api/agreements", tags=["quick-pdf-envelope"])


class QuickPartyBody(BaseModel):
    name: str = ""
    email: str = ""


class QuickEnvelopeCreateBody(BaseModel):
    document_id: str
    content_sha256: str
    size_bytes: int
    content_type: str = "application/pdf"
    owner: QuickPartyBody
    recipient: QuickPartyBody


class QuickEnvelopeFieldsBody(BaseModel):
    document_id: str
    content_sha256: str
    size_bytes: int
    content_type: str = "application/pdf"
    page_count: int = Field(default=0, ge=0, le=200)
    fields: List[Dict[str, Any]] = Field(default_factory=list)


class QuickEnvelopeActionBody(BaseModel):
    document_id: str
    content_sha256: str
    size_bytes: int
    content_type: str = "application/pdf"


class QuickOwnerCompleteBody(QuickEnvelopeActionBody):
    signature_text: str = ""
    signature_draw: str = ""
    consent: bool = False
    packet_revision: str = ""


def _require_owner(request: Request) -> str:
    require_commercial_owner_principal(request)
    return require_claw_org_id_header(request)


def _load_owned_document(request: Request, document_id: str) -> tuple[Dict[str, Any], bytes]:
    kind, meta, _claims = require_vs01_document_access(request, document_id, allow_recipient_modes=())
    if kind != "owner":
        raise HTTPException(status_code=403, detail={"code": "forbidden", "message": "This workspace cannot use that PDF."})
    raw = document_service.get_document_bytes(document_id)
    if raw is None:
        raise HTTPException(status_code=404, detail={"code": "document_not_found", "message": "This PDF is no longer available."})
    return meta, raw


def _mint_recipient_token(env: Dict[str, Any], request: Request) -> Dict[str, Any]:
    from backend.routers.agreements_v2_api import RecipientAccessMintRequest, post_recipient_access_token
    from backend.services.recipient_delivery_registry import extract_jti_from_token

    minted = post_recipient_access_token(
        env["agreement_id"],
        request,
        RecipientAccessMintRequest(
            mode="sign",
            role="signer",
            recipient_party_id=env["recipient_party_id"],
            recipient_subject=env["recipient_email"],
            inviter_display_name=env["owner_name"],
            single_use=True,
        ),
    )
    token = str(minted.get("token") or "").strip()
    if not token:
        raise HTTPException(status_code=503, detail={"code": "token_unavailable", "message": "The recipient link could not be prepared."})
    jti = extract_jti_from_token(token)
    if not jti:
        raise HTTPException(status_code=503, detail={"code": "token_unavailable", "message": "The recipient link could not be prepared."})
    env.pop("recipient_token", None)
    env.pop("recipient_open_path", None)
    env["recipient_token_jti"] = jti
    env["recipient_token_hash"] = token_sha256(token)
    env["recipient_token_issued_at"] = env.get("updated_at")
    env["recipient_link_ready"] = True
    env["delivery_state"] = "link_prepared"
    env["email_delivery"] = "unavailable"
    path = recipient_open_path(
        env["document_id"],
        env["agreement_id"],
        token,
        counterparty_id=str(env.get("recipient_party_id") or ""),
    )
    return {"token": token, "recipient_open_path": path, "jti": jti}


def _lock_packet(draft: Any, env: Dict[str, Any], request: Request) -> Any:
    from backend.routers.agreements_v2_api import _merge_agreement_draft, _save_draft_sync, _utc_now_iso

    fields = validate_fields(
        list(env.get("fields") or []),
        owner_role_id=env["owner_role_id"],
        recipient_role_id=env["recipient_role_id"],
        page_count=int(env.get("page_count") or 1),
    )
    env["fields"] = fields
    env["field_manifest_digest"] = field_manifest_digest(fields)
    portable = build_portable_packet(env)
    stored = {
        "document_id": env["document_id"],
        "packet_revision": env.get("packet_revision") or "qpk_1",
        "packet_state": "active",
        "portable": portable,
        "frozen_corpus_hash": env["content_sha256"],
        "authority_mode": AUTHORITY_KIND,
    }
    env["locked"] = True
    auth = authority_from_draft(draft) or {}
    auth.update(
        {
            "kind": AUTHORITY_KIND,
            "field_manifest": fields,
            "field_manifest_digest": env["field_manifest_digest"],
            "packet_revision": env.get("packet_revision") or "qpk_1",
            "page_count": env.get("page_count"),
            "content_sha256": env["content_sha256"],
        }
    )
    next_draft = _merge_agreement_draft(
        draft,
        vs01_signing_packet_v1=stored,
        quick_pdf_envelope_v1=env,
        uploaded_final_pdf_authority_v1=auth,
        updated_at=_utc_now_iso(),
    )
    _save_draft_sync(next_draft.model_dump(), request)
    return next_draft


def _require_matching_envelope(request: Request, body: QuickEnvelopeActionBody) -> tuple[Any, Dict[str, Any], bytes]:
    from backend.routers.agreements_v2_api import _load_or_404, _owner_mutation_guards

    did = body.document_id.strip()
    meta, raw = _load_owned_document(request, did)
    assert_document_matches_claim(
        meta,
        raw,
        document_id=did,
        content_sha256=body.content_sha256,
        size_bytes=body.size_bytes,
        content_type=body.content_type,
    )
    aid = str(meta.get("agreement_id") or "").strip()
    if not aid:
        raise HTTPException(status_code=409, detail={"code": "envelope_required", "message": "Save signer details before placing fields."})
    _owner_mutation_guards(request, aid, surface="quick_pdf_envelope")
    draft = _load_or_404(aid)
    env = envelope_from_draft(draft)
    if not env or env.get("document_id") != did:
        raise HTTPException(status_code=404, detail={"code": "envelope_not_found", "message": "This PDF envelope is unavailable."})
    if env.get("content_sha256") != body.content_sha256.strip().lower():
        raise HTTPException(status_code=409, detail={"code": "document_hash_mismatch", "message": "This PDF no longer matches the saved document."})
    if authority_from_draft(draft) is None:
        raise HTTPException(status_code=409, detail={"code": "uploaded_final_pdf_required", "message": "This PDF has no uploaded-final-PDF authority."})
    return draft, env, raw


def _persist_final_receipt_if_ready(draft: Any, env: Dict[str, Any], request: Request) -> tuple[Any, Dict[str, Any], Optional[Dict[str, Any]]]:
    from backend.routers.agreements_v2_api import _merge_agreement_draft, _save_draft_sync, _utc_now_iso

    dump = draft.model_dump() if hasattr(draft, "model_dump") else draft
    status = completion_status(dump, env)
    if not status.get("fully_executed"):
        return draft, env, None
    if env.get("final_receipt_id") and env.get("final_receipt"):
        return draft, env, dict(env["final_receipt"])
    now = _utc_now_iso()
    evidence = issue_uploaded_pdf_receipt(env=env, status=status, signed_at=now)
    env["final_receipt_id"] = evidence.get("receipt_id")
    env["final_receipt_digest"] = evidence.get("receipt_hash_sha256")
    env["final_receipt"] = evidence
    next_draft = _merge_agreement_draft(draft, quick_pdf_envelope_v1=env, updated_at=now)
    _save_draft_sync(next_draft.model_dump(), request)
    return next_draft, env, evidence


@router.post("/quick-pdf-envelope")
def create_quick_pdf_envelope(body: QuickEnvelopeCreateBody, request: Request) -> Dict[str, Any]:
    from backend.routers.agreements_v2_api import (
        AgreementDraftCreate,
        AgreementParty,
        _load_or_404,
        _merge_agreement_draft,
        _save_draft_sync,
        _utc_now_iso,
        create_agreement_draft,
    )
    from backend.services.agreement_signing_lock_store import read_signing_lock, write_signing_lock

    org_id = _require_owner(request)
    owner_name, owner_email = validate_party_identity(body.owner.name, body.owner.email, label="owner")
    recip_name, recip_email = validate_party_identity(body.recipient.name, body.recipient.email, label="recipient")
    if owner_email == recip_email:
        raise HTTPException(
            status_code=400,
            detail={"code": "duplicate_party_email", "message": "Owner and recipient need different emails."},
        )

    did = body.document_id.strip()
    meta, raw = _load_owned_document(request, did)
    assert_document_matches_claim(
        meta,
        raw,
        document_id=did,
        content_sha256=body.content_sha256,
        size_bytes=body.size_bytes,
        content_type=body.content_type,
    )
    page_count = count_pdf_pages(raw)
    principal = resolve_subject_from_request(request)

    existing_aid = str(meta.get("agreement_id") or "").strip()
    if existing_aid:
        try:
            draft = _load_or_404(existing_aid)
        except HTTPException:
            draft = None
        env = envelope_from_draft(draft) if draft else None
        if env and env.get("document_id") == did and env.get("owner_org_id") == org_id:
            if env.get("locked"):
                return {"ok": True, "idempotent": True, "envelope": public_envelope(env)}
            env.update(
                {
                    "owner_name": owner_name,
                    "owner_email": owner_email,
                    "recipient_name": recip_name,
                    "recipient_email": recip_email,
                    "page_count": page_count,
                }
            )
            next_draft = _merge_agreement_draft(
                draft,
                parties=[
                    AgreementParty(name=owner_name, role="owner", id=env["owner_party_id"], email=owner_email),
                    AgreementParty(name=recip_name, role="signer", id=env["recipient_party_id"], email=recip_email),
                ],
                quick_pdf_envelope_v1=env,
                updated_at=_utc_now_iso(),
            )
            _save_draft_sync(next_draft.model_dump(), request)
            return {"ok": True, "idempotent": True, "envelope": public_envelope(env)}

    created = create_agreement_draft(
        AgreementDraftCreate(
            title="Uploaded final PDF — e-sign preparation",
            purpose="quick_pdf_envelope",
            jurisdiction="",
            parties=[
                AgreementParty(name=owner_name, role="owner", email=owner_email),
                AgreementParty(name=recip_name, role="signer", email=recip_email),
            ],
            feed_visibility="private",
        ),
        request,
    )
    aid = str(created.get("id") or "").strip()
    if not aid:
        raise HTTPException(status_code=503, detail={"code": "envelope_unavailable", "message": "Could not create the signing envelope."})

    try:
        document_service.bind_document_agreement_id(did, aid, owner_org_id=org_id)
    except PermissionError as exc:
        raise HTTPException(status_code=403, detail={"code": "document_org_mismatch", "message": "This PDF belongs to a different workspace."}) from exc
    except KeyError as exc:
        raise HTTPException(status_code=404, detail={"code": "document_not_found", "message": "This PDF is no longer available."}) from exc
    except ValueError as exc:
        code = str(exc)
        raise HTTPException(status_code=409, detail={"code": code, "message": "This PDF is already bound to another envelope."}) from exc

    draft = _load_or_404(aid)
    parties = list(draft.parties or [])
    owner_party_id = str(parties[0].id or "").strip() if parties else f"pty_{hashlib.sha256((aid + 'o').encode()).hexdigest()[:16]}"
    recip_party_id = str(parties[1].id or "").strip() if len(parties) > 1 else f"pty_{hashlib.sha256((aid + 'r').encode()).hexdigest()[:16]}"

    lock = read_signing_lock(aid) or {}
    locked_version_id = str(lock.get("locked_version_id") or f"qlv_{hashlib.sha256((aid + did + body.content_sha256).encode()).hexdigest()[:24]}")
    write_signing_lock(
        aid,
        {
            "locked_version_id": locked_version_id,
            "locked_at": _utc_now_iso(),
            "locked_by": principal,
            "content_sha256": body.content_sha256.strip().lower(),
        },
    )

    auth = build_uploaded_final_pdf_authority(
        owner_org_id=org_id,
        owner_principal=str(principal or ""),
        agreement_id=aid,
        document_id=did,
        content_sha256=body.content_sha256,
        size_bytes=int(body.size_bytes),
        content_type=body.content_type,
        page_count=page_count,
        owner_party_id=owner_party_id,
        recipient_party_id=recip_party_id,
        packet_revision="qpk_1",
    )
    env = {
        "kind": AUTHORITY_KIND,
        "authority_id": auth["authority_id"],
        "document_id": did,
        "agreement_id": aid,
        "content_sha256": body.content_sha256.strip().lower(),
        "size_bytes": int(body.size_bytes),
        "content_type": (body.content_type or "application/pdf").strip(),
        "owner_org_id": org_id,
        "owner_name": owner_name,
        "owner_email": owner_email,
        "recipient_name": recip_name,
        "recipient_email": recip_email,
        "owner_party_id": owner_party_id,
        "recipient_party_id": recip_party_id,
        "owner_role_id": OWNER_ROLE_ID,
        "recipient_role_id": RECIPIENT_ROLE_ID,
        "max_recipients": 1,
        "locked": False,
        "page_count": page_count,
        "fields": [],
        "packet_revision": "qpk_1",
        "locked_version_id": locked_version_id,
        "delivery_state": "not_prepared",
        "created_at": _utc_now_iso(),
    }
    if getattr(draft, "accepted_review_snapshot_v1", None) or getattr(draft, "canonical_review_snapshots_v1", None):
        raise HTTPException(
            status_code=409,
            detail={"code": "uploaded_final_pdf_rejects_accepted_snapshot", "message": "This uploaded PDF cannot use drafted-agreement snapshot authority."},
        )
    next_draft = _merge_agreement_draft(
        draft,
        accepted_review_snapshot_v1=None,
        canonical_review_snapshots_v1=None,
        uploaded_final_pdf_authority_v1=auth,
        quick_pdf_envelope_v1=env,
        updated_at=_utc_now_iso(),
    )
    _save_draft_sync(next_draft.model_dump(), request)
    return {"ok": True, "idempotent": False, "envelope": public_envelope(env)}


@router.get("/quick-pdf-envelope")
def get_quick_pdf_envelope(request: Request, document_id: str) -> Dict[str, Any]:
    from backend.routers.agreements_v2_api import _load_or_404, _owner_mutation_guards

    did = (document_id or "").strip()
    _require_owner(request)
    meta, _raw = _load_owned_document(request, did)
    aid = str(meta.get("agreement_id") or "").strip()
    if not aid:
        return {"ok": True, "envelope": None}
    _owner_mutation_guards(request, aid, surface="quick_pdf_envelope")
    draft = _load_or_404(aid)
    env = envelope_from_draft(draft)
    if not env:
        return {"ok": True, "envelope": None}
    status = completion_status(draft.model_dump(), env)
    draft, env, evidence = _persist_final_receipt_if_ready(draft, env, request)
    return {
        "ok": True,
        "envelope": public_envelope(env),
        "completion": status,
        "receipt": public_receipt_fragment(evidence or env.get("final_receipt")),
    }


@router.post("/quick-pdf-envelope/fields")
def save_quick_pdf_fields(body: QuickEnvelopeFieldsBody, request: Request) -> Dict[str, Any]:
    from backend.routers.agreements_v2_api import _merge_agreement_draft, _save_draft_sync, _utc_now_iso

    _require_owner(request)
    draft, env, raw = _require_matching_envelope(request, body)
    if env.get("locked"):
        raise HTTPException(status_code=409, detail={"code": "envelope_locked", "message": "Fields are locked after sending."})
    server_pages = int(env.get("page_count") or 0) or count_pdf_pages(raw)
    if body.page_count and int(body.page_count) != server_pages:
        raise HTTPException(
            status_code=409,
            detail={"code": "page_count_mismatch", "message": "Placement pages must match the uploaded PDF."},
        )
    fields = validate_fields(
        body.fields,
        owner_role_id=env["owner_role_id"],
        recipient_role_id=env["recipient_role_id"],
        page_count=server_pages,
    )
    env["fields"] = fields
    env["page_count"] = server_pages
    env["field_manifest_digest"] = field_manifest_digest(fields)
    auth = authority_from_draft(draft) or {}
    auth["field_manifest"] = fields
    auth["field_manifest_digest"] = env["field_manifest_digest"]
    auth["page_count"] = server_pages
    next_draft = _merge_agreement_draft(
        draft,
        quick_pdf_envelope_v1=env,
        uploaded_final_pdf_authority_v1=auth,
        updated_at=_utc_now_iso(),
    )
    _save_draft_sync(next_draft.model_dump(), request)
    return {"ok": True, "envelope": public_envelope(env)}


@router.post("/quick-pdf-envelope/prepare")
def prepare_quick_pdf_envelope(body: QuickEnvelopeActionBody, request: Request) -> Dict[str, Any]:
    from backend.routers.agreements_v2_api import _merge_agreement_draft, _save_draft_sync, _utc_now_iso

    _require_owner(request)
    draft, env, _raw = _require_matching_envelope(request, body)
    if env.get("recipient_token_jti"):
        return {
            "ok": True,
            "idempotent": True,
            "envelope": public_envelope(env),
            "delivery": {
                "state": env.get("delivery_state") or "link_prepared",
                "email": "unavailable",
                "copied_manually": bool(env.get("copied_manually")),
            },
        }
    if not env.get("locked"):
        draft = _lock_packet(draft, env, request)
        env = envelope_from_draft(draft) or env
    minted = _mint_recipient_token(env, request)
    fresh = _merge_agreement_draft(draft, quick_pdf_envelope_v1=env, updated_at=_utc_now_iso())
    _save_draft_sync(fresh.model_dump(), request)
    persisted = envelope_from_draft(fresh) or env
    if persisted.get("recipient_token") or (persisted.get("recipient_open_path") or "").find("t=") >= 0:
        raise HTTPException(status_code=500, detail={"code": "token_persisted", "message": "Recipient token was not stored as JTI-only."})
    return {
        "ok": True,
        "idempotent": False,
        "envelope": public_envelope(env),
        "delivery": {"state": "link_prepared", "email": "unavailable", "copied_manually": False},
        "recipient_open_path": minted["recipient_open_path"],
    }


@router.post("/quick-pdf-envelope/reissue")
def reissue_quick_pdf_envelope(body: QuickEnvelopeActionBody, request: Request) -> Dict[str, Any]:
    from backend.routers.agreements_v2_api import _merge_agreement_draft, _save_draft_sync, _utc_now_iso

    _require_owner(request)
    draft, env, _raw = _require_matching_envelope(request, body)
    if not env.get("locked"):
        draft = _lock_packet(draft, env, request)
        env = envelope_from_draft(draft) or env
    prior_jti = env.get("recipient_token_jti")
    minted = _mint_recipient_token(env, request)
    env["prior_recipient_token_jti"] = prior_jti
    env["delivery_state"] = "link_prepared"
    fresh = _merge_agreement_draft(draft, quick_pdf_envelope_v1=env, updated_at=_utc_now_iso())
    _save_draft_sync(fresh.model_dump(), request)
    return {
        "ok": True,
        "idempotent": False,
        "reissued": True,
        "envelope": public_envelope(env),
        "delivery": {"state": "link_prepared", "email": "unavailable", "copied_manually": False},
        "recipient_open_path": minted["recipient_open_path"],
    }


@router.post("/quick-pdf-envelope/copy-link")
def mark_quick_pdf_link_copied(body: QuickEnvelopeActionBody, request: Request) -> Dict[str, Any]:
    from backend.routers.agreements_v2_api import _merge_agreement_draft, _save_draft_sync, _utc_now_iso

    _require_owner(request)
    draft, env, _raw = _require_matching_envelope(request, body)
    if not env.get("recipient_token_jti"):
        raise HTTPException(status_code=409, detail={"code": "link_not_prepared", "message": "Prepare the recipient link first."})
    env["copied_manually"] = True
    env["delivery_state"] = "copied_manually"
    next_draft = _merge_agreement_draft(draft, quick_pdf_envelope_v1=env, updated_at=_utc_now_iso())
    _save_draft_sync(next_draft.model_dump(), request)
    return {
        "ok": True,
        "envelope": public_envelope(env),
        "delivery": {"state": "copied_manually", "email": "unavailable", "copied_manually": True},
    }


@router.post("/quick-pdf-envelope/owner-complete")
def owner_complete_quick_pdf(body: QuickOwnerCompleteBody, request: Request) -> Dict[str, Any]:
    from backend.routers.agreements_v2_api import (
        _merge_agreement_draft,
        _save_draft_sync,
        _utc_now_iso,
    )
    from backend.services.vs01_signer_completion import (
        merge_fresh_audit_for_vs01_signer,
        orchestrate_vs01_signer_complete,
        vs01_signer_complete_lock,
    )

    _require_owner(request)
    draft, env, _raw = _require_matching_envelope(request, body)
    typed = (body.signature_text or "").strip()
    drawn = (body.signature_draw or "").strip()
    if not body.consent or (len(typed) < 2 and not drawn.startswith("data:image")):
        raise HTTPException(
            status_code=400,
            detail={"code": "owner_ceremony_incomplete", "message": "Type or draw your signature and confirm you agree before signing."},
        )
    want_rev = (body.packet_revision or env.get("packet_revision") or "qpk_1").strip()
    if want_rev != str(env.get("packet_revision") or "qpk_1"):
        raise HTTPException(
            status_code=409,
            detail={"code": "packet_revision_mismatch", "message": "This signing packet changed. Reload and sign again."},
        )
    if not env.get("locked"):
        draft = _lock_packet(draft, env, request)
        env = envelope_from_draft(draft) or env
    now = _utc_now_iso()
    aid = env["agreement_id"]
    env["owner_ceremony"] = {
        "consent": True,
        "signature_kind": "drawn" if drawn.startswith("data:image") else "typed",
        "signature_hash": token_sha256(typed or drawn),
        "packet_revision": env.get("packet_revision"),
        "content_sha256": env.get("content_sha256"),
        "signed_at": now,
        "signer_role_id": env["owner_role_id"],
        "participant_id": env["owner_party_id"],
    }
    with vs01_signer_complete_lock(aid):
        pending = orchestrate_vs01_signer_complete(
            draft.model_dump(),
            signer_role_id=env["owner_role_id"],
            participant_id=env["owner_party_id"],
            display_name=env["owner_name"],
            document_id=env["document_id"],
            signed_at=now,
            signed_date_iso=now[:10],
            signed_date_display=now[:10],
            locked_version_id=env.get("locked_version_id"),
            agreement_version_hash=env.get("content_sha256"),
            portable_packet=(draft.vs01_signing_packet_v1 or {}).get("portable") if isinstance(draft.vs01_signing_packet_v1, dict) else None,
        )
        outcome = merge_fresh_audit_for_vs01_signer(
            draft.model_dump(),
            pending,
            signer_role_id=env["owner_role_id"],
            portable_packet=pending.draft_dict.get("vs01_signing_packet_v1", {}).get("portable")
            if isinstance(pending.draft_dict.get("vs01_signing_packet_v1"), dict)
            else None,
        )
        next_draft = _merge_agreement_draft(
            draft,
            audit_log=outcome.draft_dict.get("audit_log") or outcome.audit,
            vs01_signing_packet_v1=outcome.draft_dict.get("vs01_signing_packet_v1"),
            quick_pdf_envelope_v1=env,
            updated_at=now,
        )
        _save_draft_sync(next_draft.model_dump(), request)
        next_draft, env, evidence = _persist_final_receipt_if_ready(next_draft, env, request)
        status = completion_status(next_draft.model_dump(), env)
    return {
        "ok": True,
        "already_signed": pending.already_signed,
        "completion": status,
        "envelope": public_envelope(env),
        "receipt": public_receipt_fragment(evidence),
    }


@router.get("/quick-pdf-envelope/receipt")
def get_quick_pdf_receipt(request: Request, document_id: str) -> Dict[str, Any]:
    from backend.routers.agreements_v2_api import _load_or_404, _owner_mutation_guards

    did = (document_id or "").strip()
    _require_owner(request)
    meta, raw = _load_owned_document(request, did)
    aid = str(meta.get("agreement_id") or "").strip()
    if not aid:
        raise HTTPException(status_code=404, detail={"code": "receipt_unavailable", "message": "No receipt for this PDF."})
    _owner_mutation_guards(request, aid, surface="quick_pdf_envelope")
    draft = _load_or_404(aid)
    env = envelope_from_draft(draft)
    if not env:
        raise HTTPException(status_code=404, detail={"code": "receipt_unavailable", "message": "No receipt for this PDF."})
    if hashlib.sha256(raw).hexdigest() != env.get("content_sha256"):
        raise HTTPException(status_code=409, detail={"code": "receipt_hash_mismatch", "message": "This receipt no longer matches the uploaded PDF."})
    status = completion_status(draft.model_dump(), env)
    evidence = None
    if status.get("fully_executed"):
        draft, env, evidence = _persist_final_receipt_if_ready(draft, env, request)
        evidence = evidence or env.get("final_receipt")
    return {
        "ok": True,
        "completion": status,
        "receipt": public_receipt_fragment(evidence),
        "envelope": public_envelope(env),
        "document_kind": AUTHORITY_KIND,
    }


@router.get("/quick-pdf-envelope/bundle")
def get_quick_pdf_bundle(request: Request, document_id: str):
    from fastapi.responses import Response
    from backend.routers.agreements_v2_api import _load_or_404, _owner_mutation_guards

    did = (document_id or "").strip()
    _require_owner(request)
    meta, raw = _load_owned_document(request, did)
    aid = str(meta.get("agreement_id") or "").strip()
    if not aid:
        raise HTTPException(status_code=404, detail={"code": "bundle_unavailable", "message": "No verification bundle for this PDF."})
    _owner_mutation_guards(request, aid, surface="quick_pdf_envelope")
    draft = _load_or_404(aid)
    env = envelope_from_draft(draft)
    if not env:
        raise HTTPException(status_code=404, detail={"code": "bundle_unavailable", "message": "No verification bundle for this PDF."})
    status = completion_status(draft.model_dump(), env)
    if not status.get("fully_executed"):
        raise HTTPException(
            status_code=409,
            detail={"code": "agreement_not_fully_executed", "message": "The verification bundle is available after every required signer finishes."},
        )
    if hashlib.sha256(raw).hexdigest() != env.get("content_sha256"):
        raise HTTPException(status_code=409, detail={"code": "receipt_hash_mismatch", "message": "This receipt no longer matches the uploaded PDF."})
    draft, env, evidence = _persist_final_receipt_if_ready(draft, env, request)
    evidence = evidence or env.get("final_receipt")
    if not evidence:
        raise HTTPException(status_code=409, detail={"code": "receipt_unavailable", "message": "The persisted receipt is not available yet."})
    blob = build_verification_bundle(
        pdf=raw,
        evidence=evidence,
        manifest={
            "kind": AUTHORITY_KIND,
            "content_sha256": env["content_sha256"],
            "field_manifest_digest": env.get("field_manifest_digest") or field_manifest_digest(list(env.get("fields") or [])),
            "packet_revision": env.get("packet_revision"),
            "receipt_id": evidence.get("receipt_id"),
            "receipt_digest": evidence.get("receipt_hash_sha256"),
            "required_signers": [env.get("owner_role_id"), env.get("recipient_role_id")],
        },
    )
    return Response(content=blob, media_type="application/zip", headers={"Content-Disposition": 'attachment; filename="quick-pdf-verification.zip"'})
