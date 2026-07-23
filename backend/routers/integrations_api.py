"""
Org-scoped integration settings: outbound webhooks, delivery log, secret rotation.

Requires ``X-Claw-Org-Id`` to match the path ``org_id`` (no cross-org access).
"""
from __future__ import annotations

import json
import logging
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel, Field, HttpUrl as PydanticHttpUrl

from backend.integrations.constants import CLAW_WEBHOOK_EVENT_TYPES
from backend.integrations.webhook_dispatch import retry_delivery
from backend.integrations import webhook_store
from backend.usage_economics.policy import require_claw_org_id_header

router = APIRouter(prefix="/v1/orgs/{org_id}/integrations", tags=["integrations"])
_log = logging.getLogger("claw.integrations.api")


def _require_org_match(request: Request, org_id_path: str) -> str:
    oid = require_claw_org_id_header(request).strip()
    from backend.security.commercial_auth import require_commercial_owner_principal
    require_commercial_owner_principal(request)
    if oid != (org_id_path or "").strip():
        raise HTTPException(
            status_code=403,
            detail={"code": "org_mismatch", "message": "X-Claw-Org-Id must match this org path."},
        )
    return oid


class RegisterWebhookBody(BaseModel):
    url: PydanticHttpUrl
    events: List[str] = Field(..., min_length=1)


class PatchWebhookBody(BaseModel):
    url: Optional[str] = Field(default=None, max_length=2048)
    events: Optional[List[str]] = None
    enabled: Optional[bool] = None


@router.get("/webhooks")
def list_org_webhooks(org_id: str, request: Request) -> Dict[str, Any]:
    _require_org_match(request, org_id)
    return {"ok": True, "hooks": webhook_store.list_hooks(org_id), "available_event_types": list(CLAW_WEBHOOK_EVENT_TYPES)}


@router.post("/webhooks")
def register_webhook(org_id: str, body: RegisterWebhookBody, request: Request) -> Dict[str, Any]:
    _require_org_match(request, org_id)
    hook = webhook_store.create_hook(org_id, url=str(body.url).strip(), events=body.events)
    _log.info(
        json.dumps({"event": "webhook_registered", "org_id": org_id, "hook_id": hook["hook_id"]}, default=str)
    )
    return {"ok": True, **hook}


@router.patch("/webhooks/{hook_id}")
def patch_webhook(org_id: str, hook_id: str, body: PatchWebhookBody, request: Request) -> Dict[str, Any]:
    _require_org_match(request, org_id)
    try:
        webhook_store.update_hook(
            org_id,
            hook_id,
            url=body.url,
            events=body.events,
            enabled=body.enabled,
        )
    except KeyError as exc:
        raise HTTPException(status_code=404, detail="hook_not_found") from exc
    return {"ok": True, "hooks": webhook_store.list_hooks(org_id)}


@router.delete("/webhooks/{hook_id}")
def delete_webhook(org_id: str, hook_id: str, request: Request) -> Dict[str, Any]:
    _require_org_match(request, org_id)
    try:
        webhook_store.delete_hook(org_id, hook_id)
    except KeyError as exc:
        raise HTTPException(status_code=404, detail="hook_not_found") from exc
    return {"ok": True}


@router.post("/webhooks/{hook_id}/rotate-secret")
def rotate_webhook_secret(org_id: str, hook_id: str, request: Request) -> Dict[str, Any]:
    _require_org_match(request, org_id)
    try:
        new_secret = webhook_store.rotate_hook_secret(org_id, hook_id)
    except KeyError as exc:
        raise HTTPException(status_code=404, detail="hook_not_found") from exc
    _log.info(json.dumps({"event": "webhook_secret_rotated", "org_id": org_id, "hook_id": hook_id}, default=str))
    return {"ok": True, "hook_id": hook_id, "signing_secret": new_secret}


@router.get("/webhooks/deliveries")
def list_webhook_deliveries(org_id: str, request: Request, hook_id: str | None = None, limit: int = 50) -> Dict[str, Any]:
    _require_org_match(request, org_id)
    return {
        "ok": True,
        "deliveries": webhook_store.list_deliveries(org_id, hook_id=hook_id, limit=limit),
    }


@router.post("/webhooks/deliveries/{delivery_id}/retry")
def retry_webhook_delivery(org_id: str, delivery_id: str, request: Request) -> Dict[str, Any]:
    _require_org_match(request, org_id)
    ok = retry_delivery(org_id, delivery_id)
    if not ok:
        raise HTTPException(status_code=404, detail="delivery_not_found")
    return {"ok": True, "queued": True}


@router.post("/audit/integration-settings-opened")
def audit_integration_settings_opened(org_id: str, request: Request) -> Dict[str, bool]:
    _require_org_match(request, org_id)
    _log.info(json.dumps({"event": "integration_settings_opened", "org_id": org_id}, default=str))
    return {"ok": True}
