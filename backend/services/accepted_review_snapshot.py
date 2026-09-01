"""
Server-authoritative canonical review snapshots for paid-Pro commercial authority.

Lifecycle:
  1. Persist immutable pending snapshot (corpus bytes + SHA-256) before review UI.
  2. Review hydrates from GET snapshot (id + digest + length + bytes).
  3. Accept by snapshot ID + digest only (no replacement corpus bytes).
  4. First signing dispatch / reissue / signer-complete / public verify bind to the
     accepted snapshot — never to owner-submitted corpusPlain as authority.

Post-cutover commercial agreements (any draft that entered the snapshot registry)
always require an accepted snapshot for reissue and signer-complete.

Pure pre-cutover sealed packets (packet present, never touched snapshot registry)
may continue under ``legacy_packet_pre_snapshot`` until explicit sealed-corpus
re-attestation migrates them onto an accepted snapshot.
"""

from __future__ import annotations

import hashlib
import hmac
import uuid
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional, Tuple

SNAPSHOT_SCHEMA_VERSION = "claw.canonical_review_snapshot/v1"
REGISTRY_SCHEMA_VERSION = "claw.canonical_review_snapshots/v1"
AUTHORITY_MODE_ACCEPTED_SNAPSHOT = "accepted_review_snapshot"
AUTHORITY_MODE_LEGACY_PACKET = "legacy_packet_pre_snapshot"

STATUS_PENDING = "pending"
STATUS_ACCEPTED = "accepted"
STATUS_SUPERSEDED = "superseded"

MIN_CORPUS_LEN = 500


def _utc_now_iso() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")


def sha256_hex_text(text: str) -> str:
    return hashlib.sha256((text or "").encode("utf-8")).hexdigest().lower()


def _clean(v: Any) -> str:
    return str(v or "").strip()


def _as_dict(v: Any) -> Dict[str, Any]:
    return v if isinstance(v, dict) else {}


def empty_registry() -> Dict[str, Any]:
    return {
        "schema": REGISTRY_SCHEMA_VERSION,
        "snapshots": {},
        "acceptedSnapshotId": None,
        "acceptedAt": None,
        "authorityMode": None,
        "registryVersion": 0,
        "commercialSnapshotAuthorityRequired": False,
    }


def get_registry(draft: Any) -> Dict[str, Any]:
    if isinstance(draft, dict):
        raw = draft.get("canonical_review_snapshots_v1")
    else:
        raw = getattr(draft, "canonical_review_snapshots_v1", None)
    if not isinstance(raw, dict):
        return empty_registry()
    reg = dict(raw)
    snaps = reg.get("snapshots")
    if not isinstance(snaps, dict):
        reg["snapshots"] = {}
    if "registryVersion" not in reg:
        reg["registryVersion"] = 0
    if "commercialSnapshotAuthorityRequired" not in reg:
        # Any non-empty snapshot map implies post-cutover commercial authority.
        reg["commercialSnapshotAuthorityRequired"] = bool(reg["snapshots"])
    return reg


def get_accepted_snapshot_record(draft: Any) -> Optional[Dict[str, Any]]:
    """Return the accepted snapshot object, preferring denormalized draft field."""
    if isinstance(draft, dict):
        denorm = draft.get("accepted_review_snapshot_v1")
    else:
        denorm = getattr(draft, "accepted_review_snapshot_v1", None)
    if isinstance(denorm, dict) and _clean(denorm.get("status")) == STATUS_ACCEPTED:
        return denorm
    reg = get_registry(draft)
    sid = _clean(reg.get("acceptedSnapshotId"))
    if not sid:
        return None
    snap = reg.get("snapshots", {}).get(sid)
    if isinstance(snap, dict) and _clean(snap.get("status")) == STATUS_ACCEPTED:
        return snap
    return None


