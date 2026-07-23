"""Agreement Memory API — semantic retrieval; premium-gated; never touches proof stores."""

from __future__ import annotations

import json
import logging
from collections import Counter
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, HTTPException, Query, Request
from pydantic import BaseModel, Field

from backend.agreement_memory.access import agreement_memory_tier_for_subject
from backend.agreement_memory.indexer import (
    agreement_memory_openai_indexing_enabled,
    build_search_blob,
    index_agreement_for_org,
)
from backend.agreement_memory.search import rank_by_embedding
from backend.agreement_memory.store import get_agreement_memory_store
from backend.llm_router import OPENAI_API_KEY, embed_texts
from backend.services.agreement_draft_store import list_draft_agreement_ids_newest_first, load_draft
from backend.usage_economics.policy import (
    assert_registered_owner_matches,
    require_claw_org_id_header,
    workspace_lists_agreement_for_subject,
)
from backend.utils.enforce import resolve_subject_from_request

log = logging.getLogger(__name__)

router = APIRouter(prefix="/api/agreement-memory", tags=["agreement-memory"])


def _subject(request: Request) -> str:
    return resolve_subject_from_request(request)


def _require_memory_tier(request: Request, minimum: str) -> tuple[str, str]:
    oid = require_claw_org_id_header(request)
    from backend.security.commercial_auth import require_commercial_owner_principal
    require_commercial_owner_principal(request)
    subj = _subject(request)
    tier = agreement_memory_tier_for_subject(subj)
    order = ("none", "standard", "full")
    if order.index(tier) < order.index(minimum):
        raise HTTPException(
            status_code=403,
            detail={
                "code": "agreement_memory_paywall",
                "paywall": True,
                "message": "Find and reuse what already worked. Upgrade to unlock Agreement Memory — search by meaning and start from previous agreements.",
            },
        )
    return subj, oid


class MemorySearchBody(BaseModel):
    query: str = Field(..., min_length=1, max_length=2000)
    limit: int = Field(12, ge=1, le=40)


class MemoryIndexBody(BaseModel):
    agreement_id: str = Field(..., min_length=1)


@router.get("/status")
def agreement_memory_status(request: Request) -> Dict[str, Any]:
    """Public to org: tier + capabilities (no indexing)."""
    oid = require_claw_org_id_header(request)
    from backend.security.commercial_auth import require_commercial_owner_principal
    require_commercial_owner_principal(request)
    subj = _subject(request)
    tier = agreement_memory_tier_for_subject(subj)
    store = get_agreement_memory_store()
    store.init_schema()
    doc_count = store.count_documents_for_org(oid)
    meta = store.get_org_reindex_meta(oid) or {}
    last_sync = str(meta.get("last_reindex_at") or "").strip() or None
    index_health = "empty"
    if doc_count > 0:
        index_health = "synced" if last_sync else "needs_sync"
    elif last_sync:
        index_health = "empty"
    return {
        "tier": tier,
        "semantic_search": tier != "none",
        "similar_agreements": tier != "none",
        "clause_reuse_hints": tier != "none",
        "relationship_view": tier == "full",
        "embedding_configured": bool(OPENAI_API_KEY),
        "openai_memory_indexing_enabled": agreement_memory_openai_indexing_enabled(),
        "indexed_document_count": doc_count,
        "last_sync_at": last_sync,
        "index_health": index_health,
    }


@router.post("/reindex-workspace")
def agreement_memory_reindex_workspace(request: Request) -> Dict[str, Any]:
    subj, oid = _require_memory_tier(request, "standard")
    store = get_agreement_memory_store()
    store.init_schema()
    indexed = 0
    errors: List[str] = []
    for aid in list_draft_agreement_ids_newest_first():
        if not workspace_lists_agreement_for_subject(aid, subj):
            continue
        try:
            row = index_agreement_for_org(org_id=oid, agreement_id=aid, with_ai_summary=True)
            store.upsert_document(row)
            indexed += 1
            try:
                from backend.integrations.hooks_emit import claw_emit_integration_event

                claw_emit_integration_event(
                    oid,
                    "agreement.memory.indexed",
                    "agreement",
                    aid,
                    {"surface": "reindex_workspace"},
                )
            except Exception:
                pass
        except Exception as e:
            log.exception("reindex failed for %s", aid)
            errors.append(f"{aid}: {e}")
    store.record_org_reindex(oid, indexed)
    meta = store.get_org_reindex_meta(oid) or {}
    return {
        "ok": True,
        "indexed": indexed,
        "last_sync_at": meta.get("last_reindex_at"),
        "errors": errors[:20],
    }


