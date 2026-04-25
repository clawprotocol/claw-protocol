"""Persistence for assistive work product — never merged into proof / receipt tables."""
from __future__ import annotations

import json
import os
import sqlite3
import uuid
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

from backend.config.runtime_environment import data_dir
from backend.advanced_work_product.grounding import merge_metadata_patch


def awp_db_path() -> str:
    env = os.getenv("CLAW_AWP_DB_PATH", "").strip()
    if env:
        return os.path.expanduser(env)
    return os.path.join(data_dir(), "advanced_work_products.sqlite3")


def _utc() -> str:
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")


class AdvancedWorkProductStore:
    def __init__(self, path: Optional[str] = None) -> None:
        self._path = path or awp_db_path()
        os.makedirs(os.path.dirname(self._path) or ".", exist_ok=True)

    def _conn(self) -> sqlite3.Connection:
        c = sqlite3.connect(self._path, timeout=30.0)
        c.row_factory = sqlite3.Row
        c.execute("PRAGMA journal_mode=WAL;")
        return c

    def init_schema(self) -> None:
        with self._conn() as con:
            con.execute(
                """
                CREATE TABLE IF NOT EXISTS advanced_work_products (
                  id TEXT PRIMARY KEY,
                  org_id TEXT NOT NULL,
                  created_at TEXT NOT NULL,
                  updated_at TEXT NOT NULL,
                  output_type TEXT NOT NULL,
                  title TEXT,
                  user_instructions TEXT,
                  audience TEXT,
                  objective TEXT,
                  use_workspace_context INTEGER NOT NULL DEFAULT 0,
                  sources_json TEXT NOT NULL,
                  sections_json TEXT NOT NULL,
                  section_grounding_json TEXT NOT NULL,
                  caveats TEXT,
                  generation_model TEXT,
                  is_assistive INTEGER NOT NULL DEFAULT 1,
                  disclaimer_version TEXT NOT NULL DEFAULT 'awp-v1'
                );
                CREATE INDEX IF NOT EXISTS idx_awp_org_updated ON advanced_work_products (org_id, updated_at DESC);
                """
            )
            cols = [r[1] for r in con.execute("PRAGMA table_info(advanced_work_products)").fetchall()]
            if "section_metadata_json" not in cols:
                con.execute(
                    "ALTER TABLE advanced_work_products ADD COLUMN section_metadata_json TEXT NOT NULL DEFAULT '{}'"
                )

    def insert(
        self,
        *,
        org_id: str,
        output_type: str,
        title: Optional[str],
        user_instructions: Optional[str],
        audience: Optional[str],
        objective: Optional[str],
        use_workspace_context: bool,
        sources: List[Dict[str, Any]],
        sections: Dict[str, str],
        section_grounding: Dict[str, List[str]],
        section_metadata: Dict[str, Dict[str, Any]],
        caveats: Optional[str],
        generation_model: Optional[str],
    ) -> str:
        pid = str(uuid.uuid4())
        now = _utc()
        with self._conn() as con:
            con.execute(
                """
                INSERT INTO advanced_work_products (
                  id, org_id, created_at, updated_at, output_type, title,
                  user_instructions, audience, objective, use_workspace_context,
                  sources_json, sections_json, section_grounding_json, section_metadata_json, caveats,
                  generation_model, is_assistive, disclaimer_version
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, 'awp-v1')
                """,
                (
                    pid,
                    org_id.strip(),
                    now,
                    now,
                    output_type,
                    title,
                    user_instructions,
                    audience,
                    objective,
                    1 if use_workspace_context else 0,
                    json.dumps(sources, ensure_ascii=False),
                    json.dumps(sections, ensure_ascii=False),
                    json.dumps(section_grounding, ensure_ascii=False),
                    json.dumps(section_metadata, ensure_ascii=False),
                    caveats,
                    generation_model,
                ),
            )
        return pid

    def update_document(
        self,
        *,
        org_id: str,
        doc_id: str,
        sections: Optional[Dict[str, str]] = None,
        section_grounding: Optional[Dict[str, List[str]]] = None,
        section_metadata: Optional[Dict[str, Dict[str, Any]]] = None,
        section_metadata_merge: bool = True,
        title: Optional[str] = None,
        caveats: Optional[str] = None,
    ) -> bool:
        sets: List[str] = ["updated_at = ?"]
        args: List[Any] = [_utc()]
        if sections is not None:
            sets.append("sections_json = ?")
            args.append(json.dumps(sections, ensure_ascii=False))
        if section_grounding is not None:
            sets.append("section_grounding_json = ?")
            args.append(json.dumps(section_grounding, ensure_ascii=False))
        if title is not None:
            sets.append("title = ?")
            args.append(title)
        if caveats is not None:
            sets.append("caveats = ?")
            args.append(caveats)

        where_doc = doc_id
        where_org = org_id.strip()

        with self._conn() as con:
            if section_metadata is not None:
                if section_metadata_merge:
                    row = con.execute(
                        "SELECT section_metadata_json FROM advanced_work_products WHERE id = ? AND org_id = ?",
                        (where_doc, where_org),
                    ).fetchone()
                    base_raw = str(row[0]) if row and row[0] else "{}"
                    try:
                        base_meta = json.loads(base_raw)
                        if not isinstance(base_meta, dict):
                            base_meta = {}
                    except json.JSONDecodeError:
                        base_meta = {}
                    merged = merge_metadata_patch(
                        {k: v for k, v in base_meta.items() if isinstance(v, dict)},
                        section_metadata,
                    )
                    meta_json = json.dumps(merged, ensure_ascii=False)
                else:
                    meta_json = json.dumps(section_metadata, ensure_ascii=False)
                sets.append("section_metadata_json = ?")
                args.append(meta_json)

            args.extend([where_doc, where_org])
            cur = con.execute(
                f"UPDATE advanced_work_products SET {', '.join(sets)} WHERE id = ? AND org_id = ?",
                tuple(args),
            )
            return cur.rowcount > 0

    def get(self, org_id: str, doc_id: str) -> Optional[Dict[str, Any]]:
        with self._conn() as con:
            row = con.execute(
                "SELECT * FROM advanced_work_products WHERE id = ? AND org_id = ?",
                (doc_id, org_id.strip()),
            ).fetchone()
            return dict(row) if row else None

    def list_for_org(self, org_id: str, *, limit: int = 50) -> List[Dict[str, Any]]:
        with self._conn() as con:
            rows = con.execute(
                """
                SELECT id, org_id, created_at, updated_at, output_type, title, objective
                FROM advanced_work_products
                WHERE org_id = ?
                ORDER BY updated_at DESC
                LIMIT ?
                """,
                (org_id.strip(), max(1, min(200, limit))),
            ).fetchall()
            return [dict(r) for r in rows]


_store: Optional[AdvancedWorkProductStore] = None


def get_awp_store() -> AdvancedWorkProductStore:
    global _store
    if _store is None:
        _store = AdvancedWorkProductStore()
        _store.init_schema()
    return _store


def reset_awp_store_for_tests() -> None:
    global _store
    _store = None
