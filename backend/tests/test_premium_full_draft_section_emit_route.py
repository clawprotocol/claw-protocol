"""premium-full-draft route gate: refuse skipped producer output.

Repair-then-accept is not proof. Identity-through of 12-then-14 must 503.
"""

from __future__ import annotations

import json

import pytest
from fastapi.testclient import TestClient

import backend.routers.agreements_v2_api as av2
from backend.agreements.premium_full_draft_section_emit import SKIPPED_TOP_LEVEL_SECTION_INTEGERS
from backend.agreements.review_plain_section_continuity import (
    collect_review_plain_top_level_section_numbers,
    review_plain_has_operative_governing_law,
    review_plain_has_skipped_section_numbers,
)
from backend.main import app
from backend.tests.test_review_plain_section_continuity import (
    _twelve_then_fourteen,
    _two_party_intake,
)
from backend.usage_economics import store as usage_economics_store_mod

pytestmark = pytest.mark.unit

_ORG_H = {
    "X-Claw-Org-Id": "test-org-section-emit-route",
    "X-Claw-Test-Auth-User-Id": "owner-section-emit-route",
}


def _pad_to_substance_floor(plain: str) -> str:
    min_len = 1800
    if len(plain) >= min_len:
        return plain
    pad = (
        "Each party shall keep confidential information confidential, pay amounts due, "
        "indemnify the other for third-party claims arising from its breach, limit liability "
        "to fees paid, and deliver notices in writing. Electronic signatures are valid. "
    )
    extra = pad * ((min_len - len(plain)) // len(pad) + 2)
    return plain.replace(
        "IN WITNESS WHEREOF, the parties have executed this Agreement as of the Effective Date.",
        f"{extra.strip()}\n\nIN WITNESS WHEREOF, the parties have executed this Agreement as of the Effective Date.",
    )


def _assert_sequential(plain: str) -> None:
    nums = collect_review_plain_top_level_section_numbers(plain)
    assert review_plain_has_skipped_section_numbers(plain) is False
    assert nums == list(range(1, len(nums) + 1))


@pytest.fixture(autouse=True)
def _reset_usage_economics_singleton():
    usage_economics_store_mod._store = None  # noqa: SLF001
    yield
    usage_economics_store_mod._store = None  # noqa: SLF001


def _route_env(monkeypatch: pytest.MonkeyPatch, tmp_path) -> None:
    monkeypatch.setenv("CLAW_DATA_DIR", str(tmp_path))
    monkeypatch.setenv("CLAW_ECONOMICS_DB_PATH", str(tmp_path / "economics.sqlite3"))
    monkeypatch.setenv("CLAW_USAGE_ECONOMICS_DB_PATH", str(tmp_path / "usage.sqlite3"))
    monkeypatch.setattr(av2, "OPENAI_API_KEY", "sk-test-section-emit")
    from backend.tests.entitlement_test_support import ensure_headers_entitled

    ensure_headers_entitled(_ORG_H)


def _llm_payload(document_text: str) -> str:
    return json.dumps(
        {
            "title": "Services Agreement",
            "agreement_family": "services_agreement",
            "document_text": document_text,
            "authoritative_draft": document_text,
            "key_terms_found": [
                "Fees",
                "Confidentiality",
                "Indemnification",
                "Limitation of liability",
                "Notices",
                "Electronic signatures",
            ],
            "missing_material_info": [],
            "agreement_intelligence": {
                "extracted_terms": {
                    "parties": [
                        {"name": "Cedar Ridge LLC", "role": "Client"},
                        {"name": "Maple Grove Inc", "role": "Service Provider"},
                    ],
                    "governing_law": "Oklahoma",
                }
            },
        }
    )


def test_premium_full_draft_refuses_when_producer_emits_12_then_14(
    monkeypatch: pytest.MonkeyPatch, tmp_path
) -> None:
    """Gate must refuse skipped producer output. Repair-then-accept is not proof."""
    _route_env(monkeypatch, tmp_path)
    raw = _pad_to_substance_floor(
        _twelve_then_fourteen(client="Cedar Ridge LLC", provider="Maple Grove Inc")
    )
    monkeypatch.setattr(av2, "call_legal_llm", lambda *a, **k: _llm_payload(raw))
    monkeypatch.setattr(
        av2,
        "emit_sequential_premium_full_draft_sections",
        lambda doc, **kwargs: {"text": doc, "repairs": []},
    )

    client = TestClient(app)
    res = client.post(
        "/api/agreements/premium-full-draft",
        headers=_ORG_H,
        json={
            "intake_text": _two_party_intake(
                client="Cedar Ridge LLC", provider="Maple Grove Inc", law="Oklahoma"
            ),
            "context": {
                "title": "Services Agreement",
                "jurisdiction": "Oklahoma",
                "parties": [
                    {"name": "Cedar Ridge LLC", "role": "Client"},
                    {"name": "Maple Grove Inc", "role": "Service Provider"},
                ],
                "purpose": "logo and brand kit",
                "payment_terms": "$2,400",
                "agreement_family": "services_agreement",
            },
        },
    )
    assert res.status_code in {200, 503}
    body = res.json()
    assert body.get("server_generation_failure_code") == SKIPPED_TOP_LEVEL_SECTION_INTEGERS
    assert not (body.get("document_text") or "").strip() or review_plain_has_skipped_section_numbers(
        body.get("document_text") or ""
    ) is False


def test_premium_full_draft_producer_emits_sequential_before_repair(
    monkeypatch: pytest.MonkeyPatch, tmp_path
) -> None:
    _route_env(monkeypatch, tmp_path)
    raw = _pad_to_substance_floor(
        _twelve_then_fourteen(client="Cedar Ridge LLC", provider="Maple Grove Inc")
    )
    monkeypatch.setattr(av2, "call_legal_llm", lambda *a, **k: _llm_payload(raw))

    seen_before_repair: list[str] = []
    real_repair = av2.repair_review_plain_section_continuity

    def _spy_repair(plain, **kwargs):
        seen_before_repair.append(plain)
        assert review_plain_has_skipped_section_numbers(plain) is False
        return real_repair(plain, **kwargs)

    monkeypatch.setattr(av2, "repair_review_plain_section_continuity", _spy_repair)

    client = TestClient(app)
    res = client.post(
        "/api/agreements/premium-full-draft",
        headers=_ORG_H,
        json={
            "intake_text": _two_party_intake(
                client="Cedar Ridge LLC", provider="Maple Grove Inc", law="Oklahoma"
            ),
            "context": {
                "title": "Services Agreement",
                "jurisdiction": "Oklahoma",
                "parties": [
                    {"name": "Cedar Ridge LLC", "role": "Client"},
                    {"name": "Maple Grove Inc", "role": "Service Provider"},
                ],
                "purpose": "logo and brand kit",
                "payment_terms": "$2,400",
                "agreement_family": "services_agreement",
            },
        },
    )
    assert res.status_code == 200, res.text
    body = res.json()
    doc = (body.get("document_text") or "").strip()
    assert doc
    _assert_sequential(doc)
    assert review_plain_has_operative_governing_law(doc, "Oklahoma") is True
    assert seen_before_repair, "continuity repair must run after sequential emit"
    _assert_sequential(seen_before_repair[0])
