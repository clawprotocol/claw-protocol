"""Postgres backend for ``UsageEconomicsStore`` when ``use_postgresql_for_usage_economics()``."""

from __future__ import annotations

import json
import threading
from contextlib import contextmanager
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional, Sequence

from backend.db.config import (
    postgres_connect_timeout_sec,
    postgres_connection_options_for_schema,
    usage_economics_postgresql_schema,
    usage_economics_postgresql_url,
    use_postgresql_for_usage_economics,
)
from backend.db.sql_split import split_sql_statements

_schema_lock = threading.Lock()
_schema_done = False


class _PgAdminConn:
    def __init__(self, url: str, schema: str) -> None:
        self._url = url
        self._schema = schema
        self._cx: Any = None

    def __enter__(self) -> _PgAdminConn:
        import psycopg
        from psycopg import sql as psql

        to = postgres_connect_timeout_sec()
        opts = postgres_connection_options_for_schema(self._schema)
        with psycopg.connect(
            self._url,
            autocommit=True,
            connect_timeout=to,
            options=opts,
        ) as ax:
            ax.execute(
                psql.SQL("CREATE SCHEMA IF NOT EXISTS {}").format(psql.Identifier(self._schema))
            )
        self._cx = psycopg.connect(
            self._url,
            options=opts,
            connect_timeout=to,
        )
        return self

    def __exit__(self, *exc: object) -> None:
        if self._cx:
            self._cx.close()
        self._cx = None

    def execute(self, sql: str, params: Sequence[Any] = ()) -> None:
        assert self._cx is not None
        self._cx.execute(sql, tuple(params))

    def commit(self) -> None:
        assert self._cx is not None
        self._cx.commit()


def ensure_usage_economics_schema() -> None:
    global _schema_done
    if not use_postgresql_for_usage_economics():
        return
    if _schema_done:
        return
    with _schema_lock:
        if _schema_done:
            return
        mig_dir = Path(__file__).resolve().parent / "migrations" / "postgres"
        url = usage_economics_postgresql_url()
        schema = usage_economics_postgresql_schema()
        with _PgAdminConn(url, schema) as adm:
            for path in sorted(mig_dir.glob("*.sql")):
                script = path.read_text(encoding="utf-8")
                for stmt in split_sql_statements(script):
                    adm.execute(stmt)
            adm.commit()
        _schema_done = True


def reset_usage_economics_schema_cache_for_tests() -> None:
    global _schema_done
    with _schema_lock:
        _schema_done = False


def _ts(iso: str) -> str:
    if iso.endswith("Z"):
        return iso.replace("Z", "+00:00")
    return iso


def _iso_z(v: Any) -> Any:
    if v is None:
        return None
    if isinstance(v, datetime):
        return v.astimezone(timezone.utc).isoformat().replace("+00:00", "Z")
    return v


def _row_out(d: Dict[str, Any]) -> Dict[str, Any]:
    out = dict(d)
    for k, v in list(out.items()):
        if isinstance(v, datetime):
            out[k] = _iso_z(v)
    return out


@contextmanager
def _tx() -> Any:
    ensure_usage_economics_schema()
    import psycopg
    from psycopg.rows import dict_row

    conn = psycopg.connect(
        usage_economics_postgresql_url(),
        options=postgres_connection_options_for_schema(usage_economics_postgresql_schema()),
        connect_timeout=postgres_connect_timeout_sec(),
        row_factory=dict_row,
    )
    try:
        with conn.transaction():
            yield conn
    finally:
        conn.close()


def _utc_now_iso() -> str:
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")


def insert_agreement_owner(
    *,
    agreement_id: str,
    subject_ref: str,
    internal_keys_draft: int,
    now_iso: str,
) -> None:
    result = try_insert_agreement_owner_with_monthly_cap(
        agreement_id=agreement_id,
        subject_ref=subject_ref,
        internal_keys_draft=internal_keys_draft,
        now_iso=now_iso,
        monthly_cap=None,
        period_start_iso="",
    )
    if result == "cap_exceeded":
        raise RuntimeError("unexpected monthly cap denial without cap")


