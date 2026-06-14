"""Build / deploy identity helpers for production diagnostics."""

from __future__ import annotations

import os
import re

# Bump when recipient-delivery-status handler behavior changes (grep in Railway logs).
RECIPIENT_DELIVERY_STATUS_HANDLER_REV = "v353"


def git_commit_sha() -> str:
    for key in ("RAILWAY_GIT_COMMIT_SHA", "RAILWAY_GIT_COMMIT", "GIT_COMMIT", "SOURCE_VERSION"):
        val = (os.getenv(key) or "").strip()
        if val:
            return val
    return "unknown"


def git_commit_short() -> str:
    sha = git_commit_sha()
    return sha if sha == "unknown" or len(sha) <= 12 else sha[:12]


def is_recipient_delivery_status_path(path: str) -> bool:
    return bool(re.match(r"^/api/agreements/[^/]+/recipient-delivery-status/?$", path or ""))


def agreement_id_from_recipient_delivery_status_path(path: str) -> str:
    match = re.match(r"^/api/agreements/([^/]+)/recipient-delivery-status/?$", path or "")
    return match.group(1) if match else ""
