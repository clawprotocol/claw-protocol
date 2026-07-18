"""
Cache-Control policy for API responses (Cloudflare / CDN / browser edge readiness).

TODO(edge): Per-route rate limits and WAF rules belong at Cloudflare or the reverse proxy
for /webhook/*, /v1/genesis-referral/ops/*, and auth surfaces — not in application code yet.
"""

from __future__ import annotations

import re
from typing import Optional

# Never cache operator, webhook, or authenticated economics surfaces.
_NO_STORE_PREFIXES = (
    "/admin",
    "/webhook",
    "/v1/admin",
    "/v1/genesis-referral/ops",
    "/v1/affiliates/ops",
)

_NO_STORE_EXACT = frozenset({"/health", "/v1/healthz", "/v1/readyz", "/version", "/v1/version"})

# Private sensitive reads must never be edge-cached publicly.
_SHORT_PUBLIC_CACHE = re.compile(
    r"^/(v1/batches/|v1/timeline/receipts/)"
)


def cache_control_for_path(path: str, method: str) -> Optional[str]:
    if method.upper() not in ("GET", "HEAD"):
        return "no-store"
    if path in _NO_STORE_EXACT:
        return "no-store"
    for prefix in _NO_STORE_PREFIXES:
        if path.startswith(prefix):
            return "no-store"
    if path.startswith("/api/agreements/") and "/recipient-access" in path:
        return "no-store"
    if _SHORT_PUBLIC_CACHE.match(path):
        return "public, max-age=60"
    if path.startswith("/v1/") or path.startswith("/api/"):
        return "no-store"
    return None