def _packet_portable(draft: Any) -> Optional[Dict[str, Any]]:
    if isinstance(draft, dict):
        packet = draft.get("vs01_signing_packet_v1")
    else:
        packet = getattr(draft, "vs01_signing_packet_v1", None)
    if not isinstance(packet, dict):
        return None
    portable = packet.get("portable")
    return portable if isinstance(portable, dict) else None


def sealed_corpus_from_draft_packet(draft: Any) -> Optional[str]:
    """Exact sealed legal corpus from stored portable seed (never layout artifacts)."""
    portable = _packet_portable(draft)
    if not portable:
        return None
    seed = portable.get("seed") if isinstance(portable.get("seed"), dict) else {}
    corpus = seed.get("corpusPlain") or seed.get("corpus_plain")
    if not isinstance(corpus, str) or not corpus.strip():
        return None
    return corpus.strip()


def verify_snapshot_integrity(snap: Dict[str, Any]) -> Tuple[bool, Optional[str]]:
    corpus = snap.get("corpusPlain")
    if not isinstance(corpus, str) or not corpus.strip():
        return False, "accepted_snapshot_corpus_missing"
    digest = _clean(snap.get("corpusSha256")).lower()
    length = int(snap.get("corpusLength") or 0)
    if length != len(corpus):
        return False, "accepted_snapshot_length_mismatch"
    if digest != sha256_hex_text(corpus):
        return False, "accepted_snapshot_digest_mismatch"
    if _clean(snap.get("schemaVersion")) != SNAPSHOT_SCHEMA_VERSION:
        return False, "accepted_snapshot_schema_mismatch"
    if _clean(snap.get("status")) not in {STATUS_PENDING, STATUS_ACCEPTED, STATUS_SUPERSEDED}:
        return False, "accepted_snapshot_status_invalid"
    return True, None


def classify_authority_mode(draft: Any) -> str:
    """
    Return authority mode for commercial operations.

    - ``accepted_review_snapshot``: trusted commercial path
    - ``legacy_packet_pre_snapshot``: pre-existing sealed packet without accepted snapshot
    """
    accepted = get_accepted_snapshot_record(draft)
    if accepted:
        return AUTHORITY_MODE_ACCEPTED_SNAPSHOT
    if _packet_portable(draft) is not None:
        return AUTHORITY_MODE_LEGACY_PACKET
    return AUTHORITY_MODE_ACCEPTED_SNAPSHOT  # new commercial — require snapshot


def is_pure_legacy_pre_cutover(draft: Any) -> bool:
    """
    True only for sealed packets that never entered the snapshot authority system.

    Post-cutover commercial drafts (flag set or any registry snapshots) are never legacy.
    """
    if get_accepted_snapshot_record(draft):
        return False
    if _packet_portable(draft) is None:
        return False
    reg = get_registry(draft)
    if bool(reg.get("commercialSnapshotAuthorityRequired")):
        return False
    snaps = reg.get("snapshots") or {}
    if snaps:
        return False
    return True


def requires_accepted_snapshot_for_continuation(draft: Any) -> bool:
    """
    Post-cutover commercial: always require accepted snapshot for reissue/signer-complete.
    Pure pre-cutover sealed packets may continue until deliberate re-attestation.
    """
    return not is_pure_legacy_pre_cutover(draft)


def _bump_registry_version(reg: Dict[str, Any], expected_registry_version: Optional[int]) -> Tuple[bool, Optional[str]]:
    current = int(reg.get("registryVersion") or 0)
    if expected_registry_version is not None and int(expected_registry_version) != current:
        return False, "registry_version_conflict"
    reg["registryVersion"] = current + 1
    return True, None


