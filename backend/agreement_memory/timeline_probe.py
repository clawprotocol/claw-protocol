"""Resolve agreement timeline id and whether proof/events exist (read-only; separate from memory index)."""

from __future__ import annotations

import os


def agreement_timeline_db_path() -> str:
    """Match agreements_v2 timeline DB resolution."""
    env_data = os.getenv("CLAW_DATA_DIR", "").strip()
    if env_data:
        data_dir = os.path.expanduser(env_data)
    else:
        prod = "/var/lib/claw"
        try:
            if os.path.isdir(prod) and os.access(prod, os.W_OK):
                data_dir = prod
            else:
                data_dir = os.path.expanduser("~/.claw")
        except Exception:
            data_dir = os.path.expanduser("~/.claw")
    return os.path.expanduser(
        os.getenv("CLAW_TIMELINE_DB_PATH", os.path.join(data_dir, "timeline.sqlite3"))
    )


def timeline_anchor_for_agreement(agreement_id: str) -> tuple[str, bool]:
    """Return canonical timeline_id and whether receipts/events exist (assistive UX only)."""
    aid = (agreement_id or "").strip()
    tid = f"agreement:{aid}"
    if not aid:
        return tid, False
    try:
        from backend.utils.timeline_store import TimelineStore

        store = TimelineStore(db_path=agreement_timeline_db_path())
        if store.get_latest_receipt_for_timeline(tid):
            return tid, True
        if store.list_event_hashes(tid):
            return tid, True
    except Exception:
        pass
    return tid, False
