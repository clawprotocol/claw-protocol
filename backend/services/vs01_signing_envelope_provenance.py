"""
Trusted-boundary VS01 signing-envelope provenance.

Server recomputes SHA-256 digests from canonical stored seed.corpusPlain + roles,
rejects client-supplied mismatches, and HMAC-attests the packet→SoT linkage.
Client seal/UI checks are not a security boundary.
"""

from __future__ import annotations

import hashlib
import hmac
import json
import re
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional, Tuple

VS01_SIGNING_ENVELOPE_SCHEMA_VERSION = "vs01.signing_envelope/v1"
VS01_ENVELOPE_ATTESTATION_SCHEMA = "vs01.signing_envelope_attestation/v1"

_WITNESS_RE = re.compile(r"\bIN WITNESS WHEREOF\b", re.IGNORECASE)
_CLIENT_BLOCK_RE = re.compile(r"\n\s*CLIENT\s*:\s*(?:\n|$)", re.IGNORECASE)
_SIG_HEADING_RE = re.compile(r"\n\s*SIGNATURES?\s*:?\s*(?:\n|$)", re.IGNORECASE)
_INLINE_STALE_SIG_RE = re.compile(r"\bSIGNATURES\b\s+(?:The\s+parties|have\s+caused)", re.IGNORECASE)
_EXECUTION_PLACEMENT_FOOTER_RE = re.compile(
    r"Execution and signature placement are handled in the electronic signing step\.?",
    re.IGNORECASE,
)
_BY_OR_SIGNATURE_LINE_RE = re.compile(r"^\s*(?:By|Signature)\s*:", re.IGNORECASE | re.MULTILINE)
_ROLE_HEADING_RE = re.compile(
    r"^\s*(?:CLIENT|SERVICE PROVIDER|ANALYTICS PROVIDER|PARTY\s+\d+)\s*:",
    re.IGNORECASE | re.MULTILINE,
)
_ENTITY_HEADING_RE = re.compile(
    r"^\s*[A-Z0-9][A-Z0-9 &.',\-]{1,160}\b(?:LLC|L\.L\.C\.|INC\.?|CORP\.?|LTD\.?|LP)\.?\s*:?\s*$",
    re.MULTILINE,
)
_STANDARDIZE_SIG_LINE_RE = re.compile(
    r"^(\s*)Signature(\s*:\s*)_{2,}\s*$",
    re.IGNORECASE | re.MULTILINE,
)

SIGNATURE_REGION_MIN_FRACTION = 0.45


def _utc_now_iso() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")


def sha256_hex_text(text: str) -> str:
    return hashlib.sha256(text.encode("utf-8")).hexdigest().lower()


def fingerprint_agreement_body(text: str) -> str:
    """Display-only length:fnv fingerprint (matches guidedSigningPacketVersion)."""
    t = (text or "").strip()
    if not t:
        return "empty"
    h = 2166136261
    for ch in t:
        h ^= ord(ch)
        h = ((h & 0xFFFFFFFF) * 16777619) & 0xFFFFFFFF
    return f"{len(t)}:{format(h, 'x')}"


def _canon_json(obj: Any) -> str:
    return json.dumps(obj, ensure_ascii=False, separators=(",", ":"), sort_keys=True)


def _clean(v: Any) -> str:
    return str(v or "").strip()


def canonicalize_prepare_roles_for_envelope(
    roles: Any,
) -> Tuple[bool, Optional[str], List[Dict[str, Any]]]:
    if not isinstance(roles, list) or not roles:
        return False, "empty_roles", []
    seen: set[int] = set()
    typed: List[Dict[str, Any]] = []
    for raw in roles:
        if not isinstance(raw, dict):
            return False, "invalid_role", []
        try:
            party_index = int(raw.get("partyIndex") if raw.get("partyIndex") is not None else raw.get("party_index"))
        except (TypeError, ValueError):
            return False, "invalid_party_index", []
        if party_index in seen:
            return False, "duplicate_party_index", []
        seen.add(party_index)
        typed.append(raw)
    typed.sort(
        key=lambda r: int(
            r.get("partyIndex") if r.get("partyIndex") is not None else r.get("party_index") or 0
        )
    )
    return True, None, typed


