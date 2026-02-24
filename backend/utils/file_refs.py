# backend/utils/file_refs.py
"""
File reference utilities for CLAW protocol.

All analyst outputs MUST be tied to frozen evidence references.
This module provides utilities for creating and validating file references.
"""
from __future__ import annotations

import hashlib
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

from backend.utils.canonical_json import canon_sha256_hex


@dataclass(frozen=True)
class FileRef:
    """
    Immutable reference to a file or document fragment.

    Attributes:
        uri: Location identifier (e.g., "file://...", "ipfs://...", "receipt://...")
        content_hash_sha256: SHA-256 hash of the referenced content
        byte_range: Optional (start, end) byte range for partial references
        label: Optional human-readable label
    """

    uri: str
    content_hash_sha256: str
    byte_range: Optional[tuple[int, int]] = None
    label: Optional[str] = None

    def to_dict(self) -> Dict[str, Any]:
        d: Dict[str, Any] = {
            "uri": self.uri,
            "content_hash_sha256": self.content_hash_sha256,
        }
        if self.byte_range is not None:
            d["byte_range"] = list(self.byte_range)
        if self.label is not None:
            d["label"] = self.label
        return d

    @classmethod
    def from_dict(cls, d: Dict[str, Any]) -> "FileRef":
        byte_range = d.get("byte_range")
        if byte_range is not None:
            byte_range = tuple(byte_range)
        return cls(
            uri=d["uri"],
            content_hash_sha256=d["content_hash_sha256"],
            byte_range=byte_range,
            label=d.get("label"),
        )


def compute_file_hash(content: bytes) -> str:
    """Compute SHA-256 hash of file content."""
    return hashlib.sha256(content).hexdigest()


def make_file_ref(
    *,
    uri: str,
    content: bytes,
    byte_range: Optional[tuple[int, int]] = None,
    label: Optional[str] = None,
) -> FileRef:
    """
    Create a FileRef from content bytes.

    If byte_range is provided, only that range is hashed.
    """
    if byte_range is not None:
        start, end = byte_range
        content = content[start:end]
    content_hash = compute_file_hash(content)
    return FileRef(
        uri=uri,
        content_hash_sha256=content_hash,
        byte_range=byte_range,
        label=label,
    )


def make_text_ref(
    *,
    uri: str,
    text: str,
    label: Optional[str] = None,
) -> FileRef:
    """
    Create a FileRef from text content (UTF-8 encoded).
    """
    content = text.encode("utf-8")
    return FileRef(
        uri=uri,
        content_hash_sha256=compute_file_hash(content),
        label=label,
    )


@dataclass(frozen=True)
class FrozenEvidenceBundle:
    """
    A bundle of frozen evidence references for audit linking.

    All analyst outputs MUST reference a FrozenEvidenceBundle.
    """

    bundle_id: str
    refs: tuple[FileRef, ...]
    frozen_at: str
    bundle_hash_sha256: str

    def to_dict(self) -> Dict[str, Any]:
        return {
            "bundle_id": self.bundle_id,
            "refs": [r.to_dict() for r in self.refs],
            "frozen_at": self.frozen_at,
            "bundle_hash_sha256": self.bundle_hash_sha256,
        }

    @classmethod
    def from_dict(cls, d: Dict[str, Any]) -> "FrozenEvidenceBundle":
        return cls(
            bundle_id=d["bundle_id"],
            refs=tuple(FileRef.from_dict(r) for r in d["refs"]),
            frozen_at=d["frozen_at"],
            bundle_hash_sha256=d["bundle_hash_sha256"],
        )


def freeze_evidence_bundle(
    *,
    bundle_id: str,
    refs: List[FileRef],
    frozen_at: Optional[str] = None,
) -> FrozenEvidenceBundle:
    """
    Create a frozen evidence bundle with a deterministic hash.

    The bundle_hash is computed from the canonical JSON of the refs,
    ensuring deterministic verification.
    """
    frozen_at = frozen_at or datetime.now(timezone.utc).isoformat()

    # Compute bundle hash from sorted refs (deterministic)
    refs_for_hash = sorted([r.to_dict() for r in refs], key=lambda x: x["uri"])
    bundle_hash = canon_sha256_hex(
        {
            "bundle_id": bundle_id,
            "refs": refs_for_hash,
            "frozen_at": frozen_at,
        }
    )

    return FrozenEvidenceBundle(
        bundle_id=bundle_id,
        refs=tuple(refs),
        frozen_at=frozen_at,
        bundle_hash_sha256=bundle_hash,
    )


def validate_file_ref(ref: FileRef, content: bytes) -> bool:
    """
    Validate that content matches the FileRef hash.

    Returns True if hash matches, False otherwise.
    """
    if ref.byte_range is not None:
        start, end = ref.byte_range
        content = content[start:end]
    actual_hash = compute_file_hash(content)
    return actual_hash == ref.content_hash_sha256
