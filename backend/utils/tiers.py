# backend/utils/tiers.py
from __future__ import annotations

from dataclasses import dataclass
from enum import Enum
from typing import Dict, Set


class Tier(str, Enum):
    PROOF = "proof"              # free: receipts only
    ASSISTED = "assisted"        # paid
    BUILDER = "builder"          # paid
    PRO = "pro"                  # paid
    INSTITUTIONAL = "inst"       # custom


class Capability(str, Enum):
    # AI
    SUMMARIZE = "summarize"
    CLASSIFY = "classify"
    CHECKLIST = "checklist"
    EXTRACT_JSON = "extract_json"
    DRAFT_NARRATIVE = "draft_narrative"
    SYNTHESIZE_MULTI = "synthesize_multi"
    REDACTION_SUGGEST = "redaction_suggest"

    # non-AI but cost-sensitive
    STORE_BLOB = "store_blob"
    PRIORITY_ANCHOR = "priority_anchor"


@dataclass(frozen=True)
class TierLimits:
    ai_calls_per_month: int
    max_input_chars_per_call: int
    max_output_tokens_per_call: int
    allowed: Set[Capability]
    # Abuse controls / cost controls
    max_upload_mb: int
    max_uploads_per_day: int
    store_blob_days: int
    # Anchoring policy
    allow_free_anchor: bool
    free_anchor_per_day: int


TIERS: Dict[Tier, TierLimits] = {
    Tier.PROOF: TierLimits(
        ai_calls_per_month=0,
        max_input_chars_per_call=0,
        max_output_tokens_per_call=0,
        allowed=set(),
        max_upload_mb=10,
        max_uploads_per_day=20,
        store_blob_days=7,
        allow_free_anchor=True,          # batched epoch anchoring only
        free_anchor_per_day=3,           # “priority” anchors; otherwise pending
    ),
    Tier.ASSISTED: TierLimits(
        ai_calls_per_month=100,
        max_input_chars_per_call=12_000,
        max_output_tokens_per_call=400,
        allowed={
            Capability.SUMMARIZE,
            Capability.CLASSIFY,
            Capability.CHECKLIST,
            Capability.STORE_BLOB,
            Capability.PRIORITY_ANCHOR,
        },
        max_upload_mb=25,
        max_uploads_per_day=100,
        store_blob_days=30,
        allow_free_anchor=True,
        free_anchor_per_day=50,
    ),
    Tier.BUILDER: TierLimits(
        ai_calls_per_month=300,
        max_input_chars_per_call=40_000,
        max_output_tokens_per_call=900,
        allowed={
            Capability.SUMMARIZE,
            Capability.CLASSIFY,
            Capability.CHECKLIST,
            Capability.EXTRACT_JSON,
            Capability.DRAFT_NARRATIVE,
            Capability.STORE_BLOB,
            Capability.PRIORITY_ANCHOR,
        },
        max_upload_mb=100,
        max_uploads_per_day=300,
        store_blob_days=365,
        allow_free_anchor=True,
        free_anchor_per_day=250,
    ),
    Tier.PRO: TierLimits(
        ai_calls_per_month=2000,
        max_input_chars_per_call=120_000,
        max_output_tokens_per_call=1500,
        allowed=set(Capability),
        max_upload_mb=500,
        max_uploads_per_day=2000,
        store_blob_days=3650,
        allow_free_anchor=True,
        free_anchor_per_day=5000,
    ),
    Tier.INSTITUTIONAL: TierLimits(
        ai_calls_per_month=10**9,
        max_input_chars_per_call=500_000,
        max_output_tokens_per_call=3000,
        allowed=set(Capability),
        max_upload_mb=2000,
        max_uploads_per_day=10**9,
        store_blob_days=3650,
        allow_free_anchor=True,
        free_anchor_per_day=10**9,
    ),
}