def try_insert_agreement_owner_with_monthly_cap(
    *,
    agreement_id: str,
    subject_ref: str,
    internal_keys_draft: int,
    now_iso: str,
    monthly_cap: Optional[int],
    period_start_iso: str,
    guest_temp: bool = False,
    idempotency_key: Optional[str] = None,
) -> str:
    """Returns ``inserted`` | ``duplicate`` | ``idempotent_hit`` | ``cap_exceeded`` under a subject advisory lock."""
    kd = int(internal_keys_draft)
    ts = _ts(now_iso)
    aid = (agreement_id or "").strip()
    subj = (subject_ref or "").strip()
    idem = (idempotency_key or "").strip()[:128] or None
    gt = 1 if guest_temp else 0
    with _tx() as conn:
        # Serialize concurrent creates for the same subject within this transaction.
        conn.execute("SELECT pg_advisory_xact_lock(hashtext(%s))", (subj,))
        cur = conn.execute(
            "SELECT 1 AS one FROM agreement_owner WHERE agreement_id = %s",
            (aid,),
        )
        if cur.fetchone():
            return "duplicate"
        if idem:
            cur = conn.execute(
                """
                SELECT agreement_id FROM agreement_owner
                WHERE subject_ref = %s AND idempotency_key = %s
                """,
                (subj, idem),
            )
            if cur.fetchone():
                return "idempotent_hit"
        if monthly_cap is not None and not guest_temp:
            start = (period_start_iso or "").strip()
            if not start:
                raise ValueError("period_start_iso required when monthly_cap is set")
            cur = conn.execute(
                """
                SELECT COUNT(*) AS c FROM agreement_owner
                WHERE subject_ref = %s AND created_at >= %s::timestamptz
                  AND COALESCE(guest_temp, 0) = 0
                  AND COALESCE(usage_refunded, 0) = 0
                """,
                (subj, _ts(start)),
            )
            row = cur.fetchone()
            used = int(row["c"] or 0) if row else 0
            if used >= int(monthly_cap):
                return "cap_exceeded"
        conn.execute(
            """
            INSERT INTO agreement_owner (
              agreement_id, subject_ref, created_at, internal_keys_draft, guest_temp,
              idempotency_key
            ) VALUES (%s, %s, %s::timestamptz, %s, %s, %s)
            """,
            (aid, subj, ts, kd, gt, idem),
        )
        if not guest_temp:
            conn.execute(
                """
                INSERT INTO subject_counters (
                  subject_ref, keys_consumed_total, agreements_created, agreements_finalized,
                  ai_calls_count, abuse_flag, soft_throttle_flag, updated_at
                )
                VALUES (%s, %s, 1, 0, 0, 0, 0, %s::timestamptz)
                ON CONFLICT (subject_ref) DO UPDATE SET
                  agreements_created = subject_counters.agreements_created + 1,
                  keys_consumed_total = subject_counters.keys_consumed_total + EXCLUDED.keys_consumed_total,
                  updated_at = EXCLUDED.updated_at
                """,
                (subj, kd, ts),
            )
        return "inserted"


def owner_subject_for_agreement(agreement_id: str) -> Optional[str]:
    aid = (agreement_id or "").strip()
    if not aid:
        return None
    with _tx() as conn:
        cur = conn.execute(
            "SELECT subject_ref FROM agreement_owner WHERE agreement_id = %s",
            (aid,),
        )
        row = cur.fetchone()
    return str(row["subject_ref"]) if row else None


def get_agreement_id_for_idempotency_key(
    *, subject_ref: str, idempotency_key: str
) -> Optional[str]:
    subj = (subject_ref or "").strip()
    idem = (idempotency_key or "").strip()
    if not subj or not idem:
        return None
    with _tx() as conn:
        cur = conn.execute(
            """
            SELECT agreement_id FROM agreement_owner
            WHERE subject_ref = %s AND idempotency_key = %s
            """,
            (subj, idem),
        )
        row = cur.fetchone()
    return str(row["agreement_id"]).strip() if row and row.get("agreement_id") else None


