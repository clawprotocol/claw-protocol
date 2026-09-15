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
    assert [p["name"] for p in out["parties"]] == [
        "Harbor Peak Analytics LLC",
        "Ironvale Manufacturing Inc.",
    ]
    assert any(p["name"] == "Alex Rivera" for p in out["unresolved_extraction_rows"])
    assert out["clarification_question"] and "Alex Rivera" in out["clarification_question"]


def test_keeps_individual_advisor_and_does_not_steal_their_email_by_domain() -> None:
    intake = (
        "Harbor Peak Analytics LLC (Consultant). Ironvale Manufacturing Inc. (Client). "
        "Jordan Hale as an individual (Advisor) is the third contracting party and uses jordan@harborpeak.test."
    )
    out = bind_representatives_to_legal_parties(
        [
            {"name": "Harbor Peak Analytics LLC", "role": "Consultant"},
            {"name": "Ironvale Manufacturing Inc.", "role": "Client"},
            {"name": "Jordan Hale", "role": "Advisor", "email": "jordan@harborpeak.test"},
        ],
        intake,
    )
    assert [p["name"] for p in out["parties"]] == [
        "Harbor Peak Analytics LLC",
        "Ironvale Manufacturing Inc.",
        "Jordan Hale",
    ]
    assert out["parties"][0]["role"] == "Consultant"
    assert out["parties"][0].get("email") in {None, ""}
    assert out["parties"][1]["role"] == "Client"
    assert out["parties"][2]["role"] == "Advisor"
    assert out["parties"][2]["email"] == "jordan@harborpeak.test"
    assert out["clarification_question"] is None


def test_explicit_consultant_signer_email_does_not_follow_domain() -> None:
    intake = (
        "Harbor Peak Analytics LLC (Consultant). Ironvale Manufacturing Inc. (Client). "
        "Consultant signer Maya Chen, maya@ironvale.test."
    )
    out = bind_representatives_to_legal_parties(
        [
            {"name": "Harbor Peak Analytics LLC", "role": "Consultant"},
            {"name": "Ironvale Manufacturing Inc.", "role": "Client"},
            {"name": "Maya Chen", "role": "Consultant signer", "email": "maya@ironvale.test"},
        ],
        intake,
    )
    assert [p["name"] for p in out["parties"]] == [
        "Harbor Peak Analytics LLC",
        "Ironvale Manufacturing Inc.",
    ]
    assert out["parties"][0]["role"] == "Consultant"
    assert out["parties"][0]["signerName"] == "Maya Chen"
    assert out["parties"][0]["email"] == "maya@ironvale.test"
    assert out["parties"][1]["role"] == "Client"
    assert out["parties"][1].get("email") in {None, ""}
    assert out["parties"][1].get("signerName") in {None, ""}
    assert out["clarification_question"] is None


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


def test_parse_extract_surfaces_identity_clarification() -> None:
    from backend.routers.agreements_v2_api import _parse_premium_intake_result

    draft, extract = _parse_premium_intake_result(
        {
            "title": "Consulting Services Agreement",
            "jurisdiction": "Delaware",
            "purpose": "AI workflow implementation",
            "parties": [
                {"name": "Harbor Peak Analytics LLC", "role": "Consultant"},
                {"name": "Ironvale Manufacturing Inc.", "role": "Client"},
                {"name": "Alex Rivera", "role": "party"},
            ],
        },
        "Draft a consulting agreement between Harbor Peak Analytics LLC (Consultant) and Ironvale Manufacturing Inc. (Client).",
    )
    assert [p.name for p in draft.parties] == [
        "Harbor Peak Analytics LLC",
        "Ironvale Manufacturing Inc.",
    ]
    assert any("Alex Rivera" in ask for ask in extract.material_asks)


def test_three_party_entity_signer_lines_bind_complete_assignments() -> None:
    intake = (
        "Stonebridge Analytics LLC signer: Sandra Wells, Managing Member, sandra@stonebridge.test.\n"
        "Novapath Systems Inc. signer: Caleb Price, Chief Product Officer, caleb@novapath.test.\n"
        "Clearspring Holdings LLC signer: Maya Coleman, President, maya@clearspring.test."
    )
    out = bind_representatives_to_legal_parties(
        [
            {"name": "Stonebridge Analytics LLC", "role": "party"},
            {"name": "Novapath Systems Inc.", "role": "party"},
            {"name": "Clearspring Holdings LLC", "role": "party"},
            {"name": "Sandra Wells", "role": "signer"},
            {"name": "Caleb Price", "role": "signer"},
            {"name": "Maya Coleman", "role": "signer"},
        ],
        intake,
    )
    assert [p["name"] for p in out["parties"]] == [
        "Stonebridge Analytics LLC",
        "Novapath Systems Inc.",
        "Clearspring Holdings LLC",
    ]
    assert [p.get("signerName") for p in out["parties"]] == ["Sandra Wells", "Caleb Price", "Maya Coleman"]
    assert [p.get("email") for p in out["parties"]] == [
        "sandra@stonebridge.test",
        "caleb@novapath.test",
        "maya@clearspring.test",
    ]
    assert out["unresolved_extraction_rows"] == []
    assert out["clarification_question"] is None


def test_four_party_explicit_roles_bind_complete_assignments() -> None:
    intake = (
        "Lumen Bioinformatics Inc. (Platform Developer). "
        "Thalassa Data Systems LLC (Data Infrastructure Provider). "
        "Coastal Meridian Analytics LLC (Analytics Integrator). "
        "Vanguard Regulatory Sciences Ltd. (Regulatory Compliance Advisor)."
    )
    rows = [
        {"name": "Lumen Bioinformatics Inc.", "role": "Platform Developer"},
        {"name": "Thalassa Data Systems LLC", "role": "Data Infrastructure Provider"},
        {"name": "Coastal Meridian Analytics LLC", "role": "Analytics Integrator"},
        {"name": "Vanguard Regulatory Sciences Ltd.", "role": "Regulatory Compliance Advisor"},
        {"name": "Elena Vasquez", "role": "Platform Developer signer", "email": "elena@lumen.test"},
        {"name": "Marcus Webb", "role": "Data Infrastructure Provider signer", "email": "marcus@thalassa.test"},
        {"name": "Priya Nair", "role": "Analytics Integrator signer", "email": "priya@coastal.test"},
        {"name": "Jonah Reeves", "role": "Regulatory Compliance Advisor signer", "email": "jonah@vanguard.test"},
    ]
    out = bind_representatives_to_legal_parties(rows, intake)
    assert [p["name"] for p in out["parties"]] == [
        "Lumen Bioinformatics Inc.",
        "Thalassa Data Systems LLC",
        "Coastal Meridian Analytics LLC",
        "Vanguard Regulatory Sciences Ltd.",
    ]
    assert [p.get("role") for p in out["parties"]] == [
        "Platform Developer",
        "Data Infrastructure Provider",
        "Analytics Integrator",
        "Regulatory Compliance Advisor",
    ]
    assert [p.get("signerName") for p in out["parties"]] == [
        "Elena Vasquez",
        "Marcus Webb",
        "Priya Nair",
        "Jonah Reeves",
    ]
    assert [p.get("email") for p in out["parties"]] == [
        "elena@lumen.test",
        "marcus@thalassa.test",
        "priya@coastal.test",
        "jonah@vanguard.test",
    ]
    assert out["unresolved_extraction_rows"] == []


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
