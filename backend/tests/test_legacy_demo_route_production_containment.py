"""
P0-1 production containment for disconnected legacy/demo HTTP surfaces.

Uses fresh interpreter subprocesses so ``backend.main`` picks up CLAW_ENVIRONMENT per case.
"""

from __future__ import annotations

import json
import os
import subprocess
import sys
from pathlib import Path

import pytest

_REPO = Path(__file__).resolve().parents[2]

_CONTAINED_REPRESENTATIVE_PATHS = (
    ("GET", "/v1/analyst/health"),
    ("POST", "/v1/workflow/demo/run"),
    ("POST", "/v1/esign/create"),
    ("POST", "/v1/agreements/create"),
    ("POST", "/v1/liability/create_or_update"),
    ("POST", "/agent/propose"),
    ("POST", "/propose"),
    ("POST", "/receipt"),
    ("POST", "/verify"),
    ("GET", "/v1/liability/assessment/demo-event"),
    ("GET", "/v1/timelines/demo-tl/liability/latest"),
)

_MODERN_REPRESENTATIVE_PATHS = (
    ("GET", "/health"),
    ("GET", "/v1/readyz"),
    ("GET", "/api/agreements/access/policy"),
    ("POST", "/v1/timelines"),
)

_OPENAPI_CONTAINED_SNIPPETS = (
    "/v1/workflow/demo/run",
    "/v1/esign/create",
    "/v1/agreements/create",
    "/v1/analyst/analyze",
    "/agent/propose",
)

_OPENAPI_MODERN_SNIPPETS = (
    "/api/agreements/access/policy",
    "/v1/sign-sessions",
    "/health",
)


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


def _fresh_test_client(env_updates: dict[str, str | None]):
    r = _run_main_snippet(
        """
from fastapi.testclient import TestClient
from backend.main import app
client = TestClient(app)
print(json.dumps({"paths": sorted({route.path for route in app.routes if hasattr(route, "path")})}))
""",
        env_updates,
    )
    assert r.returncode == 0, r.stderr + r.stdout
    return r


@pytest.mark.parametrize("env_name", ["production", "prod"])
def test_production_aliases_disable_legacy_demo_routes(env_name: str):
    r = _run_main_snippet(
        "from backend.config.legacy_demo_route_policy import legacy_demo_routes_enabled\n"
        "assert legacy_demo_routes_enabled() is False\n"
        'print("ok")',
        {"CLAW_ENVIRONMENT": env_name, "CLAW_ENABLE_LEGACY_DEMO_ROUTES": "1"},
    )
    assert r.returncode == 0, r.stderr + r.stdout


def test_malformed_environment_fails_closed_for_legacy_demo():
    r = _run_main_snippet(
        "from backend.config.legacy_demo_route_policy import legacy_demo_routes_enabled\n"
        "assert legacy_demo_routes_enabled() is False\n"
        'print("ok")',
        {"CLAW_ENVIRONMENT": "   ", "CLAW_ENABLE_LEGACY_DEMO_ROUTES": None},
    )
    assert r.returncode == 0, r.stderr + r.stdout


@pytest.mark.parametrize("env_name", ["local", "test"])
def test_relaxed_environments_retain_legacy_demo_routes(env_name: str):
    r = _run_main_snippet(
        "from backend.config.legacy_demo_route_policy import legacy_demo_routes_enabled\n"
        "assert legacy_demo_routes_enabled() is True\n"
        'print("ok")',
        {"CLAW_ENVIRONMENT": env_name, "CLAW_ENABLE_LEGACY_DEMO_ROUTES": None},
    )
    assert r.returncode == 0, r.stderr + r.stdout


def test_relaxed_environment_can_explicitly_disable_legacy_demo():
    r = _run_main_snippet(
        "from backend.config.legacy_demo_route_policy import legacy_demo_routes_enabled\n"
        "assert legacy_demo_routes_enabled() is False\n"
        'print("ok")',
        {"CLAW_ENVIRONMENT": "local", "CLAW_ENABLE_LEGACY_DEMO_ROUTES": "0"},
    )
    assert r.returncode == 0, r.stderr + r.stdout


