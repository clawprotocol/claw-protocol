"""
CLAW v1 runtime / deployment configuration (env-first).

Operator runbook: ``docs/ops/OPERATOR_RUNBOOK.md``. Env-by-process index: ``docs/architecture/ENV_TOPOLOGY.md``.

Deploy layout (typical production):

- **frontend**: static SPA; set ``VITE_API_BASE`` to the API origin; optional ``VITE_RECIPIENT_LINK_*``.
- **API backend** (``CLAW_PROCESS_ROLE`` unset or ``api``): FastAPI app in ``backend/main.py``; serves
  interactive flows only—does not need to run the anchor loop on a schedule.
- **anchor worker** (``CLAW_PROCESS_ROLE=worker`` or separate container running
  ``python -m backend.workers.run_anchor_worker``): same DB + queue paths as API; calls Bitcoin Core
  (or future Doge) RPC over **remote** URLs; no UI.
- **storage**: local disk (default) or future S3-compatible backend via ``CLAW_STORAGE_BACKEND`` — see
  ``backend.storage.blob_store``.
- **Bitcoin / Dogecoin nodes**: dedicated RPC endpoints (``BITCOIN_RPC_URL``, auth via user/pass or cookie
  file on the worker host—not assumed colocated with the API).

Key environment variables:

- ``CLAW_DATA_DIR``, ``CLAW_TIMELINE_DB_PATH``, ``CLAW_USAGE_DB_PATH`` — persistence paths.
- ``CLAW_NODE_MODE`` — ``api`` | ``verifier`` (writes blocked on verifier API nodes).
- ``CLAW_ANCHOR_MODE`` — ``batch`` | ``immediate`` (worker only meaningful in ``batch``).
- ``CLAW_ADMIN_SECRET`` / ``x-claw-admin-secret`` — admin HTTP trigger for anchor run (optional).
- ``CLAW_MERKLE_ANCHOR_MAX_ATTEMPTS`` — per-batch chain broadcast retries (Merkle table).
- ``CLAW_TIMELINE_ANCHOR_MAX_ATTEMPTS`` — failed timeline jobs re-queued up to this many attempts.
- ``CLAW_AGREEMENT_SIGNING_TOKEN_SECRET`` — HMAC secret for recipient/sign links (required for signed URLs).
- ``CLAW_RECIPIENT_LINK_MINT_KEY`` — if set, ``POST .../recipient-access-token`` requires header
  ``X-Claw-Recipient-Link-Mint-Key``.
- ``CLAW_RECIPIENT_ACCESS_TOKEN_REQUIRED`` — when ``1``, product should use ``t=`` tokens (see access/policy).
- ``python -m backend.workers.run_anchor_worker`` — run one anchor/batch cycle (no HTTP); set
  ``CLAW_WORKER_X402_PAYMENT_HEADER_VALUE`` if proof-queue jobs need payment proof server-side.
- ``CLAW_ADMIN_ANCHOR_RUN_ENABLED`` — ``0`` disables ``POST /admin/anchor/run`` (use worker only).
- ``CLAW_RECIPIENT_TOKEN_TTL_MIN_SECONDS`` / ``CLAW_RECIPIENT_TOKEN_TTL_MAX_SECONDS`` — bounds for minted links.
- ``GET /admin/runtime-summary`` — operator diagnostics (requires ``CLAW_ADMIN_SECRET`` when set).

Database / ops:

- **Timeline SQLite** holds receipts, Merkle ``batches`` rows (with ``anchor_status``, ``anchor_error``,
  ``anchor_attempts``), and timeline anchor job retries.
- **Agreement drafts** remain JSON files under ``data/agreements`` (or ``CLAW_DATA_DIR``) until migrated to
  ``BlobStore`` (see ``backend/storage/blob_store.py``).
"""

from __future__ import annotations

import os


def data_dir() -> str:
    env = os.getenv("CLAW_DATA_DIR", "").strip()
    if env:
        return os.path.expanduser(env)
    prod = "/var/lib/claw"
    try:
        if os.path.isdir(prod) and os.access(prod, os.W_OK):
            return prod
    except Exception:
        pass
    return os.path.expanduser("~/.claw")


def timeline_db_path() -> str:
    return os.path.expanduser(
        os.getenv("CLAW_TIMELINE_DB_PATH", os.path.join(data_dir(), "timeline.sqlite3"))
    )


def process_role() -> str:
    """api | worker | verifier-style reads — use with ops docs."""
    return os.getenv("CLAW_PROCESS_ROLE", "api").strip().lower()


def anchor_mode() -> str:
    return os.getenv("CLAW_ANCHOR_MODE", "batch").strip().lower()


def mainnet_disabled() -> bool:
    return os.getenv("CLAW_ANCHOR_ENABLE_MAINNET", "0") != "1"


def merkle_anchor_max_attempts() -> int:
    return max(1, int(os.getenv("CLAW_MERKLE_ANCHOR_MAX_ATTEMPTS", "8")))


def timeline_anchor_max_attempts() -> int:
    return max(1, int(os.getenv("CLAW_TIMELINE_ANCHOR_MAX_ATTEMPTS", "8")))


def recipient_access_token_required() -> bool:
    return os.getenv("CLAW_RECIPIENT_ACCESS_TOKEN_REQUIRED", "0").lower() in ("1", "true", "yes")


def recipient_token_ttl_min_seconds() -> int:
    return max(60, int(os.getenv("CLAW_RECIPIENT_TOKEN_TTL_MIN_SECONDS", "300")))


def recipient_token_ttl_max_seconds() -> int:
    """Hard cap for minted recipient/signer/reviewer links (default 90 days)."""
    return max(
        recipient_token_ttl_min_seconds(),
        int(os.getenv("CLAW_RECIPIENT_TOKEN_TTL_MAX_SECONDS", str(60 * 60 * 24 * 90))),
    )


def clamp_recipient_token_ttl_seconds(raw: int) -> int:
    lo = recipient_token_ttl_min_seconds()
    hi = recipient_token_ttl_max_seconds()
    return max(lo, min(int(raw), hi))
