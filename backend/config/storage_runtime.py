"""
Artifact / blob storage runtime (no secrets).
"""

from __future__ import annotations

import os
from typing import Any, Dict

from backend.config.runtime_environment import data_dir


def artifact_registry_db_path() -> str:
    env = os.getenv("CLAW_ARTIFACT_REGISTRY_DB_PATH", "").strip()
    if env:
        return os.path.expanduser(env)
    return os.path.join(data_dir(), "artifact_registry.sqlite3")


def unified_artifact_store_enabled() -> bool:
    """When True, VS01 documents/receipts use the artifact repository + blob keys (with optional legacy mirror)."""
    return os.getenv("CLAW_UNIFIED_ARTIFACT_STORE", "1").strip().lower() not in (
        "0",
        "false",
        "no",
        "off",
    )


def cache_verification_bundles_enabled() -> bool:
    return os.getenv("CLAW_CACHE_VERIFICATION_BUNDLES", "0").strip().lower() in ("1", "true", "yes")


def public_runtime_storage_summary() -> Dict[str, Any]:
    backend = os.getenv("CLAW_STORAGE_BACKEND", "local").strip().lower()
    root = os.getenv("CLAW_BLOB_ROOT", "").strip()
    legacy_mirror = os.getenv("CLAW_VS01_LEGACY_FILE_MIRROR", "1").strip().lower() in (
        "1",
        "true",
        "yes",
    )
    return {
        "storage_backend": backend,
        "blob_root_configured": bool(root),
        "unified_artifact_store": unified_artifact_store_enabled(),
        "artifact_registry_db_path": artifact_registry_db_path(),
        "vs01_legacy_filesystem_mirror": legacy_mirror,
        "verification_bundle_cache": cache_verification_bundles_enabled(),
    }
