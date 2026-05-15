"""Focused tests for AI airlock wiring in backend.llm_router."""

from __future__ import annotations

from unittest.mock import MagicMock

import pytest

from backend.security.ai_airlock import BLOCK_REASON_PROTECTED_MODE_EXTERNAL_AI

from backend.llm_router import ExternalAIBlockedError, call_legal_llm, embed_texts


def _stub_completion_response(content: str = "ok") -> MagicMock:
    msg = MagicMock()
    msg.content = content
    choice = MagicMock()
    choice.message = msg
    resp = MagicMock()
    resp.choices = [choice]
    return resp


def test_call_legal_llm_blocked_skips_openai(monkeypatch: pytest.MonkeyPatch) -> None:
    mock_create = MagicMock()
    mock_client = MagicMock()
    mock_client.chat.completions.create = mock_create
    monkeypatch.setattr("backend.llm_router._get_client", lambda: mock_client)

    # Policy uses word boundaries; "attorney" must stand alone to trigger a block.
    secret = "unique_blocked_phrase my attorney client_xyz"
    with pytest.raises(ExternalAIBlockedError) as excinfo:
        call_legal_llm([{"role": "user", "content": secret}])

    mock_create.assert_not_called()
    err_text = str(excinfo.value)
    assert secret not in err_text
    assert "attorney" not in err_text.lower()


def test_call_legal_llm_blocked_exception_metadata_only() -> None:
    with pytest.raises(ExternalAIBlockedError) as excinfo:
        call_legal_llm([{"role": "user", "content": "this is privileged work product"}])
    assert str(excinfo.value) == f"external_ai_blocked:{BLOCK_REASON_PROTECTED_MODE_EXTERNAL_AI}"
    assert excinfo.value.block_reason == BLOCK_REASON_PROTECTED_MODE_EXTERNAL_AI


