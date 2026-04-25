from __future__ import annotations

import json
import time

import pytest


def test_verify_webhook_signature_fresh_rejects_skew() -> None:
    from backend.integrations.webhook_signing import sign_webhook_body, verify_webhook_signature_fresh

    secret = "whsec_test"
    body = b"{}"
    ts = str(int(time.time()) - 400)
    sig = sign_webhook_body(secret, ts, body)
    assert verify_webhook_signature_fresh(secret, ts, body, sig, max_age_seconds=300) is False


def test_verify_webhook_signature_fresh_accepts_recent() -> None:
    from backend.integrations.webhook_signing import sign_webhook_body, verify_webhook_signature_fresh

    secret = "whsec_test"
    body = b'{"a":1}'
    ts = str(int(time.time()))
    sig = sign_webhook_body(secret, ts, body)
    assert verify_webhook_signature_fresh(secret, ts, body, sig, max_age_seconds=300) is True


def test_delivery_list_includes_normalized_fields(monkeypatch, tmp_path) -> None:
    monkeypatch.setenv("CLAW_DATA_DIR", str(tmp_path))
    from backend.integrations import webhook_store

    webhook_store.append_delivery(
        "org_test",
        {
            "delivery_id": "wdel_1",
            "hook_id": "wh_x",
            "event_id": "evt_a",
            "event_type": "agreement.created",
            "object_type": "agreement",
            "object_id": "aid",
            "summary": {"surface": "draft"},
            "status": "failed",
            "http_status": 503,
            "attempts": 3,
            "last_error": "http_503",
            "last_attempt_at": "2026-04-01T00:00:05Z",
            "created_at": "2026-04-01T00:00:00Z",
            "completed_at": "2026-04-01T00:00:09Z",
        },
    )
    rows = webhook_store.list_deliveries("org_test", limit=10)
    assert len(rows) == 1
    r = rows[0]
    assert r["response_code"] == 503
    assert r["retry_count"] == 3
    assert r["error_summary"] == "http_503"
    assert r["object_type"] == "agreement"
    assert r["object_id"] == "aid"


def test_webhook_payload_has_version_and_sorted_keys() -> None:
    from backend.integrations.constants import CLAW_WEBHOOK_SCHEMA_VERSION
    from backend.integrations.webhook_payload import build_webhook_payload, canonical_json_bytes

    p = build_webhook_payload(
        event_type="field.review.completed",
        org_id="org_1",
        object_type="document_layout_analysis",
        object_id="layout_x",
        summary={"action_count": 1},
    )
    assert p["version"] == CLAW_WEBHOOK_SCHEMA_VERSION
    raw = canonical_json_bytes(p)
    parsed = json.loads(raw.decode("utf-8"))
    keys = list(parsed.keys())
    assert keys == sorted(keys)


def test_claw_webhook_event_types_complete_catalog() -> None:
    """Guards catalog in constants vs DEVELOPER expectations (QA list)."""
    from backend.integrations.constants import CLAW_WEBHOOK_EVENT_TYPES

    expected = {
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
    }
    assert set(CLAW_WEBHOOK_EVENT_TYPES) == expected
