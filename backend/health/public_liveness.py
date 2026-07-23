"""
Public liveness/diagnostic health for GET /health and GET /v1/healthz.

Process liveness always returns HTTP 200 with ``ok: true``. Optional subsystem probes
degrade gracefully; failures are reported under ``subsystems`` and never raise 500.
"""

from __future__ import annotations

import logging
import os
from typing import Any, Dict, Literal, Optional

from backend.config.deployment_runtime import claw_environment

log = logging.getLogger(__name__)

LIVENESS_SUMMARY = (
    "Process up only (no dependency probes). "
    "Postgres readiness: GET /v1/readyz. Full matrix: GET /admin/deploy-readiness (admin)."
)

SubsystemStatus = Literal["ok", "degraded", "error", "skipped"]


def _subsystem(
    *,
    status: SubsystemStatus,
    available: Optional[bool] = None,
    engine: Optional[str] = None,
    reason: Optional[str] = None,
    extra: Optional[Dict[str, Any]] = None,
) -> Dict[str, Any]:
    out: Dict[str, Any] = {"status": status}
    if available is not None:
        out["available"] = available
    if engine is not None:
        out["engine"] = engine
    if reason:
        out["reason"] = reason[:500]
    if extra:
        out.update(extra)
    return out


def _probe_recipient_pdf_export() -> Dict[str, Any]:
    """PyMuPDF Story — import/API only on health path (no in-process render smoke)."""
    if os.getenv("CLAW_HEALTH_SKIP_RECIPIENT_PDF_PROBE", "").strip().lower() in (
        "1",
        "true",
        "yes",
    ):
        return _subsystem(status="skipped", available=False, engine="fallback", reason="probe_disabled")

    try:
        from backend.services.agreement_pdf_story_capability import (
            assess_agreement_pdf_story_capability_for_health,
        )

        cap = assess_agreement_pdf_story_capability_for_health()
        available = bool(cap.get("available"))
        engine = str(cap.get("engine") or "fallback")
        reason = (cap.get("reason") or "").strip() or None
        status: SubsystemStatus = "ok" if available else "degraded"
        return _subsystem(status=status, available=available, engine=engine, reason=reason)
    except Exception as exc:
        log.warning(
            "health recipient_pdf_export probe failed: %s: %s",
            type(exc).__name__,
            (str(exc) or "")[:300],
        )
        return _subsystem(
            status="error",
            available=False,
            engine="fallback",
            reason=f"probe_exception:{type(exc).__name__}",
        )


def _probe_runtime_environment() -> Dict[str, Any]:
    """Lightweight env flags (no secrets)."""
    try:
        from backend.config.runtime_environment import data_dir

        dd = data_dir()
        writable = False
        try:
            dd.mkdir(parents=True, exist_ok=True)
            probe = dd / ".health_write_probe"
            probe.write_text("ok", encoding="utf-8")
            probe.unlink(missing_ok=True)
            writable = True
        except OSError:
            writable = False
        return _subsystem(
            status="ok" if writable else "degraded",
            extra={
                "environment": claw_environment() or "(unset)",
                "data_dir_configured": bool(str(os.getenv("CLAW_DATA_DIR", "")).strip()),
                "data_dir_writable": writable,
            },
        )
    except Exception as exc:
        return _subsystem(status="error", reason=f"runtime_probe:{type(exc).__name__}")


def build_public_health_payload() -> Dict[str, Any]:
    """
    Diagnostic health body. Always safe to serialize; never raises.
    Top-level ``ok`` remains true for release smoke / load-balancer liveness.
    """
    subsystems: Dict[str, Dict[str, Any]] = {}
    try:
        subsystems["recipient_pdf_export"] = _probe_recipient_pdf_export()
    except Exception as exc:
        subsystems["recipient_pdf_export"] = _subsystem(
            status="error",
            available=False,
            engine="fallback",
            reason=f"probe_wrapper:{type(exc).__name__}",
        )

    try:
        subsystems["runtime"] = _probe_runtime_environment()
    except Exception as exc:
        subsystems["runtime"] = _subsystem(status="error", reason=f"runtime_wrapper:{type(exc).__name__}")

    degraded = any(s.get("status") in ("degraded", "error") for s in subsystems.values())
    rpe = subsystems.get("recipient_pdf_export") or {}

    return {
        "ok": True,
        "degraded": degraded,
        "summary": LIVENESS_SUMMARY,
        "subsystems": subsystems,
        # Backward compatibility for release_smoke and older clients
        "recipient_pdf_export": {
            "available": bool(rpe.get("available")),
            "engine": rpe.get("engine") or "fallback",
            **({"reason": rpe["reason"]} if rpe.get("reason") else {}),
            **({"status": rpe.get("status")} if rpe.get("status") else {}),
        },
    }
