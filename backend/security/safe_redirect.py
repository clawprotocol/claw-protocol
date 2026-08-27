"""Allowlisted internal redirect paths for post-auth (server-side)."""

from __future__ import annotations

from typing import Optional
from urllib.parse import unquote, urlencode

# Frontend create-flow sentinel — no workspace row exists yet.
CREATE_FLOW_CHECKOUT_AGREEMENT_ID = "__claw_create_checkout__"

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


def extract_agreement_id_from_app_path(path: str) -> Optional[str]:
    """Return a real checkout/create agreement id from an allowlisted app path."""
    raw = (path or "").strip()
    no_query = raw.split("?", 1)[0]
    checkout_prefix = "/app/checkout/"
    if no_query.startswith(checkout_prefix):
        aid = unquote(no_query[len(checkout_prefix) :].split("/", 1)[0]).strip()
        if aid and aid != CREATE_FLOW_CHECKOUT_AGREEMENT_ID:
            return aid
    if no_query == "/app/create" or no_query.startswith("/app/create"):
        try:
            from urllib.parse import parse_qs, urlparse

            parsed = urlparse(raw)
            aid = (parse_qs(parsed.query).get("agreementId") or [""])[0].strip()
            if aid and aid != CREATE_FLOW_CHECKOUT_AGREEMENT_ID:
                return aid
        except Exception:
            return None
    return None


def build_destination_with_agreement(*, destination_path: str, agreement_id: Optional[str]) -> str:
    dest = resolve_safe_redirect_path(destination_path, "/app")
    aid = (agreement_id or "").strip()
    if not aid or aid == CREATE_FLOW_CHECKOUT_AGREEMENT_ID:
        return dest
    if dest.startswith("/app/create") and "agreementId=" not in dest:
        sep = "&" if "?" in dest else "?"
        return f"{dest}{sep}{urlencode({'agreementId': aid})}"
    checkout_prefix = "/app/checkout/"
    if dest.startswith(checkout_prefix):
        rest = dest[len(checkout_prefix) :]
        path_id, _sep, query = rest.partition("?")
        current = unquote(path_id).strip()
        # Only replace the create-flow sentinel. A real checkout UUID is the
        # conversion agreement on the URL — never invent a different one.
        if current == CREATE_FLOW_CHECKOUT_AGREEMENT_ID or not current:
            suffix = f"?{query}" if query else ""
            return f"{checkout_prefix}{aid}{suffix}"
    return dest
