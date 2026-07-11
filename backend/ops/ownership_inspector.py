"""Ownership inspection and backfill — dry-run safe, no agreement content in output."""

from __future__ import annotations

import argparse
import json
import os
import sys
from dataclasses import dataclass, field
from typing import Any, Dict, List, Optional, Set

from backend.services.agreement_draft_store import list_draft_agreement_ids_newest_first
from backend.usage_economics.store import UsageEconomicsStore, get_usage_economics_store


@dataclass
class OwnershipReport:
    total_draft_ids: int = 0
    with_valid_owner: int = 0
    missing_owner: int = 0
    conflicting_owners: int = 0
    recoverable: int = 0
    ambiguous: int = 0
    missing_agreement_ids: List[str] = field(default_factory=list)
    ambiguous_agreement_ids: List[str] = field(default_factory=list)
    recoverable_rows: List[Dict[str, str]] = field(default_factory=list)

    def to_dict(self) -> Dict[str, Any]:
        return {
            "total_draft_ids": self.total_draft_ids,
            "with_valid_owner": self.with_valid_owner,
            "missing_owner": self.missing_owner,
            "conflicting_owners": self.conflicting_owners,
            "recoverable": self.recoverable,
            "ambiguous": self.ambiguous,
            "missing_agreement_ids_sample": self.missing_agreement_ids[:50],
            "ambiguous_agreement_ids_sample": self.ambiguous_agreement_ids[:50],
            "recoverable_sample": self.recoverable_rows[:50],
        }


def _list_known_agreement_ids(store: UsageEconomicsStore) -> Set[str]:
    ids: Set[str] = set()
    try:
        for aid in list_draft_agreement_ids_newest_first():
            t = (aid or "").strip()
            if t:
                ids.add(t)
    except Exception:
        pass
    store.init_schema()
    if store._pg:
        from backend.usage_economics import usage_economics_postgres as uep

        with uep._tx() as conn:
            cur = conn.execute("SELECT agreement_id FROM agreement_owner")
            for row in cur.fetchall():
                if isinstance(row, dict):
                    t = str(row.get("agreement_id") or "").strip()
                else:
                    t = str(row[0] or "").strip()
                if t:
                    ids.add(t)
    else:
        with store._conn() as con:
            rows = con.execute("SELECT agreement_id FROM agreement_owner").fetchall()
            for r in rows:
                t = str(r[0] or "").strip()
                if t:
                    ids.add(t)
    return ids


def _recoverable_subject_from_draft(aid: str) -> Optional[str]:
    """Derive ownership only from server-persisted authoritative draft metadata."""
    try:
        from backend.services.agreement_draft_store import load_draft

        draft = load_draft(aid)
    except Exception:
        return None
    if not isinstance(draft, dict):
        return None
    meta = draft.get("workspace_meta") or draft.get("_workspace") or {}
    if isinstance(meta, dict):
        subj = str(meta.get("subject_ref") or meta.get("owner_subject") or "").strip()
        if subj.startswith("org:"):
            return subj
        org = str(meta.get("org_id") or "").strip()
        if org:
            return f"org:{org}"
    created_by = str(draft.get("created_by_subject") or "").strip()
    if created_by.startswith("org:"):
        return created_by
    return None


def inspect_ownership(*, store: Optional[UsageEconomicsStore] = None) -> OwnershipReport:
    store = store or get_usage_economics_store()
    store.init_schema()
    report = OwnershipReport()
    agreement_ids = sorted(_list_known_agreement_ids(store))
    report.total_draft_ids = len(agreement_ids)

    for aid in agreement_ids:
        row = store.get_agreement_owner_row(aid)
        if row and str(row.get("subject_ref") or "").strip():
            report.with_valid_owner += 1
            continue

        report.missing_owner += 1
        report.missing_agreement_ids.append(aid)
        candidate = _recoverable_subject_from_draft(aid)
        if candidate:
            report.recoverable += 1
            report.recoverable_rows.append({"agreement_id": aid, "subject_ref": candidate})
        else:
            report.ambiguous += 1
            report.ambiguous_agreement_ids.append(aid)

    return report


def apply_recoverable_backfill(*, store: Optional[UsageEconomicsStore] = None, dry_run: bool = True) -> Dict[str, Any]:
    report = inspect_ownership(store=store)
    applied = 0
    skipped = 0
    store = store or get_usage_economics_store()
    for row in report.recoverable_rows:
        aid = row["agreement_id"]
        subj = row["subject_ref"]
        existing = store.get_agreement_owner_row(aid)
        if existing and str(existing.get("subject_ref") or "").strip():
            skipped += 1
            continue
        if dry_run:
            applied += 1
            continue
        store.insert_agreement_owner(
            agreement_id=aid,
            subject_ref=subj,
            internal_keys_draft=0,
        )
        applied += 1
    return {
        "dry_run": dry_run,
        "would_apply" if dry_run else "applied": applied,
        "skipped_existing": skipped,
        "report": report.to_dict(),
    }


def main(argv: Optional[List[str]] = None) -> int:
    parser = argparse.ArgumentParser(description="Inspect agreement ownership registration (no content output).")
    parser.add_argument("--dry-run", action="store_true", default=True, help="Report only (default).")
    parser.add_argument("--apply", action="store_true", help="Apply unambiguous recoverable backfill.")
    parser.add_argument("--json", action="store_true", help="Emit JSON report.")
    args = parser.parse_args(argv)
    dry_run = not args.apply
    db_path = os.getenv("CLAW_USAGE_ECONOMICS_DB_PATH", "").strip()
    store = UsageEconomicsStore(db_path) if db_path else get_usage_economics_store()
    if args.apply:
        result = apply_recoverable_backfill(store=store, dry_run=False)
    else:
        report = inspect_ownership(store=store)
        result = report.to_dict()
    if args.json:
        print(json.dumps(result, indent=2))
    else:
        if isinstance(result, dict) and "report" in result:
            r = result["report"]
            print(f"dry_run={result.get('dry_run')} applied={result.get('applied', result.get('would_apply'))}")
            print(json.dumps(r, indent=2))
        else:
            print(json.dumps(result, indent=2))
    return 0


if __name__ == "__main__":
    sys.exit(main())
