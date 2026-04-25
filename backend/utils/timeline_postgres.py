"""
Postgres backend for ``TimelineStore`` (timelines, events, receipts, Merkle batches, timeline jobs).

Activated when ``use_postgresql_for_timeline()`` — see ``backend/db/config.py``.
Hashing and batch math stay in ``timeline_store`` / ``batch_handler``; this module persists bytes/JSON as stored today.
"""

from __future__ import annotations

import json
import threading
from contextlib import contextmanager
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional, Sequence, Tuple

from backend.db.config import (
    postgres_connect_timeout_sec,
    postgres_connection_options_for_schema,
    timeline_postgresql_schema,
    timeline_postgresql_url,
    use_postgresql_for_timeline,
)
from backend.db.sql_split import split_sql_statements
from backend.handlers.batch_handler import build_receipt_batch

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


def ensure_timeline_schema() -> None:
    global _schema_done
    if not use_postgresql_for_timeline():
        return
    if _schema_done:
        return
    with _schema_lock:
        if _schema_done:
            return
        mig_dir = Path(__file__).resolve().parent / "migrations" / "timeline_postgres"
        url = timeline_postgresql_url()
        schema = timeline_postgresql_schema()
        with _PgAdminConn(url, schema) as adm:
            for path in sorted(mig_dir.glob("*.sql")):
                script = path.read_text(encoding="utf-8")
                for stmt in split_sql_statements(script):
                    adm.execute(stmt)
            adm.commit()
        _schema_done = True


def reset_timeline_schema_cache_for_tests() -> None:
    global _schema_done
    with _schema_lock:
        _schema_done = False


def _ts_param(iso: str) -> str:
    if iso.endswith("Z"):
        return iso.replace("Z", "+00:00")
    return iso


def _iso_z(v: Any) -> Any:
    if v is None:
        return None
    if isinstance(v, datetime):
        return v.astimezone(timezone.utc).isoformat().replace("+00:00", "Z")
    return v


