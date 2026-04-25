"""
Production fail-closed behavior for admin/debug/internal routes (see backend.main).

Each case uses a fresh interpreter so ``backend.main`` picks up the subprocess env.
"""

import os
import subprocess
import sys
from pathlib import Path

_REPO = Path(__file__).resolve().parents[2]


def _run_main_snippet(body: str, env_updates: dict[str, str | None]) -> subprocess.CompletedProcess[str]:
    env = os.environ.copy()
    for k, v in env_updates.items():
        if v is None:
            env.pop(k, None)
        else:
            env[k] = v
    code = f"""
import os
import sys
from unittest.mock import MagicMock

sys.path.insert(0, {str(_REPO)!r})
{body}
"""
    return subprocess.run(
        [sys.executable, "-c", code],
        cwd=str(_REPO),
        env=env,
        capture_output=True,
        text=True,
        timeout=120,
    )


def test_debug_defaults_off_in_production_like():
    r = _run_main_snippet(
        "from backend.main import _debug_enabled\n"
        'assert _debug_enabled() is False, "expected debug off when CLAW_DEBUG unset in prod"\n'
        'print("ok")',
        {"CLAW_ENVIRONMENT": "production", "CLAW_DEBUG": None},
    )
    assert r.returncode == 0, r.stderr + r.stdout


def test_debug_explicit_on_in_production_like():
    r = _run_main_snippet(
        "from backend.main import _debug_enabled\n"
        "assert _debug_enabled() is True\n"
        'print("ok")',
        {"CLAW_ENVIRONMENT": "production", "CLAW_DEBUG": "1"},
    )
    assert r.returncode == 0, r.stderr + r.stdout


def test_debug_defaults_on_in_local_when_unset():
    r = _run_main_snippet(
        "from backend.main import _debug_enabled\n"
        "assert _debug_enabled() is True\n"
        'print("ok")',
        {"CLAW_ENVIRONMENT": "local", "CLAW_DEBUG": None},
    )
    assert r.returncode == 0, r.stderr + r.stdout


def test_admin_denied_when_production_secret_unset():
    r = _run_main_snippet(
        "from backend.main import _admin_ok\n"
        "from unittest.mock import MagicMock\n"
        "req = MagicMock()\n"
        "req.headers.get = lambda k, d=None: None\n"
        "assert _admin_ok(req) is False\n"
        'print("ok")',
        {"CLAW_ENVIRONMENT": "production", "CLAW_ADMIN_SECRET": None},
    )
    assert r.returncode == 0, r.stderr + r.stdout


def test_admin_allowed_local_without_secret():
    r = _run_main_snippet(
        "from backend.main import _admin_ok\n"
        "from unittest.mock import MagicMock\n"
        "req = MagicMock()\n"
        "req.headers.get = lambda k, d=None: None\n"
        "assert _admin_ok(req) is True\n"
        'print("ok")',
        {"CLAW_ENVIRONMENT": "local", "CLAW_ADMIN_SECRET": None},
    )
    assert r.returncode == 0, r.stderr + r.stdout


def test_admin_production_secret_must_match_header():
    r = _run_main_snippet(
        "from backend.main import _admin_ok\n"
        "from unittest.mock import MagicMock\n"
        "req = MagicMock()\n"
        "req.headers.get = lambda k, d=None: 'wrong' if k == 'x-claw-admin-secret' else None\n"
        "assert _admin_ok(req) is False\n"
        "req2 = MagicMock()\n"
        "req2.headers.get = lambda k, d=None: 's3cr3t' if k == 'x-claw-admin-secret' else None\n"
        "assert _admin_ok(req2) is True\n"
        'print("ok")',
        {
            "CLAW_ENVIRONMENT": "production",
            "CLAW_ADMIN_SECRET": "s3cr3t",
            "CLAW_DEBUG": None,
        },
    )
    assert r.returncode == 0, r.stderr + r.stdout
