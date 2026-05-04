"""Deterministic paragraph/block-level diff for Pro redline import v1 (not LLM source of truth)."""

from __future__ import annotations

import re
from difflib import SequenceMatcher
from typing import Any, Dict, List, Literal, Tuple

BlockKind = Literal["equal", "added", "removed", "changed"]


def _split_blocks(text: str) -> List[str]:
    t = (text or "").replace("\r\n", "\n").strip()
    if not t:
        return []
    parts = re.split(r"\n{2,}", t)
    out = [p.strip() for p in parts if p.strip()]
    if not out:
        return [t] if t else []
    return out


def compute_pro_redline_block_diff(base: str, imported: str) -> Tuple[List[Dict[str, Any]], int]:
    """
    Compare two plain-text documents at paragraph / double-newline block granularity.
    Returns (blocks, changed_block_count) where changed excludes purely equal runs.
    """
    a = _split_blocks(base)
    b = _split_blocks(imported)
    sm = SequenceMatcher(a=a, b=b, autojunk=False)
    blocks: List[Dict[str, Any]] = []
    changed = 0
    for tag, i1, i2, j1, j2 in sm.get_opcodes():
        if tag == "equal":
            chunk = "\n\n".join(a[i1:i2])
            if chunk.strip():
                blocks.append({"kind": "equal", "text": chunk})
        elif tag == "replace":
            left = "\n\n".join(a[i1:i2]).strip()
            right = "\n\n".join(b[j1:j2]).strip()
            if left and right:
                blocks.append({"kind": "changed", "removed_text": left, "added_text": right})
                changed += 1
            elif left:
                blocks.append({"kind": "removed", "text": left})
                changed += 1
            elif right:
                blocks.append({"kind": "added", "text": right})
                changed += 1
        elif tag == "delete":
            left = "\n\n".join(a[i1:i2]).strip()
            if left:
                blocks.append({"kind": "removed", "text": left})
                changed += 1
        elif tag == "insert":
            right = "\n\n".join(b[j1:j2]).strip()
            if right:
                blocks.append({"kind": "added", "text": right})
                changed += 1
    return blocks, changed
