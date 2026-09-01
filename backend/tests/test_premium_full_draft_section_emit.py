"""premium-full-draft sequential section emit + refuse gate.

The skip producer is premium-full-draft LLM ``document_text`` integers accepted as-is.
These tests inspect ``emit_sequential_premium_full_draft_sections`` output BEFORE
``repair_review_plain_section_continuity``. Identity-through of 12-then-14 or
10-then-12 is FAIL. Repair-then-accept is not proof.

Does not remint leftover 1..8 into 10/11/12/13.
Does not hard-code Texas / Northline / Harbor / Priya / Diego.
"""

from __future__ import annotations

import json

import pytest
from fastapi.testclient import TestClient

import backend.routers.agreements_v2_api as av2
from backend.agreements.premium_full_draft_section_emit import (
    SKIPPED_TOP_LEVEL_SECTION_INTEGERS,
    emit_sequential_premium_full_draft_sections,
    refuse_skipped_top_level_section_integers,
)
from backend.agreements.review_plain_section_continuity import (
    collect_review_plain_top_level_section_numbers,
    repair_review_plain_section_continuity,
    review_plain_has_operative_governing_law,
    review_plain_has_skipped_section_numbers,
)
from backend.main import app
from backend.services.accepted_review_snapshot import MIN_CORPUS_LEN, create_pending_snapshot
from backend.tests.test_review_plain_section_continuity import (
    _leftover_eight_section,
    _sequential_1_through,
    _ten_then_twelve,
    _twelve_then_fourteen,
    _two_party_intake,
)
from backend.usage_economics import store as usage_economics_store_mod

pytestmark = pytest.mark.unit

_ORG_H = {
    "X-Claw-Org-Id": "test-org-section-emit",
    "X-Claw-Test-Auth-User-Id": "owner-section-emit",
}