def build_signer_manifest_canonical_json(roles: List[Dict[str, Any]]) -> str:
    rows = []
    for r in roles:
        party_index = int(
            r.get("partyIndex") if r.get("partyIndex") is not None else r.get("party_index") or 0
        )
        entity = _clean(r.get("entityName") or r.get("entity_name") or r.get("partyName") or r.get("party_name"))
        req = r.get("requiresSignature")
        if req is None:
            req = r.get("requires_signature")
        requires_signature = True if req is None else bool(req)
        party_id = r.get("partyId") if "partyId" in r else r.get("party_id")
        kind = r.get("kind")
        vs01_cp = r.get("vs01CounterpartyId")
        if vs01_cp is None:
            vs01_cp = r.get("vs01_counterparty_id")
        rows.append(
            {
                "entityName": entity,
                "kind": kind if kind is not None else None,
                "partyId": party_id if party_id is not None else None,
                "partyIndex": party_index,
                "requiresSignature": requires_signature,
                "roleId": r.get("roleId") if r.get("roleId") is not None else r.get("role_id"),
                "vs01CounterpartyId": vs01_cp if vs01_cp is not None else None,
            }
        )
    # Match TS: canonicalize sorts keys per object; arrays preserve order.
    return _canon_json(rows)


def find_signature_region_start(text: str) -> int:
    length = len(text)
    if length < 80:
        return -1
    min_fraction = SIGNATURE_REGION_MIN_FRACTION if length >= 2000 else 0.12
    min_pos = int(length * min_fraction)

    witness_matches = list(_WITNESS_RE.finditer(text))
    for m in reversed(witness_matches):
        if m.start() >= min_pos:
            return m.start()
    for m in reversed(witness_matches):
        if m.start() >= length * 0.72:
            return m.start()

    client_m = _CLIENT_BLOCK_RE.search(text)
    if client_m and client_m.start() >= min_pos:
        return client_m.start()

    for m in reversed(list(_SIG_HEADING_RE.finditer(text))):
        if m.start() >= min_pos:
            return m.start()

    for m in reversed(list(_INLINE_STALE_SIG_RE.finditer(text))):
        if m.start() >= min_pos:
            return m.start()

    return -1


def signature_patch_start_index(text: str) -> int:
    marker = find_signature_region_start(text)
    if marker >= 0:
        return marker
    witness = _WITNESS_RE.search(text)
    if witness:
        return witness.start()
    client_m = _CLIENT_BLOCK_RE.search(text)
    if client_m:
        return client_m.start()
    return length // 2 if (length := len(text)) else 0


def count_signature_execution_lines_in_tail(text: str) -> int:
    start = signature_patch_start_index(text)
    tail = text[start:] if start >= 0 else text[int(len(text) * 0.72) :]
    return len(_BY_OR_SIGNATURE_LINE_RE.findall(tail))


def count_signature_block_headings_in_tail(text: str) -> int:
    start = signature_patch_start_index(text)
    tail = text[start:] if start >= 0 else text[int(len(text) * 0.72) :]
    role_headings = len(_ROLE_HEADING_RE.findall(tail))
    if role_headings > 0:
        return role_headings
    return len(_ENTITY_HEADING_RE.findall(tail))


def corpus_has_visible_signature_execution_lines(text: str) -> bool:
    return count_signature_execution_lines_in_tail((text or "").strip()) > 0


def corpus_signature_blocks_have_required_by_lines(text: str, party_count: int) -> bool:
    headings = count_signature_block_headings_in_tail(text)
    execution_lines = count_signature_execution_lines_in_tail(text)
    if headings > 0:
        return execution_lines >= headings
    return execution_lines >= min(2, max(1, party_count))


def strip_stale_execution_placement_corpus_copy(text: str) -> str:
    if not _WITNESS_RE.search(text) and not re.search(
        r"\b(?:By|Signature)\s*:\s*_{2,}", text, re.IGNORECASE
    ):
        return text
    if not _EXECUTION_PLACEMENT_FOOTER_RE.search(text):
        return text
    next_text = _EXECUTION_PLACEMENT_FOOTER_RE.sub("", text)
    next_text = re.sub(r"\n{3,}", "\n\n", next_text).strip()
    return next_text