def list_agreement_owner_rows_for_subject(
    subject_ref: str,
    *,
    since_iso: Optional[str] = None,
    limit: int = 100,
) -> List[Dict[str, Any]]:
    subj = (subject_ref or "").strip()
    if not subj:
        return []
    lim = max(1, min(int(limit), 500))
    with _tx() as conn:
        if (since_iso or "").strip():
            cur = conn.execute(
                """
                SELECT agreement_id, subject_ref, created_at, completed_at,
                       internal_keys_draft, guest_temp, idempotency_key,
                       claimed_at, claim_method, anonymous_source_org,
                       COALESCE(usage_refunded, 0) AS usage_refunded
                FROM agreement_owner
                WHERE subject_ref = %s AND created_at >= %s::timestamptz
                ORDER BY created_at DESC
                LIMIT %s
                """,
                (subj, _ts((since_iso or "").strip()), lim),
            )
        else:
            cur = conn.execute(
                """
                SELECT agreement_id, subject_ref, created_at, completed_at,
                       internal_keys_draft, guest_temp, idempotency_key,
                       claimed_at, claim_method, anonymous_source_org,
                       COALESCE(usage_refunded, 0) AS usage_refunded
                FROM agreement_owner
                WHERE subject_ref = %s
                ORDER BY created_at DESC
                LIMIT %s
                """,
                (subj, lim),
            )
        rows = cur.fetchall()
    return [_row_out(dict(r)) for r in rows]


def delete_agreement_owner(agreement_id: str) -> bool:
    aid = (agreement_id or "").strip()
    if not aid:
        return False
    now = _utc_now_iso()
    with _tx() as conn:
        cur = conn.execute(
            """
            SELECT subject_ref, internal_keys_draft,
                   COALESCE(guest_temp, 0) AS guest_temp,
                   COALESCE(usage_refunded, 0) AS usage_refunded
            FROM agreement_owner WHERE agreement_id = %s
            """,
            (aid,),
        )
        row = cur.fetchone()
        if not row:
            return False
        subj = str(row.get("subject_ref") or "").strip()
        keys = int(row.get("internal_keys_draft") or 0)
        guest = int(row.get("guest_temp") or 0) == 1
        already_refunded = int(row.get("usage_refunded") or 0) == 1
        cur = conn.execute("DELETE FROM agreement_owner WHERE agreement_id = %s", (aid,))
        if int(cur.rowcount or 0) <= 0:
            return False
        if subj and not guest and not already_refunded:
            conn.execute(
                """
                UPDATE subject_counters SET
                  agreements_created = GREATEST(0, agreements_created - 1),
                  keys_consumed_total = GREATEST(0, keys_consumed_total - %s),
                  updated_at = %s::timestamptz
                WHERE subject_ref = %s
                """,
                (keys, _ts(now), subj),
            )
        return True


def mark_agreement_owner_usage_refunded(agreement_id: str) -> bool:
    aid = (agreement_id or "").strip()
    if not aid:
        return False
    now = _utc_now_iso()
    with _tx() as conn:
        cur = conn.execute(
            """
            SELECT subject_ref, internal_keys_draft,
                   COALESCE(guest_temp, 0) AS guest_temp,
                   COALESCE(usage_refunded, 0) AS usage_refunded
            FROM agreement_owner WHERE agreement_id = %s
            """,
            (aid,),
        )
        row = cur.fetchone()
        if not row:
            return False
        if int(row.get("guest_temp") or 0) == 1:
            return False
        if int(row.get("usage_refunded") or 0) == 1:
            return False
        subj = str(row.get("subject_ref") or "").strip()
        keys = int(row.get("internal_keys_draft") or 0)
        cur = conn.execute(
            """
            UPDATE agreement_owner
            SET usage_refunded = 1
            WHERE agreement_id = %s AND COALESCE(usage_refunded, 0) = 0
            """,
            (aid,),
        )
        if int(cur.rowcount or 0) <= 0:
            return False
        if subj:
            conn.execute(
                """
                UPDATE subject_counters SET
                  agreements_created = GREATEST(0, agreements_created - 1),
                  keys_consumed_total = GREATEST(0, keys_consumed_total - %s),
                  updated_at = %s::timestamptz
                WHERE subject_ref = %s
                """,
                (keys, _ts(now), subj),
            )
        return True


