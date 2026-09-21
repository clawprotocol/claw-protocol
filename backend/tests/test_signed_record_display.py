from backend.services.signed_record_display import (
    extract_title_from_corpus_plain,
    resolve_signed_record_display_title,
)


FOUR_PARTY_CORPUS = "\n".join(
    [
        "PRECISION MEDICINE DATA PLATFORM AGREEMENT",
        "The parties are Lumen Bioinformatics Inc. (Platform Developer), Thalassa Data Systems LLC",
        "(Data Infrastructure Provider), Coastal Meridian Analytics LLC (Analytics Integrator),",
        "and Vanguard Regulatory Sciences Ltd. (Regulatory Compliance Advisor).",
        "Massachusetts law governs without regard to conflict-of-law rules.",
    ]
)

THREE_PARTY_CORPUS = "\n".join(
    [
        "INTELLECTUAL PROPERTY LICENSE AND ROYALTY AGREEMENT",
        "This Agreement is entered into by and among Stonebridge Wellness LLC, NovaPath Learning Inc.,",
        "and ClearSpring Distribution LLC for the licensed wellness training materials.",
        "This Agreement is governed by the laws of the State of Oklahoma.",
    ]
)

TWO_PARTY_CORPUS = "\n".join(
    [
        "CONSULTING SERVICES AGREEMENT",
        'This Consulting Services Agreement is entered into by and between Harbor Peak Analytics LLC',
        '("Consultant") and Ironvale Manufacturing Inc. ("Client").',
        "This Agreement is governed by the laws of the State of Delaware.",
    ]
)


def test_extracts_four_party_corpus_heading() -> None:
    assert extract_title_from_corpus_plain(FOUR_PARTY_CORPUS) == "Precision Medicine Data Platform Agreement"


def test_signed_record_title_prefers_accepted_corpus_over_joint_venture_draft() -> None:
    draft = {
        "title": "Joint Venture Agreement",
        "accepted_review_snapshot_v1": {
            "status": "accepted",
            "corpusPlain": FOUR_PARTY_CORPUS,
        },
    }
    assert resolve_signed_record_display_title(draft) == "Precision Medicine Data Platform Agreement"


def test_signed_record_title_prefers_fully_executed_snapshot() -> None:
    draft = {
        "title": "Joint Venture Agreement",
        "vs01_signing_packet_v1": {
            "fully_executed_snapshot": {"corpus_plain": THREE_PARTY_CORPUS},
        },
        "accepted_review_snapshot_v1": {"corpusPlain": TWO_PARTY_CORPUS},
    }
    assert (
        resolve_signed_record_display_title(draft)
        == "Intellectual Property License And Royalty Agreement"
    )


def test_signed_record_title_falls_back_to_draft_when_corpus_has_no_heading() -> None:
    draft = {
        "title": "Consulting Agreement",
        "accepted_review_snapshot_v1": {
            "corpusPlain": "The parties agree to the commercial terms already confirmed by both sides.",
        },
    }
    assert resolve_signed_record_display_title(draft) == "Consulting Agreement"
