# backend/handlers/process_handler.py

from typing import Any, Dict, List
import hashlib
import time
import logging

from services.extraction_service import extract_from_bytes
from backend.handlers.clause_clean import normalize_clauses
from backend.handlers.proof_handler import generate_proof_packet
from backend.models.clauses import Clause

logger = logging.getLogger(__name__)


def run_full_pipeline(
    file_bytes: bytes,
    filename: str,
    options: Dict[str, Any] | None = None,
) -> Dict[str, Any]:
    """
    Unified CLAW processor:
    PDF/DOCX -> extract -> clean -> proof (+ audit, timestamps).
    """
    if options is None:
        options = {}

    meta: Dict[str, Any] = {"filename": filename}

    mode = options.get("mode", "auto")
    max_cost = options.get("max_cost_usd", 0)
    fallback_simple = options.get("fallback_simple", True)

    enable_audit = options.get("enable_audit", False)
    enable_timestamp = options.get("enable_timestamp", False)
    timestamp_provider = options.get("timestamp_provider", "local")

    t0 = time.time()
    doc_fp = hashlib.sha256(file_bytes).hexdigest()[:16]

    # 1) EXTRACT
    logger.info("[CLAW] Starting extraction mode=%s doc_fp=%s", mode, doc_fp)
    raw_clauses: List[str] = extract_from_bytes(
        file_bytes=file_bytes,
        filename=filename,
        mode=mode,
        max_cost=max_cost,
        fallback_simple=fallback_simple,
    )
    t1 = time.time()
    meta["extract_ms"] = int((t1 - t0) * 1000)
    meta["raw_clause_count"] = len(raw_clauses)

    # 2) CLEAN / STRUCTURE
    logger.info("[CLAW] Cleaning/structuring clause_count=%s doc_fp=%s", len(raw_clauses), doc_fp)
    structured: List[Clause] = normalize_clauses(raw_clauses)
    t2 = time.time()
    meta["clean_ms"] = int((t2 - t1) * 1000)
    meta["cleaned_clause_count"] = len(structured)

    structured_dicts: List[Dict[str, Any]] = [
        c.dict() if hasattr(c, "dict") else c for c in structured
    ]

    # 3) PROOF PACKET
    logger.info("[CLAW] Generating proof packet doc_fp=%s", doc_fp)
    proof_packet: Dict[str, Any] = generate_proof_packet(
        structured_dicts,
        options={
            "enable_audit": enable_audit,
            "enable_timestamp": enable_timestamp,
            "timestamp_provider": timestamp_provider,
        },
    )
    t3 = time.time()
    meta["proof_ms"] = int((t3 - t2) * 1000)
    meta["total_ms"] = int((t3 - t0) * 1000)

    meta.setdefault("pipeline_flags", {})
    meta["pipeline_flags"].update(
        {
            "lawyer_dao_ready": True,
            "multiparty_ready": True,
            "energy_contract_ready": True,
            "litigation_workflow_ready": True,
            "claw_key_ready": True,
        }
    )

    return {
        "meta": meta,
        "raw_clauses": raw_clauses,
        "cleaned_clauses": structured_dicts,
        "proof_packet": proof_packet,
    }