def ensure_agreement_owner_usage_exempt(
    *,
    agreement_id: str,
    subject_ref: str,
) -> bool:
    aid = (agreement_id or "").strip()
    subj = (subject_ref or "").strip()
    if not aid or not subj:
        return False
    now = _utc_now_iso()
    with _tx() as conn:
        cur = conn.execute(
            "SELECT subject_ref FROM agreement_owner WHERE agreement_id = %s",
            (aid,),
        )
        if cur.fetchone():
            return False
        try:
            conn.execute(
                """
                INSERT INTO agreement_owner (
                  agreement_id, subject_ref, created_at, internal_keys_draft,
                  guest_temp, usage_refunded
                ) VALUES (%s, %s, %s::timestamptz, 0, 0, 1)
                """,
                (aid, subj, _ts(now)),
            )
        except Exception:
            return False
        return True


def list_agreement_ids_for_subject(subject_ref: str) -> list[str]:
    subj = (subject_ref or "").strip()
    if not subj:
        return []
    with _tx() as conn:
        cur = conn.execute(
            "SELECT agreement_id FROM agreement_owner WHERE subject_ref = %s",
            (subj,),
        )
        rows = cur.fetchall()
    return [str(r["agreement_id"]).strip() for r in rows if str(r.get("agreement_id") or "").strip()]


def get_agreement_owner_row(agreement_id: str) -> Optional[Dict[str, Any]]:
    aid = (agreement_id or "").strip()
    if not aid:
        return None
    with _tx() as conn:
        cur = conn.execute(
            """
            SELECT agreement_id, subject_ref, created_at, completed_at,
                   claimed_at, claim_method, anonymous_source_org
            FROM agreement_owner WHERE agreement_id = %s
            """,
            (aid,),
        )
        row = cur.fetchone()
    return _row_out(dict(row)) if row else None


def owner_subjects_for_agreement_ids(agreement_ids: List[str]) -> Dict[str, Optional[str]]:
    ids = [i.strip() for i in agreement_ids if (i or "").strip()]
    if not ids:
        return {}
    ph = ",".join(["%s"] * len(ids))
    with _tx() as conn:
        cur = conn.execute(
            f"SELECT agreement_id, subject_ref FROM agreement_owner WHERE agreement_id IN ({ph})",
            ids,
        )
        rows = cur.fetchall()
    return {str(r["agreement_id"]): str(r["subject_ref"]) for r in rows}


def count_incomplete_agreements(subject_ref: str) -> int:
    with _tx() as conn:
        cur = conn.execute(
            """
            SELECT COUNT(*) AS c FROM agreement_owner
            WHERE subject_ref = %s AND completed_at IS NULL
            """,
            (subject_ref,),
        )
        row = cur.fetchone()
    return int(row["c"] or 0) if row else 0


def count_completed_agreements(subject_ref: str) -> int:
    with _tx() as conn:
        cur = conn.execute(
            """
            SELECT COUNT(*) AS c FROM agreement_owner
            WHERE subject_ref = %s AND completed_at IS NOT NULL
            """,
            (subject_ref,),
        )
        row = cur.fetchone()
    return int(row["c"] or 0) if row else 0


