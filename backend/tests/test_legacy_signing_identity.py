"""Sanitized legacy generated-id reconciliation. No hosted agreement text."""

from __future__ import annotations

import hashlib
from typing import Any, Callable, Dict

import pytest

from backend.services.legacy_signing_identity import (
    SigningIdentityAuthorityError,
    prepare_durable_execution_authority,
    rekey_portable_legacy_party_ids,
    signing_corpus_authority,
    stale_frozen_corpus_may_be_ignored,
)
from backend.services.vs01_fully_executed_snapshot import (
    completed_execution_by_name_violations,
    ensure_fully_executed_snapshot_on_draft,
)
from backend.services.vs01_signer_completion import (
    count_signature_completed_events,
    fully_executed_signed_already_recorded,
    orchestrate_vs01_signer_complete,
    resolve_participant_id_for_signer_role,
)

DURABLE = [
    "11111111-1111-4111-8111-111111111111",
    "22222222-2222-4222-8222-222222222222",
    "33333333-3333-4333-8333-333333333333",
    "44444444-4444-4444-8444-444444444444",
]
GENERATED = [
    "party_a11a11a11a11:b22b22b22b22",
    "party_c33c33c33c33:d44d44d44d44",
    "party_e55e55e55e55:f66f66f66f66",
    "party_a77a77a77a77:b88b88b88b88",
]
ENTITIES = [
    "Northwind Field Analytics LLC",
    "Cedar Ridge Services LLC",
    "Harbor Peak Workshop LLC",
    "Ironvale Field Ops LLC",
]
ROLES = ["Client", "Service Provider", "Advisor", "Auditor"]
SIGNERS = ["Casey North", "Riley Cedar", "Avery Harbor", "Quinn Ironvale"]
EMAILS = [
    "casey.north@example.test",
    "riley.cedar@example.test",
    "avery.harbor@example.test",
    "quinn.ironvale@example.test",
]
STALE_MARKER = "stale-frozen-corpus-must-not-rank"


def _sha(text: str) -> str:
    return hashlib.sha256(text.encode("utf-8")).hexdigest()


def _fp(value: str) -> str:
    return hashlib.sha256(value.encode("utf-8")).hexdigest()[:12]


def _accepted_corpus(count: int) -> str:
    operative = (
        "SERVICES AGREEMENT\n\n"
        "The operative commercial terms in this accepted corpus are the signing text.\n"
        + "Commercial terms remain immutable. " * 40
        + "\n\nIN WITNESS WHEREOF, the Parties execute this Agreement.\n\n"
    )
    witness = "\n\n".join(
        f"{ENTITIES[index]}:\nBy: __________________________\nName: {SIGNERS[index]}\n"
        "Title: Officer\nDate: _____________________________"
        for index in range(count)
    )
    return operative + witness


def _stale_corpus() -> str:
    return f"STALE FROZEN BODY\n{STALE_MARKER}\n" + ("stale clause. " * 20)


def _draft(count: int = 2, *, reverse_frozen: bool = False) -> Dict[str, Any]:
    corpus = _accepted_corpus(count)
    order = list(range(count))
    frozen_order = list(reversed(order)) if reverse_frozen else order
    return {
        "id": "ag_legacy_identity_fixture",
        "title": "Sanitized legacy identity fixture",
        "jurisdiction": "Delaware",
        "parties": [
            {
                "id": DURABLE[index],
                "name": ENTITIES[index],
                "role": ROLES[index],
                "requires_signature": True,
            }
            for index in order
        ],
        "accepted_review_snapshot_v1": {
            "schemaVersion": "claw.canonical_review_snapshot/v1",
            "status": "accepted",
            "snapshotId": "crs_legacy_fixture",
            "agreementId": "ag_legacy_identity_fixture",
            "corpusPlain": corpus,
            "corpusLength": len(corpus),
            "corpusSha256": _sha(corpus),
        },
        "frozen_signing_authority_v1": {
            "version": 1,
            "agreementId": "ag_legacy_identity_fixture",
            "frozenCorpusHash": _sha(_stale_corpus()),
            "parties": [
                {
                    "agreementPartyId": GENERATED[index],
                    "legalEntityName": ENTITIES[index],
                    "agreementRole": ROLES[index],
                    "canonicalOrder": index,
                }
                for index in frozen_order
            ],
            "signers": [
                {
                    "signerRecordId": f"signer:{GENERATED[index]}:0",
                    "agreementPartyId": GENERATED[index],
                    "signerName": SIGNERS[index],
                    "signerTitle": "Officer",
                    "signerEmail": EMAILS[index],
                    "requiresSignature": True,
                }
                for index in frozen_order
            ],
        },
        "audit_log": [],
    }


