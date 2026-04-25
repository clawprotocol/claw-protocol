"""
Server-side deploy readiness checks (no secrets in responses).

Used by ``GET /admin/deploy-readiness``. Postgres-backed domains include ``*_postgresql`` keys;
matching SQLite file pings stay in ``checks`` when that domain is not on Postgres.
See ``docs/ops/DEPLOY_SMOKE_TEST.md`` and ``docs/architecture/POSTGRES_DAY_ONE.md``.
"""

from __future__ import annotations

import os
import sqlite3
from typing import Any, Dict, List, Literal, Optional

from backend.config.deployment_runtime import (
    admin_anchor_http_trigger_enabled,
    public_runtime_summary,
)
from backend.config.feed_anchor_policy import (
    feed_event_anchor_network_default,
    feed_public_api_enabled,
    settlement_anchor_network_hint,
)
from backend.config.runtime_environment import (
    anchor_mode,
    data_dir,
    mainnet_disabled,
    timeline_db_path,
)
from backend.config.storage_runtime import (
    artifact_registry_db_path,
    public_runtime_storage_summary,
    unified_artifact_store_enabled,
)
from backend.anchoring.rpc_ping import check_bitcoin_rpc_reachable, check_dogecoin_rpc_reachable
from backend.economics.store import economics_db_path
from backend.services.claw_feed_store import _feed_db_path, get_claw_feed_store
from backend.treasury.treasury_store import _db_path as treasury_sqlite_path
from backend.utils.agreement_version_store import agreement_versions_sqlite_path
from backend.utils.anchor_queue import DEFAULT_DB_PATH as ANCHOR_QUEUE_DEFAULT_PATH
from backend.utils.timeline_store import TimelineStore
from backend.payments.store import onramp_db_path
from backend.usage_economics.store import usage_economics_db_path
from backend.db.config import (
    use_postgresql_for_affiliate_ledger,
    use_postgresql_for_agreements,
    use_postgresql_for_anchoring,
    use_postgresql_for_onramp_payments,
    use_postgresql_for_operator_alerts,
    use_postgresql_for_timeline,
    use_postgresql_for_usage_economics,
)
from backend.db.readiness import (
    affiliate_ledger_database_readiness,
    agreement_database_readiness,
    anchoring_database_readiness,
    onramp_payments_database_readiness,
    operator_alerts_database_readiness,
    timeline_database_readiness,
    usage_economics_database_readiness,
)

SmokeProfile = Literal["read_only", "standard", "deep"]


def _is_production_named_environment() -> bool:
    return os.getenv("CLAW_ENVIRONMENT", "local").strip().lower() in ("production", "prod")


def effective_smoke_profile() -> SmokeProfile:
    raw = os.getenv("CLAW_DEPLOY_SMOKE_PROFILE", "").strip().lower()
    if raw in ("read_only", "standard", "deep"):
        return raw  # type: ignore[return-value]
    if _is_production_named_environment():
        return "read_only"
    return "standard"


def allow_storage_round_trip_for_profile(profile: SmokeProfile) -> bool:
    explicit = os.getenv("CLAW_DEPLOY_SMOKE_STORAGE_ROUND_TRIP", "").strip().lower()
    if explicit in ("0", "false", "no", "off"):
        return False
    if explicit in ("1", "true", "yes", "on"):
        return True
    if profile == "deep":
        return True
    if profile == "read_only":
        return False
    # standard (default non-prod): allow light artifact round-trip
    return True


def _sqlite_select_one(db_path: str) -> Dict[str, Any]:
    try:
        with sqlite3.connect(os.path.expanduser(db_path), timeout=10.0) as con:
            con.execute("SELECT 1")
        return {"status": "ok", "path": db_path}
    except Exception as e:
        return {"status": "error", "detail": str(e)[:300], "path": db_path}


def _usage_db_path_resolved() -> str:
    env = os.getenv("CLAW_USAGE_DB_PATH", "").strip()
    if env:
        return os.path.expanduser(env)
    return os.path.abspath(ANCHOR_QUEUE_DEFAULT_PATH)


def _storage_round_trip() -> Dict[str, Any]:
    if not unified_artifact_store_enabled():
        return {"status": "skipped", "detail": "CLAW_UNIFIED_ARTIFACT_STORE off"}
    from backend.storage.artifact_repository import get_artifact_repository

    marker = b"claw-deploy-smoke"
    ref = "__deploy_readiness__"
    try:
        repo = get_artifact_repository()
        repo.put_artifact(
            artifact_type="deploy_smoke",
            logical_ref=ref,
            data=marker,
            content_type="application/octet-stream",
            visibility="private",
            metadata={"purpose": "deploy_readiness"},
        )
        got = repo.get_bytes_by_logical_ref(artifact_type="deploy_smoke", logical_ref=ref)
        if got != marker:
            return {"status": "error", "detail": "read mismatch after write"}
        repo.delete_logical_latest(artifact_type="deploy_smoke", logical_ref=ref)
        return {"status": "ok"}
    except NotImplementedError as e:
        return {"status": "not_implemented", "detail": str(e)[:200]}
    except Exception as e:
        return {"status": "error", "detail": str(e)[:300]}