def create_pending_snapshot(
    *,
    agreement_id: str,
    corpus_plain: str,
    generation_session_id: Optional[str] = None,
    created_by_principal: Optional[str] = None,
    created_by_session: Optional[str] = None,
    claimed_digest: Optional[str] = None,
    registry: Optional[Dict[str, Any]] = None,
    expected_registry_version: Optional[int] = None,
    draft_for_immutability: Any = None,
) -> Tuple[bool, Optional[str], Optional[Dict[str, Any]], Optional[Dict[str, Any]]]:
    """
    Persist an immutable pending snapshot.

    Returns (ok, error_code, snapshot, updated_registry).
    Idempotent when an identical pending/accepted corpus already exists for this agreement.
    Sets commercialSnapshotAuthorityRequired (post-cutover) on first registry write.
    """
    aid = _clean(agreement_id)
    corpus = (corpus_plain or "").strip()
    if not aid:
        return False, "agreement_id_required", None, None
    if len(corpus) < MIN_CORPUS_LEN:
        return False, "snapshot_corpus_too_short", None, None

    from backend.agreements.premium_full_draft_section_emit import (
        refuse_skipped_top_level_section_integers,
    )

    # Late-skip refuse (10-then-12 / 12-then-14). Repair-then-accept is not proof.
    # Early-hole persist Review seeds (2 then 10) are a different fixture class.
    skip_code = refuse_skipped_top_level_section_integers(corpus, late_only=True)
    if skip_code:
        return False, skip_code, None, None

    digest = sha256_hex_text(corpus)
    claimed = _clean(claimed_digest).lower()
    if claimed and claimed != digest:
        return False, "claimed_digest_mismatch", None, None

    reg = dict(registry or empty_registry())
    snaps: Dict[str, Any] = dict(reg.get("snapshots") or {})

    if draft_for_immutability is not None:
        imm_ok, imm_err = assert_snapshot_immutable_post_accept(
            draft=draft_for_immutability,
            incoming_registry=reg,
        )
        if not imm_ok:
            return False, imm_err, None, None

    # Idempotent: identical bytes already registered for this agreement.
    for existing in snaps.values():
        if not isinstance(existing, dict):
            continue
        if _clean(existing.get("agreementId")) != aid:
            continue
        if _clean(existing.get("corpusSha256")).lower() == digest and _clean(existing.get("corpusPlain")) == corpus:
            ok, err = verify_snapshot_integrity(existing)
            if not ok:
                return False, err, None, None
            # No version bump on pure idempotent read-back.
            reg["commercialSnapshotAuthorityRequired"] = True
            return True, None, existing, reg

    # Reject post-accept replacement attempts that try to insert a different corpus
    # while an accepted snapshot already exists (create is for pre-accept review only;
    # revisions must supersede via explicit accept of a new pending snapshot).
    accepted_id = _clean(reg.get("acceptedSnapshotId"))
    if accepted_id:
        accepted = snaps.get(accepted_id)
        if isinstance(accepted, dict) and _clean(accepted.get("corpusSha256")).lower() == digest:
            ok, err = verify_snapshot_integrity(accepted)
            if not ok:
                return False, err, None, None
            reg["commercialSnapshotAuthorityRequired"] = True
            return True, None, accepted, reg

    ver_ok, ver_err = _bump_registry_version(reg, expected_registry_version)
    if not ver_ok:
        return False, ver_err, None, None

    snap_id = f"crs_{uuid.uuid4().hex}"
    snap = {
        "schemaVersion": SNAPSHOT_SCHEMA_VERSION,
        "snapshotId": snap_id,
        "agreementId": aid,
        "corpusPlain": corpus,
        "corpusSha256": digest,
        "corpusLength": len(corpus),
        "generationSessionId": _clean(generation_session_id) or None,
        "createdAt": _utc_now_iso(),
        "createdByPrincipal": _clean(created_by_principal) or None,
        "createdBySession": _clean(created_by_session) or None,
        "status": STATUS_PENDING,
        "acceptedAt": None,
        "acceptedByPrincipal": None,
        "acceptedBySession": None,
    }
    snaps[snap_id] = snap
    reg["schema"] = REGISTRY_SCHEMA_VERSION
    reg["snapshots"] = snaps
    reg["commercialSnapshotAuthorityRequired"] = True

    if draft_for_immutability is not None:
        imm_ok, imm_err = assert_snapshot_immutable_post_accept(
            draft=draft_for_immutability,
            incoming_registry=reg,
        )
        if not imm_ok:
            return False, imm_err, None, None

    return True, None, snap, reg


