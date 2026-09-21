"""Durable VS01 completion / receipt uniqueness — SQLite, not a process lock.

Two workers sharing CLAW_DATA_DIR (or CLAW_VS01_COMPLETION_LEDGER_PATH) cannot
both persist a first completion or a second receipt. A Python RLock is never
the uniqueness guarantee.
"""

from __future__ import annotations

import os
import sqlite3
import threading
from dataclasses import dataclass
from pathlib import Path
from typing import Optional

_init_lock = threading.Lock()
_initialized: set[str] = set()


class CompletionEvidenceConflict(RuntimeError):
    def __init__(self) -> None:
        super().__init__("completion_evidence_mismatch")


@dataclass(frozen=True)
class CompletionClaim:
    already: bool
    event_id: str
    signature_artifact_digest: str
    consent_artifact_digest: str
    signed_at: str
    packet_revision: str
    document_id: str
    document_hash: str


@dataclass(frozen=True)
class ReceiptClaim:
    already: bool
    receipt_id: str
    receipt_digest: str


def ledger_path() -> Optional[Path]:
    override = (os.environ.get("CLAW_VS01_COMPLETION_LEDGER_PATH") or "").strip()
    if override:
        return Path(override)
    data = (os.environ.get("CLAW_DATA_DIR") or "").strip()
    if data:
        return Path(data) / "vs01_completion_ledger.sqlite3"
    return None


def completion_persistence_required() -> bool:
    env = (os.environ.get("CLAW_ENVIRONMENT") or "").strip().lower()
    if env in {"production", "prod", "staging"}:
        return True
    flag = (os.environ.get("CLAW_COMMERCIAL_MODE") or "").strip().lower()
    return flag in {"1", "true", "yes"}


def completion_persistence_ready() -> bool:
    """True only when the supported shared-SQLite topology can be opened and queried.

    Supported: workers share ``CLAW_DATA_DIR`` or ``CLAW_VS01_COMPLETION_LEDGER_PATH``
    and this process can ``SELECT`` from ``signer_completions``. Path presence alone
    is not readiness. Limits: unsynchronized disks are unsafe; a process ``RLock``
    is never the uniqueness guarantee; this check does not prove a remote replica.
    """
    if ledger_path() is None:
        return False
    try:
        cx = _connect()
        try:
            cx.execute("SELECT 1 FROM signer_completions LIMIT 1")
            return True
        finally:
            cx.close()
    except Exception:
        return False


def multi_worker_completion_ready() -> bool:
    """True only when a durable shared ledger file can be opened."""
    return completion_persistence_ready()


def assert_completion_persistence_ready() -> None:
    """Fail closed for commercial/production when the ledger topology is missing."""
    if completion_persistence_ready():
        return
    if completion_persistence_required():
        from fastapi import HTTPException

        raise HTTPException(
            status_code=503,
            detail={
                "code": "completion_ledger_unconfigured",
                "message": (
                    "Recipient completion requires a shared CLAW_DATA_DIR or "
                    "CLAW_VS01_COMPLETION_LEDGER_PATH. Multi-worker production is not ready."
                ),
            },
        )
    import logging

    logging.getLogger(__name__).warning("vs01_completion_ledger_unconfigured")


def _connect() -> sqlite3.Connection:
    path = ledger_path()
    if path is None:
        raise RuntimeError("vs01_completion_ledger_unconfigured")
    path.parent.mkdir(parents=True, exist_ok=True)
    key = str(path)
    cx = sqlite3.connect(str(path), timeout=30, isolation_level=None)
    cx.row_factory = sqlite3.Row
    with _init_lock:
        if key not in _initialized:
            cx.execute("PRAGMA journal_mode=WAL")
            cx.execute("PRAGMA busy_timeout=30000")
            cx.executescript(
                """
                CREATE TABLE IF NOT EXISTS signer_completions (
                  agreement_id TEXT NOT NULL,
                  signer_role_id TEXT NOT NULL,
                  participant_id TEXT NOT NULL,
                  event_id TEXT NOT NULL,
                  signature_artifact_digest TEXT NOT NULL,
                  consent_artifact_digest TEXT NOT NULL,
                  signed_at TEXT NOT NULL,
                  packet_revision TEXT NOT NULL,
                  document_id TEXT NOT NULL,
                  document_hash TEXT NOT NULL,
                  invite_jti TEXT NOT NULL DEFAULT '',
                  PRIMARY KEY (agreement_id, signer_role_id, participant_id)
                );
                CREATE TABLE IF NOT EXISTS receipt_issuance (
                  agreement_id TEXT PRIMARY KEY,
                  receipt_id TEXT NOT NULL,
                  receipt_digest TEXT NOT NULL,
                  issued_at TEXT NOT NULL
                );
                """
            )
            try:
                cx.execute("ALTER TABLE signer_completions ADD COLUMN invite_jti TEXT NOT NULL DEFAULT ''")
            except sqlite3.OperationalError:
                pass
            _initialized.add(key)
    return cx


