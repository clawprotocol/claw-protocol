"""No network: authorized evaluation ceilings hold before provider dispatch."""
from concurrent.futures import ThreadPoolExecutor
from types import SimpleNamespace

import pytest

from backend.quality_eval_budget import QualityEvalBudget, QualityEvalBlocked, configured_budget


def request(**overrides):
    return {"model": "gpt-4o", "messages": [{"role": "user", "content": "Synthetic contract input"}],
            "purpose": "agreement_drafting", "max_tokens": 8000, **overrides}


@pytest.fixture
def budget(tmp_path):
    return QualityEvalBudget.create(tmp_path / "approval.sqlite3")


def test_primary_attempts_include_failures_and_survive_restart(budget):
    one = budget.reserve(**request())
    budget.finish(one, failed=True)
    restarted = QualityEvalBudget(budget.path)
    two = restarted.reserve(**request())
    restarted.finish(two, usage={"prompt_tokens": 100, "completion_tokens": 20}, model="gpt-4o")
    before = restarted.summary()
    with pytest.raises(QualityEvalBlocked, match="call_limit"):
        restarted.reserve(**request())
    assert restarted.summary() == before
    assert before["attempts"] == 2 and before["reserved_upper_usd"] > 0
    with pytest.raises(FileExistsError):
        QualityEvalBudget.create(budget.path)


@pytest.mark.parametrize("overrides,code", [
    ({"model": "unpriced"}, "unpriced_model"),
    ({"purpose": "premium_review"}, "unapproved_purpose"),
    ({"repair": "unbounded"}, "unapproved_purpose"),
    ({"max_tokens": 8001}, "output_limit"),
    ({"messages": [{"role": "user", "content": [{"type": "image"}]}]}, "unsupported_input_shape"),
    ({"messages": [{"role": "user", "content": "a" * 120000}]}, "input_limit"),
])
def test_rejects_before_reservation(budget, overrides, code):
    with pytest.raises(QualityEvalBlocked, match=code):
        budget.reserve(**request(**overrides))
    assert budget.summary()["attempts"] == 0


def test_pre_dispatch_dollar_reservation_includes_input_and_max_output(tmp_path):
    budget = QualityEvalBudget.create(tmp_path / "small.sqlite3", approved_usd=1)
    large = request(messages=[{"role": "user", "content": "a" * 110000}])
    for _ in range(2):
        budget.reserve(**large)
    with pytest.raises(QualityEvalBlocked, match="dollar_limit"):
        budget.reserve(**{**large, "purpose": "conditional_repair", "repair": "repair"})
    assert budget.summary()["attempts"] == 2


def test_concurrent_requests_cannot_bypass_category_limit(budget):
    def attempt(_):
        try:
            QualityEvalBudget(budget.path).reserve(**request())
            return True
        except QualityEvalBlocked:
            return False
    with ThreadPoolExecutor(max_workers=5) as executor:
        assert sum(executor.map(attempt, range(5))) == 2
    assert budget.summary()["attempts"] == 2


def test_all_automatic_repair_flavors_share_one_limit(budget):
    budget.reserve(**request(repair="regen"))
    budget.reserve(**request(purpose="conditional_repair", repair="repair"))
    with pytest.raises(QualityEvalBlocked, match="call_limit"):
        budget.reserve(**request(repair="retry"))


def test_unexpected_usage_halts_future_calls(budget):
    attempt = budget.reserve(**request())
    with pytest.raises(QualityEvalBlocked, match="exceeded_reservation"):
        budget.finish(attempt, usage={"prompt_tokens": 1000000, "completion_tokens": 8000}, model="gpt-4o")
    with pytest.raises(QualityEvalBlocked, match="approval_halted"):
        budget.reserve(**request())


def test_only_local_explicit_approval_is_allowed(monkeypatch, tmp_path):
    monkeypatch.setenv("CLAW_QUALITY_EVAL_BUDGET_PATH", str(tmp_path / "missing.sqlite3"))
    monkeypatch.setenv("CLAW_ENVIRONMENT", "production")
    with pytest.raises(QualityEvalBlocked, match="local_only"):
        configured_budget()
    monkeypatch.setenv("CLAW_ENVIRONMENT", "test")
    with pytest.raises(QualityEvalBlocked, match="ledger_missing"):
        configured_budget().reserve(**request())