@router.post("/index")
def agreement_memory_index_one(body: MemoryIndexBody, request: Request) -> Dict[str, Any]:
    _, oid = _require_memory_tier(request, "standard")
    assert_registered_owner_matches(request, body.agreement_id)
    row = index_agreement_for_org(org_id=oid, agreement_id=body.agreement_id.strip(), with_ai_summary=True)
    store = get_agreement_memory_store()
    store.init_schema()
    store.upsert_document(row)
    aid1 = body.agreement_id.strip()
    try:
        from backend.integrations.hooks_emit import claw_emit_integration_event

        claw_emit_integration_event(
            oid,
            "agreement.memory.indexed",
            "agreement",
            aid1,
            {"surface": "single_index"},
        )
    except Exception:
        pass
    return {"ok": True, "agreement_id": aid1}


@router.post("/search")
def agreement_memory_search(body: MemorySearchBody, request: Request) -> Dict[str, Any]:
    _, oid = _require_memory_tier(request, "standard")
    if not agreement_memory_openai_indexing_enabled():
        raise HTTPException(
            status_code=503,
            detail={
                "code": "agreement_memory_openai_disabled",
                "message": "Semantic Agreement Memory search is off (CLAW_AGREEMENT_MEMORY_OPENAI=0).",
            },
        )
    if not OPENAI_API_KEY:
        raise HTTPException(
            status_code=503,
            detail={
                "code": "embeddings_unavailable",
                "message": "Semantic search requires OPENAI_API_KEY on the server.",
            },
        )
    store = get_agreement_memory_store()
    store.init_schema()
    corpus = store.get_embedding_rows_for_org(oid)
    if not corpus:
        return {
            "results": [],
            "note": "No indexed agreements yet. Use “Sync workspace” to build Agreement Memory.",
        }
    model = __import__("os").environ.get("CLAW_OPENAI_EMBEDDING_MODEL", "text-embedding-3-small").strip()
    try:
        q_emb = embed_texts([body.query.strip()[:2000]], model=model)[0]
    except Exception as e:
        log.exception("query embed failed")
        raise HTTPException(status_code=502, detail=f"embedding_failed: {e}") from e

    ranked = rank_by_embedding(q_emb, corpus, top_k=body.limit)
    results: List[Dict[str, Any]] = []
    for row, score in ranked:
        aid = str(row.get("agreement_id") or "")
        try:
            parties = json.loads(row["party_names_json"]) if row.get("party_names_json") else []
        except Exception:
            parties = []
        try:
            clauses = json.loads(row["clause_tags_json"]) if row.get("clause_tags_json") else []
        except Exception:
            clauses = []
        try:
            version_ids = json.loads(row["version_ids_json"]) if row.get("version_ids_json") else []
        except Exception:
            version_ids = []
        mem_updated = str(row.get("updated_at") or "").strip() or None
        tl_id = str(row.get("linked_timeline_id") or "").strip() or None
        try:
            th = bool(int(row.get("timeline_has_events") or 0))
        except Exception:
            th = False
        reason = (
            f"Semantic match ({score:.2f}). Assistive only — verify the live agreement."
            if score > 0
            else "Indexed match (low score — try different wording)."
        )
        timeline_path = f"/app/verification/{aid}" if th else None
        results.append(
            {
                "agreement_id": aid,
                "title": row.get("title"),
                "status": row.get("status"),
                "match_score": round(score, 4),
                "reason": reason,
                "related_parties": parties,
                "relevant_clauses": clauses,
                "ai_summary": row.get("ai_summary"),
                "memory_updated_at": mem_updated,
                "version_count": len(version_ids) if isinstance(version_ids, list) else 0,
                "linked_timeline_id": tl_id,
                "timeline_available": th,
                "actions": {
                    "open": f"/app/agreements/{aid}",
                    "compare": f"/app/agreements/{aid}?memoryCompare=1",
                    "timeline": timeline_path,
                },
            }
        )
    return {"results": results, "model": model}


