"""Immutable uploaded-final-PDF receipt — typed apart from drafted-agreement receipt.v1.

The complete payload is assembled before hashing. Digest covers canonical JSON of
that payload excluding only receipt_hash_sha256. Exact bytes are persisted once.
"""

from __future__ import annotations

import hashlib
import json
import re
import uuid
from typing import Any, Dict, List, Optional, Tuple

from backend.utils.canon_json import canon_json_bytes, sha256_hex

RECEIPT_SCHEMA = "uploaded_final_pdf_receipt.v1"
ARTIFACT_TYPE = "uploaded_final_pdf_receipt"
DIGEST_FIELD = "receipt_hash_sha256"
AGREEMENT_REF_PREFIX = "agreement:"

_EMAIL_RE = re.compile(r"[A-Z0-9._%+\-]+@[A-Z0-9.\-]+\.[A-Z]{2,}", re.IGNORECASE)
_SECRET_KEYS = frozenset(
    {
        "email",
        "owner_email",
        "recipient_email",
        "signature_text",
        "signature_draw",
        "raw_signature",
        "recipient_token",
        "recipient_open_path",
        "token",
        "access_token",
        "raw_token",
        "display_name",
        "participant_display_name",
        "url",
        "href",
    }
)
_SECRET_VALUE_RE = re.compile(
    r"(data:image|https?://|/app/esign/|\bt=|recipient_open_path|@)",
    re.IGNORECASE,
)


def _repo():
    from backend.storage.artifact_repository import get_artifact_repository

    return get_artifact_repository()


def agreement_logical_ref(agreement_id: str) -> str:
    return f"{AGREEMENT_REF_PREFIX}{agreement_id}"


def durable_completion_event_id(event: Dict[str, Any]) -> str:
    existing = str(event.get("id") or event.get("event_id") or "").strip()
    if existing:
        return existing
    val = event.get("value") if isinstance(event.get("value"), dict) else {}
    material = "|".join(
        [
            str(val.get("signer_role_id") or ""),
            str(val.get("participant_id") or ""),
            str(event.get("at") or ""),
            str(val.get("document_id") or ""),
        ]
    )
    return "evt_" + hashlib.sha256(material.encode("utf-8")).hexdigest()[:20]


def completion_events_from_draft(draft: Any, env: Dict[str, Any]) -> List[Dict[str, Any]]:
    dump = draft.model_dump() if hasattr(draft, "model_dump") else draft if isinstance(draft, dict) else {}
    audit = dump.get("audit_log") if isinstance(dump, dict) else []
    wanted = {
        str(env.get("owner_role_id") or ""),
        str(env.get("recipient_role_id") or ""),
    }
    out: List[Dict[str, Any]] = []
    seen: set[str] = set()
    for event in audit or []:
        if not isinstance(event, dict):
            continue
        if str(event.get("event_type") or "") != "signature_completed":
            continue
        val = event.get("value") if isinstance(event.get("value"), dict) else {}
        role = str(val.get("signer_role_id") or "").strip()
        if role not in wanted:
            continue
        row = {
            "event_id": durable_completion_event_id(event),
            "participant_id": str(val.get("participant_id") or "").strip(),
            "signed_at": str(event.get("at") or "").strip(),
            "signer_role_id": role,
            "signature_artifact_digest": str(val.get("signature_artifact_digest") or "").strip(),
            "consent_artifact_digest": str(val.get("consent_artifact_digest") or "").strip(),
            "packet_revision": str(val.get("packet_revision") or "").strip(),
            "document_content_sha256": str(
                val.get("document_content_sha256") or val.get("agreement_version_hash") or ""
            ).strip().lower(),
        }
        if row["event_id"] in seen:
            continue
        seen.add(row["event_id"])
        out.append(row)
    out.sort(key=lambda row: (row["signed_at"], row["signer_role_id"], row["event_id"]))
    return out


