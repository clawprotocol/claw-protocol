"""
Anchoring execution + observability configuration (env-driven).

See ``docs/architecture/ENV_TOPOLOGY.md`` and ``docs/ops/ANCHORING_LAUNCH_RUNBOOK.md``.
"""

from __future__ import annotations

import os
from typing import Optional


def _truthy(val: str, *, default: bool = False) -> bool:
    s = (val or "").strip().lower()
    if not s:
        return default
    return s not in ("0", "false", "no", "off")


def _int_env(name: str, default: int) -> int:
    raw = os.getenv(name, "").strip()
    if not raw:
        return default
    try:
        return int(raw)
    except ValueError:
        return default


def _anchor_profile() -> str:
    from backend.config.deployment_runtime import claw_environment

    return (os.getenv("CLAW_ANCHOR_ENV") or claw_environment() or "").strip().lower()


def anchoring_enabled() -> bool:
    return _truthy(os.getenv("CLAW_ANCHORING_ENABLED", "0"))


def anchor_canonical_chain_policy() -> str:
    return (os.getenv("CLAW_ANCHOR_CANONICAL_CHAIN_POLICY", "bitcoin_canonical_dogecoin_mirror")).strip()


def anchor_mirror_dogecoin_enabled() -> bool:
    return _truthy(os.getenv("CLAW_ANCHOR_MIRROR_DOGECOIN_ENABLED", "1"), default=True)


def anchor_mirror_dogecoin_required() -> bool:
    return _truthy(os.getenv("CLAW_ANCHOR_MIRROR_DOGECOIN_REQUIRED", "0"))


def dogecoin_mirror_every_nth_batch_close() -> int:
    return max(1, _int_env("CLAW_ANCHOR_MIRROR_DOGE_EVERY_NTH_BATCH", 2))


def launch_anchor_cadence_days() -> int:
    return max(1, _int_env("CLAW_ANCHOR_CADENCE_DAYS", 7))


def third_party_anchor_base_url() -> str:
    return (os.getenv("CLAW_THIRD_PARTY_ANCHOR_BASE_URL", "") or "").strip().rstrip("/")


def third_party_anchor_api_key_configured() -> bool:
    return bool((os.getenv("CLAW_THIRD_PARTY_ANCHOR_API_KEY", "") or "").strip())


def bitcoin_execution_provider_type() -> str:
    explicit = (os.getenv("CLAW_ANCHOR_BITCOIN_PROVIDER", "") or "").strip().lower()
    if explicit:
        return explicit
    return "local_rpc_bitcoin" if _anchor_profile() in ("local", "dev", "test") else "public_broadcast_bitcoin"


def dogecoin_execution_provider_type() -> str:
    explicit = (os.getenv("CLAW_ANCHOR_DOGECOIN_PROVIDER", "") or "").strip().lower()
    if explicit:
        return explicit
    return "local_rpc_dogecoin" if _anchor_profile() in ("local", "dev", "test") else "blockchair_dogecoin"


def canonical_bitcoin_network_for_anchors() -> str:
    return (os.getenv("CLAW_ANCHOR_CANONICAL_BITCOIN_NETWORK", "bitcoin-testnet") or "bitcoin-testnet").strip()


def mirror_dogecoin_network_for_anchors() -> str:
    return (os.getenv("CLAW_ANCHOR_MIRROR_DOGECOIN_NETWORK", "dogecoin-testnet") or "dogecoin-testnet").strip()


def bitcoin_public_broadcast_api_base_url(*, network: Optional[str] = None) -> str:
    override = (os.getenv("CLAW_ANCHOR_BTC_PUBLIC_BROADCAST_BASE_URL", "") or "").strip().rstrip("/")
    if override:
        return override
    net = (network or "").strip().lower() or canonical_bitcoin_network_for_anchors().lower()
    if "mainnet" in net:
        return "https://blockstream.info/api"
    return "https://blockstream.info/testnet/api"


def blockchair_base_url() -> str:
    return (os.getenv("CLAW_ANCHOR_BLOCKCHAIR_BASE_URL", "https://api.blockchair.com") or "").strip().rstrip("/")


def blockchair_dogecoin_push_url(*, network: Optional[str] = None) -> str:
    net = (network or "").strip().lower() or mirror_dogecoin_network_for_anchors().lower()
    path = (os.getenv("CLAW_ANCHOR_BLOCKCHAIR_DOGE_CHAIN_PATH", "") or "").strip()
    if not path:
        path = "dogecoin/testnet" if "test" in net else "dogecoin"
    base = blockchair_base_url()
    key = (os.getenv("CLAW_ANCHOR_BLOCKCHAIR_API_KEY", "") or "").strip()
    q = f"?key={key}" if key else ""
    return f"{base}/{path}/push/transaction{q}"


def blockchair_dogecoin_transaction_dashboard_url(*, network: Optional[str] = None) -> str:
    net = (network or "").strip().lower() or mirror_dogecoin_network_for_anchors().lower()
    path = (os.getenv("CLAW_ANCHOR_BLOCKCHAIR_DOGE_CHAIN_PATH", "") or "").strip()
    if not path:
        path = "dogecoin/testnet" if "test" in net else "dogecoin"
    base = blockchair_base_url()
    key = (os.getenv("CLAW_ANCHOR_BLOCKCHAIR_API_KEY", "") or "").strip()
    q = f"?key={key}" if key else ""
    return f"{base}/{path}/dashboards/transaction/{{txid}}{q}"


def bitcoin_explorer_tx_url_template() -> str:
    return (os.getenv("CLAW_ANCHOR_BTC_EXPLORER_TX_URL", "https://mempool.space/testnet/tx/{txid}") or "").strip()


def dogecoin_explorer_tx_url_template() -> str:
    return (
        os.getenv(
            "CLAW_ANCHOR_DOGE_EXPLORER_TX_URL",
            "https://blockchair.com/dogecoin/testnet/transaction/{txid}",
        )
        or ""
    ).strip()


def anchor_btc_confirmations_required(*, network: Optional[str] = None) -> int:
    _ = network
    return max(1, _int_env("CLAW_ANCHOR_BTC_CONFIRMATIONS", 2))


def anchor_doge_confirmations_required(*, network: Optional[str] = None) -> int:
    _ = network
    return max(1, _int_env("CLAW_ANCHOR_DOGE_CONFIRMATIONS", 2))


def receipt_batch_anchor_confirm_max_per_run() -> int:
    return max(0, _int_env("CLAW_RECEIPT_BATCH_ANCHOR_CONFIRM_MAX_PER_RUN", 20))


def anchor_batch_window_grace_days() -> int:
    return max(0, _int_env("CLAW_ANCHOR_BATCH_WINDOW_GRACE_DAYS", 2))


def anchor_receipt_batch_backlog_critical_threshold() -> int:
    return max(1, _int_env("CLAW_ANCHOR_RECEIPT_BATCH_BACKLOG_CRITICAL", 50))


def anchor_stale_submitted_job_hours() -> int:
    return max(1, _int_env("CLAW_ANCHOR_STALE_SUBMITTED_JOB_HOURS", 48))


def anchor_weekly_info_alert_min_interval_seconds() -> int:
    return max(0, _int_env("CLAW_ANCHOR_WEEKLY_INFO_ALERT_MIN_INTERVAL_SECONDS", 3600))


def anchor_weekly_info_alert_mode() -> str:
    return (os.getenv("CLAW_ANCHOR_WEEKLY_INFO_ALERT_MODE", "scheduled_only") or "scheduled_only").strip().lower()
