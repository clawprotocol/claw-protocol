# backend/audit.py

from typing import Dict, Any, List


def audit_proof(packet: Dict[str, Any], options: Dict[str, Any] | None = None) -> Dict[str, Any]:
    """
    Attach lightweight audit information into packet['meta']['audit'].
    Currently: simple counts of clauses & flagged clauses.
    """
    if options is None:
        options = {}

    meta = packet.setdefault("meta", {})
    audits = meta.setdefault("audit", {})

    clauses: List[Dict[str, Any]] = packet.get("clauses", [])

    total = len(clauses)
    flagged = 0

    for c in clauses:
        if isinstance(c, dict) and c.get("risk_flags"):
            flagged += 1

    audits.setdefault("total_clauses", total)
    audits.setdefault("total_flagged_clauses", flagged)
    audits.setdefault("status", "ok")

    return packet
