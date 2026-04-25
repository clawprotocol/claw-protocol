"""
CLI / container entrypoint: one anchor batch drain cycle (same logic as guarded ``POST /admin/anchor/run``).

Drains timeline / proof / Merkle / feed queues **and** receipt-batch ``anchor_jobs`` in ``anchoring.sqlite3``
when ``CLAW_ANCHORING_ENABLED=1`` (Bitcoin first, then mandatory Dogecoin mirror per root).

**AWS launch:** bind **Amazon EventBridge** (weekly rule) → ECS scheduled task, Lambda, or cron that runs::

    export CLAW_TIMELINE_DB_PATH=...
    export CLAW_ANCHORING_ENABLED=1
    export CLAW_ANCHOR_MODE=batch
    python -m backend.workers.run_anchor_worker

See ``docs/ops/ANCHORING_AWS_LAUNCH.md`` and ``docs/ops/ANCHORING_LAUNCH_RUNBOOK.md``.

Does not start an HTTP server.
"""

from __future__ import annotations

import sys

from backend.services.anchor_worker_service import main_cli


if __name__ == "__main__":
    raise SystemExit(main_cli())