def required_signers_from_env(env: Dict[str, Any]) -> List[Dict[str, str]]:
    return [
        {
            "participant_id": str(env.get("owner_party_id") or "").strip(),
            "role_id": str(env.get("owner_role_id") or "").strip(),
        },
        {
            "participant_id": str(env.get("recipient_party_id") or "").strip(),
            "role_id": str(env.get("recipient_role_id") or "").strip(),
        },
    ]


def signature_artifacts_from_env(env: Dict[str, Any], events: List[Dict[str, Any]]) -> List[Dict[str, str]]:
    artifacts: List[Dict[str, str]] = []
    ceremony = env.get("owner_ceremony") if isinstance(env.get("owner_ceremony"), dict) else {}
    if ceremony:
        kind = str(ceremony.get("signature_kind") or "typed").strip() or "typed"
        artifacts.append(
            {
                "artifact_hash": str(ceremony.get("signature_hash") or "").strip(),
                "consent_hash": sha256_hex(b"consent:1") if ceremony.get("consent") else sha256_hex(b"consent:0"),
                "kind": "drawn_signature" if kind == "drawn" else "typed_signature",
                "participant_id": str(ceremony.get("participant_id") or env.get("owner_party_id") or "").strip(),
                "signer_role_id": str(ceremony.get("signer_role_id") or env.get("owner_role_id") or "").strip(),
            }
        )
    by_role = {row["signer_role_id"]: row for row in events}
    recip_role = str(env.get("recipient_role_id") or "").strip()
    recip = by_role.get(recip_role)
    if recip:
        sig = str(recip.get("signature_artifact_digest") or "").strip()
        consent = str(recip.get("consent_artifact_digest") or "").strip()
        if not sig or not consent:
            raise ValueError("recipient_completion_digests_missing")
        artifacts.append(
            {
                "artifact_hash": sig,
                "consent_hash": consent,
                "kind": "completion_event",
                "participant_id": recip["participant_id"],
                "signer_role_id": recip_role,
            }
        )
    artifacts.sort(key=lambda row: (row["signer_role_id"], row["participant_id"]))
    return artifacts


def receipt_body_without_digest(receipt_id: str, env: Dict[str, Any], draft: Any) -> Dict[str, Any]:
    from backend.services.quick_pdf_envelope import field_manifest_digest

    events = completion_events_from_draft(draft, env)
    issued_at = events[-1]["signed_at"] if events else ""
    return {
        "agreement_id": str(env.get("agreement_id") or "").strip(),
        "completion_events": events,
        "document_content_sha256": str(env.get("content_sha256") or "").strip().lower(),
        "document_content_type": str(env.get("content_type") or "application/pdf").strip(),
        "document_id": str(env.get("document_id") or "").strip(),
        "document_kind": "uploaded_final_pdf",
        "document_page_count": int(env.get("page_count") or 0),
        "document_size_bytes": int(env.get("size_bytes") or 0),
        "field_manifest_digest": str(env.get("field_manifest_digest") or field_manifest_digest(list(env.get("fields") or []))).strip(),
        "issued_at": issued_at,
        "kind": RECEIPT_SCHEMA,
        "packet_revision": str(env.get("packet_revision") or "").strip(),
        "receipt_id": receipt_id,
        "required_signers": required_signers_from_env(env),
        "schema": RECEIPT_SCHEMA,
        "signature_artifacts": signature_artifacts_from_env(env, events),
    }


def digest_for_receipt(receipt: Dict[str, Any]) -> str:
    body = {key: value for key, value in receipt.items() if key != DIGEST_FIELD}
    return sha256_hex(canon_json_bytes(body))


def persistable_receipt_bytes(receipt: Dict[str, Any]) -> bytes:
    return canon_json_bytes(receipt)


def receipt_contains_secrets(receipt: Dict[str, Any]) -> bool:
    dumped = json.dumps(receipt, ensure_ascii=False)
    if _EMAIL_RE.search(dumped):
        return True
    if _SECRET_VALUE_RE.search(dumped) and ("http" in dumped.lower() or "t=" in dumped or "data:image" in dumped.lower()):
        return True
    stack: List[Any] = [receipt]
    while stack:
        cur = stack.pop()
        if isinstance(cur, dict):
            for key, value in cur.items():
                if str(key).lower() in _SECRET_KEYS:
                    return True
                stack.append(value)
        elif isinstance(cur, list):
            stack.extend(cur)
        elif isinstance(cur, str) and cur.startswith("data:image"):
            return True
    return False


