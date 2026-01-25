#!/usr/bin/env python3
from __future__ import annotations

import sqlite3
from pathlib import Path

DB_PATH = Path("audit/claw.db")  # adjust if your TimelineStore uses a different path


DDL = """
PRAGMA journal_mode=WAL;

CREATE TABLE IF NOT EXISTS batches (
  batch_id TEXT PRIMARY KEY,
  created_at TEXT NOT NULL,
  network TEXT NOT NULL,
  protocol_version TEXT NOT NULL,
  leaf_count INTEGER NOT NULL,
  merkle_root TEXT NOT NULL,
  batch_commitment TEXT NOT NULL,
  anchor_txid TEXT,            -- set later (release step)
  anchor_op_return TEXT        -- set later (release step)
);

CREATE TABLE IF NOT EXISTS batch_receipts (
  batch_id TEXT NOT NULL,
  receipt_id TEXT NOT NULL,
  receipt_hash TEXT NOT NULL,  -- 32-byte hex (sha256)
  leaf_index INTEGER NOT NULL, -- index in sorted leaves
  PRIMARY KEY (batch_id, receipt_id),
  FOREIGN KEY (batch_id) REFERENCES batches(batch_id)
);

CREATE INDEX IF NOT EXISTS idx_batch_receipts_batch ON batch_receipts(batch_id);
CREATE INDEX IF NOT EXISTS idx_batch_receipts_receipt ON batch_receipts(receipt_id);
"""


def main() -> None:
    DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    con = sqlite3.connect(str(DB_PATH))
    try:
        con.executescript(DDL)
        con.commit()
        print(f"ok: migrated {DB_PATH}")
    finally:
        con.close()


if __name__ == "__main__":
    main()
