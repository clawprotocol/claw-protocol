import json
import logging
import time
from typing import Any, Dict, List, Tuple

from backend.config import (
    MAX_CLAUSES_SYNC,
    CLEAN_BATCH_SIZE,
    MAX_TOTAL_CHARS,
    REQUEST_TIMEOUT_SECONDS,
    ROLE_LIMIT_MULTIPLIERS,
    DEFAULT_ROLE,
)
from backend.handlers.clause_clean import normalize_clauses
from backend.models.clauses import Clause

logger = logging.getLogger(__name__)


def _apply_role_limits(num_clauses: int, total_chars: int, role: str) -> None:
    """
    Enforce per-role limits so we don't blow up the backend or your wallet.
    """
    role_key = (role or DEFAULT_ROLE).upper()
    multiplier = ROLE_LIMIT_MULTIPLIERS.get(role_key, ROLE_LIMIT_MULTIPLIERS["PUBLIC"])

    allowed_clauses = int(MAX_CLAUSES_SYNC * multiplier)
    allowed_chars = int(MAX_TOTAL_CHARS * multiplier)

    if num_clauses > allowed_clauses:
        raise ValueError(
            f"Too many clauses for role={role_key}: {num_clauses} > {allowed_clauses}. "
            "Try sending fewer clauses or enabling async/batch mode."
        )

    if total_chars > allowed_chars:
        raise ValueError(
            f"Clause text too large for role={role_key}: {total_chars} chars > {allowed_chars} chars. "
            "Consider chunking or using the async pipeline."
        )


def clean_clauses_pipeline(
    raw_clauses: List[str],
    role: str = "PUBLIC",
) -> Tuple[List[Clause], Dict[str, Any]]:
    """
    Enterprise cleaning pipeline:
    - Enforces per-role limits
    - Batches clause cleaning
    - Adds basic timeout + logging
    - Returns (cleaned_clauses, meta)
    """
    if not raw_clauses:
        return [], {
            "batches": 0,
            "batch_sizes": [],
            "total_clauses_in": 0,
            "total_clauses_out": 0,
            "role": role,
            "duration_sec": 0.0,
        }

    role_key = (role or DEFAULT_ROLE).upper()

    num_clauses = len(raw_clauses)
    total_chars = sum(len(c or "") for c in raw_clauses)

    # Hard guard based on role
    _apply_role_limits(num_clauses, total_chars, role_key)

    cleaned: List[Clause] = []
    batch_sizes: List[int] = []

    start_time = time.time()

    for start_idx in range(0, num_clauses, CLEAN_BATCH_SIZE):
        batch = raw_clauses[start_idx : start_idx + CLEAN_BATCH_SIZE]
        batch_sizes.append(len(batch))

        # Timeout guard
        elapsed = time.time() - start_time
        if elapsed > REQUEST_TIMEOUT_SECONDS:
            logger.error(
                "Cleaning pipeline timeout after %.2f seconds at clause %d",
                elapsed,
                start_idx,
            )
            break

        try:
            # Existing normalizer – assumed to return List[Clause]
            batch_cleaned = normalize_clauses(batch)
            cleaned.extend(batch_cleaned)

        except Exception as e:
            logger.exception("Error cleaning batch starting at %d: %s", start_idx, e)
            # Fallback: wrap raw strings into minimal Clause objects
            for text in batch:
                cleaned.append(
                    Clause(
                        text=text,
                        id=None,
                        type=None,
                        tags=[],
                    )
                )

    duration = time.time() - start_time

    meta: Dict[str, Any] = {
        "batches": len(batch_sizes),
        "batch_sizes": batch_sizes,
        "total_clauses_in": num_clauses,
        "total_clauses_out": len(cleaned),
        "role": role_key,
        "duration_sec": round(duration, 3),
    }

    return cleaned, meta


def stream_clauses_pipeline(raw_clauses: List[str], role: str = "PUBLIC"):
    """
    Simple JSON-lines streamer for future UI:
    - Yields each cleaned clause as a JSON line
    - Ends with a `_meta` line

    NOTE: Swagger won't show partial streaming results,
    but custom front-ends (CLAW-Key, Doginal-Dogs console, etc.)
    can consume this easily.
    """
    cleaned, meta = clean_clauses_pipeline(raw_clauses, role)

    for clause in cleaned:
        # Clause is a Pydantic model
        yield json.dumps(clause.model_dump()) + "\n"

    yield json.dumps({"_meta": meta}) + "\n"
