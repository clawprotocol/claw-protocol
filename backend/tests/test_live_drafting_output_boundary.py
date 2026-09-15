"""No-spend regressions for the real 2026-09-13 provider failure.

SDK is simulated, but the production airlock/router and HTTP handler run normally.
The saved-response replay is local evidence only; portable minimal negatives also run.
"""
import json
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import MagicMock

import pytest

from backend import llm_router
from backend.security.agreement_identity import AgreementIdentityError, restore_agreement_identities
from backend.routers import agreements_v2_api as av2


@pytest.fixture(autouse=True)
def no_external_calls(monkeypatch):
    monkeypatch.setenv("CLAW_LLM_ACCEPTANCE_STUB", "0")
    monkeypatch.delenv("CLAW_QUALITY_EVAL_BUDGET_PATH", raising=False)
    monkeypatch.setenv("CLAW_ENVIRONMENT", "production")
    monkeypatch.delenv("CLAW_ALLOW_EXTERNAL_AI_LOCAL", raising=False)


def sdk(monkeypatch, text, finish="stop"):
    client = MagicMock()
    client.chat.completions.create.return_value = SimpleNamespace(
        choices=[SimpleNamespace(message=SimpleNamespace(content=text), finish_reason=finish)],
        usage=None, model="gpt-5.4", id="offline-response",
    )
    monkeypatch.setattr(llm_router, "_get_client", lambda: client)
    return client


def test_actual_router_restores_roles_names_and_email_without_sending_them(monkeypatch):
    client = sdk(monkeypatch, json.dumps({
        "parties": [{"name": "[ORG_1]", "role": "Consultant"}, {"name": "[ORG_2]", "role": "Client"}],
        "authoritative_draft": "[ORG_1] (Consultant), [ORG_2] (Client). Contact [EMAIL_1].",
    }))
    out = json.loads(llm_router.call_legal_llm([{"role": "user", "content":
        "Harbor Peak Analytics LLC (Consultant) and Ironvale Manufacturing Inc (Client). Contact maya@harbor.test."
    }], airlock_profile="agreement_outbound"))
    assert out["parties"] == [{"name": "Harbor Peak Analytics LLC", "role": "Consultant"},
                              {"name": "Ironvale Manufacturing Inc", "role": "Client"}]
    assert "maya@harbor.test" in out["authoritative_draft"]
    wire = json.dumps(client.chat.completions.create.call_args.kwargs["messages"])
    assert "Harbor Peak" not in wire and "maya@harbor.test" not in wire
    assert "[ORG_1]" in wire and "[ORG_2]" in wire


def test_multiple_messages_do_not_reuse_one_token_for_different_parties(monkeypatch):
    sdk(monkeypatch, '{"parties":["[ORG_1]","[ORG_2]","[ORG_1]"]}')
    out = llm_router.call_legal_llm([
        {"role": "user", "content": "Harbor Peak Analytics LLC"},
        {"role": "user", "content": "Ironvale Manufacturing Inc and Harbor Peak Analytics LLC"},
    ], airlock_profile="agreement_outbound")
    assert json.loads(out)["parties"] == ["Harbor Peak Analytics LLC", "Ironvale Manufacturing Inc", "Harbor Peak Analytics LLC"]


def test_no_cross_request_identity_cache(monkeypatch):
    sdk(monkeypatch, 'Agreement with [ORG_1]')
    first = llm_router.call_legal_llm([{"role": "user", "content": "Harbor Peak LLC"}], airlock_profile="agreement_outbound")
    second = llm_router.call_legal_llm([{"role": "user", "content": "Northwind Retail Inc"}], airlock_profile="agreement_outbound")
    assert first == "Agreement with Harbor Peak LLC"
    assert second == "Agreement with Northwind Retail Inc"
    with pytest.raises(AgreementIdentityError, match="unbound_agreement_identity"):
        llm_router.call_legal_llm([{"role": "user", "content": "no named party"}], airlock_profile="agreement_outbound")