def mark_agreement_completed(
    *,
    agreement_id: str,
    subject_ref: str,
    internal_keys_finalize: int,
    now_iso: str,
) -> bool:
    ts = _ts(now_iso)
    kf = int(internal_keys_finalize)
    with _tx() as conn:
        cur = conn.execute(
            """
            UPDATE agreement_owner
            SET completed_at = %s::timestamptz, internal_keys_finalize = %s
            WHERE agreement_id = %s AND subject_ref = %s AND completed_at IS NULL
            """,
            (ts, kf, agreement_id, subject_ref),
        )
        if int(cur.rowcount or 0) != 1:
            return False
        conn.execute(
            """
            UPDATE subject_counters SET
              agreements_finalized = agreements_finalized + 1,
              keys_consumed_total = keys_consumed_total + %s,
              updated_at = %s::timestamptz
            WHERE subject_ref = %s
            """,
            (kf, ts, subject_ref),
        )
        return True


def record_agreements_claimed(
    *,
    agreement_ids: list[str],
    to_subject_ref: str,
    from_org_id: str,
    claim_method: str,
    now_iso: str,
) -> int:
    if not agreement_ids:
        return 0
    method = (claim_method or "unknown").strip()[:64]
    source_org = (from_org_id or "").strip()[:128]
    from_subject = f"org:{source_org}"
    updated = 0
    with _tx() as conn:
        for aid in agreement_ids:
            cur = conn.execute(
                """
                UPDATE agreement_owner
                SET subject_ref = %s,
                    claimed_at = %s::timestamptz,
                    claim_method = %s,
                    anonymous_source_org = %s
                WHERE agreement_id = %s AND subject_ref = %s
                """,
                (to_subject_ref, _ts(now_iso), method, source_org, aid, from_subject),
            )
            if int(cur.rowcount or 0) == 1:
                updated += 1
    return updated


def get_subject_row(subject_ref: str) -> Optional[Dict[str, Any]]:
    with _tx() as conn:
        cur = conn.execute(
            "SELECT * FROM subject_counters WHERE subject_ref = %s",
            (subject_ref,),
        )
        row = cur.fetchone()
    return _row_out(dict(row)) if row else None


def agreements_created_this_utc_month(subject_ref: str, month_start_iso: str) -> int:
    with _tx() as conn:
        cur = conn.execute(
            """
            SELECT COUNT(*) AS c FROM agreement_owner
            WHERE subject_ref = %s AND created_at >= %s::timestamptz
              AND COALESCE(guest_temp, 0) = 0
              AND COALESCE(usage_refunded, 0) = 0
            """,
            (subject_ref, _ts(month_start_iso)),
        )
        row = cur.fetchone()
    return int(row["c"] or 0) if row else 0


def get_genesis_dog_entitlement(user_id: str) -> Optional[Dict[str, Any]]:
    with _tx() as conn:
        cur = conn.execute(
            "SELECT * FROM genesis_dog_entitlements WHERE user_id = %s",
            (user_id,),
        )
        row = cur.fetchone()
    return _row_out(dict(row)) if row else None


def upsert_genesis_dog_entitlement(
    *,
    user_id: str,
    status: str,
    expires_at: Optional[str],
    allowance_override: Optional[int],
    grant_source: str,
    granted_by: Optional[str],
    granted_at: str,
    revoked_by: Optional[str],
    revoked_at: Optional[str],
    revoke_reason: Optional[str],
    updated_at: str,
) -> Dict[str, Any]:
    with _tx() as conn:
        conn.execute(
            """
            INSERT INTO genesis_dog_entitlements (
              user_id, status, expires_at, allowance_override, grant_source,
              granted_by, granted_at, revoked_by, revoked_at, revoke_reason, updated_at
            ) VALUES (
              %s, %s, %s::timestamptz, %s, %s,
              %s, %s::timestamptz, %s, %s::timestamptz, %s, %s::timestamptz
            )
            ON CONFLICT (user_id) DO UPDATE SET
              status = EXCLUDED.status,
              expires_at = EXCLUDED.expires_at,
              allowance_override = EXCLUDED.allowance_override,
              grant_source = EXCLUDED.grant_source,
              granted_by = EXCLUDED.granted_by,
              granted_at = EXCLUDED.granted_at,
              revoked_by = EXCLUDED.revoked_by,
              revoked_at = EXCLUDED.revoked_at,
              revoke_reason = EXCLUDED.revoke_reason,
              updated_at = EXCLUDED.updated_at
            """,
            (
                user_id,
                status,
                _ts(expires_at) if expires_at else None,
                allowance_override,
                grant_source,
                granted_by,
                _ts(granted_at),
                revoked_by,
                _ts(revoked_at) if revoked_at else None,
                revoke_reason,
                _ts(updated_at),
            ),
        )
        cur = conn.execute(
            "SELECT * FROM genesis_dog_entitlements WHERE user_id = %s",
            (user_id,),
        )
        row = cur.fetchone()
    return _row_out(dict(row)) if row else {}