def test_call_legal_llm_settlement_allows_in_local_bypass(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    # "settlement" triggers protected mode; only non-prod + CLAW_ALLOW_EXTERNAL_AI_LOCAL allows the call.
    mock_create = MagicMock()
    mock_create.return_value = _stub_completion_response("draft ok")
    mock_client = MagicMock()
    mock_client.chat.completions.create = mock_create
    monkeypatch.setattr("backend.llm_router._get_client", lambda: mock_client)
    monkeypatch.setenv("CLAW_ENVIRONMENT", "local")
    monkeypatch.setenv("CLAW_ALLOW_EXTERNAL_AI_LOCAL", "1")
    out = call_legal_llm(
        [
            {
                "role": "user",
                "content": "Draft a settlement agreement for two parties. Settlement terms: mutual release.",
            }
        ],
    )
    assert out == "draft ok"
    mock_create.assert_called_once()


def test_call_legal_llm_settlement_still_blocked_in_production(monkeypatch: pytest.MonkeyPatch) -> None:
    mock_create = MagicMock()
    mock_client = MagicMock()
    mock_client.chat.completions.create = mock_create
    monkeypatch.setattr("backend.llm_router._get_client", lambda: mock_client)
    monkeypatch.setenv("CLAW_ENVIRONMENT", "production")
    monkeypatch.setenv("CLAW_ALLOW_EXTERNAL_AI_LOCAL", "1")
    with pytest.raises(ExternalAIBlockedError) as excinfo:
        call_legal_llm([{"role": "user", "content": "settlement and mutual release for both parties."}])
    assert excinfo.value.block_reason == BLOCK_REASON_PROTECTED_MODE_EXTERNAL_AI
    mock_create.assert_not_called()


def test_call_legal_llm_allowed_sends_minimized_not_raw_email(monkeypatch: pytest.MonkeyPatch) -> None:
    captured: dict = {}

    def fake_create(**kwargs: object) -> MagicMock:
        captured["messages"] = kwargs.get("messages")
        return _stub_completion_response()

    mock_client = MagicMock()
    mock_client.chat.completions.create = fake_create
    monkeypatch.setattr("backend.llm_router._get_client", lambda: mock_client)

    email = "reach_me@example.com"
    call_legal_llm([{"role": "user", "content": f"hello {email} there"}])

    assert "messages" in captured
    user_parts = [m for m in captured["messages"] if m["role"] == "user"]
    assert len(user_parts) == 1
    outbound = user_parts[0]["content"]
    assert email not in outbound
    assert "[EMAIL_1]" in outbound


def test_call_legal_llm_preserves_system_and_non_user_roles(monkeypatch: pytest.MonkeyPatch) -> None:
    captured: dict = {}

    def fake_create(**kwargs: object) -> MagicMock:
        captured["messages"] = kwargs.get("messages")
        return _stub_completion_response()

    mock_client = MagicMock()
    mock_client.chat.completions.create = fake_create
    monkeypatch.setattr("backend.llm_router._get_client", lambda: mock_client)

    system_text = "You are a helpful assistant."
    call_legal_llm(
        [
            {"role": "system", "content": system_text},
            {"role": "assistant", "content": "prior"},
            {"role": "user", "content": "plain greeting"},
        ]
    )

    msgs = captured["messages"]
    assert msgs[0] == {"role": "system", "content": system_text}
    assert msgs[1] == {"role": "assistant", "content": "prior"}
    assert msgs[2]["role"] == "user"
    assert "plain greeting" in msgs[2]["content"]


def test_call_legal_llm_agreement_outbound_allows_settlement_word_in_production(monkeypatch: pytest.MonkeyPatch) -> None:
    mock_create = MagicMock()
    mock_create.return_value = _stub_completion_response("ok")
    mock_client = MagicMock()
    mock_client.chat.completions.create = mock_create
    monkeypatch.setattr("backend.llm_router._get_client", lambda: mock_client)
    monkeypatch.setenv("CLAW_ENVIRONMENT", "production")
    monkeypatch.setenv("CLAW_ALLOW_EXTERNAL_AI_LOCAL", "1")
    out = call_legal_llm(
        [{"role": "user", "content": "settlement allocation schedule for milestone vendor invoices."}],
        airlock_profile="agreement_outbound",
    )
    assert out == "ok"
    mock_create.assert_called_once()


def test_call_legal_llm_agreement_outbound_allows_attorney_fees_in_repair_json(monkeypatch: pytest.MonkeyPatch) -> None:
    import json

    payload = json.dumps(
        {
            "repair_task": "full_draft_rewrite_after_rejection",
            "rejected_pro_draft": {
                "document_text": (
                    "The prevailing party may recover reasonable attorney fees and costs in any enforcement action."
                ),
            },
        },
        ensure_ascii=False,
    )
    mock_create = MagicMock()
    mock_create.return_value = _stub_completion_response('{"title":"T","agreement_family":"x","document_text":"y","key_terms_found":[],"missing_material_info":[]}')
    mock_client = MagicMock()
    mock_client.chat.completions.create = mock_create
    monkeypatch.setattr("backend.llm_router._get_client", lambda: mock_client)
    monkeypatch.setenv("CLAW_ENVIRONMENT", "production")
    out = call_legal_llm(
        [{"role": "user", "content": payload}],
        airlock_profile="agreement_outbound",
        airlock_log_context="test:repair_json",
    )
    assert "title" in out
    mock_create.assert_called_once()


def test_call_legal_llm_default_profile_blocks_attorney_fees_json(monkeypatch: pytest.MonkeyPatch) -> None:
    import json

    payload = json.dumps(
        {"note": "The prevailing party may recover reasonable attorney fees."},
        ensure_ascii=False,
    )
    mock_create = MagicMock()
    mock_client = MagicMock()
    mock_client.chat.completions.create = mock_create
    monkeypatch.setattr("backend.llm_router._get_client", lambda: mock_client)
    monkeypatch.setenv("CLAW_ENVIRONMENT", "production")
    with pytest.raises(ExternalAIBlockedError):
        call_legal_llm([{"role": "user", "content": payload}])
    mock_create.assert_not_called()


def test_embed_texts_blocked_skips_embeddings(monkeypatch: pytest.MonkeyPatch) -> None:
    mock_emb = MagicMock()
    mock_client = MagicMock()
    mock_client.embeddings.create = mock_emb
    monkeypatch.setattr("backend.llm_router._get_client", lambda: mock_client)

    with pytest.raises(ExternalAIBlockedError):
        embed_texts(["safe text", "contact my attorney"])

    mock_emb.assert_not_called()


def test_embed_texts_uses_minimized_input(monkeypatch: pytest.MonkeyPatch) -> None:
    captured: dict = {}

    def fake_embeddings_create(**kwargs: object) -> MagicMock:
        captured["input"] = kwargs.get("input")
        data = MagicMock()
        data.embedding = [0.1, 0.2]
        resp = MagicMock()
        resp.data = [data]
        return resp

    mock_client = MagicMock()
    mock_client.embeddings.create = fake_embeddings_create
    monkeypatch.setattr("backend.llm_router._get_client", lambda: mock_client)

    email = "e2e@example.com"
    embed_texts([f"note {email}"])

    assert email not in captured["input"][0]
    assert "[EMAIL_1]" in captured["input"][0]
