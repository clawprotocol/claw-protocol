"""Vector similarity for Agreement Memory (assistive retrieval only)."""

from __future__ import annotations

import json
import math
from typing import Any, Dict, List, Tuple


def _parse_embedding(raw: str) -> List[float]:
    try:
        v = json.loads(raw)
        return [float(x) for x in v] if isinstance(v, list) else []
    except Exception:
        return []


def cosine_similarity(a: List[float], b: List[float]) -> float:
    if not a or not b or len(a) != len(b):
        return 0.0
    dot = sum(x * y for x, y in zip(a, b))
    na = math.sqrt(sum(x * x for x in a))
    nb = math.sqrt(sum(y * y for y in b))
    if na <= 0 or nb <= 0:
        return 0.0
    return dot / (na * nb)


def rank_by_embedding(
    query_embedding: List[float],
    corpus: List[Dict[str, Any]],
    *,
    top_k: int = 12,
) -> List[Tuple[Dict[str, Any], float]]:
    scored: List[Tuple[Dict[str, Any], float]] = []
    for row in corpus:
        raw = row.get("embedding_json")
        if not isinstance(raw, str) or not raw.strip():
            continue
        emb = _parse_embedding(raw)
        if not emb:
            continue
        scored.append((row, cosine_similarity(query_embedding, emb)))
    scored.sort(key=lambda x: x[1], reverse=True)
    return scored[: max(1, top_k)]
