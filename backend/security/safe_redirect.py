"""Allowlisted internal redirect paths for post-auth (server-side)."""

from __future__ import annotations

from typing import Optional
from urllib.parse import urlencode

ALLOWED_PREFIXES = (
    "/app/create",
    "/app/checkout/",
    "/app/send",
    "/app/done",
    "/app/settings",
    "/app/billing",
    "/app",
    "/review",
    "/sign",
)


def is_allowlisted_internal_path(path: str) -> bool:
    p = (path or "").strip()
    if not p.startswith("/"):
        return False
    if p.startswith("//"):
        return False
    if "://" in p:
        return False
    return any(p == prefix or p.startswith(prefix) for prefix in ALLOWED_PREFIXES)


def resolve_safe_redirect_path(candidate: Optional[str], fallback: str = "/app") -> str:
    c = (candidate or "").strip()
    if c and is_allowlisted_internal_path(c):
        return c
    return fallback


def build_destination_with_agreement(*, destination_path: str, agreement_id: Optional[str]) -> str:
    dest = resolve_safe_redirect_path(destination_path, "/app")
    aid = (agreement_id or "").strip()
    if aid and dest.startswith("/app/create") and "agreementId=" not in dest:
        sep = "&" if "?" in dest else "?"
        return f"{dest}{sep}{urlencode({'agreementId': aid})}"
    return dest
