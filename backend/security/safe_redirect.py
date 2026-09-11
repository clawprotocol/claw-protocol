"""Router-aware internal redirect paths for post-auth (server-side).

Prefix matching is not authority. Recipient tokens, admin, and open redirects fail closed.
"""

from __future__ import annotations

import re
from typing import Optional
from urllib.parse import parse_qsl, unquote, urlencode

CONTROL_CHARS = re.compile(r"[\x00-\x1f\x7f]")

ALLOWED_EXACT_PATHS = frozenset(
    {
        "/app",
        "/dashboard",
        "/app/create",
        "/app/settings",
        "/app/billing",
        "/app/checkout",
    }
)

ALLOWED_DYNAMIC_PATHS = (
    re.compile(r"^/app/checkout/[^/]+$"),
    re.compile(r"^/app/send/[^/]+$"),
    re.compile(r"^/app/done/[^/]+$"),
)

FORBIDDEN_QUERY_KEYS = frozenset(
    {
        "t",
        "token",
        "recipient_token",
        "code",
        "continuation_id",
        "access_token",
        "refresh_token",
    }
)

ALLOWED_QUERY_KEYS = frozenset(
    {
        "agreementid",
        "ref",
        "join",
        "tier",
        "cadence",
        "returnto",
        "premiumcompletion",
        "checkout_session_id",
        "restore",
        "phase",
    }
)

QUICK_PDF_RETURN_PATH = "/app/quick?start=pdf"
APPROVED_QUICK_ATTRIBUTION_KEYS = frozenset({"src", "aff"})
QUICK_PDF_QUERY_KEYS = frozenset({"start"}) | APPROVED_QUICK_ATTRIBUTION_KEYS


def _looks_like_external_or_script(raw: str) -> bool:
    t = (raw or "").strip()
    lower = t.lower()
    if not t.startswith("/"):
        return True
    if t.startswith("//"):
        return True
    if "://" in t:
        return True
    if "javascript:" in lower or "data:" in lower or "vbscript:" in lower:
        return True
    if "\\" in t:
        return True
    if CONTROL_CHARS.search(t):
        return True
    return False


def _decode_pathname(raw: str) -> Optional[str]:
    current = raw
    for _ in range(3):
        nxt = unquote(current)
        if nxt == current:
            break
        current = nxt
    if CONTROL_CHARS.search(current) or "\\" in current:
        return None
    return current


def _collapse_pathname(pathname: str) -> Optional[str]:
    parts = pathname.split("/")
    out: list[str] = []
    for part in parts:
        if part in ("", "."):
            continue
        if part == "..":
            if not out:
                return None
            out.pop()
            continue
        out.append(part)
    return "/" + "/".join(out)


def _parse_internal_candidate(path: str) -> Optional[tuple[str, str]]:
    trimmed = (path or "").strip()
    if not trimmed or _looks_like_external_or_script(trimmed):
        return None
    no_hash = trimmed.split("#", 1)[0]
    if "?" in no_hash:
        raw_path, search = no_hash.split("?", 1)
        search = "?" + search
    else:
        raw_path, search = no_hash, ""
    decoded = _decode_pathname(raw_path)
    if not decoded or _looks_like_external_or_script(decoded):
        return None
    collapsed = _collapse_pathname(decoded.rstrip("/") or "/")
    if not collapsed or _looks_like_external_or_script(collapsed):
        return None
    return collapsed, search


def _query_is_safe(search: str, depth: int = 0) -> bool:
    if not search:
        return True
    if depth > 2:
        return False
    raw = search[1:] if search.startswith("?") else search
    if not raw:
        return True
    try:
        pairs = parse_qsl(raw, keep_blank_values=True, strict_parsing=False)
    except ValueError:
        return False
    for key, value in pairs:
        k = (key or "").strip().lower()
        if not k or k in FORBIDDEN_QUERY_KEYS or k not in ALLOWED_QUERY_KEYS:
            return False
        if CONTROL_CHARS.search(value) or "\\" in value or "://" in value:
            return False
        if k == "returnto" and not is_allowlisted_internal_path(value, depth + 1):
            return False
    return True