def standardize_witness_signature_lines(corpus: str) -> str:
    return _STANDARDIZE_SIG_LINE_RE.sub(r"\1By\2______________________", corpus)


def _role_entity(role: Dict[str, Any]) -> str:
    return _clean(role.get("entityName") or role.get("entity_name") or role.get("partyName") or role.get("party_name"))


def _role_signer_name(role: Dict[str, Any]) -> str:
    return _clean(
        role.get("signerName")
        or role.get("signer_name")
        or role.get("entityName")
        or role.get("entity_name")
        or role.get("partyName")
        or role.get("party_name")
    )


def _role_signer_title(role: Dict[str, Any]) -> str:
    return _clean(role.get("signerTitle") or role.get("signer_title"))


def canonical_witness_block_from_roles(roles: List[Dict[str, Any]]) -> str:
    if not roles:
        return "IN WITNESS WHEREOF, the Parties execute this Agreement."
    owner, *others = roles
    blocks: List[str] = ["IN WITNESS WHEREOF, the Parties execute this Agreement."]
    if owner:
        lines = [
            "CLIENT:",
            _role_entity(owner) or "Client",
            "By: ______________________",
            f"Name: {_role_signer_name(owner)}".rstrip(),
        ]
        title = _role_signer_title(owner)
        if title:
            lines.append(f"Title: {title}")
        lines.append("Date: ____________________")
        blocks.append("\n".join(lines))
    for i, role in enumerate(others):
        heading = "SERVICE PROVIDER:" if i == 0 else f"PARTY {i + 2}:"
        default_name = f"Party {i + 2}"
        lines = [
            heading,
            _role_entity(role) or default_name,
            "By: ______________________",
            f"Name: {_role_signer_name(role)}".rstrip(),
        ]
        title = _role_signer_title(role)
        if title:
            lines.append(f"Title: {title}")
        lines.append("Date: ____________________")
        blocks.append("\n".join(lines))
    return "\n\n".join(blocks)


def derive_vs01_packet_layout_corpus(corpus: str, roles: List[Dict[str, Any]]) -> str:
    cleaned = standardize_witness_signature_lines(strip_stale_execution_placement_corpus_copy(corpus).strip())
    signer_count = max(
        1,
        sum(
            1
            for r in roles
            if (r.get("requiresSignature") if r.get("requiresSignature") is not None else r.get("requires_signature"))
            is not False
        ),
    )
    execution_lines = count_signature_execution_lines_in_tail(cleaned)
    if (
        corpus_has_visible_signature_execution_lines(cleaned)
        and corpus_signature_blocks_have_required_by_lines(cleaned, signer_count)
        and execution_lines >= signer_count
    ):
        return cleaned
    patch_at = signature_patch_start_index(cleaned)
    if patch_at >= 0:
        operative = cleaned[:patch_at].rstrip("\n")
    else:
        operative = cleaned.rstrip("\n")
    return f"{operative}\n\n{canonical_witness_block_from_roles(roles)}".strip()


def build_vs01_signing_envelope_provenance(
    *,
    accepted_sot_plain: str,
    roles: List[Dict[str, Any]],
    packet_layout_corpus: Optional[str] = None,
    derived_at: Optional[str] = None,
    packet_schema_version: Optional[str] = None,
) -> Dict[str, Any]:
    accepted = (accepted_sot_plain or "").strip()
    ok, err, canon_roles = canonicalize_prepare_roles_for_envelope(roles)
    if not ok:
        raise ValueError(f"signer_manifest_{err}")

    layout = (packet_layout_corpus if packet_layout_corpus is not None else derive_vs01_packet_layout_corpus(accepted, canon_roles)).strip()
    schema = packet_schema_version or VS01_SIGNING_ENVELOPE_SCHEMA_VERSION
    accepted_digest = sha256_hex_text(accepted)
    layout_digest = sha256_hex_text(layout)
    signer_manifest_digest = sha256_hex_text(build_signer_manifest_canonical_json(canon_roles))
    derived = derived_at or _utc_now_iso()

    packet_digest_payload = {
        "acceptedSoTDigest": accepted_digest,
        "acceptedSoTLength": len(accepted),
        "packetLayoutCorpusDigest": layout_digest,
        "packetLayoutCorpusLength": len(layout),
        "packetSchemaVersion": schema,
        "signerManifestDigest": signer_manifest_digest,
    }
    packet_digest = sha256_hex_text(_canon_json(packet_digest_payload))

    return {
        "acceptedSoTDigest": accepted_digest,
        "acceptedSoTLength": len(accepted),
        "acceptedSoTDisplayFingerprint": fingerprint_agreement_body(accepted),
        "packetDigest": packet_digest,
        "packetSchemaVersion": schema,
        "signerManifestDigest": signer_manifest_digest,
        "derivedAt": derived,
        "packetLayoutCorpusDigest": layout_digest,
        "packetLayoutCorpusLength": len(layout),
    }