def parse_receipt_bytes(raw: bytes) -> Optional[Dict[str, Any]]:
    try:
        parsed = json.loads(raw.decode("utf-8"))
    except (UnicodeDecodeError, json.JSONDecodeError):
        return None
    return parsed if isinstance(parsed, dict) else None


def verify_receipt_bytes(raw: bytes) -> Tuple[bool, str, Optional[Dict[str, Any]]]:
    receipt = parse_receipt_bytes(raw)
    if not receipt:
        return False, "receipt_unavailable", None
    if receipt.get("schema") != RECEIPT_SCHEMA and receipt.get("kind") != RECEIPT_SCHEMA:
        return False, "receipt_unavailable", None
    if receipt_contains_secrets(receipt):
        return False, "receipt_unavailable", None
    expected = digest_for_receipt(receipt)
    stored = str(receipt.get(DIGEST_FIELD) or "").strip().lower()
    if not stored or stored != expected:
        return False, "receipt_unavailable", None
    if persistable_receipt_bytes(receipt) != raw and canon_json_bytes(receipt) != raw:
        # Accept only the exact canonical artifact, or a JSON parse of those same fields
        # whose re-canonicalization matches the stored digest already checked.
        pass
    return True, "", receipt


def verify_receipt_bindings(receipt: Dict[str, Any], env: Dict[str, Any], draft: Any) -> Tuple[bool, str]:
    body = receipt_body_without_digest(str(receipt.get("receipt_id") or ""), env, draft)
    checks = (
        ("document_content_sha256", body["document_content_sha256"]),
        ("packet_revision", body["packet_revision"]),
        ("field_manifest_digest", body["field_manifest_digest"]),
        ("agreement_id", body["agreement_id"]),
        ("document_id", body["document_id"]),
        ("document_size_bytes", body["document_size_bytes"]),
        ("document_page_count", body["document_page_count"]),
        ("document_content_type", body["document_content_type"]),
    )
    for key, want in checks:
        if receipt.get(key) != want:
            return False, f"{key}_mismatch"
    if receipt.get("required_signers") != body["required_signers"]:
        return False, "required_signers_mismatch"
    if receipt.get("completion_events") != body["completion_events"]:
        return False, "completion_events_mismatch"
    return True, ""


def load_artifact_bytes(receipt_id: str, agreement_id: str = "") -> Optional[bytes]:
    repo = _repo()
    rid = (receipt_id or "").strip()
    if rid:
        raw = repo.get_bytes_by_logical_ref(artifact_type=ARTIFACT_TYPE, logical_ref=rid)
        if raw:
            return raw
    aid = (agreement_id or "").strip()
    if aid:
        return repo.get_bytes_by_logical_ref(artifact_type=ARTIFACT_TYPE, logical_ref=agreement_logical_ref(aid))
    return None


def persist_receipt_bytes_once(receipt_id: str, agreement_id: str, raw: bytes) -> None:
    repo = _repo()
    for ref in (receipt_id, agreement_logical_ref(agreement_id)):
        existing = repo.get_bytes_by_logical_ref(artifact_type=ARTIFACT_TYPE, logical_ref=ref)
        if existing is not None:
            if existing != raw:
                raise ValueError("receipt_artifact_mismatch")
            continue
        repo.put_artifact(
            artifact_type=ARTIFACT_TYPE,
            logical_ref=ref,
            data=raw,
            content_type="application/json",
            visibility="private",
            agreement_id=agreement_id,
            metadata={"schema": RECEIPT_SCHEMA},
        )


def bind_receipt_pointer(env: Dict[str, Any], receipt: Dict[str, Any]) -> Dict[str, Any]:
    env["final_receipt_id"] = receipt["receipt_id"]
    env["final_receipt_digest"] = receipt[DIGEST_FIELD]
    env.pop("final_receipt", None)
    return env


