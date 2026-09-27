from __future__ import annotations

from backend.agreements.party_identity_persist import (
    merge_structured_party_identity,
    missing_confirmed_signer_names,
)

HARBOR_ID = "61321f75-dd4a-4100-9629-e6cfeaff379f"
IRONVALE_ID = "e535096f-bbc9-4b18-8cef-07d70be0ea88"

HARBOR_CURRENT = [
    {
        "id": HARBOR_ID,
        "name": "Harbor Peak Analytics LLC",
        "role": "Consultant",
        "signer_name": "Maya Chen",
        "email": "maya.chen@harborpeak.test",
        "signer_title": "Principal",
    },
    {
        "id": IRONVALE_ID,
        "name": "Ironvale Manufacturing Inc.",
        "role": "Client",
        "signer_name": "Jordan Hale",
        "email": "jordan.hale@ironvale.test",
        "signer_title": "Operations Lead",
    },
]


def test_harbor_ids_retain_signers_through_accepted_revision_shell():
    incoming = [
        {"id": HARBOR_ID, "name": "Harbor Peak Analytics LLC", "role": "Consultant", "signer_name": None, "email": None},
        {
            "id": IRONVALE_ID,
            "name": "Ironvale Manufacturing Inc.",
            "role": "Client",
            "signer_name": None,
            "email": "jordan.hale@ironvale.test",
        },
    ]
    merged = merge_structured_party_identity(current=HARBOR_CURRENT, incoming=incoming)
    by_id = {row["id"]: row for row in merged}
    assert by_id[HARBOR_ID]["signer_name"] == "Maya Chen"
    assert by_id[HARBOR_ID]["email"] == "maya.chen@harborpeak.test"
    assert by_id[HARBOR_ID]["signer_title"] == "Principal"
    assert by_id[IRONVALE_ID]["signer_name"] == "Jordan Hale"
    assert by_id[IRONVALE_ID]["email"] == "jordan.hale@ironvale.test"


def test_snake_case_and_camel_case_hydrate_the_same_fields():
    current = [
        {
            "id": HARBOR_ID,
            "name": "Harbor Peak Analytics LLC",
            "role": "Consultant",
            "signerName": "Maya Chen",
            "signerTitle": "Principal",
        }
    ]
    incoming = [{"id": HARBOR_ID, "name": "Harbor Peak Analytics LLC", "role": "Consultant"}]
    merged = merge_structured_party_identity(current=current, incoming=incoming)
    assert merged[0]["signer_name"] == "Maya Chen"
    assert merged[0]["signerName"] == "Maya Chen"
    assert merged[0]["signer_title"] == "Principal"
    assert merged[0]["signerTitle"] == "Principal"


def test_accepted_corpus_shell_cannot_blank_structured_signer_metadata():
    incoming = [
        {"id": HARBOR_ID, "name": "Harbor Peak Analytics LLC", "role": "Consultant"},
        {"id": IRONVALE_ID, "name": "Ironvale Manufacturing Inc.", "role": "Client"},
    ]
    merged = merge_structured_party_identity(current=HARBOR_CURRENT, incoming=incoming)
    assert [row["signer_name"] for row in merged] == ["Maya Chen", "Jordan Hale"]


def test_reordered_parties_remain_bound_by_id():
    incoming = [
        {"id": IRONVALE_ID, "name": "Ironvale Manufacturing Inc.", "role": "Client"},
        {"id": HARBOR_ID, "name": "Harbor Peak Analytics LLC", "role": "Consultant"},
    ]
    merged = merge_structured_party_identity(current=HARBOR_CURRENT, incoming=incoming)
    assert merged[0]["id"] == IRONVALE_ID
    assert merged[0]["signer_name"] == "Jordan Hale"
    assert merged[1]["id"] == HARBOR_ID
    assert merged[1]["signer_name"] == "Maya Chen"


def test_empty_incoming_shell_cannot_erase_confirmed_metadata():
    merged = merge_structured_party_identity(current=HARBOR_CURRENT, incoming=[])
    assert [row["signer_name"] for row in merged] == ["Maya Chen", "Jordan Hale"]
    assert [row["email"] for row in merged] == [
        "maya.chen@harborpeak.test",
        "jordan.hale@ironvale.test",
    ]


def test_ambiguous_legal_name_bases_do_not_cross_bind():
    current = [
        {"id": "a", "name": "Acme LLC", "role": "party", "signer_name": "Ann", "email": "ann@a.test"},
        {"id": "b", "name": "Acme LLC", "role": "party", "signer_name": "Bob", "email": "bob@b.test"},
    ]
    incoming = [{"name": "Acme LLC", "role": "party", "email": "other@x.test"}]
    merged = merge_structured_party_identity(current=current, incoming=incoming)
    by_id = {row["id"]: row for row in merged if row.get("id")}
    assert by_id["a"]["signer_name"] == "Ann"
    assert by_id["b"]["signer_name"] == "Bob"
    assert by_id["a"]["email"] == "ann@a.test"
    assert by_id["b"]["email"] == "bob@b.test"


def test_reviewer_email_update_does_not_replace_signer_name_or_notice_elsewhere():
    incoming = [
        {
            "id": HARBOR_ID,
            "name": "Harbor Peak Analytics LLC",
            "role": "Consultant",
            "email": "notices@harborpeak.test",
        },
        {
            "id": IRONVALE_ID,
            "name": "Ironvale Manufacturing Inc.",
            "role": "Client",
            "email": "jordan.reviewer@ironvale.test",
        },
    ]
    merged = merge_structured_party_identity(current=HARBOR_CURRENT, incoming=incoming)
    by_id = {row["id"]: row for row in merged}
    assert by_id[HARBOR_ID]["signer_name"] == "Maya Chen"
    assert by_id[HARBOR_ID]["email"] == "notices@harborpeak.test"
    assert by_id[IRONVALE_ID]["signer_name"] == "Jordan Hale"
    assert by_id[IRONVALE_ID]["email"] == "jordan.reviewer@ironvale.test"


def test_entity_name_copies_are_not_accepted_as_human_signer_names():
    incoming = [
        {
            "id": HARBOR_ID,
            "name": "Harbor Peak Analytics LLC",
            "role": "Consultant",
            "signerName": "Harbor Peak Analytics LLC",
        }
    ]
    merged = merge_structured_party_identity(current=HARBOR_CURRENT, incoming=incoming)
    assert merged[0]["signer_name"] == "Maya Chen"


def test_missing_signer_stays_missing_and_blocks_signing_preparation():
    parties = [
        {"id": HARBOR_ID, "name": "Harbor Peak Analytics LLC", "role": "Consultant", "signer_name": "Maya Chen"},
        {"id": IRONVALE_ID, "name": "Ironvale Manufacturing Inc.", "role": "Client"},
    ]
    merged = merge_structured_party_identity(current=parties, incoming=parties)
    assert merged[0]["signer_name"] == "Maya Chen"
    assert merged[1]["signer_name"] is None
    assert missing_confirmed_signer_names(merged) == [IRONVALE_ID]


def test_unique_legal_name_may_attach_before_ids_exist():
    current = [
        {"name": "Harbor Peak Analytics LLC", "role": "Consultant", "signer_name": "Maya Chen"},
    ]
    incoming = [{"name": "Harbor Peak Analytics LLC", "role": "Consultant"}]
    merged = merge_structured_party_identity(current=current, incoming=incoming)
    assert merged[0]["signer_name"] == "Maya Chen"