def test_router_dispatch_is_reserved_and_sdk_retries_disabled(budget, monkeypatch):
    import backend.llm_router as router
    monkeypatch.setenv("CLAW_ENVIRONMENT", "test")
    monkeypatch.setenv("CLAW_LLM_ACCEPTANCE_STUB", "0")
    monkeypatch.setenv("CLAW_QUALITY_EVAL_BUDGET_PATH", str(budget.path))
    monkeypatch.setattr(router, "_messages_after_user_airlock", lambda messages, **kw: messages)
    dispatches, options = [], []
    def create(**kwargs):
        assert budget.summary()["attempts"] == len(dispatches) + 1
        dispatches.append(kwargs)
        return SimpleNamespace(model="gpt-4o-2024-08-06", usage=SimpleNamespace(prompt_tokens=20, completion_tokens=10),
                               choices=[SimpleNamespace(message=SimpleNamespace(content="synthetic output"), finish_reason="stop")])
    client = SimpleNamespace(base_url="https://api.openai.com/v1/", chat=SimpleNamespace(completions=SimpleNamespace(create=create)))
    def with_options(**kwargs):
        options.append(kwargs)
        return client
    client.with_options = with_options
    monkeypatch.setattr(router, "_get_client", lambda: client)
    for _ in range(2):
        assert router.call_legal_llm(request()["messages"], model="gpt-4o", max_tokens=8000,
                                    call_purpose="agreement_drafting") == "synthetic output"
    with pytest.raises(QualityEvalBlocked, match="call_limit"):
        router.call_legal_llm(request()["messages"], model="gpt-4o", max_tokens=8000,
                              call_purpose="agreement_drafting")
    assert len(dispatches) == 2
    assert all(o == {"max_retries": 0, "timeout": 90.0} for o in options)
    assert budget.summary()["reserved_upper_usd"] > 0


def test_railway_gpt54_model_has_own_price_and_no_model_swap(tmp_path):
    budget = QualityEvalBudget.create(tmp_path / "railway.sqlite3", model="gpt-5.4")
    with pytest.raises(QualityEvalBlocked, match="model_differs"):
        budget.reserve(**request())
    aid = budget.reserve(**request(model="gpt-5.4"))
    budget.finish(aid, usage={"prompt_tokens": 30, "completion_tokens": 100}, model="gpt-5.4-2026-03-05")
    assert budget.summary()["model"] == "gpt-5.4"
    assert budget.summary()["reserved_upper_usd"] >= 8000 * 15 / 1_000_000


def test_existing_basic_bootstrap_is_bounded_and_cannot_replace_premium(tmp_path):
    budget = QualityEvalBudget.create(tmp_path / "mixed.sqlite3", model="gpt-5.4")
    bootstrap = request(model="gpt-4o-mini", purpose="structured_extraction", max_tokens=350)
    for _ in range(2):
        aid = budget.reserve(**bootstrap)
        budget.finish(aid, usage={"prompt_tokens": 100, "completion_tokens": 100}, model="gpt-4o-mini-2024-07-18")
    with pytest.raises(QualityEvalBlocked, match="call_limit"):
        budget.reserve(**bootstrap)
    with pytest.raises(QualityEvalBlocked, match="unapproved_purpose"):
        budget.reserve(**request(model="gpt-4o-mini"))
    for _ in range(4):
        budget.reserve(**request(model="gpt-4o-mini", purpose="free_one_pager", max_tokens=1200))
    with pytest.raises(QualityEvalBlocked, match="call_limit"):
        budget.reserve(**request(model="gpt-4o-mini", purpose="free_one_pager", max_tokens=1200))
    assert budget.summary()["attempts"] == 6
    assert budget.summary()["ceiling_usd"] == 8


def test_mixed_pipeline_keeps_sixteen_call_global_ceiling(tmp_path):
    budget = QualityEvalBudget.create(tmp_path / "total.sqlite3", model="gpt-5.4")
    for purpose, tokens, count, repair in [
        ("structured_extraction", 1200, 4, "none"),
        ("missing_facts", 900, 4, "none"),
        ("agreement_drafting", 8000, 2, "none"),
        ("conditional_repair", 8000, 2, "repair"),
        ("explicit_revision", 12000, 2, "none"),
        ("recipient_negotiation", 768, 1, "none"),
    ]:
        for _ in range(count):
            budget.reserve(**request(model="gpt-5.4", purpose=purpose, max_tokens=tokens, repair=repair))
    bootstrap = request(model="gpt-4o-mini", purpose="structured_extraction", max_tokens=350)
    budget.reserve(**bootstrap)
    with pytest.raises(QualityEvalBlocked, match="call_limit"):
        budget.reserve(**bootstrap)
    assert budget.summary()["attempts"] == 16