def _provenance_digest_fields(prov: Dict[str, Any]) -> Dict[str, Any]:
    return {
        "acceptedSoTDigest": _clean(prov.get("acceptedSoTDigest") or prov.get("accepted_sot_digest")).lower(),
        "acceptedSoTLength": int(prov.get("acceptedSoTLength") or prov.get("accepted_sot_length") or 0),
        "packetDigest": _clean(prov.get("packetDigest") or prov.get("packet_digest")).lower(),
        "packetSchemaVersion": _clean(prov.get("packetSchemaVersion") or prov.get("packet_schema_version")),
        "signerManifestDigest": _clean(prov.get("signerManifestDigest") or prov.get("signer_manifest_digest")).lower(),
        "packetLayoutCorpusDigest": _clean(
            prov.get("packetLayoutCorpusDigest") or prov.get("packet_layout_corpus_digest")
        ).lower(),
        "packetLayoutCorpusLength": int(
            prov.get("packetLayoutCorpusLength") or prov.get("packet_layout_corpus_length") or 0
        ),
    }


def compare_client_provenance_to_server(
    client_prov: Optional[Dict[str, Any]],
    server_prov: Dict[str, Any],
) -> Tuple[bool, Optional[str]]:
    """Reject forged client digests. Missing client provenance is allowed (server attests)."""
    if not isinstance(client_prov, dict) or not client_prov:
        return True, None
    c = _provenance_digest_fields(client_prov)
    s = _provenance_digest_fields(server_prov)
    if c["acceptedSoTDigest"] and c["acceptedSoTDigest"] != s["acceptedSoTDigest"]:
        return False, "forged_accepted_sot_digest"
    if c["acceptedSoTLength"] and c["acceptedSoTLength"] != s["acceptedSoTLength"]:
        return False, "forged_accepted_sot_length"
    if c["signerManifestDigest"] and c["signerManifestDigest"] != s["signerManifestDigest"]:
        return False, "forged_signer_manifest_digest"
    if c["packetLayoutCorpusDigest"] and c["packetLayoutCorpusDigest"] != s["packetLayoutCorpusDigest"]:
        return False, "forged_packet_layout_digest"
    if c["packetDigest"] and c["packetDigest"] != s["packetDigest"]:
        return False, "forged_packet_digest"
    if c["packetSchemaVersion"] and c["packetSchemaVersion"] != s["packetSchemaVersion"]:
        return False, "envelope_schema_version_mismatch"
    return True, None


def build_envelope_attestation_mac(
    *,
    agreement_id: str,
    provenance: Dict[str, Any],
    secret_raw: str,
) -> str:
    payload = {
        "acceptedSoTDigest": _clean(provenance.get("acceptedSoTDigest")).lower(),
        "agreementId": _clean(agreement_id),
        "packetDigest": _clean(provenance.get("packetDigest")).lower(),
        "packetLayoutCorpusDigest": _clean(provenance.get("packetLayoutCorpusDigest")).lower(),
        "schema": VS01_ENVELOPE_ATTESTATION_SCHEMA,
        "signerManifestDigest": _clean(provenance.get("signerManifestDigest")).lower(),
    }
    body = _canon_json(payload).encode("utf-8")
    return hmac.new(secret_raw.encode("utf-8"), body, hashlib.sha256).hexdigest()


