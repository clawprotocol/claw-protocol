"""Owner-guarded Quick PDF envelope — Phase 4C.2.

Creates a durable agreement binding for an uploaded final PDF and reuses
Phase 4B.4 packet / token / signer-complete contracts. Client IDs are not authority.
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
    OWNER_ROLE_ID,
    RECIPIENT_ROLE_ID,
    assert_document_matches_claim,
    build_portable_packet,
    build_quick_pdf_lock_corpus,
    build_verification_bundle,
    completion_status,
    public_envelope,
    recipient_open_path,
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
    page_count: int = Field(default=1, ge=1, le=200)
    fields: List[Dict[str, Any]] = Field(default_factory=list)


class QuickEnvelopeActionBody(BaseModel):
    document_id: str
    content_sha256: str
    size_bytes: int
    content_type: str = "application/pdf"


def _http_from_exc(exc: BaseException) -> HTTPException:
    if isinstance(exc, HTTPException):
        return exc
    return HTTPException(status_code=400, detail={"code": "envelope_unavailable", "message": "This PDF envelope is unavailable."})


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


def _envelope_from_draft(draft: Any) -> Optional[Dict[str, Any]]:
    env = getattr(draft, "quick_pdf_envelope_v1", None)
    if isinstance(env, dict) and env.get("document_id"):
        return dict(env)
    dump = draft.model_dump() if hasattr(draft, "model_dump") else {}
    stored = dump.get("quick_pdf_envelope_v1")
    return dict(stored) if isinstance(stored, dict) else None


@router.post("/quick-pdf-envelope")
def create_quick_pdf_envelope(body: QuickEnvelopeCreateBody, request: Request) -> Dict[str, Any]:
    from backend.routers.agreements_v2_api import (
        AgreementDraft,
        AgreementDraftCreate,
        AgreementParty,
        _load_or_404,
        _merge_agreement_draft,
        _save_draft_sync,
        _utc_now_iso,
        create_agreement_draft,
    )
    from backend.services.accepted_review_snapshot import (
        accept_snapshot,
        create_pending_snapshot,
        get_registry,
        sha256_hex_text,
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

    existing_aid = str(meta.get("agreement_id") or "").strip()
    if existing_aid:
        try:
            draft = _load_or_404(existing_aid)
        except HTTPException:
            draft = None
        env = _envelope_from_draft(draft) if draft else None
        if env and env.get("document_id") == did and env.get("owner_org_id") == org_id:
            if env.get("locked"):
                return {"ok": True, "idempotent": True, "envelope": public_envelope(env)}
            env.update(
                {
                    "owner_name": owner_name,
                    "owner_email": owner_email,
                    "recipient_name": recip_name,
                    "recipient_email": recip_email,
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

    corpus = build_quick_pdf_lock_corpus(
        document_id=did,
        content_sha256=body.content_sha256,
        size_bytes=body.size_bytes,
        content_type=body.content_type,
    )
    principal = resolve_subject_from_request(request)
    ok, err, snap, reg = create_pending_snapshot(
        agreement_id=aid,
        corpus_plain=corpus,
        created_by_principal=principal,
        registry=get_registry(draft),
        draft_for_immutability=draft,
    )
    if not ok or not isinstance(snap, dict) or not isinstance(reg, dict):
        raise HTTPException(status_code=400, detail={"code": err or "snapshot_unavailable", "message": "Could not lock this PDF identity."})
    digest = str(snap.get("corpusSha256") or sha256_hex_text(corpus)).lower()
    ok, err, accepted, reg = accept_snapshot(
        agreement_id=aid,
        snapshot_id=str(snap.get("snapshotId") or ""),
        expected_digest=digest,
        accepting_principal=principal,
        registry=reg,
        draft_for_immutability=draft,
    )
    if not ok or not isinstance(accepted, dict):
        raise HTTPException(status_code=400, detail={"code": err or "snapshot_unavailable", "message": "Could not lock this PDF identity."})

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

    env = {
        "kind": "uploaded_final_pdf",
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
        "locked": False,
        "page_count": 1,
        "fields": [],
        "packet_revision": "qpk_1",
        "snapshot_id": str(accepted.get("snapshotId") or snap.get("snapshotId") or ""),
        "snapshot_digest": digest,
        "locked_version_id": locked_version_id,
        "delivery_state": "not_prepared",
        "created_at": _utc_now_iso(),
    }
    next_draft = _merge_agreement_draft(
        draft,
        accepted_review_snapshot_v1=accepted,
        canonical_review_snapshots_v1=reg,
        quick_pdf_envelope_v1=env,
        updated_at=_utc_now_iso(),
    )
    _save_draft_sync(next_draft.model_dump(), request)
    return {"ok": True, "idempotent": False, "envelope": public_envelope(env)}


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
    env = _envelope_from_draft(draft)
    if not env or env.get("document_id") != did:
        raise HTTPException(status_code=404, detail={"code": "envelope_not_found", "message": "This PDF envelope is unavailable."})
    if env.get("content_sha256") != body.content_sha256.strip().lower():
        raise HTTPException(status_code=409, detail={"code": "document_hash_mismatch", "message": "This PDF no longer matches the saved document."})
    return draft, env, raw


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
    env = _envelope_from_draft(draft)
    if not env:
        return {"ok": True, "envelope": None}
    status = completion_status(draft.model_dump(), env)
    return {"ok": True, "envelope": public_envelope(env), "completion": status}


@router.post("/quick-pdf-envelope/fields")
def save_quick_pdf_fields(body: QuickEnvelopeFieldsBody, request: Request) -> Dict[str, Any]:
    from backend.routers.agreements_v2_api import _merge_agreement_draft, _save_draft_sync, _utc_now_iso

    _require_owner(request)
    draft, env, _raw = _require_matching_envelope(request, body)
    if env.get("locked"):
        raise HTTPException(status_code=409, detail={"code": "envelope_locked", "message": "Fields are locked after sending."})
    fields = validate_fields(
        body.fields,
        owner_role_id=env["owner_role_id"],
        recipient_role_id=env["recipient_role_id"],
        page_count=int(body.page_count),
    )
    env["fields"] = fields
    env["page_count"] = int(body.page_count)
    next_draft = _merge_agreement_draft(draft, quick_pdf_envelope_v1=env, updated_at=_utc_now_iso())
    _save_draft_sync(next_draft.model_dump(), request)
    return {"ok": True, "envelope": public_envelope(env)}


@router.post("/quick-pdf-envelope/prepare")
def prepare_quick_pdf_envelope(body: QuickEnvelopeActionBody, request: Request) -> Dict[str, Any]:
    from backend.routers.agreements_v2_api import (
        RecipientAccessMintRequest,
        _merge_agreement_draft,
        _save_draft_sync,
        _utc_now_iso,
        post_recipient_access_token,
    )

    _require_owner(request)
    draft, env, _raw = _require_matching_envelope(request, body)
    fields = validate_fields(
        list(env.get("fields") or []),
        owner_role_id=env["owner_role_id"],
        recipient_role_id=env["recipient_role_id"],
        page_count=int(env.get("page_count") or 1),
    )
    env["fields"] = fields
    if env.get("locked") and env.get("recipient_token"):
        return {
            "ok": True,
            "idempotent": True,
            "envelope": public_envelope(env),
            "delivery": {
                "state": env.get("delivery_state") or "link_prepared",
                "email": "unavailable",
                "copied_manually": bool(env.get("copied_manually")),
            },
            "recipient_open_path": env.get("recipient_open_path"),
        }

    corpus = build_quick_pdf_lock_corpus(
        document_id=env["document_id"],
        content_sha256=env["content_sha256"],
        size_bytes=int(env["size_bytes"]),
        content_type=env["content_type"],
    )
    portable = build_portable_packet(env, lock_corpus=corpus)
    stored = {
        "document_id": env["document_id"],
        "packet_revision": env.get("packet_revision") or "qpk_1",
        "packet_state": "active",
        "portable": portable,
        "frozen_corpus_hash": env["content_sha256"],
    }
    env["locked"] = True
    next_draft = _merge_agreement_draft(
        draft,
        vs01_signing_packet_v1=stored,
        quick_pdf_envelope_v1=env,
        updated_at=_utc_now_iso(),
    )
    _save_draft_sync(next_draft.model_dump(), request)

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
    env["recipient_token"] = token
    env["recipient_open_path"] = recipient_open_path(
        env["document_id"],
        env["agreement_id"],
        token,
        counterparty_id=str(env.get("recipient_party_id") or ""),
    )
    env["delivery_state"] = "link_prepared"
    env["email_delivery"] = "unavailable"
    fresh = _merge_agreement_draft(next_draft, quick_pdf_envelope_v1=env, updated_at=_utc_now_iso())
    _save_draft_sync(fresh.model_dump(), request)
    return {
        "ok": True,
        "idempotent": False,
        "envelope": public_envelope(env),
        "delivery": {"state": "link_prepared", "email": "unavailable", "copied_manually": False},
        "recipient_open_path": env["recipient_open_path"],
    }


@router.post("/quick-pdf-envelope/copy-link")
def mark_quick_pdf_link_copied(body: QuickEnvelopeActionBody, request: Request) -> Dict[str, Any]:
    from backend.routers.agreements_v2_api import _merge_agreement_draft, _save_draft_sync, _utc_now_iso

    _require_owner(request)
    draft, env, _raw = _require_matching_envelope(request, body)
    if not env.get("recipient_open_path"):
        raise HTTPException(status_code=409, detail={"code": "link_not_prepared", "message": "Prepare the recipient link first."})
    env["copied_manually"] = True
    env["delivery_state"] = "copied_manually"
    next_draft = _merge_agreement_draft(draft, quick_pdf_envelope_v1=env, updated_at=_utc_now_iso())
    _save_draft_sync(next_draft.model_dump(), request)
    return {
        "ok": True,
        "envelope": public_envelope(env),
        "delivery": {"state": "copied_manually", "email": "unavailable", "copied_manually": True},
        "recipient_open_path": env.get("recipient_open_path"),
    }


@router.post("/quick-pdf-envelope/owner-complete")
def owner_complete_quick_pdf(body: QuickEnvelopeActionBody, request: Request) -> Dict[str, Any]:
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
    if not env.get("locked"):
        raise HTTPException(status_code=409, detail={"code": "envelope_not_prepared", "message": "Place fields and prepare the packet before signing."})
    now = _utc_now_iso()
    aid = env["agreement_id"]
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
            updated_at=now,
        )
        _save_draft_sync(next_draft.model_dump(), request)
        status = completion_status(next_draft.model_dump(), env)
    return {"ok": True, "already_signed": pending.already_signed, "completion": status, "envelope": public_envelope(env)}


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
    env = _envelope_from_draft(draft)
    if not env:
        raise HTTPException(status_code=404, detail={"code": "receipt_unavailable", "message": "No receipt for this PDF."})
    if hashlib.sha256(raw).hexdigest() != env.get("content_sha256"):
        raise HTTPException(status_code=409, detail={"code": "receipt_hash_mismatch", "message": "This receipt no longer matches the uploaded PDF."})
    status = completion_status(draft.model_dump(), env)
    evidence = {
        "kind": "quick_pdf_receipt_v1",
        "document_id": env["document_id"],
        "agreement_id": env["agreement_id"],
        "content_sha256": env["content_sha256"],
        "size_bytes": env["size_bytes"],
        "content_type": env["content_type"],
        "packet_revision": env.get("packet_revision"),
        "fields": env.get("fields") or [],
        "required_signers": [env["owner_role_id"], env["recipient_role_id"]],
        "completion": status,
        "server_time": draft.updated_at,
    }
    return {"ok": True, "completion": status, "receipt": evidence, "envelope": public_envelope(env)}


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
    env = _envelope_from_draft(draft)
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
    evidence = {
        "kind": "quick_pdf_receipt_v1",
        "document_id": env["document_id"],
        "agreement_id": env["agreement_id"],
        "content_sha256": env["content_sha256"],
        "size_bytes": env["size_bytes"],
        "packet_revision": env.get("packet_revision"),
        "fields": env.get("fields") or [],
        "completion": status,
    }
    blob = build_verification_bundle(pdf=raw, evidence=evidence)
    return Response(content=blob, media_type="application/zip", headers={"Content-Disposition": 'attachment; filename="quick-pdf-verification.zip"'})
