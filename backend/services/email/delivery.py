"""Non-fatal email delivery wrapper."""

from __future__ import annotations

import logging

from backend.services.email.resend_client import SendResult, send_email

_log = logging.getLogger(__name__)


def send_email_non_fatal(
    *,
    to: str,
    subject: str,
    html: str,
    text: str | None = None,
    context: str = "email",
    idempotency_key: str | None = None,
) -> SendResult:
    """Send via Resend; log failures and never raise."""
    try:
        result = send_email(
            to=to,
            subject=subject,
            html=html,
            text=text,
            idempotency_key=idempotency_key,
        )
    except Exception as exc:  # noqa: BLE001 — outbound must not break API callers
        _log.warning("[%s] send_exception to=%s err=%s", context, _redact_to(to), exc)
        return SendResult(ok=False, error="exception")

    if not result.ok:
        _log.warning(
            "[%s] send_failed to=%s status=%s err=%s",
            context,
            _redact_to(to),
            result.status_code,
            (result.error or "")[:120],
        )
    return result


def _redact_to(email: str) -> str:
    e = (email or "").strip().lower()
    if "@" not in e:
        return "invalid"
    local, domain = e.split("@", 1)
    if not local:
        return f"***@{domain}"
    return f"{local[0]}***@{domain}"