def test_unknown_output_and_literal_input_tokens_fail_closed(monkeypatch):
    client = sdk(monkeypatch, '{"name":"[ORG_99]"}')
    with pytest.raises(AgreementIdentityError):
        llm_router.call_legal_llm([{"role": "user", "content": "Harbor Peak LLC"}], airlock_profile="agreement_outbound")
    client.chat.completions.create.reset_mock()
    with pytest.raises(AgreementIdentityError, match="reserved_identity_token_in_input"):
        llm_router.call_legal_llm([{"role": "user", "content": "Harbor Peak LLC and [ORG_1]"}], airlock_profile="agreement_outbound")
    client.chat.completions.create.assert_not_called()


def test_json_restoration_is_escaped_and_not_recursive():
    original = 'A "Quoted" Company\\Name\nLLC'
    restored = restore_agreement_identities('{"body":"[ORG_1]"}', {"[ORG_1]": original})
    assert json.loads(restored) == {"body": original}
    assert restore_agreement_identities("[ORG_1]", {"[ORG_1]": "literal [EMAIL_1]"}) == "literal [EMAIL_1]"
    with pytest.raises(AgreementIdentityError, match="identity_in_schema_key"):
        restore_agreement_identities('{"[ORG_1]":1}', {"[ORG_1]": "body"})


def test_minimized_away_identity_cannot_be_restored(monkeypatch):
    sdk(monkeypatch, "[EMAIL_1]")
    with pytest.raises(AgreementIdentityError, match="unbound_agreement_identity"):
        llm_router.call_legal_llm([{"role": "user", "content": "word " * 1000 + "hidden@example.test"}], airlock_profile="agreement_outbound")


def test_privilege_block_still_happens_before_provider(monkeypatch):
    client = sdk(monkeypatch, "unused")
    with pytest.raises(llm_router.ExternalAIBlockedError):
        llm_router.call_legal_llm([{"role": "user", "content": "privileged trial strategy memo about plaintiff Harbor Peak LLC"}], airlock_profile="agreement_outbound")
    client.chat.completions.create.assert_not_called()


@pytest.mark.parametrize("text", ['{"authoritative_draft":"' + "x" * 41042, "SERVICES AGREEMENT\n" + "x" * 8000])
def test_truncation_never_becomes_success_from_length(text):
    out = av2._premium_full_draft_degraded_response(intake_s="Harbor consulting", ctx_dict=None,
        failure_code="output_truncated", failure_message="incomplete", preserved_substantive_body=text,
        use_truncated_keep_floor=True)
    assert out.generation_ok is False and out.retryable is True
    assert out.document_text == out.authoritative_draft == out.server_full_document_text == ""


def test_saved_failed_live_response_cannot_be_promoted():
    path = Path(__file__).resolve().parents[2] / "evals/commercial-readiness/results/quality-eval-live/20260913T193125Z-7488/consulting-premium-result.json"
    if not path.exists():
        pytest.skip("private local evidence; portable truncation negatives run separately")
    raw = json.loads(path.read_text())["document_text"]
    assert len(raw) == 41042 and '[ORG_1]' in raw
    out = av2._premium_full_draft_degraded_response(intake_s="Harbor consulting", ctx_dict=None,
        failure_code="output_truncated", failure_message="incomplete", preserved_substantive_body=raw,
        use_truncated_keep_floor=True)
    assert not out.generation_ok and out.retryable and not out.authoritative_draft