def _anchor_queue_signal() -> Dict[str, Any]:
    try:
        from backend.utils.anchor_queue import AnchorQueue

        q = AnchorQueue()
        return {"status": "ok", "pending_count": q.pending_count()}
    except Exception as e:
        return {"status": "error", "detail": str(e)[:300]}


def _timeline_queue_signal() -> Dict[str, Any]:
    try:
        ts = TimelineStore(db_path=timeline_db_path())
        jobs = ts.list_queued_timeline_anchor_jobs(limit=10_000)
        return {"status": "ok", "queued_job_count": len(jobs)}
    except Exception as e:
        return {"status": "error", "detail": str(e)[:300]}


def _treasury_spine() -> Dict[str, Any]:
    try:
        from backend.treasury.treasury_store import get_treasury_store

        store = get_treasury_store()
        with store._conn() as con:
            con.execute("SELECT COUNT(1) FROM claw_keys LIMIT 1")
        return {"status": "ok"}
    except Exception as e:
        return {"status": "error", "detail": str(e)[:300]}


def gather_deploy_readiness() -> Dict[str, Any]:
    """
    Aggregate readiness for operators. Safe to expose via admin route (no RPC passwords, etc.).
    """
    profile = effective_smoke_profile()
    storage_write = allow_storage_round_trip_for_profile(profile)

    checks: Dict[str, Any] = {
        "timeline_db": (
            {"status": "skipped", "detail": "timeline on postgresql"}
            if use_postgresql_for_timeline()
            else _sqlite_select_one(timeline_db_path())
        ),
        "timeline_postgresql": timeline_database_readiness(),
        "usage_economics_postgresql": usage_economics_database_readiness(),
        "usage_economics_db": (
            {"status": "skipped", "detail": "usage economics on postgresql"}
            if use_postgresql_for_usage_economics()
            else _sqlite_select_one(usage_economics_db_path())
        ),
        "onramp_payments_postgresql": onramp_payments_database_readiness(),
        "onramp_payments_db": (
            {"status": "skipped", "detail": "onramp payments on postgresql"}
            if use_postgresql_for_onramp_payments()
            else _sqlite_select_one(onramp_db_path())
        ),
        "usage_db": _sqlite_select_one(_usage_db_path_resolved()),
        "feed_db": _sqlite_select_one(_feed_db_path()),
        "treasury_db": _sqlite_select_one(treasury_sqlite_path()),
        "data_dir": {"status": "ok", "path": data_dir()},
        "anchoring_postgresql": anchoring_database_readiness(),
        "agreements_postgresql": agreement_database_readiness(),
        "agreements_sqlite": (
            {"status": "skipped", "detail": "agreements on postgresql"}
            if use_postgresql_for_agreements()
            else _sqlite_select_one(agreement_versions_sqlite_path())
        ),
        "affiliate_ledger_postgresql": affiliate_ledger_database_readiness(),
        "operator_alerts_postgresql": operator_alerts_database_readiness(),
        "economics_sqlite": _sqlite_select_one(economics_db_path()),
    }

    get_claw_feed_store().init_schema()
    checks["treasury_spine"] = _treasury_spine()

    if unified_artifact_store_enabled():
        from backend.storage.artifact_repository import get_artifact_repository

        repo = get_artifact_repository()
        repo.init_schema()
        checks["artifact_registry_db"] = _sqlite_select_one(artifact_registry_db_path())
    else:
        checks["artifact_registry_db"] = {"status": "skipped", "detail": "unified artifact store off"}

    checks["anchor_queue"] = _anchor_queue_signal()
    checks["timeline_anchor_queue"] = _timeline_queue_signal()
    checks["bitcoin_rpc"] = check_bitcoin_rpc_reachable()
    checks["dogecoin_rpc"] = check_dogecoin_rpc_reachable()

    try:
        from backend.anchoring.wallet_runway import estimate_anchor_wallet_runway

        checks["anchor_wallet_runway"] = {
            "bitcoin": estimate_anchor_wallet_runway("bitcoin"),
            "dogecoin": estimate_anchor_wallet_runway("dogecoin"),
        }
    except Exception as e:
        checks["anchor_wallet_runway"] = {"status": "error", "detail": str(e)[:300]}

    try:
        from backend.anchoring.config import anchoring_enabled
        from backend.anchoring.store import AnchoringStore

        if anchoring_enabled():
            st = AnchoringStore()
            st.init_schema()
            checks["anchoring_receipt_batch_queue"] = {
                "queued_batch_jobs": st.count_batch_anchor_jobs_with_status("queued"),
            }
        else:
            checks["anchoring_receipt_batch_queue"] = {
                "status": "skipped",
                "detail": "CLAW_ANCHORING_ENABLED off",
            }
    except Exception as e:
        checks["anchoring_receipt_batch_queue"] = {
            "status": "error",
            "detail": str(e)[:300],
        }

    try:
        from backend.anchoring.config import (
            anchor_batch_window_grace_days,
            anchor_receipt_batch_backlog_critical_threshold,
            anchor_stale_submitted_job_hours,
            anchoring_enabled,
            launch_anchor_cadence_days,
        )
        from backend.anchoring.operator_summary import (
            build_anchoring_operator_summary,
            compute_anchor_operator_health,
        )
        from backend.anchoring.store import AnchoringStore

        def _pick_runway_row(row: Any) -> Any:
            if not isinstance(row, dict):
                return None
            if row.get("status") == "error":
                return None
            if "runway_severity" in row or "runway_weeks" in row:
                return row
            return None

        awr = checks.get("anchor_wallet_runway") or {}
        btc_rw = _pick_runway_row(awr.get("bitcoin"))
        doge_rw = _pick_runway_row(awr.get("dogecoin"))

        arq = checks.get("anchoring_receipt_batch_queue") or {}
        n_queued = arq.get("queued_batch_jobs")
        if not isinstance(n_queued, int):
            n_queued = None

        latest_fa = None
        n_queued_int = int(n_queued) if isinstance(n_queued, int) else 0
        stale_o = 0
        od = 0
        btc_rpc = check_bitcoin_rpc_reachable()
        doge_rpc = check_dogecoin_rpc_reachable()
        if anchoring_enabled():
            st = AnchoringStore()
            st.init_schema()
            latest_fa = st.get_latest_fully_anchored_receipt_batch()
            n_queued_int = int(st.count_batch_anchor_jobs_with_status("queued"))
            stale_o = int(
                st.count_stale_unconfirmed_batch_anchor_jobs(
                    older_than_hours=anchor_stale_submitted_job_hours()
                )
            )
            grace = anchor_batch_window_grace_days()
            cadence = launch_anchor_cadence_days()
            od = int(
                st.count_receipt_batches_ready_overdue(
                    older_than_days=float(cadence + grace)
                )
            )

        thr = anchor_receipt_batch_backlog_critical_threshold()
        health = compute_anchor_operator_health(
            bitcoin_rpc_status=str(btc_rpc.get("status") or ""),
            dogecoin_rpc_status=str(doge_rpc.get("status") or ""),
            rw_btc=btc_rw if isinstance(btc_rw, dict) else None,
            rw_doge=doge_rw if isinstance(doge_rw, dict) else None,
            receipt_batch_jobs_queued=n_queued_int,
            backlog_critical_threshold=thr,
            cycle_summary={},
            stale_unconfirmed_jobs=stale_o,
            ready_batches_overdue=od,
        )

        checks["anchoring_operator_summary"] = build_anchoring_operator_summary(
            rw_btc=btc_rw if isinstance(btc_rw, dict) else None,
            rw_doge=doge_rw if isinstance(doge_rw, dict) else None,
            receipt_batch_jobs_queued=n_queued_int,
            latest_fully_anchored=latest_fa,
            health=health,
        )
    except Exception as e:
        checks["anchoring_operator_summary"] = {
            "status": "error",
            "detail": str(e)[:300],
        }

    if storage_write:
        checks["artifact_storage_round_trip"] = _storage_round_trip()
    else:
        checks["artifact_storage_round_trip"] = {
            "status": "skipped",
            "detail": "storage write disabled (profile or CLAW_DEPLOY_SMOKE_STORAGE_ROUND_TRIP)",
        }

    critical_keys = ["usage_db", "treasury_db", "treasury_spine", "economics_sqlite"]
    if use_postgresql_for_timeline():
        critical_keys.append("timeline_postgresql")
    else:
        critical_keys.append("timeline_db")
    if use_postgresql_for_usage_economics():
        critical_keys.append("usage_economics_postgresql")
    else:
        critical_keys.append("usage_economics_db")
    if use_postgresql_for_onramp_payments():
        critical_keys.append("onramp_payments_postgresql")
    else:
        critical_keys.append("onramp_payments_db")
    if use_postgresql_for_anchoring():
        critical_keys.append("anchoring_postgresql")
    if use_postgresql_for_agreements():
        critical_keys.append("agreements_postgresql")
    else:
        critical_keys.append("agreements_sqlite")
    if use_postgresql_for_affiliate_ledger():
        critical_keys.append("affiliate_ledger_postgresql")
    if use_postgresql_for_operator_alerts():
        critical_keys.append("operator_alerts_postgresql")
    if checks.get("artifact_registry_db", {}).get("status") == "ok":
        critical_keys.append("artifact_registry_db")
    elif unified_artifact_store_enabled():
        critical_keys.append("artifact_registry_db")

    failed = [k for k in critical_keys if checks.get(k, {}).get("status") not in ("ok", "skipped")]

    optional_component_errors: List[str] = []
    for name, result in checks.items():
        if name in critical_keys:
            continue
        if isinstance(result, dict) and result.get("status") == "error":
            optional_component_errors.append(name)
    optional_component_errors.sort()

    if failed:
        op_headline = "Not deploy-ready: critical check failures — " + ", ".join(failed) + "."
    elif optional_component_errors:
        op_headline = (
            "Critical path ok; non-critical components reported errors — "
            + ", ".join(optional_component_errors)
            + "."
        )
    else:
        op_headline = "Critical dependencies healthy (ok or skipped)."

    hints = {
        "feed_event_anchor_network_default": feed_event_anchor_network_default(),
        "settlement_anchor_network_hint": settlement_anchor_network_hint(),
        "feed_public_api_configured": feed_public_api_enabled(),
        "anchor_mode": anchor_mode(),
        "mainnet_broadcast_guards_enabled": mainnet_disabled(),
        "admin_http_anchor_run_enabled": admin_anchor_http_trigger_enabled(),
        "worker_cli": "python -m backend.workers.run_anchor_worker",
    }

    return {
        "ok": len(failed) == 0,
        "smoke_profile": profile,
        "storage_round_trip_attempted": storage_write,
        "failed_critical_checks": failed,
        "summary": {
            "headline": op_headline,
            "optional_component_errors": optional_component_errors,
            "how_to_read": (
                "Top-level `ok` is false only when `failed_critical_checks` is non-empty. "
                "`optional_component_errors` names failing checks that do not alone fail `ok` "
                "(e.g. chain RPC); still review before heavy traffic."
            ),
        },
        "checks": checks,
        "artifact_storage_config": public_runtime_storage_summary(),
        "runtime": public_runtime_summary(),
        "hints": hints,
    }


