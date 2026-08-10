"""SQLite persistence for agreement ownership, internal key counters, and analytics events."""

from __future__ import annotations

import json
import os
import sqlite3
import uuid
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, List, Optional

from backend.config.runtime_environment import data_dir


def usage_economics_db_path() -> str:
    env = os.getenv("CLAW_USAGE_ECONOMICS_DB_PATH", "").strip()
    if env:
        return os.path.expanduser(env)
    return os.path.join(data_dir(), "usage_economics.sqlite3")


def _usage_eco_pg() -> bool:
    from backend.db.config import use_postgresql_for_usage_economics

    return use_postgresql_for_usage_economics()


def _utc_now() -> str:
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")


class UsageEconomicsStore:
    def __init__(self, path: Optional[str] = None) -> None:
        self._path = path or usage_economics_db_path()
        self._pg = _usage_eco_pg()
        if not self._pg:
            os.makedirs(os.path.dirname(self._path) or ".", exist_ok=True)

    def _conn(self) -> sqlite3.Connection:
        if self._pg:
            raise RuntimeError(
                "UsageEconomicsStore uses PostgreSQL; internal SQLite _conn() is not available."
            )
        c = sqlite3.connect(self._path, timeout=30.0)
        c.row_factory = sqlite3.Row
        c.execute("PRAGMA journal_mode=WAL;")
        return c

    def init_schema(self) -> None:
        if self._pg:
            from backend.usage_economics.usage_economics_postgres import (
                ensure_usage_economics_schema,
            )

            ensure_usage_economics_schema()
            return
        with self._conn() as con:
            con.executescript(
                """
                CREATE TABLE IF NOT EXISTS agreement_owner (
                  agreement_id TEXT PRIMARY KEY,
                  subject_ref TEXT NOT NULL,
                  created_at TEXT NOT NULL,
                  completed_at TEXT,
                  internal_keys_draft INTEGER NOT NULL DEFAULT 0,
                  internal_keys_finalize INTEGER NOT NULL DEFAULT 0
                );
                CREATE INDEX IF NOT EXISTS idx_agreement_owner_subject ON agreement_owner (subject_ref);

                CREATE TABLE IF NOT EXISTS subject_counters (
                  subject_ref TEXT PRIMARY KEY,
                  keys_consumed_total INTEGER NOT NULL DEFAULT 0,
                  agreements_created INTEGER NOT NULL DEFAULT 0,
                  agreements_finalized INTEGER NOT NULL DEFAULT 0,
                  ai_calls_count INTEGER NOT NULL DEFAULT 0,
                  abuse_flag INTEGER NOT NULL DEFAULT 0,
                  soft_throttle_flag INTEGER NOT NULL DEFAULT 0,
                  updated_at TEXT NOT NULL
                );

                CREATE TABLE IF NOT EXISTS ip_subject_day (
                  ip TEXT NOT NULL,
                  day TEXT NOT NULL,
                  subject_ref TEXT NOT NULL,
                  PRIMARY KEY (ip, day, subject_ref)
                );
                CREATE INDEX IF NOT EXISTS idx_ip_day ON ip_subject_day (ip, day);

                CREATE TABLE IF NOT EXISTS analytics_events (
                  id TEXT PRIMARY KEY,
                  subject_ref TEXT,
                  event_type TEXT NOT NULL,
                  payload_json TEXT NOT NULL,
                  created_at TEXT NOT NULL
                );
                CREATE INDEX IF NOT EXISTS idx_analytics_subject ON analytics_events (subject_ref, created_at);

                CREATE TABLE IF NOT EXISTS ip_draft_burst (
                  ip TEXT NOT NULL,
                  created_at TEXT NOT NULL
                );
                CREATE INDEX IF NOT EXISTS idx_ip_draft_burst_ip_ts ON ip_draft_burst (ip, created_at);
                """
            )
            from backend.usage_economics.genesis_dog_entitlement import (
                ensure_genesis_dog_entitlement_schema,
            )

            ensure_genesis_dog_entitlement_schema(con)
            for col_sql in (
                "ALTER TABLE agreement_owner ADD COLUMN claimed_at TEXT",
                "ALTER TABLE agreement_owner ADD COLUMN claim_method TEXT",
                "ALTER TABLE agreement_owner ADD COLUMN anonymous_source_org TEXT",
                "ALTER TABLE agreement_owner ADD COLUMN guest_temp INTEGER NOT NULL DEFAULT 0",
                "ALTER TABLE agreement_owner ADD COLUMN idempotency_key TEXT",
                "ALTER TABLE agreement_owner ADD COLUMN usage_refunded INTEGER NOT NULL DEFAULT 0",
            ):
                try:
                    con.execute(col_sql)
                except Exception:
                    pass
            try:
                con.execute(
                    """
                    CREATE UNIQUE INDEX IF NOT EXISTS idx_agreement_owner_subject_idempotency
                      ON agreement_owner (subject_ref, idempotency_key)
                      WHERE idempotency_key IS NOT NULL AND length(trim(idempotency_key)) > 0
                    """
                )
            except Exception:
                pass

    def insert_agreement_owner(
        self,
        *,
        agreement_id: str,
        subject_ref: str,
        internal_keys_draft: int,
    ) -> None:
        result = self.try_insert_agreement_owner_with_monthly_cap(
            agreement_id=agreement_id,
            subject_ref=subject_ref,
            internal_keys_draft=internal_keys_draft,
            monthly_cap=None,
            period_start_iso="",
        )
        if result == "cap_exceeded":
            raise RuntimeError("unexpected monthly cap denial without cap")

    def try_insert_agreement_owner_with_monthly_cap(
        self,
        *,
        agreement_id: str,
        subject_ref: str,
        internal_keys_draft: int,
        monthly_cap: Optional[int],
        period_start_iso: str,
        guest_temp: bool = False,
        idempotency_key: Optional[str] = None,
    ) -> str:
        """
        Idempotent ownership insert with optional transactional monthly create cap.

        Returns ``inserted`` | ``duplicate`` | ``idempotent_hit`` | ``cap_exceeded``.
        Concurrent callers cannot exceed ``monthly_cap`` when set.
        Guest temporary drafts (``guest_temp``) do not consume commercial allowance.
        """
        now = _utc_now()
        aid = (agreement_id or "").strip()
        subj = (subject_ref or "").strip()
        idem = (idempotency_key or "").strip()[:128] or None
        if not aid or not subj:
            raise ValueError("agreement_id and subject_ref are required")
        if self._pg:
            from backend.usage_economics import usage_economics_postgres as uep

            return uep.try_insert_agreement_owner_with_monthly_cap(
                agreement_id=aid,
                subject_ref=subj,
                internal_keys_draft=internal_keys_draft,
                now_iso=now,
                monthly_cap=monthly_cap,
                period_start_iso=period_start_iso,
                guest_temp=guest_temp,
                idempotency_key=idem,
            )

        con = self._conn()
        try:
            con.execute("BEGIN IMMEDIATE")
            existing = con.execute(
                "SELECT 1 FROM agreement_owner WHERE agreement_id = ?",
                (aid,),
            ).fetchone()
            if existing:
                con.execute("COMMIT")
                return "duplicate"
            if idem:
                prior = con.execute(
                    """
                    SELECT agreement_id FROM agreement_owner
                    WHERE subject_ref = ? AND idempotency_key = ?
                    """,
                    (subj, idem),
                ).fetchone()
                if prior:
                    con.execute("COMMIT")
                    return "idempotent_hit"
            if monthly_cap is not None and not guest_temp:
                start = (period_start_iso or "").strip()
                if not start:
                    raise ValueError("period_start_iso required when monthly_cap is set")
                row = con.execute(
                    """
                    SELECT COUNT(*) AS c FROM agreement_owner
                    WHERE subject_ref = ? AND created_at >= ?
                      AND COALESCE(guest_temp, 0) = 0
                      AND COALESCE(usage_refunded, 0) = 0
                    """,
                    (subj, start),
                ).fetchone()
                used = int(row[0]) if row else 0
                if used >= int(monthly_cap):
                    con.execute("ROLLBACK")
                    return "cap_exceeded"
            kd = int(internal_keys_draft)
            gt = 1 if guest_temp else 0
            con.execute(
                """
                INSERT INTO agreement_owner (
                  agreement_id, subject_ref, created_at, internal_keys_draft, guest_temp,
                  idempotency_key
                ) VALUES (?, ?, ?, ?, ?, ?)
                """,
                (aid, subj, now, kd, gt, idem),
            )
            if not guest_temp:
                con.execute(
                    """
                    INSERT INTO subject_counters (subject_ref, keys_consumed_total, agreements_created, agreements_finalized, ai_calls_count, abuse_flag, soft_throttle_flag, updated_at)
                    VALUES (?, ?, 1, 0, 0, 0, 0, ?)
                    ON CONFLICT(subject_ref) DO UPDATE SET
                      agreements_created = agreements_created + 1,
                      keys_consumed_total = keys_consumed_total + ?,
                      updated_at = excluded.updated_at
                    """,
                    (subj, kd, now, kd),
                )
            con.execute("COMMIT")
            return "inserted"
        except Exception as exc:
            try:
                con.execute("ROLLBACK")
            except Exception:
                pass
            # Concurrent retry with the same idempotency key.
            if idem and "UNIQUE" in str(exc).upper():
                hit = self.get_agreement_id_for_idempotency_key(
                    subject_ref=subj, idempotency_key=idem
                )
                if hit:
                    return "idempotent_hit"
            raise
        finally:
            con.close()

    def owner_subject_for_agreement(self, agreement_id: str) -> Optional[str]:
        if self._pg:
            from backend.usage_economics import usage_economics_postgres as uep

            return uep.owner_subject_for_agreement(agreement_id)
        with self._conn() as con:
            row = con.execute(
                "SELECT subject_ref FROM agreement_owner WHERE agreement_id = ?",
                ((agreement_id or "").strip(),),
            ).fetchone()
            return str(row[0]) if row else None

    def get_agreement_id_for_idempotency_key(
        self, *, subject_ref: str, idempotency_key: str
    ) -> Optional[str]:
        subj = (subject_ref or "").strip()
        idem = (idempotency_key or "").strip()
        if not subj or not idem:
            return None
        if self._pg:
            from backend.usage_economics import usage_economics_postgres as uep

            return uep.get_agreement_id_for_idempotency_key(subject_ref=subj, idempotency_key=idem)
        with self._conn() as con:
            row = con.execute(
                """
                SELECT agreement_id FROM agreement_owner
                WHERE subject_ref = ? AND idempotency_key = ?
                """,
                (subj, idem),
            ).fetchone()
            return str(row[0]).strip() if row and row[0] else None

    def list_agreement_owner_rows_for_subject(
        self,
        subject_ref: str,
        *,
        since_iso: Optional[str] = None,
        limit: int = 100,
    ) -> List[Dict[str, Any]]:
        subj = (subject_ref or "").strip()
        if not subj:
            return []
        lim = max(1, min(int(limit), 500))
        if self._pg:
            from backend.usage_economics import usage_economics_postgres as uep

            return uep.list_agreement_owner_rows_for_subject(
                subject_ref=subj, since_iso=since_iso, limit=lim
            )
        with self._conn() as con:
            if (since_iso or "").strip():
                rows = con.execute(
                    """
                    SELECT agreement_id, subject_ref, created_at, completed_at,
                           internal_keys_draft, guest_temp, idempotency_key,
                           claimed_at, claim_method, anonymous_source_org,
                           COALESCE(usage_refunded, 0) AS usage_refunded
                    FROM agreement_owner
                    WHERE subject_ref = ? AND created_at >= ?
                    ORDER BY datetime(created_at) DESC
                    LIMIT ?
                    """,
                    (subj, (since_iso or "").strip(), lim),
                ).fetchall()
            else:
                rows = con.execute(
                    """
                    SELECT agreement_id, subject_ref, created_at, completed_at,
                           internal_keys_draft, guest_temp, idempotency_key,
                           claimed_at, claim_method, anonymous_source_org,
                           COALESCE(usage_refunded, 0) AS usage_refunded
                    FROM agreement_owner
                    WHERE subject_ref = ?
                    ORDER BY datetime(created_at) DESC
                    LIMIT ?
                    """,
                    (subj, lim),
                ).fetchall()
            return [dict(r) for r in rows]

    def delete_agreement_owner(self, agreement_id: str) -> bool:
        """
        Remove ownership meter row and reverse subject_counters when the row was charged
        (non-guest and not already soft-refunded). Used for save/meter rollback.
        """
        aid = (agreement_id or "").strip()
        if not aid:
            return False
        if self._pg:
            from backend.usage_economics import usage_economics_postgres as uep

            return uep.delete_agreement_owner(aid)
        now = _utc_now()
        with self._conn() as con:
            row = con.execute(
                """
                SELECT subject_ref, internal_keys_draft,
                       COALESCE(guest_temp, 0) AS guest_temp,
                       COALESCE(usage_refunded, 0) AS usage_refunded
                FROM agreement_owner WHERE agreement_id = ?
                """,
                (aid,),
            ).fetchone()
            if not row:
                return False
            subj = str(row["subject_ref"] or "").strip()
            keys = int(row["internal_keys_draft"] or 0)
            guest = int(row["guest_temp"] or 0) == 1
            already_refunded = int(row["usage_refunded"] or 0) == 1
            cur = con.execute("DELETE FROM agreement_owner WHERE agreement_id = ?", (aid,))
            if cur.rowcount <= 0:
                return False
            if subj and not guest and not already_refunded:
                con.execute(
                    """
                    UPDATE subject_counters SET
                      agreements_created = MAX(0, agreements_created - 1),
                      keys_consumed_total = MAX(0, keys_consumed_total - ?),
                      updated_at = ?
                    WHERE subject_ref = ?
                    """,
                    (keys, now, subj),
                )
            return True

    def mark_agreement_owner_usage_refunded(self, agreement_id: str) -> bool:
        """
        Soft-refund one ownership row: keep workspace access, exclude from monthly meters,
        and reverse subject_counters once when the row was previously charged.
        """
        aid = (agreement_id or "").strip()
        if not aid:
            return False
        if self._pg:
            from backend.usage_economics import usage_economics_postgres as uep

            return uep.mark_agreement_owner_usage_refunded(aid)
        now = _utc_now()
        with self._conn() as con:
            row = con.execute(
                """
                SELECT subject_ref, internal_keys_draft,
                       COALESCE(guest_temp, 0) AS guest_temp,
                       COALESCE(usage_refunded, 0) AS usage_refunded
                FROM agreement_owner WHERE agreement_id = ?
                """,
                (aid,),
            ).fetchone()
            if not row:
                return False
            if int(row["guest_temp"] or 0) == 1:
                return False
            if int(row["usage_refunded"] or 0) == 1:
                return False
            subj = str(row["subject_ref"] or "").strip()
            keys = int(row["internal_keys_draft"] or 0)
            cur = con.execute(
                """
                UPDATE agreement_owner
                SET usage_refunded = 1
                WHERE agreement_id = ? AND COALESCE(usage_refunded, 0) = 0
                """,
                (aid,),
            )
            if cur.rowcount <= 0:
                return False
            if subj:
                con.execute(
                    """
                    UPDATE subject_counters SET
                      agreements_created = MAX(0, agreements_created - 1),
                      keys_consumed_total = MAX(0, keys_consumed_total - ?),
                      updated_at = ?
                    WHERE subject_ref = ?
                    """,
                    (keys, now, subj),
                )
            return True

    def ensure_agreement_owner_usage_exempt(
        self,
        *,
        agreement_id: str,
        subject_ref: str,
    ) -> bool:
        """
        Restore missing ownership without consuming monthly allowance.

        Returns True when a usage-exempt owner row was inserted. Returns False when the
        row already exists for this subject, belongs to another subject, or insert fails.
        """
        aid = (agreement_id or "").strip()
        subj = (subject_ref or "").strip()
        if not aid or not subj:
            return False
        if self._pg:
            from backend.usage_economics import usage_economics_postgres as uep

            return uep.ensure_agreement_owner_usage_exempt(
                agreement_id=aid, subject_ref=subj
            )
        now = _utc_now()
        with self._conn() as con:
            existing = con.execute(
                "SELECT subject_ref FROM agreement_owner WHERE agreement_id = ?",
                (aid,),
            ).fetchone()
            if existing:
                return False
            try:
                con.execute(
                    """
                    INSERT INTO agreement_owner (
                      agreement_id, subject_ref, created_at, internal_keys_draft,
                      guest_temp, usage_refunded
                    ) VALUES (?, ?, ?, 0, 0, 1)
                    """,
                    (aid, subj, now),
                )
            except Exception:
                return False
            return True

    def list_agreement_ids_from_analytics_for_subject(
        self, subject_ref: str, *, limit: int = 500
    ) -> List[str]:
        """Agreement ids previously associated with subject via usage analytics events."""
        subj = (subject_ref or "").strip()
        if not subj:
            return []
        lim = max(1, min(int(limit), 2000))
        if self._pg:
            from backend.usage_economics import usage_economics_postgres as uep

            return uep.list_agreement_ids_from_analytics_for_subject(subj, limit=lim)
        out: List[str] = []
        seen: set[str] = set()
        with self._conn() as con:
            rows = con.execute(
                """
                SELECT event_type, payload_json FROM analytics_events
                WHERE subject_ref = ?
                  AND event_type IN (
                    'agreement_created', 'keys_consumed', 'genesis_usage_reconciled'
                  )
                ORDER BY datetime(created_at) DESC
                LIMIT ?
                """,
                (subj, lim),
            ).fetchall()
        for row in rows:
            try:
                payload = json.loads(str(row["payload_json"] or "{}"))
            except Exception:
                continue
            if not isinstance(payload, dict):
                continue
            aid = str(payload.get("agreement_id") or "").strip()
            if aid and aid not in seen:
                seen.add(aid)
                out.append(aid)
            refunded = payload.get("refunded_agreement_ids")
            if isinstance(refunded, list):
                for raw in refunded:
                    a = str(raw or "").strip()
                    if a and a not in seen:
                        seen.add(a)
                        out.append(a)
        return out

    def _agreement_ids_from_admin_genesis_audits(self, subject_ref: str) -> List[str]:
        """Ids recorded on prior admin Genesis usage resets for this user."""
        subj = (subject_ref or "").strip()
        if not subj.startswith("org:user-"):
            return []
        uid = subj[len("org:user-") :].strip()
        if not uid:
            return []
        try:
            from backend.admin_console.store import get_admin_console_store
        except Exception:
            return []
        try:
            admin = get_admin_console_store()
            admin.init_schema()
            rows = admin.list_admin_action_audit_for_targets(
                target_ids=[uid, subj, f"user-{uid}"],
                limit=50,
                action_types=["genesis_usage_reconcile"],
            )
        except Exception:
            return []
        out: List[str] = []
        seen: set[str] = set()
        for row in rows:
            for key in ("before_snapshot_json", "after_snapshot_json"):
                raw = row.get(key)
                snap: Dict[str, Any]
                if isinstance(raw, dict):
                    snap = raw
                elif isinstance(raw, str) and raw.strip():
                    try:
                        parsed = json.loads(raw)
                        snap = parsed if isinstance(parsed, dict) else {}
                    except Exception:
                        snap = {}
                else:
                    snap = {}
                for field in (
                    "candidate_ids",
                    "refunded_agreement_ids",
                    "healed_agreement_ids",
                ):
                    vals = snap.get(field)
                    if not isinstance(vals, list):
                        continue
                    for raw_id in vals:
                        a = str(raw_id or "").strip()
                        if a and a not in seen:
                            seen.add(a)
                            out.append(a)
        return out

    def heal_orphaned_agreement_ownership_for_subject(self, subject_ref: str) -> List[str]:
        """
        Re-attach ownership for drafts/org agreements missing owner rows (usage-exempt).

        Discovers candidates from Supabase, draft metadata, usage analytics, and prior
        admin Genesis reset audits. Used after legacy hard-delete monthly resets.
        """
        subj = (subject_ref or "").strip()
        if not subj:
            return []
        candidates: List[str] = []
        seen: set[str] = set()

        def _add(aid: str) -> None:
            a = (aid or "").strip()
            if a and a not in seen:
                seen.add(a)
                candidates.append(a)

        try:
            from backend.lawdog_dashboard.workspace_index import (
                supabase_agreement_ids_for_subject,
            )

            for aid in supabase_agreement_ids_for_subject(subj):
                _add(aid)
        except Exception:
            pass
        try:
            from backend.ops.ownership_inspector import _recoverable_subject_from_draft
            from backend.services.agreement_draft_store import (
                list_draft_agreement_ids_newest_first,
            )

            for aid in list_draft_agreement_ids_newest_first():
                a = (aid or "").strip()
                if not a or a in seen:
                    continue
                try:
                    if (_recoverable_subject_from_draft(a) or "").strip() == subj:
                        _add(a)
                except Exception:
                    continue
        except Exception:
            pass
        try:
            for aid in self.list_agreement_ids_from_analytics_for_subject(subj):
                _add(aid)
        except Exception:
            pass
        try:
            for aid in self._agreement_ids_from_admin_genesis_audits(subj):
                _add(aid)
        except Exception:
            pass

        supabase_set: set[str] = set()
        try:
            from backend.lawdog_dashboard.workspace_index import (
                supabase_agreement_ids_for_subject,
            )

            supabase_set = {
                str(a or "").strip()
                for a in supabase_agreement_ids_for_subject(subj)
                if str(a or "").strip()
            }
        except Exception:
            supabase_set = set()

        try:
            from backend.services.agreement_draft_store import draft_exists
        except Exception:
            draft_exists = None  # type: ignore[assignment]

        healed: List[str] = []
        for aid in candidates:
            if self.owner_subject_for_agreement(aid) == subj:
                continue
            if self.owner_subject_for_agreement(aid):
                # Owned by a different subject — do not steal.
                continue
            durable = False
            if aid in supabase_set:
                durable = True
            elif draft_exists is not None:
                try:
                    durable = bool(draft_exists(aid))
                except Exception:
                    durable = False
            if not durable:
                continue
            if self.ensure_agreement_owner_usage_exempt(
                agreement_id=aid, subject_ref=subj
            ):
                healed.append(aid)
        return healed

    def refund_agreement_owners_since(
        self,
        *,
        subject_ref: str,
        period_start_iso: str,
    ) -> List[str]:
        """
        Soft-refund non-guest agreement_owner rows for subject since period_start.

        Keeps ownership so existing agreements remain accessible; marks usage_refunded
        so monthly allowance meters no longer count them. Returns refunded ids.
        """
        subj = (subject_ref or "").strip()
        start = (period_start_iso or "").strip()
        if not subj or not start:
            return []
        rows = self.list_agreement_owner_rows_for_subject(subj, since_iso=start, limit=500)
        refunded: List[str] = []
        for row in rows:
            if int(row.get("guest_temp") or 0):
                continue
            if int(row.get("usage_refunded") or 0):
                continue
            aid = str(row.get("agreement_id") or "").strip()
            if not aid:
                continue
            if self.mark_agreement_owner_usage_refunded(aid):
                refunded.append(aid)
        return refunded

    def list_agreement_ids_for_subject(self, subject_ref: str) -> list[str]:
        subj = (subject_ref or "").strip()
        if not subj:
            return []
        if self._pg:
            from backend.usage_economics import usage_economics_postgres as uep

            return uep.list_agreement_ids_for_subject(subj)
        with self._conn() as con:
            rows = con.execute(
                """
                SELECT agreement_id FROM agreement_owner
                WHERE subject_ref = ?
                ORDER BY created_at DESC, agreement_id DESC
                """,
                (subj,),
            ).fetchall()
            return [str(r[0]).strip() for r in rows if str(r[0] or "").strip()]

    def get_agreement_owner_row(self, agreement_id: str) -> Optional[Dict[str, Any]]:
        aid = (agreement_id or "").strip()
        if not aid:
            return None
        if self._pg:
            from backend.usage_economics import usage_economics_postgres as uep

            return uep.get_agreement_owner_row(aid)
        with self._conn() as con:
            row = con.execute(
                """
                SELECT agreement_id, subject_ref, created_at, completed_at,
                       claimed_at, claim_method, anonymous_source_org
                FROM agreement_owner WHERE agreement_id = ?
                """,
                (aid,),
            ).fetchone()
            return dict(row) if row else None

    def owner_subjects_for_agreement_ids(self, agreement_ids: List[str]) -> Dict[str, Optional[str]]:
        """Map agreement_id → subject_ref when registered; missing ids are omitted from dict."""
        ids = [i.strip() for i in agreement_ids if (i or "").strip()]
        if not ids:
            return {}
        if self._pg:
            from backend.usage_economics import usage_economics_postgres as uep

            return uep.owner_subjects_for_agreement_ids(ids)
        qmarks = ",".join("?" * len(ids))
        with self._conn() as con:
            rows = con.execute(
                f"SELECT agreement_id, subject_ref FROM agreement_owner WHERE agreement_id IN ({qmarks})",
                ids,
            ).fetchall()
        return {str(r[0]): str(r[1]) for r in rows}

    def count_incomplete_agreements(self, subject_ref: str) -> int:
        if self._pg:
            from backend.usage_economics import usage_economics_postgres as uep

            return uep.count_incomplete_agreements(subject_ref)
        with self._conn() as con:
            row = con.execute(
                """
                SELECT COUNT(*) AS c FROM agreement_owner
                WHERE subject_ref = ? AND completed_at IS NULL
                """,
                (subject_ref,),
            ).fetchone()
            return int(row[0]) if row else 0

    def count_completed_agreements(self, subject_ref: str) -> int:
        if self._pg:
            from backend.usage_economics import usage_economics_postgres as uep

            return uep.count_completed_agreements(subject_ref)
        with self._conn() as con:
            row = con.execute(
                """
                SELECT COUNT(*) AS c FROM agreement_owner
                WHERE subject_ref = ? AND completed_at IS NOT NULL
                """,
                (subject_ref,),
            ).fetchone()
            return int(row[0]) if row else 0

    def mark_agreement_completed(
        self,
        *,
        agreement_id: str,
        subject_ref: str,
        internal_keys_finalize: int,
    ) -> bool:
        """Returns False if agreement_id not registered for subject."""
        now = _utc_now()
        if self._pg:
            from backend.usage_economics import usage_economics_postgres as uep

            return uep.mark_agreement_completed(
                agreement_id=agreement_id,
                subject_ref=subject_ref,
                internal_keys_finalize=internal_keys_finalize,
                now_iso=now,
            )
        with self._conn() as con:
            cur = con.execute(
                """
                UPDATE agreement_owner
                SET completed_at = ?, internal_keys_finalize = ?
                WHERE agreement_id = ? AND subject_ref = ? AND completed_at IS NULL
                """,
                (now, int(internal_keys_finalize), agreement_id, subject_ref),
            )
            if cur.rowcount != 1:
                return False
            con.execute(
                """
                UPDATE subject_counters SET
                  agreements_finalized = agreements_finalized + 1,
                  keys_consumed_total = keys_consumed_total + ?,
                  updated_at = ?
                WHERE subject_ref = ?
                """,
                (int(internal_keys_finalize), now, subject_ref),
            )
            return True

    def record_agreements_claimed(
        self,
        *,
        agreement_ids: list[str],
        to_subject_ref: str,
        from_org_id: str,
        claim_method: str,
    ) -> int:
        """Mark agreements as claimed after anonymous → authenticated ownership transfer."""
        if not agreement_ids:
            return 0
        now = _utc_now()
        method = (claim_method or "unknown").strip()[:64]
        source_org = (from_org_id or "").strip()[:128]
        if self._pg:
            from backend.usage_economics import usage_economics_postgres as uep

            return uep.record_agreements_claimed(
                agreement_ids=agreement_ids,
                to_subject_ref=to_subject_ref,
                from_org_id=source_org,
                claim_method=method,
                now_iso=now,
            )
        updated = 0
        with self._conn() as con:
            for aid in agreement_ids:
                cur = con.execute(
                    """
                    UPDATE agreement_owner
                    SET subject_ref = ?, claimed_at = ?, claim_method = ?, anonymous_source_org = ?
                    WHERE agreement_id = ? AND subject_ref = ?
                    """,
                    (to_subject_ref, now, method, source_org, aid, f"org:{source_org}"),
                )
                if cur.rowcount == 1:
                    updated += 1
        return updated

    def get_subject_row(self, subject_ref: str) -> Optional[Dict[str, Any]]:
        if self._pg:
            from backend.usage_economics import usage_economics_postgres as uep

            return uep.get_subject_row(subject_ref)
        with self._conn() as con:
            row = con.execute(
                "SELECT * FROM subject_counters WHERE subject_ref = ?", (subject_ref,)
            ).fetchone()
            return dict(row) if row else None

    def agreements_created_this_utc_month(self, subject_ref: str) -> int:
        """Count agreements created in current UTC calendar month (paid soft limit)."""
        now = datetime.now(timezone.utc)
        start = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0).isoformat().replace("+00:00", "Z")
        return self.agreements_created_since(subject_ref, start)

    def agreements_created_since(self, subject_ref: str, period_start_iso: str) -> int:
        """Count persisted agreement creates for subject since period_start (inclusive)."""
        start = (period_start_iso or "").strip()
        if not start:
            return 0
        if self._pg:
            from backend.usage_economics import usage_economics_postgres as uep

            return uep.agreements_created_this_utc_month(subject_ref, start)
        with self._conn() as con:
            row = con.execute(
                """
                SELECT COUNT(*) AS c FROM agreement_owner
                WHERE subject_ref = ? AND created_at >= ?
                  AND COALESCE(guest_temp, 0) = 0
                  AND COALESCE(usage_refunded, 0) = 0
                """,
                (subject_ref, start),
            ).fetchone()
            return int(row[0]) if row else 0

    def append_ip_draft_create_event(self, ip: str) -> None:
        """Log one draft-creation event from this IP (for burst / abuse heuristics)."""
        safe_ip = (ip or "unknown").strip() or "unknown"
        now = _utc_now()
        cutoff_day = (datetime.now(timezone.utc) - timedelta(hours=48)).isoformat().replace("+00:00", "Z")
        if self._pg:
            from backend.usage_economics import usage_economics_postgres as uep

            uep.append_ip_draft_create_event(safe_ip, now, cutoff_day)
            return
        with self._conn() as con:
            con.execute(
                "INSERT INTO ip_draft_burst (ip, created_at) VALUES (?, ?)",
                (safe_ip, now),
            )
            con.execute("DELETE FROM ip_draft_burst WHERE created_at < ?", (cutoff_day,))

    def count_recent_draft_creates_from_ip(self, ip: str, window_seconds: int) -> int:
        safe_ip = (ip or "unknown").strip() or "unknown"
        if window_seconds < 60:
            window_seconds = 60
        cutoff_dt = datetime.now(timezone.utc) - timedelta(seconds=int(window_seconds))
        cutoff = cutoff_dt.isoformat().replace("+00:00", "Z")
        if self._pg:
            from backend.usage_economics import usage_economics_postgres as uep

            return uep.count_recent_draft_creates_from_ip(safe_ip, cutoff)
        with self._conn() as con:
            row = con.execute(
                """
                SELECT COUNT(*) AS c FROM ip_draft_burst
                WHERE ip = ? AND created_at >= ?
                """,
                (safe_ip, cutoff),
            ).fetchone()
            return int(row[0]) if row else 0

    def record_ip_subject(self, *, ip: str, subject_ref: str) -> int:
        """Return distinct subject count for this IP today."""
        day = datetime.now(timezone.utc).date().isoformat()
        if self._pg:
            from backend.usage_economics import usage_economics_postgres as uep

            return uep.record_ip_subject(ip=ip, day=day, subject_ref=subject_ref)
        with self._conn() as con:
            con.execute(
                """
                INSERT OR IGNORE INTO ip_subject_day (ip, day, subject_ref) VALUES (?, ?, ?)
                """,
                (ip, day, subject_ref),
            )
            row = con.execute(
                """
                SELECT COUNT(DISTINCT subject_ref) AS c FROM ip_subject_day
                WHERE ip = ? AND day = ?
                """,
                (ip, day),
            ).fetchone()
            return int(row[0]) if row else 0

    def set_abuse_flag(self, subject_ref: str, value: int = 1) -> None:
        now = _utc_now()
        if self._pg:
            from backend.usage_economics import usage_economics_postgres as uep

            uep.set_abuse_flag(subject_ref, value, now)
            return
        with self._conn() as con:
            con.execute(
                """
                INSERT INTO subject_counters (subject_ref, keys_consumed_total, agreements_created, agreements_finalized, ai_calls_count, abuse_flag, soft_throttle_flag, updated_at)
                VALUES (?, 0, 0, 0, 0, ?, 0, ?)
                ON CONFLICT(subject_ref) DO UPDATE SET abuse_flag = ?, updated_at = excluded.updated_at
                """,
                (subject_ref, int(value), now, int(value)),
            )

    def set_soft_throttle(self, subject_ref: str, value: int = 1) -> None:
        now = _utc_now()
        if self._pg:
            from backend.usage_economics import usage_economics_postgres as uep

            uep.set_soft_throttle(subject_ref, value, now)
            return
        with self._conn() as con:
            con.execute(
                """
                UPDATE subject_counters SET soft_throttle_flag = ?, updated_at = ?
                WHERE subject_ref = ?
                """,
                (int(value), now, subject_ref),
            )

    def incr_ai_calls(self, subject_ref: str, n: int = 1) -> None:
        now = _utc_now()
        if self._pg:
            from backend.usage_economics import usage_economics_postgres as uep

            uep.incr_ai_calls(subject_ref, n, now)
            return
        with self._conn() as con:
            con.execute(
                """
                INSERT INTO subject_counters (subject_ref, keys_consumed_total, agreements_created, agreements_finalized, ai_calls_count, abuse_flag, soft_throttle_flag, updated_at)
                VALUES (?, 0, 0, 0, ?, 0, 0, ?)
                ON CONFLICT(subject_ref) DO UPDATE SET
                  ai_calls_count = ai_calls_count + excluded.ai_calls_count,
                  updated_at = excluded.updated_at
                """,
                (subject_ref, int(n), now),
            )

    def emit_event(self, *, subject_ref: Optional[str], event_type: str, payload: Dict[str, Any]) -> str:
        eid = str(uuid.uuid4())
        now = _utc_now()
        pj = json.dumps(payload, sort_keys=True)
        if self._pg:
            from backend.usage_economics import usage_economics_postgres as uep

            uep.emit_event(
                event_id=eid,
                subject_ref=subject_ref,
                event_type=event_type,
                payload_json=pj,
                now_iso=now,
            )
            return eid
        with self._conn() as con:
            con.execute(
                """
                INSERT INTO analytics_events (id, subject_ref, event_type, payload_json, created_at)
                VALUES (?, ?, ?, ?, ?)
                """,
                (eid, subject_ref, event_type, pj, now),
            )
        return eid

    def list_recent_events(self, limit: int = 200) -> List[Dict[str, Any]]:
        if self._pg:
            from backend.usage_economics import usage_economics_postgres as uep

            return uep.list_recent_events(limit)
        with self._conn() as con:
            rows = con.execute(
                """
                SELECT * FROM analytics_events ORDER BY created_at DESC LIMIT ?
                """,
                (limit,),
            ).fetchall()
            return [dict(r) for r in rows]

    def admin_aggregate_subjects(self) -> List[Dict[str, Any]]:
        if self._pg:
            from backend.usage_economics import usage_economics_postgres as uep

            return uep.admin_aggregate_subjects()
        with self._conn() as con:
            rows = con.execute(
                """
                SELECT subject_ref, keys_consumed_total, agreements_created, agreements_finalized,
                       ai_calls_count, abuse_flag, soft_throttle_flag, updated_at
                FROM subject_counters ORDER BY keys_consumed_total DESC LIMIT 500
                """
            ).fetchall()
            return [dict(r) for r in rows]


_store: Optional[UsageEconomicsStore] = None


def get_usage_economics_store() -> UsageEconomicsStore:
    global _store
    if _store is None:
        _store = UsageEconomicsStore()
    return _store