@router.post("/similar/{agreement_id}")
def agreement_memory_similar(agreement_id: str, request: Request, limit: int = 8) -> Dict[str, Any]:
    _, oid = _require_memory_tier(request, "standard")
    aid = agreement_id.strip()
    assert_registered_owner_matches(request, aid)
    store = get_agreement_memory_store()
    store.init_schema()
    row = store.get_one(oid, aid)
    if not agreement_memory_openai_indexing_enabled():
        raise HTTPException(
            status_code=503,
            detail={
                "code": "agreement_memory_openai_disabled",
                "message": "Similar-agreement retrieval requires OpenAI memory indexing (CLAW_AGREEMENT_MEMORY_OPENAI=0).",
            },
        )
    if not OPENAI_API_KEY:
        raise HTTPException(status_code=503, detail="embeddings_unavailable")
    corpus = store.get_embedding_rows_for_org(oid)
    if not row or not row.get("embedding_json"):
        try:
            raw = load_draft(aid)
            blob = build_search_blob(raw)
            model = __import__("os").environ.get("CLAW_OPENAI_EMBEDDING_MODEL", "text-embedding-3-small").strip()
            q_emb = embed_texts([blob[:8000]], model=model)[0]
        except Exception as e:
            raise HTTPException(status_code=400, detail=f"similarity_source_failed: {e}") from e
    else:
        try:
            q_emb = json.loads(str(row["embedding_json"]))
        except Exception:
            raise HTTPException(status_code=500, detail="bad_stored_embedding")
        model = str(row.get("embedding_model") or "text-embedding-3-small")

    others = [r for r in corpus if str(r.get("agreement_id")) != aid]
    ranked = rank_by_embedding(q_emb, others, top_k=max(1, min(limit, 20)))
    results = []
    for r, score in ranked:
        oaid = str(r.get("agreement_id") or "")
        results.append(
            {
                "agreement_id": oaid,
                "title": r.get("title"),
                "status": r.get("status"),
                "match_score": round(score, 4),
                "reason": "Similar semantic profile (assistive only).",
            }
        )
    return {"agreement_id": aid, "similar": results, "model": model}


def _workspace_clause_themes(docs: List[Dict[str, Any]], limit: int = 14) -> List[Dict[str, Any]]:
    c: Counter[str] = Counter()
    for d in docs:
        for t in d.get("clause_tags") or []:
            c[str(t)] += 1
    return [{"tag": k, "count": v} for k, v in c.most_common(limit)]


@router.get("/relationships")
def agreement_memory_relationships(
    request: Request,
    for_agreement_id: Optional[str] = Query(None),
) -> Dict[str, Any]:
    """Structured workspace + focus panel for full tier — index metadata only."""
    _, oid = _require_memory_tier(request, "full")
    store = get_agreement_memory_store()
    store.init_schema()
    docs = store.list_by_org(oid)
    themes = _workspace_clause_themes(docs)
    overview = [
        {
            "agreement_id": str(d.get("agreement_id") or ""),
            "title": d.get("title"),
            "status": d.get("status"),
            "party_count": len(d.get("party_names") or []),
            "top_clauses": (d.get("clause_tags") or [])[:5],
        }
        for d in docs[:40]
    ]
    disclaimer = (
        "Workspace relationships are assistive and derived from Agreement Memory metadata only — "
        "not cryptographic proof."
    )
    out: Dict[str, Any] = {
        "disclaimer": disclaimer,
        "workspace_clause_themes": themes,
        "indexed_agreements": overview,
    }
    aid = (for_agreement_id or "").strip()
    if not aid:
        return out

    focus_doc = store.get_one(oid, aid)
    if not focus_doc:
        raise HTTPException(status_code=404, detail="agreement_not_in_memory")

    parties_focus = [str(x).strip() for x in (focus_doc.get("party_names") or []) if str(x).strip()]
    party_l = {p.lower() for p in parties_focus}
    related: List[Dict[str, Any]] = []
    for d in docs:
        oth = str(d.get("agreement_id") or "")
        if oth == aid:
            continue
        onames = [str(x).strip() for x in (d.get("party_names") or []) if str(x).strip()]
        shared = [p for p in onames if p.lower() in party_l]
        if not shared:
            continue
        related.append(
            {
                "agreement_id": oth,
                "title": d.get("title"),
                "status": d.get("status"),
                "shared_parties": shared,
            }
        )
    related.sort(key=lambda x: len(x.get("shared_parties") or []), reverse=True)
    vids = focus_doc.get("version_ids") or []
    try:
        th = bool(int(focus_doc.get("timeline_has_events") or 0))
    except Exception:
        th = False
    out["focus"] = {
        "agreement_id": aid,
        "title": focus_doc.get("title"),
        "status": focus_doc.get("status"),
        "related_parties": parties_focus,
        "clause_tags": focus_doc.get("clause_tags") or [],
        "versions": vids if isinstance(vids, list) else [],
        "versions_count": len(vids) if isinstance(vids, list) else 0,
        "linked_timeline_id": focus_doc.get("linked_timeline_id"),
        "timeline_has_activity": th,
        "timeline_verify_path": f"/app/verification/{aid}",
        "memory_updated_at": focus_doc.get("updated_at"),
        "receipt_links": focus_doc.get("linked_receipt_ids") or [],
    }
    out["related_agreements"] = related[:24]
    return out