def get_genesis_access_request(user_id: str) -> Optional[Dict[str, Any]]:
    with _tx() as conn:
        cur = conn.execute(
            "SELECT * FROM genesis_access_requests WHERE user_id = %s",
            (user_id,),
        )
        row = cur.fetchone()
    return _row_out(dict(row)) if row else None


def upsert_genesis_access_request(user_id: str, now_iso: str) -> Dict[str, Any]:
    with _tx() as conn:
        conn.execute(
            """
            INSERT INTO genesis_access_requests (user_id, requested_at, status, updated_at)
            VALUES (%s, %s::timestamptz, 'open', %s::timestamptz)
            ON CONFLICT (user_id) DO UPDATE SET
              status = 'open',
              updated_at = EXCLUDED.updated_at
            """,
            (user_id, _ts(now_iso), _ts(now_iso)),
        )
        cur = conn.execute(
            "SELECT * FROM genesis_access_requests WHERE user_id = %s",
            (user_id,),
        )
        row = cur.fetchone()
    return _row_out(dict(row)) if row else {}


def append_ip_draft_create_event(ip: str, now_iso: str, cutoff_iso: str) -> None:
    safe_ip = (ip or "unknown").strip() or "unknown"
    with _tx() as conn:
        conn.execute(
            "INSERT INTO ip_draft_burst (ip, created_at) VALUES (%s, %s::timestamptz)",
            (safe_ip, _ts(now_iso)),
        )
        conn.execute(
            "DELETE FROM ip_draft_burst WHERE created_at < %s::timestamptz",
            (_ts(cutoff_iso),),
        )


def count_recent_draft_creates_from_ip(ip: str, cutoff_iso: str) -> int:
    safe_ip = (ip or "unknown").strip() or "unknown"
    with _tx() as conn:
        cur = conn.execute(
            """
            SELECT COUNT(*) AS c FROM ip_draft_burst
            WHERE ip = %s AND created_at >= %s::timestamptz
            """,
            (safe_ip, _ts(cutoff_iso)),
        )
        row = cur.fetchone()
    return int(row["c"] or 0) if row else 0


def record_ip_subject(*, ip: str, day: str, subject_ref: str) -> int:
    with _tx() as conn:
        conn.execute(
            """
            INSERT INTO ip_subject_day (ip, day, subject_ref) VALUES (%s, %s, %s)
            ON CONFLICT DO NOTHING
            """,
            (ip, day, subject_ref),
        )
        cur = conn.execute(
            """
            SELECT COUNT(DISTINCT subject_ref) AS c FROM ip_subject_day
            WHERE ip = %s AND day = %s
            """,
            (ip, day),
        )
        row = cur.fetchone()
    return int(row["c"] or 0) if row else 0


def set_abuse_flag(subject_ref: str, value: int, now_iso: str) -> None:
    v = int(value)
    ts = _ts(now_iso)
    with _tx() as conn:
        conn.execute(
            """
            INSERT INTO subject_counters (
              subject_ref, keys_consumed_total, agreements_created, agreements_finalized,
              ai_calls_count, abuse_flag, soft_throttle_flag, updated_at
            )
            VALUES (%s, 0, 0, 0, 0, %s, 0, %s::timestamptz)
            ON CONFLICT (subject_ref) DO UPDATE SET
              abuse_flag = EXCLUDED.abuse_flag,
              updated_at = EXCLUDED.updated_at
            """,
            (subject_ref, v, ts),
        )