def verify_envelope_attestation_mac(
    *,
    agreement_id: str,
    provenance: Dict[str, Any],
    attestation: Optional[Dict[str, Any]],
    secret_raw: str,
) -> bool:
    if not isinstance(attestation, dict):
        return False
    mac = _clean(attestation.get("mac") or attestation.get("hmac") or attestation.get("signature"))
    if not mac:
        return False
    expected = build_envelope_attestation_mac(
        agreement_id=agreement_id,
        provenance=provenance,
        secret_raw=secret_raw,
    )
    return hmac.compare_digest(mac.lower(), expected.lower())


def attest_portable_envelope_provenance(
    *,
    agreement_id: str,
    portable: Dict[str, Any],
    secret_raw: str,
    require_client_match: bool = True,
) -> Tuple[bool, Optional[str], Optional[Dict[str, Any]]]:
    """
    Recompute digests from portable seed/roles, reject client forgery, attach server attestation.

    Returns (ok, error_code, portable_with_server_provenance).
    """
    if not isinstance(portable, dict):
        return False, "portable_required", None
    seed = portable.get("seed") if isinstance(portable.get("seed"), dict) else {}
    accepted = _clean(seed.get("corpusPlain") or seed.get("corpus_plain"))
    if not accepted:
        return False, "accepted_sot_missing", None
    roles = portable.get("roles") if isinstance(portable.get("roles"), list) else []
    ok_roles, role_err, canon_roles = canonicalize_prepare_roles_for_envelope(roles)
    if not ok_roles:
        return False, f"signer_manifest_{role_err}", None

    try:
        server_prov = build_vs01_signing_envelope_provenance(
            accepted_sot_plain=accepted,
            roles=canon_roles,
        )
    except ValueError as exc:
        return False, str(exc), None

    client_prov = portable.get("envelopeProvenance") or portable.get("envelope_provenance")
    if require_client_match:
        match_ok, match_err = compare_client_provenance_to_server(
            client_prov if isinstance(client_prov, dict) else None,
            server_prov,
        )
        if not match_ok:
            return False, match_err, None

    mac = build_envelope_attestation_mac(
        agreement_id=agreement_id,
        provenance=server_prov,
        secret_raw=secret_raw,
    )
    attestation = {
        "schema": VS01_ENVELOPE_ATTESTATION_SCHEMA,
        "algo": "hmac-sha256",
        "mac": mac,
        "attestedAt": _utc_now_iso(),
        "attestedBy": "server",
    }
    next_portable = {
        **portable,
        "envelopeProvenance": server_prov,
        "envelopeAttestation": attestation,
    }
    return True, None, next_portable


def validate_portable_against_stored_attested_sot(
    *,
    agreement_id: str,
    stored_portable: Optional[Dict[str, Any]],
    incoming_portable: Dict[str, Any],
    secret_raw: str,
) -> Tuple[bool, Optional[str], Optional[Dict[str, Any]]]:
    """
    Signing-completion / reissue gate: reject SoT swap and forged provenance vs stored attestation.
    """
    ok, err, attested = attest_portable_envelope_provenance(
        agreement_id=agreement_id,
        portable=incoming_portable,
        secret_raw=secret_raw,
        require_client_match=True,
    )
    if not ok or not attested:
        return False, err or "envelope_attestation_failed", None

    if isinstance(stored_portable, dict):
        stored_seed = stored_portable.get("seed") if isinstance(stored_portable.get("seed"), dict) else {}
        stored_sot = _clean(stored_seed.get("corpusPlain") or stored_seed.get("corpus_plain"))
        incoming_seed = attested.get("seed") if isinstance(attested.get("seed"), dict) else {}
        incoming_sot = _clean(incoming_seed.get("corpusPlain") or incoming_seed.get("corpus_plain"))
        if stored_sot and incoming_sot and stored_sot != incoming_sot:
            return False, "accepted_sot_substitution_rejected", None

        stored_prov = stored_portable.get("envelopeProvenance") or stored_portable.get("envelope_provenance")
        if isinstance(stored_prov, dict):
            stored_digest = _clean(stored_prov.get("acceptedSoTDigest")).lower()
            incoming_digest = _clean(attested["envelopeProvenance"].get("acceptedSoTDigest")).lower()
            if stored_digest and incoming_digest and stored_digest != incoming_digest:
                return False, "provenance_copied_from_other_sot", None

            stored_att = stored_portable.get("envelopeAttestation") or stored_portable.get("envelope_attestation")
            if isinstance(stored_att, dict) and not verify_envelope_attestation_mac(
                agreement_id=agreement_id,
                provenance=stored_prov,
                attestation=stored_att,
                secret_raw=secret_raw,
            ):
                # Stored attestation broken — still enforce digest recompute on incoming.
                pass
            elif isinstance(stored_att, dict):
                # Preserve original attestation for the accepted SoT linkage when SoT unchanged.
                if stored_digest == incoming_digest:
                    attested = {
                        **attested,
                        "envelopeProvenance": {
                            **attested["envelopeProvenance"],
                            # Keep packet/layout digests from recompute of incoming roles+layout.
                        },
                        "envelopeAttestation": stored_att
                        if _clean(stored_prov.get("packetDigest")).lower()
                        == _clean(attested["envelopeProvenance"].get("packetDigest")).lower()
                        and _clean(stored_prov.get("signerManifestDigest")).lower()
                        == _clean(attested["envelopeProvenance"].get("signerManifestDigest")).lower()
                        else attested["envelopeAttestation"],
                    }

    return True, None, attested


