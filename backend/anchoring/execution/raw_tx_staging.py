"""Resolve signed raw transaction hex for HTTP broadcast providers (no Core wallet on the worker)."""

from __future__ import annotations

import os
from pathlib import Path
from typing import Any, Dict, Optional


def resolve_signed_raw_tx_hex(
    *,
    commitment_hex: str,
    metadata: Optional[Dict[str, Any]],
) -> str:
    """
    Precedence:

    1. ``metadata["signed_raw_tx_hex"]`` (tests / tightly coupled callers).
    2. File ``{CLAW_ANCHOR_SIGNED_RAW_TX_DIR}/{anchor_job_id}.hex`` when ``anchor_job_id`` is set.
    3. File ``{CLAW_ANCHOR_SIGNED_RAW_TX_DIR}/{commitment_hex}.hex`` (lowercase).

    Raises ``ValueError`` with a short operator hint if nothing is found.
    """
    meta = metadata or {}
    inline = str(meta.get("signed_raw_tx_hex") or "").strip()
    if inline:
        return _validate_hex_payload(inline, source="metadata.signed_raw_tx_hex")

    base = os.getenv("CLAW_ANCHOR_SIGNED_RAW_TX_DIR", "").strip()
    if not base:
        raise ValueError(
            "signed_raw_tx_missing: set CLAW_ANCHOR_SIGNED_RAW_TX_DIR and stage "
            "<job_id>.hex / <commitment>.hex, or pass signed_raw_tx_hex in metadata"
        )

    root = Path(base).expanduser()
    aj = str(meta.get("anchor_job_id") or "").strip()
    candidates: list[Path] = []
    if aj:
        candidates.append(root / f"{aj}.hex")
    c = (commitment_hex or "").strip().lower()
    if len(c) == 64:
        candidates.append(root / f"{c}.hex")

    for p in candidates:
        try:
            if p.is_file():
                raw = p.read_text(encoding="utf-8").strip()
                return _validate_hex_payload(raw, source=str(p))
        except OSError:
            continue

    raise ValueError(
        f"signed_raw_tx_missing: no file for anchor_job_id={aj!r} or commitment under {root}"
    )


def _validate_hex_payload(s: str, *, source: str) -> str:
    h = "".join(s.split()).lower()
    if not h or len(h) < 20 or any(c not in "0123456789abcdef" for c in h):
        raise ValueError(f"signed_raw_tx_invalid_hex:{source}")
    return h