def accept_snapshot(
    *,
    agreement_id: str,
    snapshot_id: str,
    expected_digest: str,
    accepting_principal: str,
    accepting_session: Optional[str] = None,
    registry: Optional[Dict[str, Any]] = None,
    # Optional concurrency token: when set, must match current acceptedSnapshotId (or empty).
    expected_accepted_snapshot_id: Optional[str] = None,
    # Explicit owner revision: supersede prior accepted and accept a different pending snapshot.
    allow_revision: bool = False,
    expected_registry_version: Optional[int] = None,
    # Fail closed when UI display authority does not match the snapshot being accepted.
    display_snapshot_id: Optional[str] = None,
    display_digest: Optional[str] = None,
    display_length: Optional[int] = None,
    draft_for_immutability: Any = None,
) -> Tuple[bool, Optional[str], Optional[Dict[str, Any]], Optional[Dict[str, Any]]]:
    """
    Atomically mark a pending snapshot accepted.

    Acceptance references snapshot ID + digest only — no corpus body accepted.
    Concurrent accept of a different snapshot fails closed unless ``allow_revision``.
    Idempotent when the identical snapshot is already accepted.
    Client ``allowShorterOverwrite`` / execution-append cannot mutate accepted bytes;
    a revision requires a new pending snapshot + explicit ``allow_revision`` accept.
    """
    aid = _clean(agreement_id)
    sid = _clean(snapshot_id)
    digest = _clean(expected_digest).lower()
    principal = _clean(accepting_principal)
    if not aid or not sid or not digest:
        return False, "accept_fields_required", None, None
    if not principal:
        return False, "accepting_principal_required", None, None

    reg = dict(registry or empty_registry())
    snaps: Dict[str, Any] = dict(reg.get("snapshots") or {})
    snap = snaps.get(sid)
    if not isinstance(snap, dict):
        return False, "snapshot_not_found", None, None
    if _clean(snap.get("agreementId")) != aid:
        return False, "snapshot_agreement_mismatch", None, None

    ok, err = verify_snapshot_integrity(snap)
    if not ok:
        return False, err, None, None
    if _clean(snap.get("corpusSha256")).lower() != digest:
        return False, "accept_digest_mismatch", None, None

    # Display authority must match the snapshot under accept (A≠B fail closed).
    if display_snapshot_id is not None and _clean(display_snapshot_id) != sid:
        return False, "display_authority_mismatch", None, None
    if display_digest is not None and _clean(display_digest).lower() != digest:
        return False, "display_authority_mismatch", None, None
    if display_length is not None and int(display_length) != int(snap.get("corpusLength") or 0):
        return False, "display_authority_mismatch", None, None

    current_accepted = _clean(reg.get("acceptedSnapshotId"))
    if expected_accepted_snapshot_id is not None:
        expected_token = _clean(expected_accepted_snapshot_id)
        if current_accepted != expected_token:
            return False, "accept_concurrency_conflict", None, None

    # Idempotent identical accept (no version bump).
    if current_accepted == sid and _clean(snap.get("status")) == STATUS_ACCEPTED:
        reg["commercialSnapshotAuthorityRequired"] = True
        return True, None, snap, reg

    # Concurrent / second accept of a different snapshot.
    if current_accepted and current_accepted != sid and not allow_revision:
        return False, "different_snapshot_already_accepted", None, None

    if _clean(snap.get("status")) == STATUS_SUPERSEDED and not allow_revision:
        return False, "snapshot_superseded", None, None
    if _clean(snap.get("status")) not in {STATUS_PENDING, STATUS_ACCEPTED}:
        if not (allow_revision and _clean(snap.get("status")) == STATUS_PENDING):
            if _clean(snap.get("status")) == STATUS_SUPERSEDED:
                return False, "snapshot_superseded", None, None

    ver_ok, ver_err = _bump_registry_version(reg, expected_registry_version)
    if not ver_ok:
        return False, ver_err, None, None

    now = _utc_now_iso()
    # Explicit revision: mark prior accepted snapshot superseded (corpus remains immutable).
    if allow_revision and current_accepted and current_accepted != sid:
        prior = snaps.get(current_accepted)
        if isinstance(prior, dict):
            snaps[current_accepted] = {
                **prior,
                "status": STATUS_SUPERSEDED,
                "supersededAt": now,
                "supersededBy": sid,
            }

    accepted = {
        **snap,
        "status": STATUS_ACCEPTED,
        "acceptedAt": now,
        "acceptedByPrincipal": principal,
        "acceptedBySession": _clean(accepting_session) or None,
    }
    # Supersede any other pending snapshots for this agreement.
    for other_id, other in list(snaps.items()):
        if other_id == sid or not isinstance(other, dict):
            continue
        if _clean(other.get("agreementId")) != aid:
            continue
        if _clean(other.get("status")) == STATUS_PENDING:
            snaps[other_id] = {**other, "status": STATUS_SUPERSEDED, "supersededAt": now, "supersededBy": sid}

    snaps[sid] = accepted
    reg["snapshots"] = snaps
    reg["acceptedSnapshotId"] = sid
    reg["acceptedAt"] = now
    reg["authorityMode"] = AUTHORITY_MODE_ACCEPTED_SNAPSHOT
    reg["schema"] = REGISTRY_SCHEMA_VERSION
    reg["commercialSnapshotAuthorityRequired"] = True

    if draft_for_immutability is not None:
        # Prior accepted corpus bytes must remain byte-identical in the write set.
        prior_accepted = get_accepted_snapshot_record(draft_for_immutability)
        if prior_accepted and _clean(prior_accepted.get("snapshotId")) == sid:
            imm_ok, imm_err = assert_snapshot_immutable_post_accept(
                draft=draft_for_immutability,
                incoming_registry=reg,
            )
            if not imm_ok:
                return False, imm_err, None, None
        elif prior_accepted and not allow_revision:
            imm_ok, imm_err = assert_snapshot_immutable_post_accept(
                draft=draft_for_immutability,
                incoming_registry=reg,
            )
            if not imm_ok and imm_err == "accepted_snapshot_mutation_rejected":
                return False, imm_err, None, None

    return True, None, accepted, reg