def public_verify_envelope_provenance_from_draft(
    *,
    agreement_id: str,
    draft: Any,
    secret_raw: str,
) -> Optional[Dict[str, Any]]:
    """
    Independent of client input: recompute from persisted portable and verify server MAC.
    Returns public verification fragment or None when packet absent.
    """
    packet = None
    if isinstance(draft, dict):
        packet = draft.get("vs01_signing_packet_v1")
    else:
        packet = getattr(draft, "vs01_signing_packet_v1", None)
    if not isinstance(packet, dict):
        return None
    portable = packet.get("portable")
    if not isinstance(portable, dict):
        return None
    seed = portable.get("seed") if isinstance(portable.get("seed"), dict) else {}
    accepted = _clean(seed.get("corpusPlain") or seed.get("corpus_plain"))
    roles = portable.get("roles") if isinstance(portable.get("roles"), list) else []
    if not accepted or not roles:
        return None
    try:
        recomputed = build_vs01_signing_envelope_provenance(
            accepted_sot_plain=accepted,
            roles=roles,
            derived_at=_clean(
                (portable.get("envelopeProvenance") or {}).get("derivedAt")
                if isinstance(portable.get("envelopeProvenance"), dict)
                else None
            )
            or None,
        )
    except ValueError:
        return None

    stored_prov = portable.get("envelopeProvenance") if isinstance(portable.get("envelopeProvenance"), dict) else {}
    stored_att = portable.get("envelopeAttestation") if isinstance(portable.get("envelopeAttestation"), dict) else None
    digests_match_stored = True
    if stored_prov:
        digests_match_stored = (
            _clean(stored_prov.get("acceptedSoTDigest")).lower() == recomputed["acceptedSoTDigest"]
            and _clean(stored_prov.get("packetDigest")).lower() == recomputed["packetDigest"]
            and _clean(stored_prov.get("signerManifestDigest")).lower() == recomputed["signerManifestDigest"]
        )
    mac_ok = verify_envelope_attestation_mac(
        agreement_id=agreement_id,
        provenance=recomputed,
        attestation=stored_att,
        secret_raw=secret_raw,
    )
    if not digests_match_stored or not mac_ok:
        # Fail closed for public verify: do not advertise untrusted client-only provenance.
        return {
            "envelope_provenance": None,
            "envelope_attestation_valid": False,
            "envelope_attestation_reason": (
                "stored_provenance_tamper" if not digests_match_stored else "attestation_mac_invalid"
            ),
        }

    return {
        "envelope_provenance": {
            "acceptedSoTDigest": recomputed["acceptedSoTDigest"],
            "acceptedSoTLength": recomputed["acceptedSoTLength"],
            "packetDigest": recomputed["packetDigest"],
            "packetSchemaVersion": recomputed["packetSchemaVersion"],
            "signerManifestDigest": recomputed["signerManifestDigest"],
            "derivedAt": recomputed["derivedAt"],
            "packetLayoutCorpusDigest": recomputed["packetLayoutCorpusDigest"],
        },
        "envelope_attestation_valid": True,
        "envelope_attestation_reason": None,
    }
