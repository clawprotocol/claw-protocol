"""
Stable operator-alert event_type strings for LawDog anchoring observability.

Persisted via ``lawdog_operator_alerts`` (economics SQLite or Postgres when ``CLAW_OPERATOR_ALERTS_DATABASE_URL`` / shared DSN is set; see ``emit_operator_alert``).
"""

from __future__ import annotations

# Critical
BITCOIN_NODE_RPC_UNREACHABLE = "bitcoin_node_rpc_unreachable"
DOGECOIN_NODE_RPC_UNREACHABLE = "dogecoin_node_rpc_unreachable"
CANONICAL_ANCHOR_SUBMISSION_FAILED = "canonical_anchor_submission_failed"
ANCHOR_WALLET_LOW_BALANCE_CRITICAL = "anchor_wallet_low_balance_critical"
ANCHOR_QUEUE_BACKLOG_CRITICAL = "anchor_queue_backlog_critical"

# Warning
DOGECOIN_MIRROR_FAILED = "dogecoin_mirror_failed"
ANCHOR_WALLET_LOW_BALANCE_WARNING = "anchor_wallet_low_balance_warning"
STALE_SUBMITTED_ANCHOR_JOB = "stale_submitted_anchor_job"
BATCH_NOT_FULLY_ANCHORED_IN_EXPECTED_WINDOW = "batch_not_fully_anchored_in_expected_window"

# Info
WEEKLY_ANCHOR_CYCLE_COMPLETED = "weekly_anchor_cycle_completed"
BATCH_FULLY_ANCHORED = "batch_fully_anchored"
ANCHOR_WALLET_TOPPED_UP = "anchor_wallet_topped_up"
