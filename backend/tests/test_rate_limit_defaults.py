"""Launch defaults: production-like environments get non-zero rate limits when env vars unset.

Each case runs in a fresh interpreter so we do not reload ``backend.main`` in-process
(which would break other tests that already imported the app).
"""

import os
import subprocess
import sys
from pathlib import Path

_REPO = Path(__file__).resolve().parents[2]


def _run_rate_limit_snippet(env_updates: dict[str, str | None]) -> tuple[float, float]:
    env = os.environ.copy()
    for k, v in env_updates.items():
        if v is None:
            env.pop(k, None)
        else:
            env[k] = v
    code = f"""
import sys
sys.path.insert(0, {str(_REPO)!r})
from backend.main import _rate_limit_rps_burst
rps, burst = _rate_limit_rps_burst()
print(f"{{rps}},{{burst}}")
"""
    out = subprocess.check_output(
        [sys.executable, "-c", code],
        cwd=str(_REPO),
        env=env,
        text=True,
    ).strip()
    a, b = out.split(",")
    return float(a), float(b)


def test_rate_limit_unlimited_when_claw_environment_local():
    rps, burst = _run_rate_limit_snippet(
        {"CLAW_ENVIRONMENT": "local", "CLAW_RATE_LIMIT_RPS": None, "CLAW_RATE_LIMIT_BURST": None}
    )
    assert rps == 0.0 and burst == 0.0


def test_rate_limit_defaults_when_production_and_vars_unset():
    rps, burst = _run_rate_limit_snippet(
        {"CLAW_ENVIRONMENT": "production", "CLAW_RATE_LIMIT_RPS": None, "CLAW_RATE_LIMIT_BURST": None}
    )
    assert rps == 8.0 and burst == 16.0


def test_rate_limit_explicit_env_overrides_defaults():
    rps, burst = _run_rate_limit_snippet(
        {
            "CLAW_ENVIRONMENT": "production",
            "CLAW_RATE_LIMIT_RPS": "3",
            "CLAW_RATE_LIMIT_BURST": "9",
        }
    )
    assert rps == 3.0 and burst == 9.0