@contextmanager
def _tx() -> Any:
    ensure_timeline_schema()
    import psycopg
    from psycopg.rows import dict_row

    conn = psycopg.connect(
        timeline_postgresql_url(),
        options=postgres_connection_options_for_schema(timeline_postgresql_schema()),
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


def create_timeline(
    *,
    timeline_id: str,
    title: str,
    parties_json: str,
    created_at: str,
    protocol_version: str,
    network: str,
) -> None:
    with _tx() as conn:
        conn.execute(
            """
            INSERT INTO timelines
            (timeline_id, title, parties_json, created_at, protocol_version, network, frozen)
            VALUES (%s, %s, %s, %s::timestamptz, %s, %s, 0)
            """,
            (timeline_id, title, parties_json, _ts_param(created_at), protocol_version, network),
        )


def get_timeline_dict(timeline_id: str) -> Optional[Dict[str, Any]]:
    with _tx() as conn:
        cur = conn.execute("SELECT * FROM timelines WHERE timeline_id = %s", (timeline_id,))
        row = cur.fetchone()
    if not row:
        return None
    d = dict(row)
    d["created_at"] = _iso_z(d.get("created_at"))
    d["frozen_at"] = _iso_z(d.get("frozen_at"))
    d["frozen"] = int(d.get("frozen") or 0)
    return d


def list_event_hashes(timeline_id: str) -> List[str]:
    with _tx() as conn:
        cur = conn.execute(
            """
            SELECT event_sha256 FROM events WHERE timeline_id = %s ORDER BY event_index ASC
            """,
            (timeline_id,),
        )
        return [str(r["event_sha256"]) for r in cur.fetchall()]


def get_event_dict(timeline_id: str, event_id: str) -> Optional[Dict[str, Any]]:
    with _tx() as conn:
        cur = conn.execute(
            "SELECT * FROM events WHERE timeline_id = %s AND event_id = %s",
            (timeline_id, event_id),
        )
        row = cur.fetchone()
    if not row:
        return None
    d = dict(row)
    d["created_at"] = _iso_z(d.get("created_at"))
    d["event_index"] = int(d["event_index"])
    return d


def fetch_events_ordered(timeline_id: str) -> List[Dict[str, Any]]:
    with _tx() as conn:
        cur = conn.execute(
            """
            SELECT * FROM events WHERE timeline_id = %s ORDER BY event_index ASC
            """,
            (timeline_id,),
        )
        rows = cur.fetchall()
    out: List[Dict[str, Any]] = []
    for r in rows:
        d = dict(r)
        d["created_at"] = _iso_z(d.get("created_at"))
        d["event_index"] = int(d["event_index"])
        out.append(d)
    return out


def _ensure_not_frozen_tx(conn: Any, timeline_id: str) -> None:
    cur = conn.execute("SELECT * FROM timelines WHERE timeline_id = %s FOR UPDATE", (timeline_id,))
    tl = cur.fetchone()
    if not tl:
        raise KeyError("timeline_not_found")
    if int(tl["frozen"] or 0) == 1:
        raise RuntimeError("timeline_frozen")


def next_event_index(conn: Any, timeline_id: str) -> int:
    cur = conn.execute(
        "SELECT MAX(event_index) AS max_idx FROM events WHERE timeline_id = %s",
        (timeline_id,),
    )
    row = cur.fetchone()
    return 0 if row["max_idx"] is None else int(row["max_idx"]) + 1


def append_event_compute(
    *,
    timeline_id: str,
    event_type: str,
    event_time: str,
    notice_json: Optional[str],
    marker_json: Optional[str],
) -> str:
    """
    Under timeline lock: allocate next event_index, compute event_sha256 (same formula as SQLite path),
    insert, return event_id.
    """
    from backend.utils.timeline_store import event_sha256 as ev_sha

    created_at = _utc_now_iso()
    with _tx() as conn:
        _ensure_not_frozen_tx(conn, timeline_id)
        next_idx = next_event_index(conn, timeline_id)
        notice_d: Optional[Dict[str, Any]] = None
        marker_d: Optional[Dict[str, Any]] = None
        if notice_json:
            notice_d = json.loads(notice_json)
        if marker_json:
            marker_d = json.loads(marker_json)
        sha = ev_sha(
            timeline_id=timeline_id,
            event_index=next_idx,
            event_type=event_type,
            event_time=event_time,
            notice=notice_d,
            marker=marker_d,
        )
        event_id = f"evt_{sha[:32]}"
        conn.execute(
            """
            INSERT INTO events
            (event_id, timeline_id, event_index, event_type, event_time, notice_json, marker_json, event_sha256, created_at)
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s::timestamptz)
            """,
            (
                event_id,
                timeline_id,
                next_idx,
                event_type,
                event_time,
                notice_json,
                marker_json,
                sha,
                _ts_param(created_at),
            ),
        )
        return event_id


def patch_event_row(
    *,
    timeline_id: str,
    event_id: str,
    event_type: str,
    event_time: str,
    notice_json: Optional[str],
    marker_json: Optional[str],
    event_sha256: str,
) -> int:
    """Returns rowcount."""
    with _tx() as conn:
        _ensure_not_frozen_tx(conn, timeline_id)
        cur = conn.execute(
            """
            UPDATE events
            SET event_type = %s, event_time = %s, notice_json = %s, marker_json = %s, event_sha256 = %s
            WHERE timeline_id = %s AND event_id = %s
            """,
            (event_type, event_time, notice_json, marker_json, event_sha256, timeline_id, event_id),
        )
        return int(cur.rowcount or 0)


def delete_event_row(*, timeline_id: str, event_id: str) -> int:
    with _tx() as conn:
        _ensure_not_frozen_tx(conn, timeline_id)
        cur = conn.execute(
            "DELETE FROM events WHERE timeline_id = %s AND event_id = %s",
            (timeline_id, event_id),
        )
        return int(cur.rowcount or 0)


def duplicate_event_compute(*, timeline_id: str, source_event_id: str) -> str:
    from backend.utils.timeline_store import event_sha256 as ev_sha

    created_at = _utc_now_iso()
    with _tx() as conn:
        _ensure_not_frozen_tx(conn, timeline_id)
        cur = conn.execute(
            "SELECT * FROM events WHERE timeline_id = %s AND event_id = %s",
            (timeline_id, source_event_id),
        )
        src = cur.fetchone()
        if not src:
            raise KeyError("event_not_found")
        next_idx = next_event_index(conn, timeline_id)
        src_type = src["event_type"]
        src_time = src["event_time"]
        notice_d = json.loads(src["notice_json"]) if src.get("notice_json") else None
        marker_d = json.loads(src["marker_json"]) if src.get("marker_json") else None
        new_sha = ev_sha(
            timeline_id=timeline_id,
            event_index=next_idx,
            event_type=src_type,
            event_time=src_time,
            notice=notice_d,
            marker=marker_d,
        )
        new_event_id = f"evt_{new_sha[:32]}"
        notice_json = src.get("notice_json")
        marker_json = src.get("marker_json")
        conn.execute(
            """
            INSERT INTO events
            (event_id, timeline_id, event_index, event_type, event_time, notice_json, marker_json, event_sha256, created_at)
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s::timestamptz)
            """,
            (
                new_event_id,
                timeline_id,
                next_idx,
                src_type,
                src_time,
                notice_json,
                marker_json,
                new_sha,
                _ts_param(created_at),
            ),
        )
        return new_event_id


def freeze_timeline(*, timeline_id: str, manifest_hash: str) -> Tuple[str, str]:
    from backend.utils.timeline_store import manifest_sha256

    frozen_at = _utc_now_iso()
    with _tx() as conn:
        cur = conn.execute(
            "SELECT * FROM timelines WHERE timeline_id = %s FOR UPDATE", (timeline_id,)
        )
        tl = cur.fetchone()
        if not tl:
            raise KeyError("timeline_not_found")
        cur2 = conn.execute(
            """
            SELECT event_sha256 FROM events WHERE timeline_id = %s ORDER BY event_index ASC
            """,
            (timeline_id,),
        )
        event_hashes = [str(r["event_sha256"]) for r in cur2.fetchall()]
        server_manifest = manifest_sha256(event_hashes)
        if server_manifest != manifest_hash:
            raise RuntimeError("manifest_sha256_mismatch")

        if int(tl["frozen"] or 0) == 1:
            existing = tl["frozen_manifest_sha256"] or ""
            if existing != manifest_hash:
                raise RuntimeError("frozen_manifest_mismatch")
            fa = _iso_z(tl.get("frozen_at"))
            return str(existing), str(fa or "")

        conn.execute(
            """
            UPDATE timelines
            SET frozen = 1, frozen_manifest_sha256 = %s, frozen_at = %s::timestamptz
            WHERE timeline_id = %s
            """,
            (manifest_hash, _ts_param(frozen_at), timeline_id),
        )
        return manifest_hash, frozen_at


def create_receipt(
    *,
    receipt_id: str,
    timeline_id: str,
    protocol_version: str,
    network: str,
    epoch_id: Optional[str],
    btc_txid: str,
    commitment: str,
    merkle_proof_json: str,
    zk_proof_refs_json: Optional[str],
    issued_at: str,
    receipt_hash_sha256: Optional[str],
) -> None:
    with _tx() as conn:
        conn.execute(
            """
            INSERT INTO receipts
            (receipt_id, timeline_id, protocol_version, network, epoch_id, btc_txid, commitment,
             merkle_proof_json, zk_proof_refs_json, issued_at, receipt_hash_sha256)
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s::timestamptz, %s)
            """,
            (
                receipt_id,
                timeline_id,
                protocol_version,
                network,
                epoch_id,
                btc_txid,
                commitment,
                merkle_proof_json,
                zk_proof_refs_json,
                _ts_param(issued_at),
                receipt_hash_sha256,
            ),
        )


def get_receipt_row_raw(receipt_id: str) -> Optional[Dict[str, Any]]:
    with _tx() as conn:
        cur = conn.execute("SELECT * FROM receipts WHERE receipt_id = %s", (receipt_id,))
        row = cur.fetchone()
    if not row:
        return None
    d = dict(row)
    d["issued_at"] = _iso_z(d.get("issued_at"))
    return d


def get_receipt_parsed(receipt_id: str) -> Dict[str, Any]:
    data = get_receipt_row_raw(receipt_id)
    if not data:
        raise KeyError("receipt_not_found")
    proof = json.loads(data["merkle_proof_json"]) if data.get("merkle_proof_json") else []
    zk = json.loads(data["zk_proof_refs_json"]) if data.get("zk_proof_refs_json") else None
    data.pop("merkle_proof_json", None)
    data.pop("zk_proof_refs_json", None)
    data["batch_proof_siblings"] = proof
    data["zk_proof_refs"] = zk
    return data


def set_receipt_txid(*, receipt_id: str, btc_txid: str) -> None:
    with _tx() as conn:
        conn.execute(
            "UPDATE receipts SET btc_txid = %s WHERE receipt_id = %s",
            (btc_txid, receipt_id),
        )


def set_receipt_batch_fields(
    *,
    receipt_id: str,
    batch_id: str,
    batch_merkle_root_sha256: str,
    leaf_index: int,
    merkle_proof_json: str,
) -> None:
    with _tx() as conn:
        conn.execute(
            """
            UPDATE receipts
            SET batch_id = %s, batch_merkle_root_sha256 = %s, leaf_index = %s, merkle_proof_json = %s
            WHERE receipt_id = %s
            """,
            (batch_id, batch_merkle_root_sha256, leaf_index, merkle_proof_json, receipt_id),
        )


def build_next_batch(*, network: str, protocol_version: str, limit: int) -> Dict[str, Any]:
    with _tx() as conn:
        cur = conn.execute(
            """
            SELECT receipt_id, receipt_hash_sha256
            FROM receipts
            WHERE network = %s
              AND protocol_version = %s
              AND receipt_hash_sha256 IS NOT NULL
              AND (batch_id IS NULL OR batch_id = '')
            ORDER BY receipt_hash_sha256 ASC
            LIMIT %s
            FOR UPDATE
            """,
            (network, protocol_version, limit),
        )
        rows = cur.fetchall()
        if not rows:
            return {"ok": False, "reason": "no eligible receipts"}
        receipt_summaries = [
            {"receipt_id": str(r["receipt_id"]), "receipt_sha256": r["receipt_hash_sha256"]}
            for r in rows
        ]
        built = build_receipt_batch(
            network=network,
            protocol_version=protocol_version,
            receipt_summaries=receipt_summaries,
        )
        now_ts = _ts_param(built.created_at)
        conn.execute(
            """
            INSERT INTO batches
            (batch_id, created_at, network, protocol_version, leaf_count, merkle_root, batch_commitment,
             anchor_status, anchor_attempts, anchor_updated_at)
            VALUES (%s, %s::timestamptz, %s, %s, %s, %s, %s, 'pending', 0, %s::timestamptz)
            """,
            (
                built.batch_id,
                now_ts,
                built.network,
                built.protocol_version,
                built.leaf_count,
                built.merkle_root,
                built.batch_commitment,
                now_ts,
            ),
        )
        for idx, r in enumerate(rows):
            rid = r["receipt_id"]
            rh = r["receipt_hash_sha256"]
            conn.execute(
                """
                INSERT INTO batch_receipts (batch_id, receipt_id, receipt_hash, leaf_index)
                VALUES (%s, %s, %s, %s)
                """,
                (built.batch_id, rid, rh, idx),
            )
            conn.execute(
                """
                UPDATE receipts
                SET batch_id = %s, batch_merkle_root_sha256 = %s, leaf_index = %s
                WHERE receipt_id = %s
                """,
                (built.batch_id, built.merkle_root, idx, rid),
            )
        return {
            "ok": True,
            "batch_id": built.batch_id,
            "created_at": built.created_at,
            "network": built.network,
            "protocol_version": built.protocol_version,
            "leaf_count": built.leaf_count,
            "merkle_root": built.merkle_root,
            "batch_commitment": built.batch_commitment,
        }


def list_unbatched_receipt_groups() -> List[Tuple[str, str]]:
    with _tx() as conn:
        cur = conn.execute(
            """
            SELECT DISTINCT network, protocol_version
            FROM receipts
            WHERE receipt_hash_sha256 IS NOT NULL
              AND (batch_id IS NULL OR batch_id = '')
            ORDER BY network ASC, protocol_version ASC
            """
        )
        return [(str(r["network"]), str(r["protocol_version"])) for r in cur.fetchall()]


def list_merkle_batches_pending_anchor(*, limit: int, max_attempts: int) -> List[Dict[str, Any]]:
    with _tx() as conn:
        cur = conn.execute(
            """
            SELECT *
            FROM batches
            WHERE (anchor_txid IS NULL OR TRIM(COALESCE(anchor_txid, '')) = '')
              AND COALESCE(anchor_attempts, 0) < %s
              AND COALESCE(anchor_status, 'pending') IN ('pending', 'failed')
            ORDER BY created_at ASC
            LIMIT %s
            """,
            (max_attempts, limit),
        )
        rows = cur.fetchall()
    out = []
    for r in rows:
        d = dict(r)
        d["created_at"] = _iso_z(d.get("created_at"))
        d["anchor_updated_at"] = _iso_z(d.get("anchor_updated_at"))
        out.append(d)
    return out


def mark_merkle_batch_anchor_attempt_started(*, batch_id: str, now_iso: str) -> None:
    with _tx() as conn:
        conn.execute(
            """
            UPDATE batches SET anchor_status='anchoring', anchor_updated_at=%s::timestamptz
            WHERE batch_id=%s
            """,
            (_ts_param(now_iso), batch_id),
        )


def mark_merkle_batch_anchored(*, batch_id: str, anchor_txid: str, now_iso: str) -> None:
    with _tx() as conn:
        conn.execute(
            """
            UPDATE batches
            SET anchor_txid=%s, anchor_status='anchored', anchor_error=NULL, anchor_updated_at=%s::timestamptz
            WHERE batch_id=%s
            """,
            (anchor_txid, _ts_param(now_iso), batch_id),
        )


def mark_merkle_batch_anchor_failed(*, batch_id: str, error: str, now_iso: str) -> None:
    err = (error or "")[:4000]
    with _tx() as conn:
        conn.execute(
            """
            UPDATE batches
            SET anchor_status='failed', anchor_error=%s,
                anchor_attempts=COALESCE(anchor_attempts,0)+1, anchor_updated_at=%s::timestamptz
            WHERE batch_id=%s
            """,
            (err, _ts_param(now_iso), batch_id),
        )


def recover_stale_merkle_batch_anchoring(*, cutoff_iso: str, now_iso: str) -> int:
    with _tx() as conn:
        cur = conn.execute(
            """
            UPDATE batches
            SET anchor_status='pending',
                anchor_error=COALESCE(anchor_error,'') || ';recovered_stale_anchoring',
                anchor_updated_at=%s::timestamptz
            WHERE anchor_status='anchoring'
              AND (anchor_updated_at IS NULL OR anchor_updated_at < %s::timestamptz)
            """,
            (_ts_param(now_iso), _ts_param(cutoff_iso)),
        )
        return int(cur.rowcount or 0)


def requeue_retryable_timeline_anchor_failures(*, now_iso: str, max_attempts: int) -> int:
    with _tx() as conn:
        cur = conn.execute(
            """
            UPDATE timeline_anchor_jobs
            SET status='queued', updated_at=%s::timestamptz
            WHERE status='failed' AND COALESCE(attempts, 0) < %s
            """,
            (_ts_param(now_iso), max_attempts),
        )
        return int(cur.rowcount or 0)


def set_batch_anchor_txid(*, batch_id: str, anchor_txid: str) -> None:
    with _tx() as conn:
        conn.execute(
            "UPDATE batches SET anchor_txid = %s WHERE batch_id = %s",
            (anchor_txid, batch_id),
        )


def set_receipt_txids_for_batch(*, batch_id: str, btc_txid: str) -> None:
    with _tx() as conn:
        conn.execute(
            """
            UPDATE receipts SET btc_txid = %s
            WHERE receipt_id IN (SELECT receipt_id FROM batch_receipts WHERE batch_id = %s)
            """,
            (btc_txid, batch_id),
        )


def get_latest_receipt_id_for_timeline(timeline_id: str) -> Optional[str]:
    with _tx() as conn:
        cur = conn.execute(
            """
            SELECT receipt_id FROM receipts
            WHERE timeline_id = %s
            ORDER BY issued_at DESC
            LIMIT 1
            """,
            (timeline_id,),
        )
        row = cur.fetchone()
    return str(row["receipt_id"]) if row else None


def enqueue_timeline_anchor_job(
    *,
    job_id: str,
    receipt_id: str,
    timeline_id: str,
    network: str,
    commitment: str,
    now_iso: str,
) -> None:
    ts = _ts_param(now_iso)
    with _tx() as conn:
        conn.execute(
            """
            INSERT INTO timeline_anchor_jobs
            (job_id, receipt_id, timeline_id, network, commitment, status, created_at, updated_at)
            VALUES (%s, %s, %s, %s, %s, 'queued', %s::timestamptz, %s::timestamptz)
            ON CONFLICT (job_id) DO NOTHING
            """,
            (job_id, receipt_id, timeline_id, network, commitment, ts, ts),
        )


def list_queued_timeline_anchor_jobs(*, limit: int) -> List[Dict[str, Any]]:
    with _tx() as conn:
        cur = conn.execute(
            """
            SELECT * FROM timeline_anchor_jobs
            WHERE status = 'queued'
            ORDER BY created_at ASC
            LIMIT %s
            """,
            (limit,),
        )
        rows = cur.fetchall()
    return [_job_dict(r) for r in rows]


def _job_dict(r: Dict[str, Any]) -> Dict[str, Any]:
    d = dict(r)
    d["created_at"] = _iso_z(d.get("created_at"))
    d["updated_at"] = _iso_z(d.get("updated_at"))
    return d


def claim_timeline_anchor_jobs(*, max_n: int) -> List[Dict[str, Any]]:
    with _tx() as conn:
        cur = conn.execute(
            """
            SELECT * FROM timeline_anchor_jobs
            WHERE status = 'queued'
            ORDER BY created_at ASC
            LIMIT %s
            FOR UPDATE
            """,
            (max_n,),
        )
        rows = cur.fetchall()
        jobs = [_job_dict(dict(r)) for r in rows]
        now_iso = _utc_now_iso()
        ts = _ts_param(now_iso)
        for j in jobs:
            conn.execute(
                """
                UPDATE timeline_anchor_jobs
                SET status='running', updated_at=%s::timestamptz
                WHERE job_id=%s AND status='queued'
                """,
                (ts, j["job_id"]),
            )
        return jobs


def mark_timeline_anchor_built(
    *,
    job_id: str,
    receipt_id: str,
    batch_id: str,
    batch_merkle_root_sha256: str,
    leaf_index: int,
    merkle_proof_json: str,
    now_iso: str,
) -> None:
    ts = _ts_param(now_iso)
    with _tx() as conn:
        conn.execute(
            """
            UPDATE timeline_anchor_jobs
            SET status='done', txid=NULL, error=NULL, updated_at=%s::timestamptz
            WHERE job_id=%s
            """,
            (ts, job_id),
        )
        conn.execute(
            """
            UPDATE receipts
            SET batch_id = %s, batch_merkle_root_sha256 = %s, leaf_index = %s, merkle_proof_json = %s
            WHERE receipt_id = %s
            """,
            (batch_id, batch_merkle_root_sha256, leaf_index, merkle_proof_json, receipt_id),
        )


def mark_timeline_anchor_done(*, job_id: str, txid: str, now_iso: str) -> None:
    with _tx() as conn:
        conn.execute(
            """
            UPDATE timeline_anchor_jobs
            SET status='done', txid=%s, error=NULL, updated_at=%s::timestamptz
            WHERE job_id=%s
            """,
            (txid, _ts_param(now_iso), job_id),
        )


def mark_timeline_anchor_failed(*, job_id: str, error: str, now_iso: str) -> None:
    err = (error or "")[:4000]
    with _tx() as conn:
        conn.execute(
            """
            UPDATE timeline_anchor_jobs
            SET status='failed', error=%s, updated_at=%s::timestamptz,
                attempts=COALESCE(attempts,0)+1
            WHERE job_id=%s
            """,
            (err, _ts_param(now_iso), job_id),
        )


def get_batch_row(batch_id: str) -> Optional[Dict[str, Any]]:
    with _tx() as conn:
        cur = conn.execute("SELECT * FROM batches WHERE batch_id = %s", (batch_id,))
        row = cur.fetchone()
    if not row:
        return None
    d = dict(row)
    d["created_at"] = _iso_z(d.get("created_at"))
    d["anchor_updated_at"] = _iso_z(d.get("anchor_updated_at"))
    return d


def find_event_row_by_event_id(event_id: str) -> Optional[Dict[str, Any]]:
    with _tx() as conn:
        cur = conn.execute(
            "SELECT timeline_id, event_id, notice_json FROM events WHERE event_id = %s",
            (event_id,),
        )
        row = cur.fetchone()
    return dict(row) if row else None


def get_latest_liability_event_id(timeline_id: str) -> Optional[str]:
    with _tx() as conn:
        cur = conn.execute(
            """
            SELECT event_id
            FROM events
            WHERE timeline_id = %s
              AND event_type = 'notice'
              AND notice_json LIKE %s
            ORDER BY created_at DESC
            LIMIT 1
            """,
            (timeline_id, '%"liability_attestation"%'),
        )
        row = cur.fetchone()
    return str(row["event_id"]) if row else None