def reattest_legacy_sealed_corpus(
    *,
    agreement_id: str,
    draft: Any,
    sealed_corpus_plain: str,
    accepting_principal: str,
    accepting_session: Optional[str] = None,
    claimed_digest: Optional[str] = None,
) -> Tuple[bool, Optional[str], Optional[Dict[str, Any]], Optional[Dict[str, Any]]]:
    """
    Deliberate migration for pure pre-cutover sealed packets.

    Requires the caller to re-attest the *exact* sealed portable seed corpus.
    Mismatched bytes fail closed — no silent backfill from arbitrary client corpus.
    """
    aid = _clean(agreement_id)
    if not aid:
        return False, "agreement_id_required", None, None
    if not is_pure_legacy_pre_cutover(draft):
        if get_accepted_snapshot_record(draft):
            return False, "legacy_migration_not_applicable_already_accepted", None, None
        if not _packet_portable(draft):
            return False, "legacy_migration_requires_sealed_packet", None, None
        return False, "legacy_migration_not_pure_pre_cutover", None, None

    stored = sealed_corpus_from_draft_packet(draft)
    if not stored:
        return False, "legacy_sealed_corpus_missing", None, None
    offered = (sealed_corpus_plain or "").strip()
    if offered != stored:
        return False, "legacy_sealed_corpus_mismatch", None, None

    ok, err, snap, reg = create_pending_snapshot(
        agreement_id=aid,
        corpus_plain=stored,
        generation_session_id="legacy_reattestation",
        created_by_principal=accepting_principal,
        created_by_session=accepting_session,
        claimed_digest=claimed_digest or sha256_hex_text(stored),
        registry=get_registry(draft),
        draft_for_immutability=draft,
    )
    if not ok or not isinstance(snap, dict) or not isinstance(reg, dict):
        return False, err or "legacy_migration_persist_failed", None, None
    if _clean(snap.get("status")) == STATUS_ACCEPTED:
        return True, None, snap, reg
    return accept_snapshot(
        agreement_id=aid,
        snapshot_id=_clean(snap.get("snapshotId")),
        expected_digest=_clean(snap.get("corpusSha256")).lower(),
        accepting_principal=accepting_principal,
        accepting_session=accepting_session,
        registry=reg,
        expected_accepted_snapshot_id="",
        allow_revision=False,
        display_snapshot_id=_clean(snap.get("snapshotId")),
        display_digest=_clean(snap.get("corpusSha256")).lower(),
        display_length=int(snap.get("corpusLength") or 0),
        draft_for_immutability=draft,
    )