def test_saved_agreement_identity_replay_only_not_acceptance():
    root = Path(__file__).resolve().parents[2] / "evals/commercial-readiness/results/quality-eval-live/20260913T193125Z-7488"
    if not root.exists():
        pytest.skip("private local evidence; portable identity proofs run separately")
    raw = json.loads((root / "consulting-premium-result.json").read_text())["document_text"]
    request = next(x["request"] for x in json.loads((root / "consulting-model-endpoints.json").read_text())
                   if x["path"].endswith("premium-full-draft"))
    payload, _ = av2.build_premium_full_draft_user_payload_for_airlock(av2.PremiumFullDraftRequest(**request))
    bindings = {}
    llm_router._messages_after_user_airlock([{"role": "user", "content": json.dumps(payload, ensure_ascii=False)}],
        airlock_profile="agreement_outbound", identity_bindings=bindings)
    # Extract a *complete string* solely to reproduce masking without paying again.
    # Production still rejects the original response's finish_reason=length above.
    paper, _ = json.JSONDecoder().raw_decode(raw.split('"authoritative_draft":', 1)[1])
    assert len(paper) == 18677
    restored = json.loads(restore_agreement_identities(json.dumps({"authoritative_draft": paper}), bindings))["authoritative_draft"]
    assert 'Harbor Peak Analytics LLC ("Consultant")' in restored
    assert 'Ironvale Manufacturing Inc. ("Client")' in restored
    assert 'maya.chen@harborpeak.test' in restored and 'jordan.hale@ironvale.test' in restored
    assert '[ORG_' not in restored and '[EMAIL_' not in restored
    validation = av2._validate_and_log_premium_agreement_draft(authoritative_draft=restored,
        agreement_intelligence=av2.AgreementIntelligence(), original_intake=request["intake_text"], stage="offline_replay")
    assert validation.passed


def test_failed_validation_cannot_override_authority(monkeypatch):
    monkeypatch.setattr(av2, "premium_full_draft_body_meets_substance_floor", lambda *a, **k: (True, []))
    out = av2._premium_full_draft_degraded_response(intake_s="Harbor consulting", ctx_dict=None,
        failure_code="json_parse", failure_message="bad output", preserved_substantive_body="AGREEMENT\n[ORG_1] " * 500)
    assert out.agreement_validation.passed is False
    assert not out.generation_ok and out.retryable and not out.document_text


def test_single_body_prompt_contract_and_server_compatibility():
    prompt = av2._premium_full_draft_system_prompt()
    assert "Emit the full agreement ONCE" in prompt
    assert "you may also include `document_text`" not in prompt
    normalized = av2._normalize_premium_full_draft_result({"authoritative_draft": "exact paper", "title": "Agreement"})
    assert normalized.authoritative_draft == normalized.document_text == "exact paper"


def test_final_http_boundary_cannot_claim_success_against_failed_validation():
    rejected = av2._validate_and_log_premium_agreement_draft(authoritative_draft="[ORG_1]",
        agreement_intelligence=av2.AgreementIntelligence(), original_intake="Harbor consulting", stage="offline")
    assert not rejected.passed
    model = av2.PremiumFullDraftResponse(document_text="rejected paper", authoritative_draft="rejected paper",
        server_full_document_text="rejected paper", server_repair_document_text="rejected repair",
        generation_ok=True, agreement_validation=rejected)
    response = av2._premium_full_draft_finalize_http_response(model, intake_len=20, session_hint="offline")
    wire = json.loads(response.body)
    assert response.status_code == 503
    assert wire["generation_ok"] is False and wire["retryable"] is True
    assert wire["server_generation_failure_code"] == "agreement_validation_failed"
    assert all(wire[key] == "" for key in ("document_text", "authoritative_draft", "server_full_document_text", "server_repair_document_text"))


def test_parenthesized_party_roles_require_both_intake_identities():
    from backend.agreements.premium_agreement_validation import _has_named_parties
    draft = 'This agreement is between Harbor Peak LLC ("Consultant") and Ironvale Inc. ("Client").'
    assert _has_named_parties(draft, "Harbor Peak LLC and Ironvale Inc.", {})
    assert not _has_named_parties(draft, "Harbor Peak LLC and Other Entity LLC", {})
    assert not _has_named_parties(draft, "need consulting for two parties", {})


def test_four_party_listed_recital_is_identifiable_when_intake_names_those_entities():
    from backend.agreements.premium_agreement_validation import _has_named_parties
    from backend.tests.test_quality_eval_multiparty_acceptance_stub import FOUR_PARTY_INTAKE
    from backend.llm_acceptance_stub import stub_legal_llm_completion
    import json

    doc = json.loads(
        stub_legal_llm_completion(
            [{"role": "user", "content": FOUR_PARTY_INTAKE}],
            call_purpose="agreement_drafting",
        )
    )["document_text"]
    assert _has_named_parties(doc, FOUR_PARTY_INTAKE, {})
    assert not _has_named_parties(doc, "Harbor Peak LLC and Ironvale Inc.", {})