def _pad_to_persist_floor(plain: str) -> str:
    if len(plain) >= MIN_CORPUS_LEN:
        return plain
    pad = "Each party shall perform its obligations in good faith. "
    extra = pad * ((MIN_CORPUS_LEN - len(plain)) // len(pad) + 2)
    return plain.replace(
        "IN WITNESS WHEREOF, the parties have executed this Agreement as of the Effective Date.",
        f"{extra.strip()}\n\nIN WITNESS WHEREOF, the parties have executed this Agreement as of the Effective Date.",
    )


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


@pytest.mark.parametrize(
    ("law", "client", "provider"),
    [
        ("Oklahoma", "Cedar Ridge LLC", "Maple Grove Inc"),
        ("Colorado", "Riverbend Studio", "Oak Point LLC"),
        ("New York", "Summit Craft Co", "Harborline Design LLC"),
    ],
)
def test_producer_output_before_repair_fails_12_then_14_and_10_then_12(
    law: str, client: str, provider: str
) -> None:
    intake = _two_party_intake(client=client, provider=provider, law=law)
    skipped_12_14 = _twelve_then_fourteen(client=client, provider=provider)
    skipped_10_12 = _ten_then_twelve(client=client, provider=provider)

    assert review_plain_has_skipped_section_numbers(skipped_12_14) is True
    assert review_plain_has_skipped_section_numbers(skipped_10_12) is True

    emitted_12_14 = emit_sequential_premium_full_draft_sections(
        skipped_12_14, original_intake=intake
    )
    emitted_10_12 = emit_sequential_premium_full_draft_sections(
        skipped_10_12, original_intake=intake
    )

    # BEFORE review_plain_section_continuity repair — identity-through is FAIL.
    assert "repair_review_plain_section_continuity" not in emitted_12_14.get("repairs", [])
    _assert_sequential(emitted_12_14["text"])
    _assert_sequential(emitted_10_12["text"])
    assert review_plain_has_operative_governing_law(emitted_12_14["text"], law) is True
    assert law in emitted_12_14["text"]
    assert "Texas" not in emitted_12_14["text"]
    assert "Northline" not in emitted_12_14["text"]
    assert "Harbor Marks" not in emitted_12_14["text"]
    assert "Priya" not in emitted_12_14["text"]
    assert "Diego" not in emitted_12_14["text"]

    repaired = repair_review_plain_section_continuity(
        emitted_12_14["text"], original_intake=intake
    )
    assert repaired["text"] == emitted_12_14["text"] or not review_plain_has_skipped_section_numbers(
        repaired["text"]
    )


def test_identity_emit_of_12_then_14_is_refused_by_gate() -> None:
    raw = _twelve_then_fourteen(client="Cedar Ridge LLC", provider="Maple Grove Inc")
    assert refuse_skipped_top_level_section_integers(raw) == SKIPPED_TOP_LEVEL_SECTION_INTEGERS
    raw_10 = _ten_then_twelve(client="Riverbend Studio", provider="Oak Point LLC")
    assert refuse_skipped_top_level_section_integers(raw_10) == SKIPPED_TOP_LEVEL_SECTION_INTEGERS

    sequential = _sequential_1_through(14, client="Cedar Ridge LLC", provider="Maple Grove Inc")
    assert refuse_skipped_top_level_section_integers(sequential) is None


def test_leftover_eight_section_stays_1_through_8() -> None:
    client, provider = "Summit Craft Co", "Harborline Design LLC"
    leftover = _leftover_eight_section(client=client, provider=provider)
    assert collect_review_plain_top_level_section_numbers(leftover) == list(range(1, 9))

    emitted = emit_sequential_premium_full_draft_sections(
        leftover,
        original_intake=_two_party_intake(client=client, provider=provider, law="Delaware"),
    )
    nums = collect_review_plain_top_level_section_numbers(emitted["text"])
    assert nums == list(range(1, 9))
    assert 10 not in nums
    assert 11 not in nums
    assert 12 not in nums
    assert 13 not in nums
    assert refuse_skipped_top_level_section_integers(emitted["text"]) is None


def test_persist_refuses_12_then_14_and_10_then_12_without_repair() -> None:
    skipped_12_14 = _pad_to_persist_floor(
        _twelve_then_fourteen(client="Cedar Ridge LLC", provider="Maple Grove Inc")
    )
    skipped_10_12 = _pad_to_persist_floor(
        _ten_then_twelve(client="Riverbend Studio", provider="Oak Point LLC")
    )
    assert review_plain_has_skipped_section_numbers(skipped_12_14) is True
    assert review_plain_has_skipped_section_numbers(skipped_10_12) is True

    ok, err, snap, _reg = create_pending_snapshot(
        agreement_id="agr_skip_12_14",
        corpus_plain=skipped_12_14,
    )
    assert ok is False
    assert err == SKIPPED_TOP_LEVEL_SECTION_INTEGERS
    assert snap is None

    ok, err, snap, _reg = create_pending_snapshot(
        agreement_id="agr_skip_10_12",
        corpus_plain=skipped_10_12,
    )
    assert ok is False
    assert err == SKIPPED_TOP_LEVEL_SECTION_INTEGERS
    assert snap is None


def test_persist_accepts_leftover_1_through_8() -> None:
    leftover = _pad_to_persist_floor(
        _leftover_eight_section(client="Summit Craft Co", provider="Harborline Design LLC")
    )
    assert collect_review_plain_top_level_section_numbers(leftover) == list(range(1, 9))
    ok, err, snap, _reg = create_pending_snapshot(
        agreement_id="agr_leftover_eight",
        corpus_plain=leftover,
    )
    assert ok is True
    assert err is None
    assert snap is not None
    persisted_nums = collect_review_plain_top_level_section_numbers(snap["corpusPlain"])
    assert persisted_nums == list(range(1, 9))


def test_persist_late_gate_does_not_refuse_early_2_then_10_seed() -> None:
    """Unrelated persist Review seed class (2 then 10). Must not trip the late-skip gate."""
    seed = _pad_to_persist_floor(
        "\n".join(
            [
                "SERVICES AGREEMENT",
                "",
                "This Agreement is between Cedar Ridge LLC and Maple Grove Inc.",
                "",
                "2. Term",
                "The engagement continues for 30 days.",
                "",
                "10. Liability",
                "Each party's aggregate liability is limited to fees paid.",
                "",
                "11. Governing Law",
                "This Agreement is governed by the laws of the applicable jurisdiction.",
                "",
                "12. Notices",
                "Notices must be in writing.",
                "",
                "13. Miscellaneous",
                "This Agreement is the entire agreement of the parties.",
                "",
                "IN WITNESS WHEREOF, the parties have executed this Agreement as of the Effective Date.",
            ]
        )
    )
    assert refuse_skipped_top_level_section_integers(seed, late_only=True) is None
    ok, err, snap, _reg = create_pending_snapshot(
        agreement_id="agr_early_hole_seed",
        corpus_plain=seed,
    )
    assert ok is True
    assert err is None
    assert snap is not None


def test_missing_term_is_next_integer_never_a_hole() -> None:
    client, provider, law = "Cedar Ridge LLC", "Maple Grove Inc", "Oklahoma"
    raw = _twelve_then_fourteen(client=client, provider=provider)
    emitted = emit_sequential_premium_full_draft_sections(
        raw, original_intake=_two_party_intake(client=client, provider=provider, law=law)
    )
    nums = collect_review_plain_top_level_section_numbers(emitted["text"])
    _assert_sequential(emitted["text"])
    assert 13 in nums
    assert review_plain_has_operative_governing_law(emitted["text"], law) is True


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
    assert body.get("generation_ok") is False or body.get("server_generation_failure_code") == (
        SKIPPED_TOP_LEVEL_SECTION_INTEGERS
    )
    assert body.get("server_generation_failure_code") == SKIPPED_TOP_LEVEL_SECTION_INTEGERS
    assert review_plain_has_skipped_section_numbers(body.get("document_text") or "") is False or not (
        body.get("document_text") or ""
    ).strip()


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