def is_allowlisted_internal_path(path: str, depth: int = 0) -> bool:
    if depth > 2:
        return False
    parsed = _parse_internal_candidate(path)
    if not parsed:
        return False
    pathname, search = parsed
    if not _query_is_safe(search, depth):
        return False
    if pathname in ALLOWED_EXACT_PATHS:
        return True
    return any(pattern.match(pathname) for pattern in ALLOWED_DYNAMIC_PATHS)


def _quick_pdf_query_is_approved(search: str) -> bool:
    raw = search[1:] if search.startswith("?") else search
    if not raw:
        return False
    try:
        pairs = parse_qsl(raw, keep_blank_values=True, strict_parsing=False)
    except ValueError:
        return False
    if not pairs:
        return False
    start_values: list[str] = []
    for key, value in pairs:
        k = (key or "").strip().lower()
        if not k or k in FORBIDDEN_QUERY_KEYS or k not in QUICK_PDF_QUERY_KEYS:
            return False
        if CONTROL_CHARS.search(value) or "\\" in value or "://" in value:
            return False
        if k == "start":
            start_values.append((value or "").strip().lower())
    return start_values == ["pdf"] or (len(start_values) >= 1 and all(v == "pdf" for v in start_values))


def canonicalize_quick_pdf_return(path: str) -> str:
    parsed = _parse_internal_candidate(path)
    if not parsed:
        return QUICK_PDF_RETURN_PATH
    _pathname, search = parsed
    raw = search[1:] if search.startswith("?") else search
    try:
        pairs = parse_qsl(raw, keep_blank_values=True, strict_parsing=False)
    except ValueError:
        return QUICK_PDF_RETURN_PATH
    kept: list[tuple[str, str]] = []
    seen: set[str] = set()
    for key, value in pairs:
        k = (key or "").strip().lower()
        if k not in APPROVED_QUICK_ATTRIBUTION_KEYS:
            continue
        v = (value or "").strip()
        if not v or k in seen:
            continue
        if CONTROL_CHARS.search(v) or "\\" in v or "://" in v:
            continue
        seen.add(k)
        kept.append((k, v))
    if not kept:
        return QUICK_PDF_RETURN_PATH
    return f"/app/quick?{urlencode([('start', 'pdf'), *kept])}"


def is_approved_server_quick_pdf_return(path: str) -> bool:
    """``/app/quick?start=pdf`` is server-continuation only — never a caller ``next``."""
    parsed = _parse_internal_candidate(path)
    if not parsed:
        return False
    pathname, search = parsed
    if pathname != "/app/quick":
        return False
    return _quick_pdf_query_is_approved(search)


def resolve_server_auth_destination(candidate: Optional[str], fallback: str = "/app") -> str:
    """Destinations the auth server may issue, including Quick PDF return."""
    c = (candidate or "").strip()
    if c and is_approved_server_quick_pdf_return(c):
        return canonicalize_quick_pdf_return(c)
    if c and is_allowlisted_internal_path(c):
        return _canonicalize_internal_path(c)
    return fallback


def _canonicalize_internal_path(path: str) -> str:
    parsed = _parse_internal_candidate(path)
    if not parsed:
        return path
    pathname, search = parsed
    if pathname == "/dashboard":
        return f"/app{search}"
    return path


def resolve_safe_redirect_path(candidate: Optional[str], fallback: str = "/app") -> str:
    c = (candidate or "").strip()
    if c and is_allowlisted_internal_path(c):
        return _canonicalize_internal_path(c)
    return fallback


def build_destination_with_agreement(*, destination_path: str, agreement_id: Optional[str]) -> str:
    dest = resolve_server_auth_destination(destination_path, "/app")
    aid = (agreement_id or "").strip()
    if aid and dest.startswith("/app/create") and "agreementId=" not in dest:
        sep = "&" if "?" in dest else "?"
        return f"{dest}{sep}{urlencode({'agreementId': aid})}"
    return dest