def public_accepted_snapshot_fragment(snap: Optional[Dict[str, Any]]) -> Optional[Dict[str, Any]]:
    """Non-secret public-verify fragment — digests/ids only, never corpus/MAC."""
    if not isinstance(snap, dict):
        return None
    return {
        "snapshot_id": _clean(snap.get("snapshotId")),
        "corpus_sha256": _clean(snap.get("corpusSha256")).lower(),
        "corpus_length": int(snap.get("corpusLength") or 0),
        "schema_version": _clean(snap.get("schemaVersion")),
        "accepted_at": _clean(snap.get("acceptedAt")) or None,
        "status": _clean(snap.get("status")),
    }


def bind_portable_to_accepted_snapshot(
    *,
    agreement_id: str,
    draft: Any,
    portable: Dict[str, Any],
    require_accepted: bool = True,
) -> Tuple[bool, Optional[str], Optional[Dict[str, Any]], Optional[str]]:
    """
    Enforce accepted-snapshot authority on a portable packet.

    - Loads corpus from accepted server snapshot (not client authority).
    - Rejects differing submitted corpusPlain / digests / lengths.
    - Overwrites seed.corpusPlain with server bytes before attestation.
    - Legacy sealed packets without snapshot: allowed only when require_accepted=False
      and a stored packet already exists (continuation), never for new first-seal.

    Returns (ok, error_code, portable_with_server_corpus, authority_mode).
    """
    aid = _clean(agreement_id)
    if not isinstance(portable, dict):
        return False, "portable_required", None, None

    accepted = get_accepted_snapshot_record(draft)
    mode = classify_authority_mode(draft)

    if accepted:
        ok, err = verify_snapshot_integrity(accepted)
        if not ok:
            return False, err, None, AUTHORITY_MODE_ACCEPTED_SNAPSHOT
        if _clean(accepted.get("agreementId")) != aid:
            return False, "snapshot_agreement_mismatch", None, AUTHORITY_MODE_ACCEPTED_SNAPSHOT
        if _clean(accepted.get("status")) != STATUS_ACCEPTED:
            return False, "snapshot_not_accepted", None, AUTHORITY_MODE_ACCEPTED_SNAPSHOT

        server_corpus = accepted["corpusPlain"]
        server_digest = _clean(accepted.get("corpusSha256")).lower()
        server_len = int(accepted.get("corpusLength") or 0)

        seed = portable.get("seed") if isinstance(portable.get("seed"), dict) else {}
        client_corpus = _clean(seed.get("corpusPlain") or seed.get("corpus_plain"))
        if client_corpus and client_corpus != server_corpus.strip():
            return False, "submitted_corpus_differs_from_accepted_snapshot", None, AUTHORITY_MODE_ACCEPTED_SNAPSHOT

        client_prov = portable.get("envelopeProvenance") or portable.get("envelope_provenance")
        if isinstance(client_prov, dict):
            claimed = _clean(client_prov.get("acceptedSoTDigest") or client_prov.get("accepted_sot_digest")).lower()
            if claimed and claimed != server_digest:
                return False, "submitted_digest_differs_from_accepted_snapshot", None, AUTHORITY_MODE_ACCEPTED_SNAPSHOT
            claimed_len = int(client_prov.get("acceptedSoTLength") or client_prov.get("accepted_sot_length") or 0)
            if claimed_len and claimed_len != server_len:
                return False, "submitted_length_differs_from_accepted_snapshot", None, AUTHORITY_MODE_ACCEPTED_SNAPSHOT

        # Client may send snapshot correlation fields; reject cross-agreement / wrong id.
        client_sid = _clean(
            portable.get("acceptedReviewSnapshotId")
            or portable.get("accepted_review_snapshot_id")
            or seed.get("acceptedReviewSnapshotId")
            or seed.get("accepted_review_snapshot_id")
        )
        if client_sid and client_sid != _clean(accepted.get("snapshotId")):
            return False, "submitted_snapshot_id_mismatch", None, AUTHORITY_MODE_ACCEPTED_SNAPSHOT

        next_seed = {
            **seed,
            "corpusPlain": server_corpus,
            "corpus_plain": server_corpus,
            "acceptedReviewSnapshotId": _clean(accepted.get("snapshotId")),
            "acceptedReviewSnapshotDigest": server_digest,
        }
        next_portable = {
            **portable,
            "seed": next_seed,
            "acceptedReviewSnapshotId": _clean(accepted.get("snapshotId")),
            "acceptedReviewSnapshotDigest": server_digest,
            "authorityMode": AUTHORITY_MODE_ACCEPTED_SNAPSHOT,
        }
        return True, None, next_portable, AUTHORITY_MODE_ACCEPTED_SNAPSHOT

    # No accepted snapshot.
    if require_accepted:
        if mode == AUTHORITY_MODE_LEGACY_PACKET:
            return False, "legacy_packet_requires_reattestation", None, AUTHORITY_MODE_LEGACY_PACKET
        return False, "accepted_review_snapshot_required", None, AUTHORITY_MODE_ACCEPTED_SNAPSHOT

    # Continuation-only legacy path (explicit caller opt-in + pure pre-cutover only).
    if not is_pure_legacy_pre_cutover(draft):
        return False, "accepted_review_snapshot_required", None, AUTHORITY_MODE_ACCEPTED_SNAPSHOT
    return True, None, portable, AUTHORITY_MODE_LEGACY_PACKET


