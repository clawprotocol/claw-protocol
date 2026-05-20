from backend.config.http_cache_policy import cache_control_for_path


def test_health_and_webhooks_are_no_store() -> None:
    assert cache_control_for_path("/health", "GET") == "no-store"
    assert cache_control_for_path("/webhook/stripe", "POST") == "no-store"
    assert cache_control_for_path("/v1/genesis-referral/ops/summary", "GET") == "no-store"


def test_v1_api_defaults_no_store() -> None:
    assert cache_control_for_path("/v1/agreements/parse", "GET") == "no-store"