@pytest.mark.parametrize("count", [2, 3, 4])
def test_legacy_mapping_uses_durable_ids_for_supported_party_counts(count: int) -> None:
    prepared = prepare_durable_execution_authority(_draft(count, reverse_frozen=count == 3))
    assert prepared.corpus_source == "accepted_canonical"
    assert prepared.digest == _sha(_accepted_corpus(count))
    assert prepared.length == len(_accepted_corpus(count))
    assert prepared.participant_ids == DURABLE[:count]
    assert [party.order for party in prepared.parties] == list(range(count))
    assert [party.role for party in prepared.parties] == ROLES[:count]
    assert [party.signer_name for party in prepared.parties] == SIGNERS[:count]
    assert [party.signer_email for party in prepared.parties] == EMAILS[:count]
    assert STALE_MARKER not in prepared.corpus
    assert all(party.party_id == prepared.alias[party.legacy_party_id] for party in prepared.parties)
    if count == 3:
        assert prepared.alias[GENERATED[2]] == DURABLE[2]


@pytest.mark.parametrize(
    ("label", "code", "mutate"),
    [
        ("duplicate legal names", "ambiguous_legal_name", lambda draft: _rename(draft, 1, ENTITIES[0], ENTITIES[0])),
        ("missing legal name", "missing_legal_name", lambda draft: _rename(draft, 0, "", ENTITIES[0])),
        ("count mismatch", "party_count_mismatch", lambda draft: draft["parties"].pop()),
        (
            "reordered ambiguous names",
            "ambiguous_legal_name",
            lambda draft: _rename(draft, 1, f"{ENTITIES[0]}.", ENTITIES[0]),
        ),
        (
            "mixed identity",
            "mixed_party_identity",
            lambda draft: draft["frozen_signing_authority_v1"]["parties"][0].__setitem__(
                "agreementPartyId", "99999999-9999-4999-8999-999999999999"
            ),
        ),
        ("missing signer", "missing_signer_record", lambda draft: draft["frozen_signing_authority_v1"]["signers"].pop()),
        (
            "multiple signers",
            "multiple_signers_for_party",
            lambda draft: draft["frozen_signing_authority_v1"]["signers"][1].__setitem__(
                "agreementPartyId", GENERATED[0]
            ),
        ),
        (
            "unknown signer",
            "unknown_generated_party",
            lambda draft: draft["frozen_signing_authority_v1"]["signers"][1].__setitem__(
                "agreementPartyId", "party_deadbeefdead:beefbeefbeef"
            ),
        ),
        (
            "role conflict",
            "role_conflict",
            lambda draft: draft["frozen_signing_authority_v1"]["parties"][1].__setitem__("agreementRole", "Vendor"),
        ),
        (
            "entity copied as signer",
            "human_signer_name_missing",
            lambda draft: draft["frozen_signing_authority_v1"]["signers"][0].__setitem__("signerName", ENTITIES[0]),
        ),
        ("accepted missing", "accepted_snapshot_missing", lambda draft: draft.__setitem__("accepted_review_snapshot_v1", None)),
        (
            "accepted invalid",
            "accepted_snapshot_invalid",
            lambda draft: draft["accepted_review_snapshot_v1"].__setitem__("corpusSha256", "ab" * 32),
        ),
    ],
)
def test_legacy_mapping_fails_closed(label: str, code: str, mutate: Callable[[Dict[str, Any]], None]) -> None:
    del label
    draft = _draft()
    mutate(draft)
    with pytest.raises(SigningIdentityAuthorityError) as raised:
        prepare_durable_execution_authority(draft)
    assert raised.value.code == code


def test_stale_frozen_corpus_cannot_outrank_accepted_text() -> None:
    draft = _draft()
    accepted = draft["accepted_review_snapshot_v1"]
    with pytest.raises(SigningIdentityAuthorityError) as raised:
        signing_corpus_authority(
            accepted_corpus=accepted["corpusPlain"],
            accepted_digest=accepted["corpusSha256"],
            frozen_digest=draft["frozen_signing_authority_v1"]["frozenCorpusHash"],
            prefer_frozen=True,
        )
    assert raised.value.code == "frozen_corpus_mismatch"
    assert stale_frozen_corpus_may_be_ignored(
        validation_code="corpus_hash_mismatch",
        portable_corpus_hash=accepted["corpusSha256"],
        accepted_digest=accepted["corpusSha256"],
    )
    assert not stale_frozen_corpus_may_be_ignored(
        validation_code="corpus_hash_mismatch",
        portable_corpus_hash=draft["frozen_signing_authority_v1"]["frozenCorpusHash"],
        accepted_digest=accepted["corpusSha256"],
    )
    prepared = prepare_durable_execution_authority(draft)
    portable = {
        "roles": [
            {"roleId": "r0", "partyId": GENERATED[0], "vs01CounterpartyId": GENERATED[0]},
            {"roleId": "r1", "partyId": GENERATED[1], "vs01CounterpartyId": GENERATED[1]},
        ]
    }
    rekeyed = rekey_portable_legacy_party_ids(draft, portable)
    assert [role["partyId"] for role in rekeyed["roles"]] == DURABLE[:2]
    assert "alias" not in rekeyed
    assert draft.get("legacy_party_alias") is None
    assert resolve_participant_id_for_signer_role(draft, "accepted_party_0", GENERATED[0]) == DURABLE[0]
    assert prepared.digest == accepted["corpusSha256"]


