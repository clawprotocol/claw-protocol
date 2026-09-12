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


def multi_worker_completion_ready() -> bool:
    """True only when a durable shared ledger file can be opened."""
    return ledger_path() is not None


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
            _initialized.add(key)
    return cx


def reset_vs01_completion_ledger_for_tests() -> None:
    with _init_lock:
        _initialized.clear()


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
            if (
                str(row["signature_artifact_digest"] or "") != (signature_artifact_digest or "")
                or str(row["consent_artifact_digest"] or "") != (consent_artifact_digest or "")
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
              packet_revision, document_id, document_hash
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
        if (
            str(row["signature_artifact_digest"] or "") != (signature_artifact_digest or "")
            or str(row["consent_artifact_digest"] or "") != (consent_artifact_digest or "")
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