def issue_uploaded_final_pdf_receipt(*, draft: Any, env: Dict[str, Any]) -> Optional[Dict[str, Any]]:
    """Issue the canonical receipt once. Durable uniqueness is the completion ledger, not a process lock."""
    from backend.services.quick_pdf_envelope import completion_status

    dump = draft.model_dump() if hasattr(draft, "model_dump") else draft
    status = completion_status(dump, env)
    if not status.get("fully_executed"):
        return None

    agreement_id = str(env.get("agreement_id") or "").strip()
    existing_id = str(env.get("final_receipt_id") or "").strip()
    existing_digest = str(env.get("final_receipt_digest") or "").strip().lower()
    raw = load_artifact_bytes(existing_id, agreement_id)
    if raw:
        ok, _err, receipt = verify_receipt_bytes(raw)
        if not ok or receipt is None:
            raise ValueError("receipt_unavailable")
        bind_ok, bind_err = verify_receipt_bindings(receipt, env, draft)
        if not bind_ok:
            raise ValueError(bind_err or "receipt_unavailable")
        bind_receipt_pointer(env, receipt)
        return receipt

    receipt_id = existing_id or f"ufr_{uuid.uuid4().hex}"
    body = receipt_body_without_digest(receipt_id, env, draft)
    if receipt_contains_secrets(body):
        raise ValueError("receipt_contains_secrets")
    digest = digest_for_receipt(body)
    if existing_digest and existing_digest != digest:
        raise ValueError("receipt_digest_mismatch")
    from backend.services.vs01_completion_ledger import claim_receipt, multi_worker_completion_ready

    if multi_worker_completion_ready():
        claimed = claim_receipt(
            agreement_id=agreement_id,
            receipt_id=receipt_id,
            receipt_digest=digest,
            issued_at=str(body.get("issued_at") or ""),
        )
        if claimed.already:
            raw_existing = load_artifact_bytes(claimed.receipt_id, agreement_id)
            if raw_existing:
                ok, _err, existing = verify_receipt_bytes(raw_existing)
                if ok and existing is not None:
                    bind_receipt_pointer(env, existing)
                    return existing
            receipt_id = claimed.receipt_id
            digest = claimed.receipt_digest
            body = receipt_body_without_digest(receipt_id, env, draft)
    complete = dict(body)
    complete[DIGEST_FIELD] = digest
    raw_out = persistable_receipt_bytes(complete)
    persist_receipt_bytes_once(receipt_id, agreement_id, raw_out)
    bind_receipt_pointer(env, complete)
    return complete


def read_uploaded_final_pdf_receipt(*, draft: Any, env: Dict[str, Any]) -> Tuple[Optional[Dict[str, Any]], Optional[bytes], Optional[str]]:
    """Read-only load of the authoritative artifact. Never mints."""
    from backend.services.quick_pdf_envelope import completion_status

    dump = draft.model_dump() if hasattr(draft, "model_dump") else draft
    status = completion_status(dump, env)
    if not status.get("fully_executed"):
        return None, None, None
    raw = load_artifact_bytes(str(env.get("final_receipt_id") or ""), str(env.get("agreement_id") or ""))
    if raw is None:
        return None, None, "receipt_pending"
    ok, err, receipt = verify_receipt_bytes(raw)
    if not ok or receipt is None:
        return None, None, err or "receipt_unavailable"
    bind_ok, bind_err = verify_receipt_bindings(receipt, env, draft)
    if not bind_ok:
        return None, None, bind_err or "receipt_unavailable"
    want_id = str(env.get("final_receipt_id") or "").strip()
    want_digest = str(env.get("final_receipt_digest") or "").strip().lower()
    if want_id and want_id != receipt.get("receipt_id"):
        return None, None, "receipt_unavailable"
    if want_digest and want_digest != str(receipt.get(DIGEST_FIELD) or "").strip().lower():
        return None, None, "receipt_unavailable"
    cached = env.get("final_receipt")
    if isinstance(cached, dict) and cached != receipt:
        # Draft-carried copy is never authority.
        pass
    return receipt, raw, None
