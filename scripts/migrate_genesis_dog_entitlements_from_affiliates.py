#!/usr/bin/env python3
"""Backfill active genesis_affiliates into genesis_dog_entitlements.

Usage (from repo root, with CLAW_DATA_DIR / DB env pointing at the target env):

  # Dry-run — precise before counts, no writes
  python scripts/migrate_genesis_dog_entitlements_from_affiliates.py --dry-run

  # Apply (idempotent)
  python scripts/migrate_genesis_dog_entitlements_from_affiliates.py

Idempotent: skips users that already have a genesis_dog_entitlements row
(including revoked/expired — explicit denials are never overwritten).
Writes grant_source=legacy_migration. Does not touch support_operator or Stripe.
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Report candidate counts/user ids without writing entitlement rows.",
    )
    args = parser.parse_args()

    from backend.usage_economics.genesis_dog_entitlement import backfill_legacy_affiliate_grants

    counts = backfill_legacy_affiliate_grants(
        granted_by="legacy_migration_script",
        dry_run=bool(args.dry_run),
    )
    print(json.dumps({"ok": True, "counts": counts}, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
