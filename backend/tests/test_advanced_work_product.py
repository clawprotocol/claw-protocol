from backend.advanced_work_product.templates import (
    LIMITED_OUTPUT_TYPES,
    allowed_types_for_tier,
    template_for,
)


def test_allowed_types_tier_ladder() -> None:
    assert allowed_types_for_tier("none") == []
    lim = allowed_types_for_tier("limited")
    assert "executive_summary" in lim
    assert "issue_analysis" in lim
    assert "white_paper" not in lim
    full = allowed_types_for_tier("full")
    assert len(full) > len(lim)
    assert "white_paper" in full


def test_limited_set_matches_policy() -> None:
    assert LIMITED_OUTPUT_TYPES == frozenset({"executive_summary", "issue_analysis"})


def test_template_keys_exist() -> None:
    t = template_for("feature_brief")
    assert any(s["key"] == "executive_overview" for s in t["sections"])
