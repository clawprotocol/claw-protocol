from backend.agreements.legal_party_representative_bind import bind_representatives_to_legal_parties

HARBOR_INTAKE = (
    "Draft a consulting services agreement between Harbor Peak Analytics LLC (Consultant) "
    "and Ironvale Manufacturing Inc. (Client). Scope is AI workflow implementation. "
    "Fixed fee $48,000. Consultant signer Maya Chen, maya.chen@harborpeak.test. "
    "Client signer Jordan Hale, jordan.hale@ironvale.test."
)


def test_binds_six_row_premium_parse_to_two_legal_parties() -> None:
    raw = [
        {"name": "Harbor Peak Analytics LLC", "role": "Consultant"},
        {"name": "Ironvale Manufacturing Inc", "role": "Client"},
        {"name": "Maya Chen", "role": "Consultant signer"},
        {"name": "Jordan Hale", "role": "Client signer"},
        {"name": "maya.chen@harborpeak.test", "role": "Consultant signer email"},
        {"name": "jordan.hale@ironvale.test", "role": "Client signer email"},
    ]
    out = bind_representatives_to_legal_parties(raw, HARBOR_INTAKE)
    names = [p["name"] for p in out["parties"]]
    assert names == ["Harbor Peak Analytics LLC", "Ironvale Manufacturing Inc"]
    assert out["parties"][0]["role"] == "Consultant"
    assert out["parties"][0]["signerName"] == "Maya Chen"
    assert out["parties"][0]["email"] == "maya.chen@harborpeak.test"
    assert out["parties"][1]["role"] == "Client"
    assert out["parties"][1]["signerName"] == "Jordan Hale"
    assert out["clarification_question"] is None


def test_asks_when_unbound_human_is_not_an_individual_party() -> None:
    out = bind_representatives_to_legal_parties(
        [
            {"name": "Harbor Peak Analytics LLC", "role": "Consultant"},
            {"name": "Ironvale Manufacturing Inc.", "role": "Client"},
            {"name": "Alex Rivera", "role": "party"},
        ],
        "Draft a consulting agreement between Harbor Peak Analytics LLC (Consultant) and Ironvale Manufacturing Inc. (Client).",
    )
    assert any(p["name"] == "Alex Rivera" for p in out["parties"])
    assert out["clarification_question"] and "Alex Rivera" in out["clarification_question"]


def test_normalize_parsed_draft_binds_premium_parse_rows() -> None:
    from backend.routers.agreements_v2_api import _normalize_parsed_draft

    draft = _normalize_parsed_draft(
        {
            "title": "Consulting Services Agreement",
            "jurisdiction": "Delaware",
            "purpose": "AI workflow implementation",
            "payment_terms": "Fixed fee $48,000",
            "parties": [
                {"name": "Harbor Peak Analytics LLC", "role": "Consultant"},
                {"name": "Ironvale Manufacturing Inc", "role": "Client"},
                {"name": "Maya Chen", "role": "Consultant signer"},
                {"name": "Jordan Hale", "role": "Client signer"},
                {"name": "maya.chen@harborpeak.test", "role": "Consultant signer email"},
                {"name": "jordan.hale@ironvale.test", "role": "Client signer email"},
            ],
        },
        HARBOR_INTAKE,
    )
    assert [p.name for p in draft.parties] == [
        "Harbor Peak Analytics LLC",
        "Ironvale Manufacturing Inc",
    ]
    assert draft.parties[0].role == "Consultant"
    assert draft.parties[0].signer_name == "Maya Chen"
    assert draft.purpose == "AI workflow implementation"


def test_keeps_explicit_individual_party() -> None:
    intake = (
        "Agreement between Harbor Peak Analytics LLC (Consultant) and Jordan Hale as an individual (Client)."
    )
    out = bind_representatives_to_legal_parties(
        [
            {"name": "Harbor Peak Analytics LLC", "role": "Consultant"},
            {"name": "Jordan Hale", "role": "Client"},
        ],
        intake,
    )
    assert any(p["name"] == "Jordan Hale" for p in out["parties"])
