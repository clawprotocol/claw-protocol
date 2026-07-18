"""Phase 3C2B: session-bound recipient packet projection (read-only)."""

from __future__ import annotations

from typing import Any, Dict, List, Optional

from backend.services.vs01_recipient_bootstrap_exchange import (
    RecipientBootstrapExchangeError,
    _clean,
    _revalidate_session_authority,
)
from backend.services.vs01_signing_invite_delivery import (
    Vs01SigningInviteDeliveryError,
    _load_validated_activation,
    _validate_authority_bindings,
)
from backend.services.vs01_signing_packet_activation import (
    has_active_signing_packet_activation,
)

RECIPIENT_SESSION_PACKET_PROJECTION_VERSION = 1
READINESS_READY_FOR_REVIEW = "ready_for_review"

_PROJECTED_FIELD_KEYS = frozenset(
    {"id", "type", "page", "x", "y", "width", "height", "autoInitials"}
)


class RecipientSessionPacketProjectionError(RecipientBootstrapExchangeError):
    """Uniform fail-closed projection error (maps to bootstrap_invalid_or_expired)."""


def _resolve_locked_role_id(*, portable: Dict[str, Any], signer_record_id: str) -> str:
    roles = portable.get("roles")
    if not isinstance(roles, list):
        raise RecipientSessionPacketProjectionError()
    matches: List[Dict[str, Any]] = []
    for role in roles:
        if not isinstance(role, dict):
            raise RecipientSessionPacketProjectionError()
        if _clean(role.get("signerRecordId")) == signer_record_id:
            matches.append(role)
    if len(matches) != 1:
        raise RecipientSessionPacketProjectionError()
    role_id = _clean(matches[0].get("roleId"))
    if not role_id:
        raise RecipientSessionPacketProjectionError()
    return role_id


def _role_ids(portable: Dict[str, Any]) -> set[str]:
    roles = portable.get("roles")
    if not isinstance(roles, list):
        return set()
    out: set[str] = set()
    for role in roles:
        if isinstance(role, dict):
            rid = _clean(role.get("roleId"))
            if rid:
                out.add(rid)
    return out


def _project_field(field: Dict[str, Any]) -> Dict[str, Any]:
    projected: Dict[str, Any] = {}
    for key in _PROJECTED_FIELD_KEYS:
        if key not in field:
            if key in {"page", "x", "y", "width", "height"}:
                raise RecipientSessionPacketProjectionError()
            continue
        projected[key] = field[key]
    for required in ("id", "type", "page", "x", "y", "width", "height"):
        if required not in projected:
            raise RecipientSessionPacketProjectionError()
    return projected


def _filter_signer_fields(
    *,
    portable: Dict[str, Any],
    locked_role_id: str,
) -> List[Dict[str, Any]]:
    fields = portable.get("fields")
    if not isinstance(fields, list):
        raise RecipientSessionPacketProjectionError()
    known_role_ids = _role_ids(portable)
    seen_ids: set[str] = set()
    projected: List[Dict[str, Any]] = []

    for field in fields:
        if not isinstance(field, dict):
            raise RecipientSessionPacketProjectionError()
        field_id = _clean(field.get("id"))
        if not field_id:
            raise RecipientSessionPacketProjectionError()
        if field_id in seen_ids:
            raise RecipientSessionPacketProjectionError()
        seen_ids.add(field_id)

        assigned = _clean(field.get("assignedSignerRoleId"))
        if not assigned:
            raise RecipientSessionPacketProjectionError()
        if assigned not in known_role_ids:
            raise RecipientSessionPacketProjectionError()
        if assigned != locked_role_id:
            continue
        projected.append(_project_field(field))

    projected.sort(
        key=lambda item: (
            int(item.get("page") or 0),
            float(item.get("y") or 0),
            float(item.get("x") or 0),
            _clean(item.get("id")),
        )
    )
    return projected


def _signer_title(frozen: Dict[str, Any], signer_record_id: str) -> str:
    signers = frozen.get("signers")
    if not isinstance(signers, list):
        return ""
    for signer in signers:
        if not isinstance(signer, dict):
            continue
        if _clean(signer.get("signerRecordId")) == signer_record_id:
            return _clean(signer.get("signerTitle"))
    return ""