def assert_snapshot_immutable_post_accept(
    *,
    draft: Any,
    incoming_registry: Optional[Dict[str, Any]] = None,
) -> Tuple[bool, Optional[str]]:
    """Reject attempts to mutate accepted snapshot corpus bytes in a registry write."""
    current = get_accepted_snapshot_record(draft)
    if not current:
        return True, None
    if incoming_registry is None:
        return True, None
    sid = _clean(current.get("snapshotId"))
    incoming_snaps = _as_dict(incoming_registry.get("snapshots"))
    incoming = incoming_snaps.get(sid)
    if not isinstance(incoming, dict):
        # Supersede path may omit prior id only when status flipped; still require presence.
        return False, "accepted_snapshot_missing_on_write"
    if _clean(incoming.get("corpusPlain")) != _clean(current.get("corpusPlain")):
        return False, "accepted_snapshot_mutation_rejected"
    if _clean(incoming.get("corpusSha256")).lower() != _clean(current.get("corpusSha256")).lower():
        return False, "accepted_snapshot_mutation_rejected"
    if int(incoming.get("corpusLength") or 0) != int(current.get("corpusLength") or 0):
        return False, "accepted_snapshot_mutation_rejected"
    return True, None


def timing_safe_equal(a: str, b: str) -> bool:
    return hmac.compare_digest(_clean(a).encode("utf-8"), _clean(b).encode("utf-8"))
