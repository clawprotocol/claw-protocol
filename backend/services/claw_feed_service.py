from __future__ import annotations

import uuid
from typing import Any, Dict, List, Literal, Optional

from backend.config.anchor_network_config import ALLOWED_AGREEMENT_ANCHOR_NETWORKS
from backend.config.feed_anchor_policy import feed_event_anchor_network_default
from backend.services.agreement_draft_store import load_draft
from backend.services.claw_feed_store import get_claw_feed_store
from backend.utils.canon_json import canon_sha256_hex

FeedEventType = Literal["created", "revision_applied", "finalized", "signed"]


def _truncate(s: str, max_len: int = 280) -> str:
    t = (s or "").strip()
    if len(t) <= max_len:
        return t
    return t[: max_len - 1] + "…"


def _anonymize_party_name(idx: int) -> str:
    return f"Participant {idx + 1}"


def build_feed_summary_and_participants(
    *,
    draft_dict: Dict[str, Any],
    event_type: str,
    anonymize_parties: bool,
    show_financial_hint: bool,
) -> tuple[str, List[Dict[str, str]]]:
    """
    Privacy-safe summary for public feed. Never includes purpose, payment_terms content, or full body.
    """
    title = str(draft_dict.get("title") or "").strip() or "Agreement"
    jurisdiction = str(draft_dict.get("jurisdiction") or "").strip()

    parties_raw = draft_dict.get("parties") or []
    participants: List[Dict[str, str]] = []
    if isinstance(parties_raw, list):
        for i, p in enumerate(parties_raw):
            if not isinstance(p, dict):
                continue
            role = str(p.get("role") or "party").strip() or "party"
            if anonymize_parties:
                name = _anonymize_party_name(i)
            else:
                name = str(p.get("name") or "").strip() or _anonymize_party_name(i)
            participants.append({"name": name, "role": role})

    labels: Dict[str, str] = {
        "created": "Agreement workspace created",
        "revision_applied": "Revision applied",
        "finalized": "Locked for signing",
        "signed": "Fully executed",
    }
    et = (event_type or "").strip()
    base = labels.get(et, et.replace("_", " ").title() or "Event")
    bits = [base, f"“{title}”"]
    if jurisdiction:
        bits.append(jurisdiction)
    fin = ""
    if show_financial_hint:
        pt = str(draft_dict.get("payment_terms") or "").strip()
        if pt:
            fin = " · Payment terms on file (redacted detail)"
    summary = _truncate(" · ".join(bits) + fin)
    return summary, participants


def feed_commitment_sha256_hex(
    *,
    event_id: str,
    agreement_id: str,
    event_type: str,
    at: str,
    summary: str,
    anchor_network: str,
) -> str:
    payload = {
        "schema": "claw.feed_event/v1",
        "event_id": event_id,
        "agreement_id": agreement_id,
        "event_type": event_type,
        "at": at,
        "summary": summary,
        "anchor_network": anchor_network,
    }
    return canon_sha256_hex(payload)


def record_public_feed_event_if_applicable(
    *,
    draft_dict: Dict[str, Any],
    event_type: FeedEventType,
    at: str,
) -> Optional[str]:
    vis = str(draft_dict.get("feed_visibility") or "private").strip().lower()
    if vis != "public":
        return None

    aid = str(draft_dict.get("id") or "").strip()
    if not aid:
        return None

    net = str(
        draft_dict.get("feed_anchor_network") or feed_event_anchor_network_default()
    ).strip()
    if net not in ALLOWED_AGREEMENT_ANCHOR_NETWORKS:
        net = feed_event_anchor_network_default()

    anonymize = bool(draft_dict.get("feed_party_anonymize"))
    show_fin = bool(draft_dict.get("feed_show_financial_summary"))
    summary, _parts = build_feed_summary_and_participants(
        draft_dict=draft_dict,
        event_type=event_type,
        anonymize_parties=anonymize,
        show_financial_hint=show_fin,
    )

    event_id = str(uuid.uuid4())
    commitment = feed_commitment_sha256_hex(
        event_id=event_id,
        agreement_id=aid,
        event_type=event_type,
        at=at,
        summary=summary,
        anchor_network=net,
    )
    store = get_claw_feed_store()
    store.insert_feed_event_pending(
        event_id=event_id,
        agreement_id=aid,
        event_type=event_type,
        at=at,
        summary=summary,
        visibility="public",
        anchor_network=net,
        commitment_hex=commitment,
    )
    return event_id


def list_public_feed_safe(*, limit: int) -> List[Dict[str, Any]]:
    """Drop entries if the agreement is no longer public (opt-out / visibility change)."""
    store = get_claw_feed_store()
    rows = store.list_public_feed_events(limit=limit * 4)
    out: List[Dict[str, Any]] = []
    for r in rows:
        aid = str(r.get("agreement_id") or "").strip()
        if not aid:
            continue
        try:
            d = load_draft(aid)
        except Exception:
            continue
        if str(d.get("feed_visibility") or "private").strip().lower() != "public":
            continue
        et = str(r.get("event_type") or "")
        anonymize = bool(d.get("feed_party_anonymize"))
        show_fin = bool(d.get("feed_show_financial_summary"))
        summary, participants = build_feed_summary_and_participants(
            draft_dict=d,
            event_type=et,
            anonymize_parties=anonymize,
            show_financial_hint=show_fin,
        )
        item = {
            **r,
            "summary": summary,
            "participants": participants,
        }
        out.append(item)
        if len(out) >= limit:
            break
    return out
