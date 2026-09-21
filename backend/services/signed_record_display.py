"""Derived display fields for completed / signed records.

Does not rewrite accepted or signed paper. Prefer the stored corpus heading
over a stale intake or draft title when presenting the final record.
"""

from __future__ import annotations

import re
from typing import Any, Dict

_THIS_AGREEMENT_TITLE_RE = re.compile(
    r"\bThis\s+((?:Mutual\s+)?[A-Z][A-Za-z0-9,&'\"\-\s]{3,100}Agreement)\b"
)


def _draft_as_dict(draft: Any) -> Dict[str, Any]:
    if isinstance(draft, dict):
        return draft
    if hasattr(draft, "model_dump"):
        dumped = draft.model_dump()
        if isinstance(dumped, dict):
            return dumped
    return {}


def _to_title_case_agreement(raw: str) -> str:
    return re.sub(r"\s+", " ", raw).strip().title()


def extract_title_from_corpus_plain(corpus: str | None) -> str:
    body = str(corpus or "").replace("\r\n", "\n").strip()
    if len(body) < 40:
        return ""
    opening = body[:2_500]
    match = _THIS_AGREEMENT_TITLE_RE.search(opening)
    if match and match.group(1):
        phrase = _to_title_case_agreement(match.group(1))
        if len(phrase) >= 8 and "agreement" in phrase.lower():
            return phrase
    first = next((line.strip() for line in opening.split("\n") if line.strip()), "")
    if (
        8 <= len(first) <= 160
        and "agreement" in first.lower()
        and not re.match(r"^\d+\.", first)
        and first == first.upper()
    ):
        return _to_title_case_agreement(first)
    return ""


def signed_record_corpus_plain(draft: Any) -> str:
    data = _draft_as_dict(draft)
    packet = data.get("vs01_signing_packet_v1")
    if isinstance(packet, dict):
        snap = packet.get("fully_executed_snapshot")
        if isinstance(snap, dict):
            text = str(snap.get("corpus_plain") or "").strip()
            if len(text) >= 80:
                return text
    accepted = data.get("accepted_review_snapshot_v1")
    if isinstance(accepted, dict):
        text = str(accepted.get("corpusPlain") or accepted.get("corpus_plain") or "").strip()
        if len(text) >= 80:
            return text
    return ""


def resolve_signed_record_display_title(draft: Any) -> str:
    from_corpus = extract_title_from_corpus_plain(signed_record_corpus_plain(draft))
    if from_corpus:
        return from_corpus
    data = _draft_as_dict(draft)
    return str(data.get("title") or "").strip()