def test_staging_requires_explicit_opt_in_for_legacy_demo():
    r = _run_main_snippet(
        "from backend.config.legacy_demo_route_policy import legacy_demo_routes_enabled\n"
        "assert legacy_demo_routes_enabled() is False\n"
        'print("ok")',
        {"CLAW_ENVIRONMENT": "staging", "CLAW_ENABLE_LEGACY_DEMO_ROUTES": None},
    )
    assert r.returncode == 0, r.stderr + r.stdout


@pytest.mark.parametrize("method,path", _CONTAINED_REPRESENTATIVE_PATHS)
def test_production_app_does_not_expose_contained_route_families(method: str, path: str):
    r = _run_main_snippet(
        f"""
from fastapi.testclient import TestClient
from backend.main import app
client = TestClient(app)
resp = client.request({method!r}, {path!r}, json={{}} if {method!r} in ("POST", "PATCH", "PUT") else None)
assert resp.status_code == 404, resp.status_code
assert resp.json().get("detail") == "not_found"
print("ok")
""",
        {
            "CLAW_ENVIRONMENT": "production",
            "CLAW_ADMIN_SECRET": "smoke-secret",
            "CLAW_ENABLE_LEGACY_DEMO_ROUTES": "1",
        },
    )
    assert r.returncode == 0, r.stderr + r.stdout


@pytest.mark.parametrize("method,path", _MODERN_REPRESENTATIVE_PATHS)
def test_production_app_keeps_active_modern_routes_mounted(method: str, path: str):
    r = _run_main_snippet(
        f"""
from fastapi.testclient import TestClient
from backend.main import app
client = TestClient(app)
resp = client.request({method!r}, {path!r}, json={{"title": "smoke", "parties": [], "network": "testnet"}} if {path!r}.endswith("/timelines") else None)
assert resp.status_code != 404, (resp.status_code, resp.text[:300])
print("ok")
""",
        {
            "CLAW_ENVIRONMENT": "production",
            "CLAW_ADMIN_SECRET": "smoke-secret",
        },
    )
    assert r.returncode == 0, r.stderr + r.stdout


def test_production_openapi_omits_contained_routes():
    r = _run_main_snippet(
        """
from backend.main import app
schema = app.openapi()
paths = schema.get("paths") or {}
for snippet in """ + repr(_OPENAPI_CONTAINED_SNIPPETS) + """:
    assert not any(snippet in p for p in paths), snippet
print("ok")
""",
        {"CLAW_ENVIRONMENT": "production"},
    )
    assert r.returncode == 0, r.stderr + r.stdout


def test_production_openapi_keeps_modern_routes():
    r = _run_main_snippet(
        """
from backend.main import app
schema = app.openapi()
paths = schema.get("paths") or {}
joined = " ".join(paths.keys())
for snippet in """ + repr(_OPENAPI_MODERN_SNIPPETS) + """:
    assert snippet in joined, snippet
print("ok")
""",
        {"CLAW_ENVIRONMENT": "production"},
    )
    assert r.returncode == 0, r.stderr + r.stdout


def test_local_openapi_lists_contained_routes():
    r = _run_main_snippet(
        """
from backend.main import app
schema = app.openapi()
paths = schema.get("paths") or {}
joined = " ".join(paths.keys())
assert "/v1/workflow/demo/run" in joined
assert "/v1/agreements/create" in joined
print("ok")
""",
        {"CLAW_ENVIRONMENT": "local"},
    )
    assert r.returncode == 0, r.stderr + r.stdout


def test_local_environment_retains_contained_route_http_surface():
    r = _run_main_snippet(
        """
from fastapi.testclient import TestClient
from backend.main import app
client = TestClient(app)
resp = client.get("/v1/analyst/health")
assert resp.status_code == 200, resp.text[:300]
print("ok")
""",
        {"CLAW_ENVIRONMENT": "local"},
    )
    assert r.returncode == 0, r.stderr + r.stdout


def test_startup_diagnostic_reports_legacy_demo_enabled_flag_only():
    r = _run_main_snippet(
        """
import logging
from backend.config.deployment_runtime import public_runtime_summary
from backend.config.legacy_demo_route_policy import log_legacy_demo_route_policy_at_startup
log_legacy_demo_route_policy_at_startup()
summary = public_runtime_summary()
assert set(summary.keys()) >= {"legacy_demo_routes_enabled"}
assert isinstance(summary["legacy_demo_routes_enabled"], bool)
print("ok")
""",
        {"CLAW_ENVIRONMENT": "production"},
    )
    assert r.returncode == 0, r.stderr + r.stdout