def _rename(draft: Dict[str, Any], index: int, persisted_name: str, frozen_name: str) -> None:
    draft["parties"][index]["name"] = persisted_name
    draft["frozen_signing_authority_v1"]["parties"][index]["legalEntityName"] = frozen_name


def _complete(draft: Dict[str, Any], index: int) -> Dict[str, Any]:
    outcome = orchestrate_vs01_signer_complete(
        draft,
        signer_role_id=f"accepted_party_{index}",
        participant_id=DURABLE[index],
        display_name=SIGNERS[index],
        document_id="doc_legacy_fixture",
        signed_at=f"2026-10-0{index + 1}T12:00:00Z",
        signed_date_iso=f"2026-10-0{index + 1}",
        signed_date_display=f"October {index + 1}, 2026",
        locked_version_id=None,
        agreement_version_hash=draft["accepted_review_snapshot_v1"]["corpusSha256"],
    )
    return outcome.draft_dict


def test_sanitized_two_party_legacy_lifecycle_uses_one_durable_authority() -> None:
    draft = _draft()
    accepted = dict(draft["accepted_review_snapshot_v1"])
    prepared = prepare_durable_execution_authority(draft)
    links = [
        {"participant_id": party.party_id, "signer_name": party.signer_name, "signer_email": party.signer_email}
        for party in prepared.parties
    ]
    assert [link["participant_id"] for link in links] == DURABLE[:2]
    assert [link["signer_name"] for link in links] == SIGNERS[:2]

    after_first = _complete(draft, 0)
    assert count_signature_completed_events(after_first["audit_log"]) == 1
    assert fully_executed_signed_already_recorded(after_first["audit_log"]) is False
    assert "fully_executed_snapshot" not in (after_first.get("vs01_signing_packet_v1") or {})

    after_second = _complete(after_first, 1)
    assert count_signature_completed_events(after_second["audit_log"]) == 2
    assert fully_executed_signed_already_recorded(after_second["audit_log"]) is True
    event_ids = [
        event["value"]["participant_id"]
        for event in after_second["audit_log"]
        if event.get("event_type") == "signature_completed"
    ]
    assert event_ids == DURABLE[:2]

    ensured = ensure_fully_executed_snapshot_on_draft(after_second, agreement_id=draft["id"])
    assert ensured.snapshot_ready is True
    assert ensured.source == "accepted_snapshot_reconstructed"
    packet = ensured.draft_dict["vs01_signing_packet_v1"]
    snapshot = packet["fully_executed_snapshot"]
    completed = snapshot["corpus_plain"]
    assert STALE_MARKER not in completed
    assert "operative commercial terms in this accepted corpus" in completed
    assert completed_execution_by_name_violations(completed) == []
    assert "By: Casey North" in completed
    assert "By: Riley Cedar" in completed
    role_ids = [role["partyId"] for role in packet["portable"]["roles"]]
    assert role_ids == DURABLE[:2]
    assert ensured.draft_dict["accepted_review_snapshot_v1"]["corpusSha256"] == accepted["corpusSha256"]
    assert ensured.draft_dict["accepted_review_snapshot_v1"]["corpusLength"] == accepted["corpusLength"]
    assert ensured.draft_dict["accepted_review_snapshot_v1"]["corpusPlain"] == accepted["corpusPlain"]
    assert "legacy_party_alias" not in ensured.draft_dict

    from backend.services.completed_signed_pdf_export import build_completed_signed_pdf_bytes

    pdf_bytes, _filename = build_completed_signed_pdf_bytes(
        agreement_id=draft["id"],
        draft=ensured.draft_dict,
    )
    assert pdf_bytes.startswith(b"%PDF")
    extracted = _pdf_text(pdf_bytes)
    assert STALE_MARKER not in extracted
    assert "Casey North" in extracted
    assert "Riley Cedar" in extracted

    repeated = orchestrate_vs01_signer_complete(
        ensured.draft_dict,
        signer_role_id="accepted_party_0",
        participant_id=DURABLE[0],
        display_name=SIGNERS[0],
        document_id="doc_legacy_fixture",
        signed_at="2026-10-03T12:00:00Z",
        signed_date_iso="2026-10-03",
        signed_date_display="October 3, 2026",
        locked_version_id=None,
        agreement_version_hash=accepted["corpusSha256"],
    )
    assert repeated.already_signed is True
    assert count_signature_completed_events(repeated.audit) == 2
    assert sum(1 for event in repeated.audit if event.get("event_type") == "signed") == 1
    reloaded = ensure_fully_executed_snapshot_on_draft(repeated.draft_dict, agreement_id=draft["id"])
    assert reloaded.source == "existing"
    assert reloaded.draft_dict["vs01_signing_packet_v1"]["fully_executed_snapshot"]["corpus_plain"] == completed
    assert [ _fp(party_id) for party_id in event_ids ] == [_fp(DURABLE[0]), _fp(DURABLE[1])]


def _pdf_text(pdf_bytes: bytes) -> str:
    import fitz

    document = fitz.open(stream=pdf_bytes, filetype="pdf")
    return "\n".join(page.get_text() for page in document)
