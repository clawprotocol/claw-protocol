"""
Fail-closed gate for legacy noncommercial HTTP surfaces.

Covered surfaces (when commercial / production-like mode is enforced):

- Routers: ``/v1/workflow/*``, ``/v1/agreements/*`` (legacy packet API),
  ``/v1/esign/*``, ``/v1/liability/*`` (packet create/finalize router)
- Main-app legacy timeline tool: ``/v1/timelines/*``, ``/v1/liability/assessment/*``,
  ``/v1/timeline/receipts/*`` private fetches (auth via receipt_access where kept),
  ``/v1/batches/*``
- Main-app agent / clause mirrors: ``/agent/*``, ``/propose``, ``/sign``,
  ``/proof``, ``/anchor``, ``/receipt``

These remain available only when commercial mode is not enforced (explicit
``CLAW_ENVIRONMENT`` local/dev/test and ``CLAW_COMMERCIAL_MODE`` unset/off).

Staging, production, unset/blank/unknown environment, or ``CLAW_COMMERCIAL_MODE=1``
deny all gated legacy routes — including anonymous reads and mutations.

Deliberately public cryptographic verify of client-supplied packets
(``POST /verify``, and ``POST /verify/tree`` when the body already contains a
receipt object) is not gated here. Server-side fetch by ``receipt_id`` uses
``require_timeline_receipt_access`` instead.
"""

from __future__ import annotations

from fastapi import HTTPException, Request

from backend.security.commercial_auth import commercial_mode_enforced


def deny_legacy_router_in_commercial(request: Request) -> None:
    """FastAPI dependency: reject legacy routers/surfaces under commercial mode."""
    del request  # unused; present for Depends(Request) compatibility
    if not commercial_mode_enforced():
        return
    raise HTTPException(
        status_code=403,
        detail={
            "code": "legacy_router_disabled",
            "message": (
                "This legacy API is disabled in commercial and production-like "
                "environments. Use the authenticated commercial agreement APIs."
            ),
        },
    )


# Alias used by main.py timeline/agent surfaces for clarity in call sites.
deny_legacy_main_surface_in_commercial = deny_legacy_router_in_commercial
