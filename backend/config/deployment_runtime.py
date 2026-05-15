"""
Operator-facing runtime summary (no secrets).

Use for ``GET /admin/runtime-summary`` and health/diagnostics. Never include passwords, tokens, or cookies.

Operator docs: ``docs/ops/OPERATOR_RUNBOOK.md``; deploy smoke: ``docs/ops/DEPLOY_SMOKE_TEST.md``;
env inventory: ``docs/architecture/ENV_TOPOLOGY.md``.
"""

from __future__ import annotations

import os
from typing import Any, Dict

from backend.config.anchor_network_config import anchor_cadence_summary, agreement_receipt_protocol_version
from backend.config.feed_anchor_policy import (
    feed_event_anchor_network_default,
    feed_public_api_enabled,
    settlement_anchor_network_hint,
)
from backend.config.runtime_environment import (
    anchor_mode,
    data_dir,
    mainnet_disabled,
    process_role,
    recipient_access_token_required,
    recipient_token_ttl_max_seconds,
    recipient_token_ttl_min_seconds,
    review_delivery_mode,
    timeline_db_path,
)
from backend.config.storage_runtime import public_runtime_storage_summary


def claw_environment() -> str:
    return os.getenv("CLAW_ENVIRONMENT", "local").strip().lower()


def is_relaxed_claw_environment() -> bool:
    return claw_environment() in ("local", "dev", "test")


def is_production_like_claw_environment() -> bool:
    return not is_relaxed_claw_environment()


def admin_http_request_authorized(request: Any) -> bool:
    """
    Same rules as ``main._admin_ok`` for shared-secret operator HTTP surfaces.

    ``request`` must implement ``.headers.get(name)`` (e.g. Starlette ``Request``).
    """
    secret = os.getenv("CLAW_ADMIN_SECRET", "").strip()
    if is_production_like_claw_environment():
        if not secret:
            return False
        return (request.headers.get("x-claw-admin-secret") or "").strip() == secret
    if not secret:
        return True
    return (request.headers.get("x-claw-admin-secret") or "").strip() == secret


def admin_endpoints_unauthenticated() -> bool:
    """True when CLAW_ADMIN_SECRET is unset — admin routes accept any caller (dev only)."""
    return not os.getenv("CLAW_ADMIN_SECRET", "").strip()


def admin_anchor_http_trigger_enabled() -> bool:
    """When False, POST /admin/anchor/run is disabled; use the worker CLI/cron only."""
    return os.getenv("CLAW_ADMIN_ANCHOR_RUN_ENABLED", "1").strip().lower() not in (
        "0",
        "false",
        "no",
        "off",
    )


def public_runtime_summary() -> Dict[str, Any]:
    secret_present = bool(os.getenv("CLAW_AGREEMENT_SIGNING_TOKEN_SECRET", "").strip())
    mint_key_present = bool(os.getenv("CLAW_RECIPIENT_LINK_MINT_KEY", "").strip())
    btc_url_set = bool(os.getenv("BITCOIN_RPC_URL", "").strip())
    doge_url_set = bool(os.getenv("DOGECOIN_RPC_URL", "").strip())
    storage = os.getenv("CLAW_STORAGE_BACKEND", "local").strip().lower()
    node_mode = os.getenv("CLAW_NODE_MODE", "api").strip().lower()

    blob_root_set = bool(os.getenv("CLAW_BLOB_ROOT", "").strip())

    return {
        "process_role": process_role(),
        "node_mode": node_mode,
        "anchor_mode": anchor_mode(),
        "mainnet_broadcast_allowed": not mainnet_disabled(),
        "data_dir": data_dir(),
        "timeline_db_path": timeline_db_path(),
        "storage_backend": storage,
        "blob_root_explicitly_set": blob_root_set,
        "agreement_receipt_protocol_version": agreement_receipt_protocol_version(),
        "anchor_cadence_blocks": anchor_cadence_summary(),
        "feed_event_anchor_network_default": feed_event_anchor_network_default(),
        "settlement_anchor_network_hint": settlement_anchor_network_hint(),
        "feed_public_api_enabled": feed_public_api_enabled(),
        "recipient_access_token_required": recipient_access_token_required(),
        "review_delivery_mode": review_delivery_mode(),
        "recipient_token_ttl_seconds": {
            "min": recipient_token_ttl_min_seconds(),
            "max": recipient_token_ttl_max_seconds(),
        },
        "signing_token_secret_configured": secret_present,
        "recipient_link_mint_key_configured": mint_key_present,
        "bitcoin_rpc_url_configured": btc_url_set,
        "dogecoin_rpc_url_configured": doge_url_set,
        "admin_secret_configured": not admin_endpoints_unauthenticated(),
        "admin_anchor_http_trigger_enabled": admin_anchor_http_trigger_enabled(),
        "worker_entrypoint": "python -m backend.workers.run_anchor_worker",
        "artifact_storage": public_runtime_storage_summary(),
    }