def _initials_policy(portable: Dict[str, Any]) -> Dict[str, bool]:
    raw = portable.get("initialsPolicy")
    if not isinstance(raw, dict):
        return {"enabled": False, "bodyPagesOnly": True}
    return {
        "enabled": bool(raw.get("enabled")),
        "bodyPagesOnly": bool(raw.get("bodyPagesOnly", True)),
    }


def build_recipient_session_packet_projection(
    *,
    session: Dict[str, Any],
    draft: Dict[str, Any],
    signing_lock: Optional[Dict[str, Any]],
) -> Dict[str, Any]:
    """Build minimum recipient-safe packet projection after authority revalidation."""
    agreement_id = _clean(session.get("agreement_id"))
    if not agreement_id or not draft:
        raise RecipientSessionPacketProjectionError()
    if not has_active_signing_packet_activation(draft):
        raise RecipientSessionPacketProjectionError()

    activation_field = draft.get("vs01_signing_packet_activation_v1")
    if not isinstance(activation_field, dict):
        raise RecipientSessionPacketProjectionError()
    document_id = _clean(session.get("document_id")) or _clean(activation_field.get("document_id"))

    try:
        activation = _load_validated_activation(
            agreement_id=agreement_id,
            document_id=document_id,
            draft=draft,
        )
        frozen, authority = _validate_authority_bindings(
            agreement_id=agreement_id,
            draft=draft,
            activation=activation,
            signing_lock=signing_lock,
        )
    except (Vs01SigningInviteDeliveryError, RecipientBootstrapExchangeError):
        raise RecipientSessionPacketProjectionError() from None
    except Exception:
        raise RecipientSessionPacketProjectionError() from None

    _revalidate_session_authority(draft=draft, session=session, signing_lock=signing_lock)

    signer_record_id = _clean(session.get("signer_record_id"))
    party_id = _clean(session.get("party_id"))
    if not signer_record_id or not party_id:
        raise RecipientSessionPacketProjectionError()

    portable = activation.get("portable")
    if not isinstance(portable, dict):
        raise RecipientSessionPacketProjectionError()
    seed = portable.get("seed")
    if not isinstance(seed, dict):
        raise RecipientSessionPacketProjectionError()
    corpus_plain = seed.get("corpusPlain")
    if not isinstance(corpus_plain, str) or not corpus_plain.strip():
        raise RecipientSessionPacketProjectionError()

    locked_role_id = _resolve_locked_role_id(portable=portable, signer_record_id=signer_record_id)
    fields = _filter_signer_fields(portable=portable, locked_role_id=locked_role_id)
    page_count_raw = portable.get("pageCount")
    witness_raw = portable.get("witnessPageIndex")
    try:
        page_count = int(page_count_raw)
        witness_page_index = int(witness_raw)
    except (TypeError, ValueError):
        raise RecipientSessionPacketProjectionError() from None

    corpus_hash = _clean(seed.get("corpusHash"))
    accepted_corpus_sha256 = _clean(authority.get("accepted_corpus_sha256")).lower()
    if _clean(seed.get("corpusPlain")) and accepted_corpus_sha256:
        import hashlib

        computed = hashlib.sha256(corpus_plain.encode("utf-8")).hexdigest().lower()
        if computed != accepted_corpus_sha256:
            raise RecipientSessionPacketProjectionError()

    return {
        "v": RECIPIENT_SESSION_PACKET_PROJECTION_VERSION,
        "document_label": _clean(session.get("document_label")) or "Agreement",
        "accepted_version_id": _clean(authority.get("accepted_version_id")),
        "accepted_corpus_sha256": accepted_corpus_sha256,
        "packet_revision": _clean(authority.get("packet_revision")),
        "signer_record_id": signer_record_id,
        "signer_role_id": locked_role_id,
        "party_id": party_id,
        "signer_display_name": _clean(session.get("signer_display_name")) or "Recipient",
        "signer_title": _signer_title(frozen, signer_record_id),
        "corpus_plain": corpus_plain,
        "corpus_hash": corpus_hash,
        "fields": fields,
        "page_count": page_count,
        "witness_page_index": witness_page_index,
        "initials_policy": _initials_policy(portable),
        "readiness": READINESS_READY_FOR_REVIEW,
    }
