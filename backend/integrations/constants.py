"""Stable integration identifiers — keep in sync with DEVELOPER.md webhook section."""

from __future__ import annotations

CLAW_WEBHOOK_SCHEMA_VERSION = "claw.integration.webhook/v1"

# Dot+lower event names (single namespace for filters + docs)
CLAW_WEBHOOK_EVENT_TYPES: tuple[str, ...] = (
    "agreement.created",
    "agreement.updated",
    "agreement.sent",
    "agreement.signed",
    "agreement.completed",
    "agreement.expired",
    "agreement.memory.indexed",
    "document.analysis.completed",
    "field.review.completed",
    "paywall.triggered",
    "subscription.upgraded",
)

CLAW_WEBHOOK_USER_AGENT = "CLAW-Webhooks/1.0"

# object_type values emitted today: agreement, document_layout_analysis, subscription, workspace
# (see DEVELOPER.md — paywall uses workspace + org id as object_id).
