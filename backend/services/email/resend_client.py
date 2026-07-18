"""Thin Resend API client (httpx). Never log API keys or full message bodies with secrets."""

from __future__ import annotations

import logging
from dataclasses import dataclass
from typing import Any, Dict, List, Optional

import httpx

from backend.config.email_config import email_from, resend_api_key

_log = logging.getLogger(__name__)

RESEND_API_URL = "https://api.resend.com/emails"


@dataclass(frozen=True)
class SendResult:
    ok: bool
    provider_id: str | None = None
    status_code: int | None = None
    error: str | None = None


def send_email(
    *,
    to: str,
    subject: str,
    html: str,
    text: str | None = None,
    tags: Optional[List[Dict[str, str]]] = None,
    idempotency_key: str | None = None,
) -> SendResult:
    api_key = resend_api_key()
    from_addr = email_from()
    if not api_key or not from_addr:
        return SendResult(ok=False, error="email_not_configured")

    recipient = (to or "").strip()
    if not recipient or "@" not in recipient:
        return SendResult(ok=False, error="invalid_recipient")

    payload: Dict[str, Any] = {
        "from": from_addr,
        "to": [recipient],
        "subject": (subject or "").strip() or "Notification",
        "html": html,
    }
    if text:
        payload["text"] = text
    if tags:
        payload["tags"] = tags

    try:
        headers = {
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json",
        }
        idem = (idempotency_key or "").strip()
        if idem:
            headers["Idempotency-Key"] = idem[:256]
        with httpx.Client(timeout=20.0) as client:
            res = client.post(
                RESEND_API_URL,
                headers=headers,
                json=payload,
            )
    except httpx.HTTPError as exc:
        _log.warning("[resend] transport_error to_domain=%s err=%s", _email_domain(recipient), exc)
        return SendResult(ok=False, error="transport_error")

    if res.status_code >= 400:
        err_snip = (res.text or "")[:200]
        _log.warning(
            "[resend] send_failed status=%s to_domain=%s err_snip=%s",
            res.status_code,
            _email_domain(recipient),
            err_snip,
        )
        return SendResult(ok=False, status_code=res.status_code, error=err_snip or "send_failed")

    provider_id: str | None = None
    try:
        body = res.json()
        if isinstance(body, dict):
            rid = body.get("id")
            if isinstance(rid, str) and rid.strip():
                provider_id = rid.strip()
    except Exception:
        pass

    return SendResult(ok=True, provider_id=provider_id, status_code=res.status_code)


def _email_domain(email: str) -> str:
    parts = (email or "").split("@", 1)
    return parts[1].lower() if len(parts) == 2 else "unknown"