def set_soft_throttle(subject_ref: str, value: int, now_iso: str) -> None:
    with _tx() as conn:
        conn.execute(
            """
            UPDATE subject_counters SET soft_throttle_flag = %s, updated_at = %s::timestamptz
            WHERE subject_ref = %s
            """,
            (int(value), _ts(now_iso), subject_ref),
        )


def incr_ai_calls(subject_ref: str, n: int, now_iso: str) -> None:
    nn = int(n)
    ts = _ts(now_iso)
    with _tx() as conn:
        conn.execute(
            """
            INSERT INTO subject_counters (
              subject_ref, keys_consumed_total, agreements_created, agreements_finalized,
              ai_calls_count, abuse_flag, soft_throttle_flag, updated_at
            )
            VALUES (%s, 0, 0, 0, %s, 0, 0, %s::timestamptz)
            ON CONFLICT (subject_ref) DO UPDATE SET
              ai_calls_count = subject_counters.ai_calls_count + EXCLUDED.ai_calls_count,
              updated_at = EXCLUDED.updated_at
            """,
            (subject_ref, nn, ts),
        )


def list_agreement_ids_from_analytics_for_subject(
    subject_ref: str, *, limit: int = 500
) -> List[str]:
    subj = (subject_ref or "").strip()
    if not subj:
        return []
    lim = max(1, min(int(limit), 2000))
    out: List[str] = []
    seen: set[str] = set()
    with _tx() as conn:
        cur = conn.execute(
            """
            SELECT event_type, payload_json FROM analytics_events
            WHERE subject_ref = %s
              AND event_type IN (
                'agreement_created', 'keys_consumed', 'genesis_usage_reconciled'
              )
            ORDER BY created_at DESC
            LIMIT %s
            """,
            (subj, lim),
        )
        rows = cur.fetchall()
    for row in rows:
        raw = row.get("payload_json")
        payload: Dict[str, Any]
        if isinstance(raw, dict):
            payload = raw
        elif isinstance(raw, str) and raw.strip():
            try:
                parsed = json.loads(raw)
                payload = parsed if isinstance(parsed, dict) else {}
            except Exception:
                continue
        else:
            continue
        aid = str(payload.get("agreement_id") or "").strip()
        if aid and aid not in seen:
            seen.add(aid)
            out.append(aid)
        refunded = payload.get("refunded_agreement_ids")
        if isinstance(refunded, list):
            for item in refunded:
                a = str(item or "").strip()
                if a and a not in seen:
                    seen.add(a)
                    out.append(a)
    return out


def emit_event(
    *,
    event_id: str,
    subject_ref: Optional[str],
    event_type: str,
    payload_json: str,
    now_iso: str,
) -> None:
    with _tx() as conn:
        conn.execute(
            """
            INSERT INTO analytics_events (id, subject_ref, event_type, payload_json, created_at)
            VALUES (%s, %s, %s, %s, %s::timestamptz)
            """,
            (event_id, subject_ref, event_type, payload_json, _ts(now_iso)),
        )


def list_recent_events(limit: int) -> List[Dict[str, Any]]:
    lim = max(1, min(int(limit), 2000))
    with _tx() as conn:
        cur = conn.execute(
            """
            SELECT * FROM analytics_events ORDER BY created_at DESC LIMIT %s
            """,
            (lim,),
        )
        rows = cur.fetchall()
    return [_row_out(dict(r)) for r in rows]


def admin_aggregate_subjects() -> List[Dict[str, Any]]:
    with _tx() as conn:
        cur = conn.execute(
            """
            SELECT subject_ref, keys_consumed_total, agreements_created, agreements_finalized,
                   ai_calls_count, abuse_flag, soft_throttle_flag, updated_at
            FROM subject_counters ORDER BY keys_consumed_total DESC LIMIT 500
            """
        )
        rows = cur.fetchall()
    return [_row_out(dict(r)) for r in rows]
