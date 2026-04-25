"""Build Agreement Memory index rows from agreement drafts (never mutates proof artifacts).

Privacy / retention (SQLite ``memory_documents``):
  - ``search_blob``: concatenation of title, jurisdiction, purpose, payment_terms, duration,
    party names, and up to 8k chars of ``body_markdown`` (stored truncated to 12k) — **duplicates**
    substantive fields from the canonical draft file.
  - ``embedding_json``: vector of ``search_blob[:8000]`` via OpenAI embeddings API when enabled.
  - ``ai_summary``: one-sentence LLM summary; prompt includes up to 12k of ``search_blob`` when enabled.
  - ``party_names``, ``monetary_terms``, ``clause_tags``: derived or extracted; party names are PII.

Disable third-party calls without dropping the feature: set ``CLAW_AGREEMENT_MEMORY_OPENAI=0``
(embeddings + summary skipped; local ``search_blob`` and metadata rows still written).
"""

from __future__ import annotations

import json
import logging
import os
import re
from typing import Any, Dict, List, Optional

from backend.agreement_memory.timeline_probe import timeline_anchor_for_agreement
from backend.llm_router import OPENAI_API_KEY, call_legal_llm, embed_texts
from backend.security.safe_logging import exception_summary
from backend.services.agreement_draft_store import load_draft

log = logging.getLogger(__name__)


def agreement_memory_openai_indexing_enabled() -> bool:
    """When false, skip OpenAI embedding + LLM summary for memory (strict / air-gapped deployments)."""
    return os.getenv("CLAW_AGREEMENT_MEMORY_OPENAI", "1").strip().lower() not in (
        "0",
        "false",
        "no",
        "off",
    )


def _audit_events(draft: Dict[str, Any]) -> List[Dict[str, Any]]:
    out: List[Dict[str, Any]] = []
    for e in draft.get("audit_log") or []:
        if isinstance(e, dict):
            out.append(e)
    return out


def derive_document_status(draft: Dict[str, Any]) -> str:
    """High-level UX status for memory — not a legal determination."""
    events = _audit_events(draft)
    if any(str(e.get("event_type") or "") == "signed" for e in events):
        return "signed"
    if draft.get("workspace_archived_at"):
        return "archived"
    if draft.get("review_sent_at"):
        return "sent"
    # incomplete free draft expiry is handled in economics overlay, not here
    return "draft"


def _party_names(draft: Dict[str, Any]) -> List[str]:
    names: List[str] = []
    for p in draft.get("parties") or []:
        if not isinstance(p, dict):
            continue
        n = str(p.get("name") or "").strip()
        if n:
            names.append(n)
    return names


def _money_snippet(text: str) -> str:
    t = (text or "").strip()
    if not t:
        return ""
    found = re.findall(r"\$[\d,]+(?:\.\d{2})?(?:\s*(?:per|\/)\s*[a-z]+)?", t, flags=re.I)
    return "; ".join(found[:6]) if found else ""


def heuristic_clause_tags(blob: str) -> List[str]:
    t = (blob or "").lower()
    tags: List[str] = []
    pairs = [
        ("arbitration", "arbitrat"),
        ("confidentiality", "confidential"),
        ("late_payment", "late payment"),
        ("termination", "terminat"),
        ("indemnity", "indemnif"),
        ("limitation_of_liability", "limitation of liability"),
        ("force_majeure", "force majeure"),
        ("payment_terms", "payment"),
    ]
    for label, needle in pairs:
        if needle in t:
            tags.append(label)
    return tags


def _version_ids(draft: Dict[str, Any]) -> List[str]:
    vers = draft.get("versions") or []
    out: List[str] = []
    if isinstance(vers, list):
        for v in vers:
            if isinstance(v, dict):
                vid = str(v.get("version_id") or v.get("id") or "").strip()
                if vid:
                    out.append(vid)
    return out


def build_search_blob(draft: Dict[str, Any]) -> str:
    party_line = ", ".join(_party_names(draft))
    parts = [
        draft.get("title"),
        draft.get("jurisdiction"),
        draft.get("purpose"),
        draft.get("payment_terms"),
        draft.get("duration"),
        party_line,
        (draft.get("body_markdown") or "")[:8000],
    ]
    return "\n".join(str(p or "").strip() for p in parts if p)


def _optional_ai_summary(blob: str) -> Optional[str]:
    if not agreement_memory_openai_indexing_enabled():
        return None
    if not OPENAI_API_KEY or not (blob or "").strip():
        return None
    if os.getenv("CLAW_AGREEMENT_MEMORY_SUMMARY", "1").strip().lower() in ("0", "false", "no"):
        return None
    try:
        text = call_legal_llm(
            messages=[
                {
                    "role": "system",
                    "content": "Summarize the agreement in one concise sentence for workspace search. "
                    "No legal advice. No markdown.",
                },
                {"role": "user", "content": blob[:12000]},
            ],
            max_tokens=80,
            temperature=0.0,
            trace_context={"feature": "agreement_memory_summary"},
        )
        s = (text or "").strip()
        return s[:500] if s else None
    except Exception as exc:
        log.warning("agreement_memory summary failed exc_type=%s", exception_summary(exc))
        return None


def index_agreement_for_org(
    *,
    org_id: str,
    agreement_id: str,
    with_ai_summary: bool = True,
) -> Dict[str, Any]:
    raw = load_draft(agreement_id)
    blob = build_search_blob(raw)
    status = derive_document_status(raw)
    monetary = _money_snippet(
        " ".join(
            str(x or "")
            for x in (
                raw.get("payment_terms"),
                raw.get("purpose"),
                raw.get("body_markdown"),
            )
        )
    )
    clause_tags = heuristic_clause_tags(blob)
    ai_summary = _optional_ai_summary(blob) if with_ai_summary else None

    embedding_json = None
    model = os.getenv("CLAW_OPENAI_EMBEDDING_MODEL", "text-embedding-3-small").strip()
    if agreement_memory_openai_indexing_enabled() and OPENAI_API_KEY and blob.strip():
        try:
            vec = embed_texts([blob[:8000]], model=model)[0]
            embedding_json = json.dumps(vec)
        except Exception as exc:
            log.warning(
                "agreement_memory embed failed agreement_id=%s exc_type=%s",
                agreement_id,
                exception_summary(exc),
            )

    tl_id, tl_active = timeline_anchor_for_agreement(agreement_id)
    row = {
        "agreement_id": agreement_id,
        "org_id": org_id.strip(),
        "title": str(raw.get("title") or "").strip() or "Untitled agreement",
        "document_type": "agreement",
        "status": status,
        "party_names": _party_names(raw),
        "effective_date": str(raw.get("effective_date") or "").strip() or None,
        "monetary_terms": monetary or None,
        "clause_tags": clause_tags,
        "linked_timeline_id": tl_id,
        "linked_receipt_ids": [],
        "timeline_has_events": 1 if tl_active else 0,
        "version_ids": _version_ids(raw),
        "created_at": str(raw.get("created_at") or "") or None,
        "embedding_model": model if embedding_json else None,
        "embedding_json": embedding_json,
        "ai_summary": ai_summary,
        "clause_fingerprints": [{"tag": t} for t in clause_tags],
        "search_blob": blob[:12000],
    }
    return row
