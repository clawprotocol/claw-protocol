"""Review content binding for negotiation-review sessions (pre-lock drift detection)."""

from __future__ import annotations

import hashlib
from typing import Any, Dict, Optional

from backend.security.negotiation_review_version_binding import (
    authoritative_review_version_binding,
    normalize_bound_version_id,
)


def _clean(value: Any) -> str:
    return str(value or "").strip()


def review_content_binding_sha256(draft: Dict[str, Any]) -> str:
    """Stable SHA-256 over the recipient-visible review corpus snapshot."""
    from backend.utils.canon_json import canon_json_bytes

    parties: list[Dict[str, Any]] = []
    for party in draft.get("parties") or []:
        if not isinstance(party, dict):
            continue
        parties.append(
            {
                "id": _clean(party.get("id")) or None,
                "name": _clean(party.get("name")) or "Party",
                "role": _clean(party.get("role")) or "party",
            }
        )
    snapshot = {
        "title": _clean(draft.get("title")),
        "jurisdiction": _clean(draft.get("jurisdiction")),
        "parties": parties,
        "purpose": _clean(draft.get("purpose")),
        "payment_terms": _clean(draft.get("payment_terms")),
        "duration": draft.get("duration"),
        "due_date": draft.get("due_date"),
        "effective_date": draft.get("effective_date"),
    }
    pro_redline = draft.get("pro_redline_v1")
    if isinstance(pro_redline, dict):
        corpus = pro_redline.get("review_first_final_corpus")
        if isinstance(corpus, dict):
            text = _clean(corpus.get("text"))
            if text:
                snapshot["review_first_final_corpus"] = {
                    "text": text,
                    "hash": _clean(corpus.get("hash")) or None,
                    "source": _clean(corpus.get("source")) or None,
                }
    return hashlib.sha256(canon_json_bytes(snapshot)).hexdigest()


def authoritative_review_binding(
    *,
    signing_lock: Optional[Dict[str, Any]],
    draft: Dict[str, Any],
) -> Dict[str, str]:
    version = authoritative_review_version_binding(signing_lock)
    out = {
        "locked_version_id": version,
        "content_sha256": review_content_binding_sha256(draft),
    }
    return out


def review_bindings_match(
    *,
    signing_lock: Optional[Dict[str, Any]],
    draft: Dict[str, Any],
    bound_version_id: Any,
    bound_content_sha256: Any,
) -> bool:
    current_version = authoritative_review_version_binding(signing_lock)
    bound_version = normalize_bound_version_id(bound_version_id)
    if current_version != bound_version:
        return False
    current_content = review_content_binding_sha256(draft)
    bound_content = _clean(bound_content_sha256)
    if not bound_content:
        return False
    return current_content == bound_content


def assert_review_bindings_match(
    *,
    signing_lock: Optional[Dict[str, Any]],
    draft: Dict[str, Any],
    bound_version_id: Any,
    bound_content_sha256: Any,
) -> None:
    if not review_bindings_match(
        signing_lock=signing_lock,
        draft=draft,
        bound_version_id=bound_version_id,
        bound_content_sha256=bound_content_sha256,
    ):
        from backend.services.negotiation_review_bootstrap_exchange import (
            NegotiationReviewBootstrapExchangeError,
        )

        raise NegotiationReviewBootstrapExchangeError()
