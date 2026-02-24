from __future__ import annotations

import json
import os
import subprocess
import sys
from pathlib import Path


def _run(cmd: list[str], cwd: Path, env: dict | None = None) -> subprocess.CompletedProcess:
    return subprocess.run(
        cmd,
        cwd=str(cwd),
        env=env or {**os.environ},
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        text=True,
    )


def test_repro_pack_repo_less_verifier(tmp_path: Path) -> None:
    repo_root = Path(__file__).resolve().parents[2]
    out_dir = tmp_path / "first_adjudication"
    env = {**os.environ, "CLAW_OUT_DIR": str(out_dir)}

    r1 = _run([sys.executable, "-m", "backend.scripts.demo_first_adjudication"], cwd=repo_root, env=env)
    assert r1.returncode == 0, r1.stdout
    r2 = _run([sys.executable, "-m", "backend.scripts.export_first_adjudication_repro"], cwd=repo_root, env=env)
    assert r2.returncode == 0, r2.stdout

    repro_dir = out_dir / "repro"
    verify_py = repro_dir / "verify.py"
    r3 = _run([sys.executable, str(verify_py)], cwd=repro_dir, env=env)
    assert r3.returncode == 0, r3.stdout

    # Tamper timeline and expect failure (deterministic JSON mutation)
    timeline_path = repro_dir / "sample_timeline.json"
    timeline = json.loads(timeline_path.read_text(encoding="utf-8"))
    events = timeline.get("events")
    assert isinstance(events, list) and len(events) > 0
    ev0 = events[0]
    assert isinstance(ev0, dict)

    def _flip_first_string(obj):
        if isinstance(obj, dict):
            for k, v in obj.items():
                if isinstance(v, str) and v:
                    obj[k] = v[:-1] + ("X" if v[-1] != "X" else "Y")
                    return True
                if _flip_first_string(v):
                    return True
        elif isinstance(obj, list):
            for item in obj:
                if _flip_first_string(item):
                    return True
        return False

    mutated = False
    for key in ("payload", "content", "notice", "message"):
        if isinstance(ev0.get(key), dict) and _flip_first_string(ev0[key]):
            mutated = True
            break
        if isinstance(ev0.get(key), str) and ev0.get(key):
            v = ev0[key]
            ev0[key] = v[:-1] + ("X" if v[-1] != "X" else "Y")
            mutated = True
            break

    if not mutated:
        mutated = _flip_first_string(ev0)
    assert mutated, "no string field found to mutate in events[0]"

    timeline_path.write_text(json.dumps(timeline, indent=2, sort_keys=True), encoding="utf-8")
    r4 = _run([sys.executable, str(verify_py)], cwd=repro_dir, env=env)
    assert r4.returncode != 0