def reset_vs01_completion_ledger_for_tests() -> None:
    with _init_lock:
        _initialized.clear()


def completing_invite_jti(agreement_id: str, participant_id: str) -> str:
    aid = (agreement_id or "").strip()
    pid = (participant_id or "").strip()
    if not aid or not pid or ledger_path() is None:
        return ""
    cx = _connect()
    try:
        row = cx.execute(
            """
            SELECT invite_jti FROM signer_completions
            WHERE agreement_id = ? AND participant_id = ?
            LIMIT 1
            """,
            (aid, pid),
        ).fetchone()
        return str(row["invite_jti"] or "") if row else ""
    except sqlite3.OperationalError:
        return ""
    finally:
        cx.close()


def _claim_identity_matches(row: sqlite3.Row, *, packet_revision: str, document_id: str, document_hash: str, signature_artifact_digest: str, consent_artifact_digest: str) -> bool:
    if str(row["signature_artifact_digest"] or "") != (signature_artifact_digest or ""):
        return False
    if str(row["consent_artifact_digest"] or "") != (consent_artifact_digest or ""):
        return False
    stored_rev = str(row["packet_revision"] or "")
    if stored_rev and packet_revision and stored_rev != packet_revision:
        return False
    stored_doc = str(row["document_id"] or "")
    if stored_doc and document_id and stored_doc != document_id:
        return False
    stored_hash = str(row["document_hash"] or "")
    if stored_hash and document_hash and stored_hash != document_hash:
        return False
    return True


def has_participant_completion(agreement_id: str, participant_id: str) -> bool:
    """True when this participant already has a durable completion row."""
    aid = (agreement_id or "").strip()
    pid = (participant_id or "").strip()
    if not aid or not pid or ledger_path() is None:
        return False
    cx = _connect()
    try:
        row = cx.execute(
            """
            SELECT 1 FROM signer_completions
            WHERE agreement_id = ? AND participant_id = ?
            LIMIT 1
            """,
            (aid, pid),
        ).fetchone()
        return row is not None
    finally:
        cx.close()