def gather_readiness_summary_lines() -> List[str]:
    """Plain-text lines for CLI/logging (no secrets)."""
    r = gather_deploy_readiness()
    summ = r.get("summary") or {}
    opt_err = summ.get("optional_component_errors") or []
    lines = [
        f"deploy_readiness ok={r['ok']} profile={r['smoke_profile']} "
        f"CLAW_ENVIRONMENT={os.getenv('CLAW_ENVIRONMENT', 'local')}",
        f"  {summ.get('headline', '')}",
    ]
    if opt_err:
        lines.append(f"  optional_component_errors={','.join(opt_err)}")
    lines.extend(
        [
        f"  process_role={r['runtime'].get('process_role', '')} node_mode={r['runtime'].get('node_mode', '')}",
        f"  storage_backend={r['artifact_storage_config'].get('storage_backend')} "
        f"unified_store={r['artifact_storage_config'].get('unified_artifact_store')}",
        f"  feed_public={r['hints'].get('feed_public_api_configured')} "
        f"feed_anchor_net={r['hints'].get('feed_event_anchor_network_default')}",
        f"  mainnet_guards={r['hints'].get('mainnet_broadcast_guards_enabled')} "
        f"admin_anchor_http={r['hints'].get('admin_http_anchor_run_enabled')}",
        f"  bitcoin_rpc={r['checks'].get('bitcoin_rpc', {}).get('status')} "
        f"dogecoin_rpc={r['checks'].get('dogecoin_rpc', {}).get('status')}",
        f"  anchoring_postgresql={r['checks'].get('anchoring_postgresql', {}).get('status')}",
        f"  agreements_postgresql={r['checks'].get('agreements_postgresql', {}).get('status')}",
        f"  timeline_postgresql={r['checks'].get('timeline_postgresql', {}).get('status')}",
        f"  economics_sqlite={r['checks'].get('economics_sqlite', {}).get('status')}",
        ]
    )
    return lines


if __name__ == "__main__":
    import json

    out = gather_deploy_readiness()
    print(json.dumps(out, indent=2, sort_keys=True))
    raise SystemExit(0 if out.get("ok") else 2)