def claim_signer_completion(
    *,
    agreement_id: str,
    signer_role_id: str,
    participant_id: str,
    event_id: str,
    signature_artifact_digest: str,
    consent_artifact_digest: str,
    signed_at: str,
    packet_revision: str,
    document_id: str,
    document_hash: str,
    invite_jti: str = "",
) -> CompletionClaim:
    aid = (agreement_id or "").strip()
    role = (signer_role_id or "").strip()
    pid = (participant_id or "").strip()
    if not aid or not role:
        raise ValueError("completion_claim_identity_required")
    cx = _connect()
    try:
        cx.execute("BEGIN IMMEDIATE")
        row = cx.execute(
            """
            SELECT event_id, signature_artifact_digest, consent_artifact_digest,
                   signed_at, packet_revision, document_id, document_hash
            FROM signer_completions
            WHERE agreement_id = ? AND signer_role_id = ? AND participant_id = ?
            """,
            (aid, role, pid),
        ).fetchone()
        if row:
            if not _claim_identity_matches(
                row,
                packet_revision=packet_revision or "",
                document_id=document_id or "",
                document_hash=document_hash or "",
                signature_artifact_digest=signature_artifact_digest or "",
                consent_artifact_digest=consent_artifact_digest or "",
            ):
                cx.execute("ROLLBACK")
                raise CompletionEvidenceConflict()
            cx.execute("COMMIT")
            return CompletionClaim(
                already=True,
                event_id=str(row["event_id"] or ""),
                signature_artifact_digest=str(row["signature_artifact_digest"] or ""),
                consent_artifact_digest=str(row["consent_artifact_digest"] or ""),
                signed_at=str(row["signed_at"] or ""),
                packet_revision=str(row["packet_revision"] or ""),
                document_id=str(row["document_id"] or ""),
                document_hash=str(row["document_hash"] or ""),
            )
        cx.execute(
            """
            INSERT INTO signer_completions (
              agreement_id, signer_role_id, participant_id, event_id,
              signature_artifact_digest, consent_artifact_digest, signed_at,
              packet_revision, document_id, document_hash, invite_jti
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                aid,
                role,
                pid,
                event_id,
                signature_artifact_digest or "",
                consent_artifact_digest or "",
                signed_at,
                packet_revision or "",
                document_id or "",
                document_hash or "",
                (invite_jti or "").strip(),
            ),
        )
        cx.execute("COMMIT")
        return CompletionClaim(
            already=False,
            event_id=event_id,
            signature_artifact_digest=signature_artifact_digest or "",
            consent_artifact_digest=consent_artifact_digest or "",
            signed_at=signed_at,
            packet_revision=packet_revision or "",
            document_id=document_id or "",
            document_hash=document_hash or "",
        )
    except sqlite3.IntegrityError:
        cx.execute("ROLLBACK")
        row = cx.execute(
            """
            SELECT event_id, signature_artifact_digest, consent_artifact_digest,
                   signed_at, packet_revision, document_id, document_hash
            FROM signer_completions
            WHERE agreement_id = ? AND signer_role_id = ? AND participant_id = ?
            """,
            (aid, role, pid),
        ).fetchone()
        if row is None:
            raise
        if not _claim_identity_matches(
            row,
            packet_revision=packet_revision or "",
            document_id=document_id or "",
            document_hash=document_hash or "",
            signature_artifact_digest=signature_artifact_digest or "",
            consent_artifact_digest=consent_artifact_digest or "",
        ):
            raise CompletionEvidenceConflict()
        return CompletionClaim(
            already=True,
            event_id=str(row["event_id"] or ""),
            signature_artifact_digest=str(row["signature_artifact_digest"] or ""),
            consent_artifact_digest=str(row["consent_artifact_digest"] or ""),
            signed_at=str(row["signed_at"] or ""),
            packet_revision=str(row["packet_revision"] or ""),
            document_id=str(row["document_id"] or ""),
            document_hash=str(row["document_hash"] or ""),
        )
    finally:
        cx.close()


def claim_receipt(
    *,
    agreement_id: str,
    receipt_id: str,
    receipt_digest: str,
    issued_at: str,
) -> ReceiptClaim:
    aid = (agreement_id or "").strip()
    if not aid:
        raise ValueError("receipt_claim_agreement_required")
    cx = _connect()
    try:
        cx.execute("BEGIN IMMEDIATE")
        row = cx.execute(
            "SELECT receipt_id, receipt_digest FROM receipt_issuance WHERE agreement_id = ?",
            (aid,),
        ).fetchone()
        if row:
            cx.execute("COMMIT")
            return ReceiptClaim(
                already=True,
                receipt_id=str(row["receipt_id"] or ""),
                receipt_digest=str(row["receipt_digest"] or ""),
            )
        cx.execute(
            """
            INSERT INTO receipt_issuance (agreement_id, receipt_id, receipt_digest, issued_at)
            VALUES (?, ?, ?, ?)
            """,
            (aid, receipt_id, receipt_digest, issued_at),
        )
        cx.execute("COMMIT")
        return ReceiptClaim(already=False, receipt_id=receipt_id, receipt_digest=receipt_digest)
    except sqlite3.IntegrityError:
        cx.execute("ROLLBACK")
        row = cx.execute(
            "SELECT receipt_id, receipt_digest FROM receipt_issuance WHERE agreement_id = ?",
            (aid,),
        ).fetchone()
        if row is None:
            raise
        return ReceiptClaim(
            already=True,
            receipt_id=str(row["receipt_id"] or ""),
            receipt_digest=str(row["receipt_digest"] or ""),
        )
    finally:
        cx.close()
