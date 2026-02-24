# clawctl/main.py
from __future__ import annotations

import hashlib
import json
import os
import re
import subprocess
import sys
import time
from pathlib import Path
from typing import Optional, List, Any, Dict, Tuple

import requests
import typer
from rich import box
from rich.console import Console
from rich.panel import Panel
from rich.table import Table

from backend.services import workflow_service
from backend.services import attestation_service
from backend.services import bundle_service

# ---------------------------------------------------------------------------
# Globals & basic setup
# ---------------------------------------------------------------------------

APP_VERSION = "0.1.0"

app = typer.Typer(
    help="CLAWCTL PRO – Command-Line Interface for the CLAW Protocol",
    add_completion=True,
)
console = Console()

# Root of the project (where backend/, services/, etc. live)
PROJECT_ROOT = Path(__file__).resolve().parents[1]

# ---------------------------------------------------------------------------
# Config & helpers
# ---------------------------------------------------------------------------

CONFIG_DIR = Path.home() / ".claw"
CONFIG_FILE = CONFIG_DIR / "config.toml"
TIMESTAMP_DIR = CONFIG_DIR / "timestamps"
PROJECT_DEFAULTS = {
    "server": "http://127.0.0.1:8000",
}

try:  # Python 3.11+
    import tomllib
except ModuleNotFoundError:  # Python 3.9–3.10
    import tomli as tomllib  # type: ignore[no-redef]


def load_config() -> dict:
    """Load ~/.claw/config.toml and merge with defaults + env overrides."""
    config = dict(PROJECT_DEFAULTS)

    if CONFIG_FILE.exists():
        try:
            with CONFIG_FILE.open("rb") as f:
                data = tomllib.load(f)
            config.update(data or {})
        except Exception as e:
            console.print(f"[red]Failed to read config {CONFIG_FILE}: {e}[/red]")

    # Env overrides (support both CLAW_SERVER + CLAW_API_BASE)
    env_server = os.getenv("CLAW_SERVER") or os.getenv("CLAW_API_BASE")
    if env_server:
        config["server"] = env_server

    return config


def get_server_url(server_override: Optional[str]) -> str:
    config = load_config()
    base = server_override or config.get("server") or PROJECT_DEFAULTS["server"]
    return str(base).rstrip("/")


def ensure_dirs() -> None:
    CONFIG_DIR.mkdir(parents=True, exist_ok=True)
    TIMESTAMP_DIR.mkdir(parents=True, exist_ok=True)


def ensure_project_scaffold(root: Path) -> None:
    """Create a simple CLAW project layout under `root`."""
    for sub in ["clauses", "proofs", "signed", "timestamps"]:
        (root / sub).mkdir(parents=True, exist_ok=True)
    (root / ".claw").mkdir(parents=True, exist_ok=True)


def run_subprocess(
    args: List[str],
    *,
    cwd: Optional[Path] = None,
    capture: bool = False,
    check: bool = False,
) -> subprocess.CompletedProcess:
    """Thin wrapper around subprocess.run with decent defaults."""
    env = os.environ.copy()
    env.setdefault("PYTHONUNBUFFERED", "1")
    if capture:
        result = subprocess.run(
            args,
            cwd=str(cwd) if cwd else None,
            env=env,
            text=True,
            stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT,
        )
    else:
        result = subprocess.run(
            args,
            cwd=str(cwd) if cwd else None,
            env=env,
            text=True,
        )

    if check and result.returncode != 0:
        raise RuntimeError(f"Command failed: {' '.join(args)}\n{result.stdout}")

    return result


# ---------------------------------------------------------------------------
# Back-compat helpers (tests import these)
# ---------------------------------------------------------------------------


def _canon(obj: Any) -> str:
    return json.dumps(obj, sort_keys=True, separators=(",", ":"), ensure_ascii=False)


def _sha256_hex(s: str) -> str:
    return hashlib.sha256(s.encode("utf-8")).hexdigest()


def _env_default(name: str, default: str) -> str:
    return os.getenv(name, default)


def _read_json(path: Path) -> Dict[str, Any]:
    return json.loads(path.read_text(encoding="utf-8"))


def _write_json(path: Path, obj: Dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(obj, indent=2, sort_keys=True), encoding="utf-8")


def _export_bundle(
    *,
    out_dir: Path,
    timeline_path: Path,
    receipt_path: Path,
    esign_path: Path,
    liability_path: Path,
    agreement_path: Path,
    dispute_path: Optional[Path],
    created_at: str,
) -> None:
    timeline = _read_json(timeline_path)
    receipt = _read_json(receipt_path)
    esign = _read_json(esign_path)
    liability = _read_json(liability_path)
    agreement = _read_json(agreement_path)
    dispute = _read_json(dispute_path) if dispute_path else None
    workflow_service.export_bundle(
        out_dir=out_dir,
        timeline=timeline,
        receipt=receipt,
        esign_attestation=esign,
        liability_attestation=liability,
        agreement=agreement,
        dispute_packet=dispute,
        verify_md_path=PROJECT_ROOT / "docs" / "VERIFY.md",
        created_at=created_at,
    )


# Stable receipt fields (keep this small + deterministic for “vector” tests)
_BUNDLE_STABLE_RECEIPT_FIELDS: Tuple[str, ...] = (
    "receipt_id",
    "protocol_version",
    "network",
    "epoch_id",
    "timeline_id",
    "commitment",
    "issued_at",
)


def _payload_for_receipt_hash(receipt: Dict[str, Any]) -> Dict[str, Any]:
    # IMPORTANT: include ALL stable fields, even if absent, as None.
    # This matches backend canonicalization expectations and avoids
    # missing-key vs null-key hash divergence.
    return {k: receipt.get(k, None) for k in _BUNDLE_STABLE_RECEIPT_FIELDS}


_HEX64_RE = re.compile(r"^[0-9a-f]{64}$")


def _has_explicit_integrity_hash(receipt: Dict[str, Any]) -> bool:
    """
    True if the receipt includes an explicit embedded integrity hash field.

    Minimal/legacy receipts (like tests/vectors/demo.receipt.json) may only include
    `commitment` and no integrity hash at all. In that case we skip canonical-hash
    enforcement and rely on the commitment invariant.
    """
    if not isinstance(receipt, dict):
        return False

    integ = receipt.get("integrity")
    if isinstance(integ, dict):
        for k in (
            "sha256",
            "receipt_hash_sha256",
            "receipt_canonical_hash_sha256",
            "canonical_hash_sha256",
            "canonical_sha256",
            "canonical_hash",
            "hash",
        ):
            v = integ.get(k)
            if isinstance(v, str) and v.strip():
                return True

    for k in (
        "receipt_hash_sha256",
        "receipt_sha256",
        "receipt_hash",
        "canonical_hash",
        "canonical_sha256",
        "sha256",
        "hash",
        "integrity_sha256",
    ):
        v = receipt.get(k)
        if isinstance(v, str) and v.strip():
            return True

    meta = receipt.get("meta")
    if isinstance(meta, dict):
        v = meta.get("canonical_hash_sha256") or meta.get("canonical_sha256")
        if isinstance(v, str) and v.strip():
            return True

    return False


def _embedded_receipt_hash(receipt: Dict[str, Any]) -> Optional[str]:
    """
    Return the embedded integrity hash (sha256 hex) from the receipt, if present.

    NOTE: This function is used for *reading* embedded hashes across schema variants.
    It may also fall back to `commitment` for legacy receipts — but *enforcement* of
    canonical receipt hashing MUST ONLY occur when an explicit integrity hash exists.
    """
    # 1) Preferred explicit fields (newer schemas)
    candidates = [
        ("integrity", "sha256"),
        ("integrity", "receipt_hash_sha256"),
        ("integrity", "receipt_canonical_hash_sha256"),
        ("integrity", "canonical_hash_sha256"),
        ("integrity_sha256",),
        ("receipt_hash_sha256",),
        ("receipt_sha256",),
        ("receipt_hash",),
        ("canonical_hash",),
        ("canonical_sha256",),
        ("hash",),
        ("sha256",),
        ("meta", "canonical_hash_sha256"),
        ("checks", "canonical_hash"),
        ("checks", "canonical_sha256"),
        ("checks", "receipt_sha256"),
    ]

    for path in candidates:
        cur: Any = receipt
        ok = True
        for key in path:
            if not isinstance(cur, dict) or key not in cur:
                ok = False
                break
            cur = cur[key]
        if ok and isinstance(cur, str):
            v = cur.strip().lower()
            if _HEX64_RE.match(v):
                return v

    # 2) Legacy/minimal fallback: treat `commitment` as integrity hash *for display*
    # (enforcement logic checks _has_explicit_integrity_hash() before requiring match)
    v = receipt.get("commitment")
    if isinstance(v, str):
        v = v.strip().lower()
        if _HEX64_RE.match(v):
            return v

    return None


def _normalize_bundle(
    bundle_or_timeline: Dict[str, Any],
    receipt: Optional[Dict[str, Any]] = None,
) -> Tuple[Dict[str, Any], Dict[str, Any]]:
    """
    Normalize the two supported calling conventions into (timeline_dict, receipt_dict).

    1) verify_bundle_data(bundle_dict)
       - bundle may include: {"timeline": {...}, "receipt": {...}}
       - or may include: {"final_state": {...}, "anchored": {...}}
       - or may itself be the receipt object (legacy)

    2) verify_bundle_data(timeline_dict, receipt_dict)
       - used by backend/tests/test_verify_bundle.py vectors
    """
    if receipt is not None:
        tl = bundle_or_timeline if isinstance(bundle_or_timeline, dict) else {}
        rcpt = receipt if isinstance(receipt, dict) else {}
        return tl, rcpt

    bundle = bundle_or_timeline

    # Try to locate timeline-ish object
    timeline_obj: Dict[str, Any] = {}
    for k in ("timeline", "final_state", "timeline_state", "created", "timeline_state"):
        v = bundle.get(k)
        if isinstance(v, dict):
            timeline_obj = v
            break

    # Try to locate receipt-ish object
    receipt_obj: Any = bundle.get("receipt")
    if receipt_obj is None:
        receipt_obj = bundle.get("anchored")
    if receipt_obj is None:
        # Legacy: bundle itself IS the receipt
        receipt_obj = bundle

    return timeline_obj, receipt_obj if isinstance(receipt_obj, dict) else {}


def verify_bundle_data(
    bundle_or_timeline: Dict[str, Any],
    receipt: Optional[Dict[str, Any]] = None,
) -> Dict[str, Any]:
    """
    Minimal bundle verifier used by CLI/tests.

    Supports BOTH calling conventions:
      1) verify_bundle_data(bundle_dict)
      2) verify_bundle_data(timeline_dict, receipt_dict)

    Verification rules (local deterministic):
      - commitment must match timeline.frozen_manifest_sha256 (when present)
      - if receipt embeds an explicit integrity hash, it must match the canonical
        hash computed from stable receipt fields.
      - legacy/minimal receipts without explicit integrity hash: integrity check
        is skipped (we rely on the commitment invariant).
    """
    if not isinstance(bundle_or_timeline, dict):
        return {"ok": False, "errors": ["bundle must be a dict"], "checks": {}}

    tl, rcpt = _normalize_bundle(bundle_or_timeline, receipt)

    if not isinstance(rcpt, dict) or not rcpt:
        return {"ok": False, "errors": ["bundle missing receipt dict"], "checks": {}}

    errors: List[str] = []
    checks: Dict[str, Any] = {}

    # 1) Timeline frozen manifest (best-effort; vectors may provide it)
    frozen_manifest = tl.get("frozen_manifest_sha256") if isinstance(tl, dict) else None
    checks["timeline_frozen_manifest_sha256"] = frozen_manifest

    # 2) Commitment invariant
    commitment = rcpt.get("commitment")
    checks["receipt_commitment"] = commitment
    if frozen_manifest and commitment and frozen_manifest != commitment:
        errors.append("commitment mismatch vs timeline frozen_manifest_sha256")

    # 3) Receipt integrity (stable fields only) — enforced only when explicitly embedded
    payload_for_hash = _payload_for_receipt_hash(rcpt)
    computed = _sha256_hex(_canon(payload_for_hash))

    explicit_integrity = _has_explicit_integrity_hash(rcpt)
    embedded = _embedded_receipt_hash(rcpt)  # may fallback to commitment

    checks["payload_for_hash"] = payload_for_hash
    checks["canonical_hash_computed"] = computed
    checks["canonical_hash_embedded"] = embedded
    checks["explicit_integrity_present"] = explicit_integrity

    if explicit_integrity:
        if not embedded:
            errors.append("receipt missing embedded integrity hash")
        elif embedded != computed:
            errors.append("receipt integrity hash mismatch (embedded vs computed)")
    else:
        checks["integrity_check"] = "skipped (legacy receipt; using commitment invariant)"

    return {"ok": len(errors) == 0, "errors": errors, "checks": checks}


def _verify_bundle_data(*args, **kwargs):
    """
    Backwards-compatible alias for older tests importing this private helper.
    """
    return verify_bundle_data(*args, **kwargs)


# ---------------------------------------------------------------------------
# Backend lifecycle commands
# ---------------------------------------------------------------------------


def _backend_pattern() -> str:
    """Pattern used to identify the running backend uvicorn process."""
    return "uvicorn backend.main:app"


def _backend_running() -> bool:
    # macOS/Linux using pgrep
    result = run_subprocess(["pgrep", "-f", _backend_pattern()], capture=True)
    return result.returncode == 0 and bool(result.stdout.strip())


@app.command()
def start(
    workers: int = typer.Option(2, help="Number of uvicorn workers"),
    port: int = typer.Option(8000, help="Port for backend"),
) -> None:
    """
    Start the local CLAW backend.
    """
    if _backend_running():
        console.print("[yellow]CLAW backend already running.[/yellow]")
        return

    console.print(f"[cyan]🔱 Starting CLAW backend on port {port}...[/cyan]")

    args = [
        "uvicorn",
        "backend.main:app",
        "--workers",
        str(workers),
        "--loop",
        "asyncio",
        "--http",
        "auto",
        "--host",
        "127.0.0.1",
        "--port",
        str(port),
    ]

    # Run detached
    subprocess.Popen(
        args,
        cwd=str(PROJECT_ROOT),
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
    )

    # Give it a moment to boot
    time.sleep(2)

    if _backend_running():
        console.print("[green]✅ CLAW backend started.[/green]")
    else:
        console.print("[red]❌ Failed to start backend. Check logs.[/red]")


@app.command()
def stop() -> None:
    """
    Stop the local CLAW backend.
    """
    if not _backend_running():
        console.print("[yellow]Backend not running.[/yellow]")
        return

    console.print("[cyan]🔪 Stopping CLAW backend (uvicorn)...[/cyan]")
    run_subprocess(["pkill", "-f", _backend_pattern()])
    time.sleep(1)

    if _backend_running():
        console.print("[red]❌ Still running – you may need to kill manually.[/red]")
    else:
        console.print("[green]✅ Backend stopped.[/green]")


@app.command()
def restart(
    workers: int = typer.Option(2, help="Number of uvicorn workers"),
    port: int = typer.Option(8000, help="Port for backend"),
) -> None:
    """
    Restart the CLAW backend.
    """
    stop()
    start(workers=workers, port=port)


@app.command()
def status() -> None:
    """
    Check if backend is running.
    """
    if _backend_running():
        console.print("[green]✅ CLAW backend is running.[/green]")
    else:
        console.print("[red]⛔ CLAW backend is NOT running.[/red]")


@app.command()
def logs() -> None:
    """
    Show current uvicorn processes (simple ps/grep view).
    """
    console.print("[cyan]📜 CLAW uvicorn processes:[/cyan]")
    result = run_subprocess(
        ["bash", "-lc", f"ps aux | grep '{_backend_pattern()}' | grep -v grep"],
        capture=True,
    )
    if not result.stdout.strip():
        console.print("[yellow]No backend processes found.[/yellow]")
    else:
        console.print(result.stdout)


# ---------------------------------------------------------------------------
# HTTP helpers for protocol operations
# ---------------------------------------------------------------------------


def _post_file(
    endpoint: str,
    file_path: Path,
    server: Optional[str],
    extra_data: Optional[dict] = None,
) -> dict:
    url = f"{get_server_url(server)}{endpoint}"
    files = {"file": file_path.open("rb")}
    data = extra_data or {}

    try:
        resp = requests.post(url, files=files, data=data, timeout=120)
    except Exception as e:
        console.print(f"[red]HTTP error POST {url}: {e}[/red]")
        raise typer.Exit(1)

    if resp.status_code >= 400:
        console.print(f"[red]Backend error {resp.status_code}: {resp.text}[/red]")
        raise typer.Exit(1)

    try:
        return resp.json()
    except Exception:
        console.print("[red]Backend response is not JSON.[/red]")
        console.print(resp.text)
        raise typer.Exit(1)


def _post_json(
    endpoint: str,
    payload: dict,
    server: Optional[str],
    timeout: int = 120,
) -> dict:
    url = f"{get_server_url(server)}{endpoint}"
    try:
        resp = requests.post(url, json=payload, timeout=timeout)
    except Exception as e:
        console.print(f"[red]HTTP error POST {url}: {e}[/red]")
        raise typer.Exit(1)

    if resp.status_code >= 400:
        console.print(f"[red]Backend error {resp.status_code}: {resp.text}[/red]")
        raise typer.Exit(1)

    try:
        return resp.json()
    except Exception:
        console.print("[red]Backend response is not JSON.[/red]")
        console.print(resp.text)
        raise typer.Exit(1)


def _get_json(
    endpoint: str,
    server: Optional[str],
    timeout: int = 60,
) -> dict:
    url = f"{get_server_url(server)}{endpoint}"
    try:
        resp = requests.get(url, timeout=timeout)
    except Exception as e:
        console.print(f"[red]HTTP error GET {url}: {e}[/red]")
        raise typer.Exit(1)

    if resp.status_code >= 400:
        console.print(f"[red]Backend error {resp.status_code}: {resp.text}[/red]")
        raise typer.Exit(1)

    try:
        return resp.json()
    except Exception:
        console.print("[red]Backend response is not JSON.[/red]")
        console.print(resp.text)
        raise typer.Exit(1)


def _iso_utc_now() -> str:
    return time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())


def _pick_first(d: Dict[str, Any], keys: List[str]) -> Optional[Any]:
    for k in keys:
        if k in d and d.get(k) is not None:
            return d.get(k)
    return None


def _find_latest_timestamp_glob(pattern: str) -> Optional[Path]:
    """Find latest file in ~/.claw/timestamps matching a glob pattern."""
    try:
        candidates = sorted(
            TIMESTAMP_DIR.glob(pattern),
            key=lambda p: p.stat().st_mtime,
            reverse=True,
        )
        return candidates[0] if candidates else None
    except Exception:
        return None


# ---------------------------------------------------------------------------
# Core protocol commands: extract, proof, sign, timestamp
# ---------------------------------------------------------------------------


@app.command()
def extract(
    file: Path = typer.Argument(..., exists=True, dir_okay=False),
    server: Optional[str] = typer.Option(
        None, "--server", "-s", help="Override backend server URL"
    ),
    save: bool = typer.Option(False, "--save", help="Save clauses JSON under ./clauses/"),
) -> None:
    """
    Extract clauses from a contract file via the backend /extract endpoint.
    """
    ensure_project_scaffold(PROJECT_ROOT)

    console.print(
        f"[cyan]📑 Extracting clauses from [bold]{file.name}[/bold] via backend...[/cyan]"
    )

    res = _post_file("/extract", file, server)
    clauses = res.get("clauses", res)

    table = Table(title="Extracted Clauses", box=box.SIMPLE)
    table.add_column("#", style="cyan", justify="right")
    table.add_column("Clause", style="white", overflow="fold")

    if isinstance(clauses, list):
        for idx, clause in enumerate(clauses, start=1):
            table.add_row(str(idx), str(clause))
    else:
        table.add_row("1", json.dumps(clauses, indent=2))

    console.print(table)

    if save and isinstance(clauses, list):
        out_path = PROJECT_ROOT / "clauses" / f"{file.stem}.clauses.json"
        out_path.write_text(json.dumps(clauses, indent=2), encoding="utf-8")
        console.print(f"[green]💾 Saved clauses to {out_path}[/green]")


@app.command()
def proof(
    source: Path = typer.Argument(
        ...,
        exists=True,
        help="Either a contract file or a *.clauses.json file",
    ),
    server: Optional[str] = typer.Option(
        None, "--server", "-s", help="Override backend server URL"
    ),
) -> None:
    """
    Generate a proof packet for a contract or pre-extracted clauses.
    """
    ensure_project_scaffold(PROJECT_ROOT)

    if source.suffix == ".json":
        clauses = json.loads(source.read_text(encoding="utf-8"))
    else:
        res = _post_file("/extract", source, server)
        clauses = res.get("clauses", res)

    if not isinstance(clauses, list):
        console.print("[red]Expected a list of clauses from extract.[/red]")
        raise typer.Exit(1)

    console.print(
        f"[cyan]🧮 Generating proof packet for [bold]{source.name}[/bold]...[/cyan]"
    )
    payload = {"clauses": clauses}
    proof_res = _post_json("/proof", payload, server)

    out_path = PROJECT_ROOT / "proofs" / f"{source.stem}.proof.json"
    out_path.write_text(json.dumps(proof_res, indent=2), encoding="utf-8")
    console.print(f"[green]💾 Saved proof packet to {out_path}[/green]")

    console.print(
        Panel(
            json.dumps(proof_res, indent=2),
            title="Proof Packet (preview)",
            border_style="cyan",
        )
    )


@app.command()
def sign(
    file: Path = typer.Argument(..., exists=True, dir_okay=False),
    role: str = typer.Option(
        "author",
        "--role",
        "-r",
        help="Role for this signature (author, reviewer, notary, etc.)",
    ),
    note: Optional[str] = typer.Option(
        None, "--note", "-n", help="Optional note or reason for signing"
    ),
    server: Optional[str] = typer.Option(
        None, "--server", "-s", help="Override backend server URL"
    ),
) -> None:
    """
    Request a sign packet from the backend for the given document.
    """
    ensure_project_scaffold(PROJECT_ROOT)

    console.print(
        f"[cyan]✍️ Requesting sign packet for [bold]{file.name}[/bold] as role '{role}'...[/cyan]"
    )

    extra_data = {"role": role}
    if note:
        extra_data["note"] = note

    res = _post_file("/sign", file, server, extra_data=extra_data)

    out_path = PROJECT_ROOT / "signed" / f"{file.stem}.sign.json"
    out_path.write_text(json.dumps(res, indent=2), encoding="utf-8")

    console.print(f"[green]💾 Saved sign packet to {out_path}[/green]")
    console.print(
        Panel(
            json.dumps(res, indent=2),
            title="Sign Packet (preview)",
            border_style="magenta",
        )
    )


@app.command()
def timestamp(
    file: Path = typer.Argument(..., exists=True, dir_okay=False),
    label: Optional[str] = typer.Option(
        None, "--label", "-l", help="Optional human-readable label"
    ),
) -> None:
    """
    Create a LOCAL timestamp receipt for a file (hash + wall-clock time).
    """
    ensure_dirs()
    ensure_project_scaffold(PROJECT_ROOT)

    data = file.read_bytes()
    sha256 = hashlib.sha256(data).hexdigest()
    ts = int(time.time())

    receipt = {
        "file": str(file.resolve()),
        "hash_alg": "sha256",
        "hash": sha256,
        "timestamp_unix": ts,
        "label": label or file.name,
        "clawctl_version": APP_VERSION,
    }

    out_path = TIMESTAMP_DIR / f"{file.stem}-{ts}.clawstamp.json"
    out_path.write_text(json.dumps(receipt, indent=2), encoding="utf-8")

    console.print(
        Panel(
            json.dumps(receipt, indent=2),
            title="Local Timestamp Receipt",
            border_style="green",
        )
    )
    console.print(f"[green]💾 Saved timestamp receipt to {out_path}[/green]")


@app.command("first-adjudication")
def first_adjudication(
    out_dir: Optional[str] = typer.Option(
        None, "--out-dir", help="Output directory for adjudication artifacts"
    ),
) -> None:
    """
    Run the first adjudication pack end-to-end: demo -> verify -> export.
    """
    env = os.environ.copy()
    if out_dir:
        env["CLAW_OUT_DIR"] = out_dir

    cmds = [
        ["uv", "run", "python", "-m", "backend.scripts.demo_first_adjudication"],
        ["uv", "run", "python", "-m", "backend.scripts.verify_first_adjudication"],
        ["uv", "run", "python", "-m", "backend.scripts.export_first_adjudication_pack"],
    ]

    zip_path = None
    for cmd in cmds:
        result = subprocess.run(
            cmd,
            cwd=str(PROJECT_ROOT),
            env=env,
            text=True,
            stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT,
        )
        if result.returncode != 0:
            console.print(result.stdout)
            raise typer.Exit(1)
        if "export_first_adjudication_pack" in " ".join(cmd):
            zip_path = (result.stdout or "").strip().splitlines()[-1]

    if zip_path:
        console.print(f"[green]pack_zip={zip_path}[/green]")


@app.command("verify")
def verify_bundle(
    path: Path = typer.Argument(..., help="Path to bundle.zip or bundle directory"),
    json_output: bool = typer.Option(True, "--json/--no-json", help="Print JSON output (default true)"),
    pretty: bool = typer.Option(False, "--pretty", help="Pretty-print JSON"),
    quiet: bool = typer.Option(False, "--quiet", help="Print only ok true/false"),
) -> None:
    """
    Verify a CLAW bundle zip or directory offline.
    Exit code: 0 if ok, 1 if not ok, 2 on tool error.
    """
    try:
        if path.is_dir():
            report = bundle_service.verify_bundle_dir(path)
        else:
            data = path.read_bytes()
            report = bundle_service.verify_bundle_zip(data)
        ok = bool(report.get("ok"))
        if quiet:
            print("true" if ok else "false")
        elif json_output:
            if pretty:
                print(json.dumps(report, indent=2, sort_keys=True))
            else:
                print(json.dumps(report, sort_keys=True, separators=(",", ":")))
        else:
            print(f"ok={str(ok).lower()}")
        raise typer.Exit(code=0 if ok else 1)
    except typer.Exit:
        raise
    except Exception as e:
        console.print(f"[red]verify error: {e}[/red]")
        raise typer.Exit(code=2)


# ---------------------------------------------------------------------------
# Timeline mode (notice + timeline demo flow)
# ---------------------------------------------------------------------------

timeline_app = typer.Typer(
    help="Timeline tools – verification is file-based; verify.py is authoritative."
)
app.add_typer(timeline_app, name="timeline")


@timeline_app.command("new")
def timeline_new(
    timeline_id: str = typer.Option(..., "--timeline-id"),
    title: str = typer.Option(..., "--title"),
    network: str = typer.Option("testnet", "--network"),
    created_at: str = typer.Option(
        _env_default("CLAW_CREATED_AT", "2026-01-01T00:00:00Z"), "--created-at"
    ),
    out_dir: Path = typer.Option(Path("workflow_artifacts"), "--out-dir"),
) -> None:
    tl = workflow_service.create_timeline(
        timeline_id=timeline_id,
        title=title,
        network=network,
        created_at=created_at,
        parties=[],
    )
    path = out_dir / "timelines" / timeline_id / "timeline.json"
    _write_json(path, tl)
    console.print(f"[green]timeline={path}[/green]")


@timeline_app.command("append")
def timeline_append(
    timeline_path: Optional[Path] = typer.Option(None, "--timeline"),
    timeline_id: Optional[str] = typer.Option(None, "--timeline-id"),
    out_dir: Path = typer.Option(Path("workflow_artifacts"), "--out-dir"),
    event_json: Optional[str] = typer.Option(
        None, "--event", help="Event JSON string (file-based verification only)."
    ),
    event_file: Optional[Path] = typer.Option(
        None, "--event-file", help="Event JSON file (file-based verification only)."
    ),
    event_type: str = typer.Option("notice", "--event-type"),
    event_time: str = typer.Option(
        _env_default("CLAW_EVENT_TIME", "2026-01-01T00:00:00Z"), "--event-time"
    ),
    notice: str = typer.Option("", "--notice"),
) -> None:
    if not timeline_path:
        if not timeline_id:
            raise typer.Exit(1)
        timeline_path = out_dir / "timelines" / timeline_id / "timeline.json"
    timeline = _read_json(timeline_path)
    if event_json or event_file:
        if event_json and event_file:
            raise typer.Exit(1)
        raw = event_json or event_file.read_text(encoding="utf-8")
        event_obj = json.loads(raw)
        notice_obj = event_obj.get("notice")
        marker_obj = event_obj.get("marker")
        references = event_obj.get("references")
        tl = workflow_service.append_event(
            timeline=timeline,
            event_type=event_obj.get("event_type", "notice"),
            event_time=event_obj.get("event_time", event_time),
            notice=notice_obj,
            marker=marker_obj,
            references=references,
        )
    else:
        notice_obj = {"text": notice} if notice else {}
        tl = workflow_service.append_event(
            timeline=timeline,
            event_type=event_type,
            event_time=event_time,
            notice=notice_obj,
            marker=None,
            references=None,
        )
    _write_json(timeline_path, tl)
    console.print(f"[green]timeline={timeline_path}[/green]")


@timeline_app.command("freeze")
def timeline_freeze(
    timeline_path: Optional[Path] = typer.Option(None, "--timeline"),
    timeline_id: Optional[str] = typer.Option(None, "--timeline-id"),
    out_dir: Path = typer.Option(Path("workflow_artifacts"), "--out-dir"),
    frozen_at: str = typer.Option(
        _env_default("CLAW_FROZEN_AT", "2026-01-01T00:00:00Z"), "--frozen-at"
    ),
    anchor_network: str = typer.Option("bitcoin-testnet", "--anchor-network"),
    epoch_id: str = typer.Option("epoch-demo", "--epoch-id"),
    issued_at: str = typer.Option(
        _env_default("CLAW_ISSUED_AT", "2026-01-01T00:00:00Z"), "--issued-at"
    ),
    btc_txid: str = typer.Option("pending", "--btc-txid"),
) -> None:
    if not timeline_path:
        if not timeline_id:
            raise typer.Exit(1)
        timeline_path = out_dir / "timelines" / timeline_id / "timeline.json"
    timeline = _read_json(timeline_path)
    frozen = workflow_service.freeze_timeline(timeline=timeline, frozen_at=frozen_at)
    receipt = workflow_service.create_receipt(
        timeline_id=frozen["timeline_id"],
        frozen_manifest_sha256=frozen["frozen_manifest_sha256"],
        anchor_network=anchor_network,
        epoch_id=epoch_id,
        issued_at=issued_at,
        btc_txid=btc_txid,
    )
    _write_json(timeline_path, frozen)
    receipt_path = timeline_path.parent / "receipt.json"
    _write_json(receipt_path, receipt)
    console.print(f"[green]timeline={timeline_path}[/green]")
    console.print(f"[green]receipt={receipt_path}[/green]")


@timeline_app.command("export")
def timeline_export(
    out_dir: Path = typer.Option(Path("workflow_bundle"), "--out-dir"),
    timeline_path: Path = typer.Option(..., "--timeline"),
    receipt_path: Path = typer.Option(..., "--receipt"),
    created_at: str = typer.Option(
        _env_default("CLAW_PACK_CREATED_AT", "2026-01-01T00:00:00Z"), "--created-at"
    ),
) -> None:
    """
    Export a repo-less timeline capture repro kit.

    Verification is file-based; verify.py is authoritative.
    """
    timeline = _read_json(timeline_path)
    receipt = _read_json(receipt_path)
    workflow_service.export_timeline_repro_kit(
        out_dir=out_dir,
        timeline=timeline,
        receipt=receipt,
        created_at=created_at,
        verify_md_path=PROJECT_ROOT / "docs" / "VERIFY.md",
        reference_base_dir=timeline_path.parent,
    )
    console.print(
        f"[green]bundle={out_dir}[/green]\n[cyan]Verification is file-based; verify.py is authoritative.[/cyan]"
    )


@timeline_app.command("demo")
def timeline_demo(
    title: str = typer.Option(..., "--title", help="Timeline title"),
    message: str = typer.Option(..., "--message", "-m", help="Notice/event message"),
    network: str = typer.Option(
        "testnet",
        "--network",
        help="Timeline network (e.g. testnet, mainnet)",
    ),
    anchor_network: str = typer.Option(
        "bitcoin-testnet",
        "--anchor-network",
        help="Anchor network (bitcoin-testnet or bitcoin-mainnet)",
    ),
    server: Optional[str] = typer.Option(
        None, "--server", "-s", help="Override backend server URL"
    ),
) -> None:
    """
    End-to-end demo: create timeline, append notice, freeze, anchor.

    This matches the backend OpenAPI schemas:
      - CreateTimelineRequest requires title + parties[]
      - AppendEventRequest requires event_type + event_time (notice optional)
      - FreezeTimelineRequest requires manifest_sha256
      - AnchorTimelineRequest requires frozen_manifest_sha256 + anchor_network
    """
    base = get_server_url(server)

    console.print(
        Panel(
            f"[bold]Timeline Demo[/bold]\n\n"
            f"Server: {base}\n"
            f"Title: {title}\n"
            f"Message: {message}\n"
            f"Network: {network}\n"
            f"Anchor Network: {anchor_network}",
            border_style="cyan",
        )
    )

    # 1) Create timeline (CreateTimelineRequest)
    create_payload = {
        "title": title,
        "parties": [
            {"role": "author", "id": "demo-author", "display_name": "Demo Author"},
            {
                "role": "counterparty",
                "id": "demo-counterparty",
                "display_name": "Demo Counterparty",
            },
        ],
        "network": network,
    }
    create = _post_json("/v1/timelines", create_payload, server, timeout=120)

    timeline_id = _pick_first(create, ["timeline_id", "id", "uuid"])
    if not timeline_id:
        console.print("[red]Backend did not return a timeline id.[/red]")
        console.print(json.dumps(create, indent=2))
        raise typer.Exit(1)
    console.print(f"[green]✅ Created timeline: {timeline_id}[/green]")

    # 2) Append event (AppendEventRequest)
    append_payload = {
        "event_type": "notice",
        "event_time": _iso_utc_now(),
        "notice": {"message": message},
    }
    appended = _post_json(
        f"/v1/timelines/{timeline_id}/events",
        append_payload,
        server,
        timeout=120,
    )
    console.print("[green]✅ Appended notice event[/green]")

    # 3) GET timeline state; we need manifest_sha256 for freeze
    timeline_state = _get_json(f"/v1/timelines/{timeline_id}", server, timeout=60)

    manifest_sha256 = _pick_first(timeline_state, ["manifest_sha256"]) or _pick_first(
        timeline_state.get("manifest", {})
        if isinstance(timeline_state.get("manifest"), dict)
        else {},
        ["manifest_sha256"],
    )
    if not manifest_sha256:
        console.print("[red]Could not find manifest_sha256 in timeline response.[/red]")
        console.print(json.dumps(timeline_state, indent=2))
        raise typer.Exit(1)

    # 4) Freeze (FreezeTimelineRequest)
    frozen = _post_json(
        f"/v1/timelines/{timeline_id}/freeze",
        {"manifest_sha256": manifest_sha256},
        server,
        timeout=120,
    )
    console.print("[green]✅ Frozen timeline[/green]")

    frozen_manifest_sha256 = _pick_first(
        frozen, ["frozen_manifest_sha256", "manifest_sha256"]
    )
    if not frozen_manifest_sha256:
        console.print(
            "[yellow]Freeze response did not include frozen_manifest_sha256 plainly.[/yellow]"
        )
        console.print(json.dumps(frozen, indent=2))
        frozen_manifest_sha256 = manifest_sha256

    # 5) Anchor (AnchorTimelineRequest)
    anchored = _post_json(
        f"/v1/timelines/{timeline_id}/anchor",
        {
            "frozen_manifest_sha256": frozen_manifest_sha256,
            "anchor_network": anchor_network,
            "epoch_id": None,
        },
        server,
        timeout=180,
    )
    console.print("[green]✅ Anchored timeline[/green]")

    # Final state
    final_state = _get_json(f"/v1/timelines/{timeline_id}", server, timeout=60)

    # -----------------------------------------------------------------------
    # Persist demo artifacts to disk (repo-independent)
    # -----------------------------------------------------------------------
    ensure_dirs()
    ts = int(time.time())
    out_path = TIMESTAMP_DIR / f"timeline-demo-{timeline_id}-{ts}.json"
    out_path.write_text(
        json.dumps(
            {
                "created": create,
                "appended": appended,
                "timeline_state": timeline_state,
                "frozen": frozen,
                "anchored": anchored,
                "final_state": final_state,
            },
            indent=2,
        ),
        encoding="utf-8",
    )
    console.print(f"[green]💾 Saved timeline demo artifact to {out_path}[/green]")

    console.print(
        Panel(
            json.dumps(
                {
                    "created": create,
                    "appended": appended,
                    "timeline_state": timeline_state,
                    "frozen": frozen,
                    "anchored": anchored,
                    "final_state": final_state,
                },
                indent=2,
            ),
            title="Timeline Demo Results",
            border_style="green",
        )
    )


@timeline_app.command("verify")
def timeline_verify(
    artifact: Optional[Path] = typer.Option(
        None,
        "--artifact",
        "-a",
        help="Path to a saved timeline demo artifact JSON. If omitted, uses latest ~/.claw/timestamps/timeline-demo-*.json",
    ),
    receipt_id: Optional[str] = typer.Option(
        None,
        "--receipt-id",
        help="Receipt id to verify (if you don't want to pass an artifact).",
    ),
    server: Optional[str] = typer.Option(
        None, "--server", "-s", help="Override backend server URL"
    ),
) -> None:
    """
    Verify a timeline anchor receipt using backend /verify (and optionally /verify/tree).

    Strategy:
      1) Prefer pulling canonical receipt via GET /v1/receipts/{receipt_id}
      2) POST that receipt JSON directly to /verify (OpenAPI uses a generic object body)
      3) Save verify output under ~/.claw/timestamps/
    """
    ensure_dirs()
    base = get_server_url(server)

    # Resolve artifact path if not provided
    resolved_artifact: Optional[Path] = artifact
    if resolved_artifact is None and receipt_id is None:
        resolved_artifact = _find_latest_timestamp_glob("timeline-demo-*.json")

    artifact_data: Optional[dict] = None
    if resolved_artifact is not None:
        if not resolved_artifact.exists():
            console.print(f"[red]Artifact not found: {resolved_artifact}[/red]")
            raise typer.Exit(1)
        try:
            artifact_data = json.loads(resolved_artifact.read_text(encoding="utf-8"))
        except Exception as e:
            console.print(f"[red]Failed to parse artifact JSON: {e}[/red]")
            raise typer.Exit(1)

    # Derive receipt_id from artifact if not provided
    if receipt_id is None and artifact_data:
        anchored_obj = (
            artifact_data.get("anchored", {})
            if isinstance(artifact_data.get("anchored"), dict)
            else {}
        )
        receipt_id = _pick_first(anchored_obj, ["receipt_id", "id"])

    if not receipt_id:
        console.print("[red]No receipt_id provided and could not derive from artifact.[/red]")
        raise typer.Exit(1)

    # Local invariant check (nice UX, catches logic bugs instantly)
    local_checks: Dict[str, Any] = {"ok": True, "checks": []}
    try:
        if artifact_data:
            anchored = artifact_data.get("anchored", {}) or {}
            frozen = artifact_data.get("frozen", {}) or {}
            final_state = artifact_data.get("final_state", {}) or {}

            commitment = anchored.get("commitment")
            frozen_manifest = frozen.get("frozen_manifest_sha256")
            final_frozen_manifest = final_state.get("frozen_manifest_sha256")

            if commitment and frozen_manifest:
                ok = commitment == frozen_manifest
                local_checks["checks"].append(
                    {
                        "name": "commitment == frozen.frozen_manifest_sha256",
                        "ok": ok,
                        "commitment": commitment,
                        "frozen_manifest_sha256": frozen_manifest,
                    }
                )
                if not ok:
                    local_checks["ok"] = False

            if commitment and final_frozen_manifest:
                ok = commitment == final_frozen_manifest
                local_checks["checks"].append(
                    {
                        "name": "commitment == final_state.frozen_manifest_sha256",
                        "ok": ok,
                        "commitment": commitment,
                        "final_frozen_manifest_sha256": final_frozen_manifest,
                    }
                )
                if not ok:
                    local_checks["ok"] = False
    except Exception as e:
        local_checks["ok"] = False
        local_checks["checks"].append(
            {"name": "local invariant checks", "ok": False, "error": str(e)}
        )

    console.print(
        Panel(
            f"[bold]Timeline Verify[/bold]\n\n"
            f"Server: {base}\n"
            f"Receipt ID: {receipt_id}\n"
            f"Artifact: {str(resolved_artifact) if resolved_artifact else '<none>'}",
            border_style="cyan",
        )
    )

    # Fetch canonical receipt from backend
    receipt = _get_json(f"/v1/receipts/{receipt_id}", server, timeout=60)

    # POST to /verify using generic object body
    verify_res = _post_json("/verify", receipt, server, timeout=120)

    # Optionally verify tree (best-effort) — only if there is something to verify.
    # This avoids noisy failures when merkle_proof is present but empty ([]).
    verify_tree_res: Optional[dict] = None
    try:
        should_tree = False
        if isinstance(receipt, dict):
            mp = receipt.get("merkle_proof")
            mpj = receipt.get("merkle_proof_json")
            child = receipt.get("child_receipts")

            if isinstance(mp, list) and len(mp) > 0:
                should_tree = True
            elif mpj:
                should_tree = True
            elif isinstance(child, dict) and len(child) > 0:
                should_tree = True

        if should_tree:
            # Server endpoint requires {"receipt": {...}} (it will NOT fetch by receipt_id).
            verify_tree_res = _post_json(
                "/verify/tree", {"receipt": receipt}, server, timeout=120
            )
        else:
            verify_tree_res = {"skipped": True, "reason": "no merkle proof / no child receipts"}
    except Exception as e:
        verify_tree_res = {"skipped_or_failed": True, "error": str(e)}

    ts = int(time.time())
    out_path = TIMESTAMP_DIR / f"verify-{receipt_id}-{ts}.json"
    out_path.write_text(
        json.dumps(
            {
                "receipt_id": receipt_id,
                "artifact": str(resolved_artifact) if resolved_artifact else None,
                "local_checks": local_checks,
                "receipt": receipt,
                "verify": verify_res,
                "verify_tree": verify_tree_res,
                "verified_at_unix": ts,
            },
            indent=2,
        ),
        encoding="utf-8",
    )

    local_ok = bool(local_checks.get("ok"))
    console.print(f"[green]💾 Saved verify artifact to {out_path}[/green]")
    console.print(
        Panel(
            json.dumps(
                {
                    "local_checks_ok": local_ok,
                    "verify": verify_res,
                    "verify_tree": verify_tree_res,
                },
                indent=2,
            ),
            title="Verify Results",
            border_style="green" if local_ok else "yellow",
        )
    )


# ---------------------------------------------------------------------------
# Agent mode (simple pipeline for now)
# ---------------------------------------------------------------------------

agent_app = typer.Typer(help="Agent helpers – mini CLAW pipelines.")
app.add_typer(agent_app, name="agent")


@agent_app.command("run")
def agent_run(
    file: Path = typer.Argument(..., exists=True, dir_okay=False),
    server: Optional[str] = typer.Option(
        None, "--server", "-s", help="Override backend server URL"
    ),
    role: str = typer.Option(
        "author",
        "--role",
        "-r",
        help="Signature role the agent should use at the end.",
    ),
) -> None:
    """
    Run a mini-agent pipeline on a single file:

      extract -> proof -> sign -> timestamp
    """
    console.print(
        Panel(
            f"Running CLAW agent pipeline on [bold]{file.name}[/bold]\n"
            "[cyan]extract → proof → sign → timestamp[/cyan]",
            title="Agent Pipeline",
            border_style="cyan",
        )
    )

    res = _post_file("/extract", file, server)
    clauses = res.get("clauses", res)
    if not isinstance(clauses, list):
        console.print("[red]Extract did not return a list of clauses.[/red]")
        raise typer.Exit(1)

    proof_res = _post_json("/proof", {"clauses": clauses}, server)

    sign_res = _post_file(
        "/sign",
        file,
        server,
        extra_data={"role": role, "note": "Agent pipeline auto-sign"},
    )

    data = file.read_bytes()
    sha256 = hashlib.sha256(data).hexdigest()
    ts = int(time.time())
    ensure_dirs()
    receipt = {
        "file": str(file.resolve()),
        "hash_alg": "sha256",
        "hash": sha256,
        "timestamp_unix": ts,
        "label": f"agent-pipeline:{file.name}",
        "clawctl_version": APP_VERSION,
    }
    out_path = TIMESTAMP_DIR / f"{file.stem}-{ts}.agent.clawstamp.json"
    out_path.write_text(json.dumps(receipt, indent=2), encoding="utf-8")

    table = Table(title="Agent Pipeline Summary", box=box.SIMPLE_HEAVY)
    table.add_column("Step", style="cyan")
    table.add_column("Result", style="white", overflow="fold")
    table.add_row("Extract", f"{len(clauses)} clauses")
    table.add_row(
        "Proof",
        json.dumps({k: proof_res.get(k) for k in list(proof_res)[:5]}, indent=2),
    )
    table.add_row(
        "Sign",
        json.dumps({k: sign_res.get(k) for k in list(sign_res)[:5]}, indent=2),
    )
    table.add_row("Timestamp", json.dumps(receipt, indent=2))

    console.print(table)
    console.print(f"[green]💾 Agent timestamp receipt saved to {out_path}[/green]")


@agent_app.command("watch")
def agent_watch(
    folder: Path = typer.Argument(
        Path("incoming"),
        exists=False,
        help="Folder to watch for new files (simple polling).",
    ),
    interval: int = typer.Option(10, help="Polling interval in seconds"),
    server: Optional[str] = typer.Option(
        None, "--server", "-s", help="Override backend server URL"
    ),
) -> None:
    """
    VERY SIMPLE watch loop: poll a folder and run `agent run` on new files.
    """
    folder.mkdir(parents=True, exist_ok=True)
    console.print(
        f"[cyan]👀 Watching {folder} every {interval}s for new files (Ctrl+C to stop)...[/cyan]"
    )

    seen: set[Path] = set()

    try:
        while True:
            for p in folder.iterdir():
                if p.is_file() and p not in seen:
                    seen.add(p)
                    console.print(f"[magenta]New file detected: {p.name}[/magenta]")
                    agent_run(p, server=server)  # type: ignore[arg-type]
            time.sleep(interval)
    except KeyboardInterrupt:
        console.print("[yellow]Stopped watching.[/yellow]")


# ---------------------------------------------------------------------------
# Setup / doctor / init
# ---------------------------------------------------------------------------

@app.command()
def doctor(
    server: Optional[str] = typer.Option(
        None, "--server", "-s", help="Override backend server URL"
    ),
) -> None:
    """
    Run CLI + backend diagnostics.
    """
    console.print(Panel("Running CLAWCTL diagnostics…", border_style="cyan"))

    table = Table(box=box.SIMPLE_HEAVY)
    table.add_column("Check", style="cyan")
    table.add_column("Result", style="white")

    table.add_row("Python", sys.version.replace("\n", " "))

    venv = os.environ.get("VIRTUAL_ENV")
    table.add_row("Virtualenv", venv or "<none>")

    uv = run_subprocess(["which", "uvicorn"], capture=True)
    table.add_row("uvicorn", uv.stdout.strip() or "<not found>")

    table.add_row("Backend running", "yes" if _backend_running() else "no")

    base = get_server_url(server)
    try:
        resp = requests.get(f"{base}/docs", timeout=5)
        table.add_row("HTTP /docs", f"{resp.status_code}")
    except Exception as e:
        table.add_row("HTTP /docs", f"error: {e}")

    console.print(table)


@app.command()
def init(
    path: Path = typer.Argument(
        Path("."), help="Directory to initialize as a CLAW project"
    ),
) -> None:
    """
    Initialize a CLAW project structure in the given directory.
    """
    target = path.resolve()
    ensure_project_scaffold(target)

    config_path = target / ".claw" / "config.toml"
    if not config_path.exists():
        config_body = (
            "# CLAW project config\n"
            'server = "http://127.0.0.1:8000"\n'
            "# You can override with CLAW_SERVER or CLAW_API_BASE env var.\n"
        )
        config_path.write_text(config_body, encoding="utf-8")

    console.print(
        Panel(
            f"Initialized CLAW project at [bold]{target}[/bold]",
            border_style="green",
        )
    )


# ---------------------------------------------------------------------------
# Workflow CLI (deterministic, file-based)
# ---------------------------------------------------------------------------

attest_app = typer.Typer(help="Attestation workflows (e-sign, liability).")
app.add_typer(attest_app, name="attest")

esign_app = typer.Typer(help="E-sign attestation workflow.")
liability_app = typer.Typer(help="Personal liability attestation workflow.")
attest_app.add_typer(esign_app, name="esign")
attest_app.add_typer(liability_app, name="liability")


attestation_app = typer.Typer(
    help="Attestation signing – verification is file-based; verify.py is authoritative."
)
app.add_typer(attestation_app, name="attestation")


@attestation_app.command("new")
def attestation_new(
    attestation_type: str = typer.Option(..., "--type"),
    payload_json: Optional[str] = typer.Option(None, "--payload-json"),
    payload_file: Optional[Path] = typer.Option(None, "--payload-file"),
    signer_json: Optional[str] = typer.Option(None, "--signer-json"),
    signer_file: Optional[Path] = typer.Option(None, "--signer-file"),
    issued_at: str = typer.Option(
        _env_default("CLAW_ISSUED_AT", "2026-01-01T00:00:00Z"), "--issued-at"
    ),
    out_dir: Path = typer.Option(Path("workflow_artifacts"), "--out-dir"),
) -> None:
    if (payload_json is None) == (payload_file is None):
        raise typer.Exit(1)
    if (signer_json is None) == (signer_file is None):
        raise typer.Exit(1)
    payload = json.loads(payload_json) if payload_json else json.loads(payload_file.read_text(encoding="utf-8"))
    signer = json.loads(signer_json) if signer_json else json.loads(signer_file.read_text(encoding="utf-8"))
    att = attestation_service.create_attestation(attestation_type, payload, signer, issued_at)
    path = out_dir / "attestations" / f"{att['attestation_id']}.json"
    _write_json(path, att)
    console.print(f"[green]attestation={path}[/green]")


@attestation_app.command("sign")
def attestation_sign(
    attestation_path: Path = typer.Option(..., "--attestation"),
    signer_id: str = typer.Option(..., "--signer-id"),
    signed_at: str = typer.Option(
        _env_default("CLAW_SIGNED_AT", "2026-01-01T00:00:00Z"), "--signed-at"
    ),
    signing_key: Optional[str] = typer.Option(None, "--signing-key"),
) -> None:
    att = _read_json(attestation_path)
    signed = attestation_service.sign_attestation(
        att, signer_id=signer_id, signed_at=signed_at, signing_key=signing_key
    )
    _write_json(attestation_path, signed)
    console.print(f"[green]attestation={attestation_path}[/green]")


@attestation_app.command("freeze")
def attestation_freeze(
    attestation_path: Path = typer.Option(..., "--attestation"),
    frozen_at: str = typer.Option(
        _env_default("CLAW_FROZEN_AT", "2026-01-01T00:00:00Z"), "--frozen-at"
    ),
) -> None:
    att = _read_json(attestation_path)
    frozen = attestation_service.freeze_attestation(att, frozen_at)
    _write_json(attestation_path, frozen)
    console.print(f"[green]attestation={attestation_path}[/green]")


@attestation_app.command("export")
def attestation_export(
    attestation_path: Path = typer.Option(..., "--attestation"),
    out_dir: Path = typer.Option(Path("attestation_repro"), "--out"),
    created_at: str = typer.Option(
        _env_default("CLAW_CREATED_AT", "2026-01-01T00:00:00Z"), "--created-at"
    ),
    event_time: str = typer.Option(
        _env_default("CLAW_EVENT_TIME", "2026-01-01T00:00:00Z"), "--event-time"
    ),
    frozen_at: str = typer.Option(
        _env_default("CLAW_FROZEN_AT", "2026-01-01T00:00:00Z"), "--frozen-at"
    ),
    issued_at: str = typer.Option(
        _env_default("CLAW_ISSUED_AT", "2026-01-01T00:00:00Z"), "--issued-at"
    ),
    anchor_network: str = typer.Option("bitcoin-testnet", "--anchor-network"),
    epoch_id: str = typer.Option("epoch-demo", "--epoch-id"),
) -> None:
    """
    Export a repo-less attestation repro kit.

    Verification is file-based; verify.py is authoritative.
    """
    att = _read_json(attestation_path)
    attestation_service.export_attestation_repro(
        out_dir=out_dir,
        attestation=att,
        created_at=created_at,
        event_time=event_time,
        frozen_at=frozen_at,
        issued_at=issued_at,
        anchor_network=anchor_network,
        epoch_id=epoch_id,
        verify_md_path=PROJECT_ROOT / "docs" / "VERIFY.md",
    )
    console.print(
        f"[green]bundle={out_dir}[/green]\n[cyan]Verification is file-based; verify.py is authoritative.[/cyan]"
    )


@esign_app.command("new")
def esign_new(
    signer_id: str = typer.Option(..., "--signer-id"),
    signer_name: str = typer.Option(..., "--signer-name"),
    statement: str = typer.Option(..., "--statement"),
    signed_at: str = typer.Option(
        _env_default("CLAW_SIGNED_AT", "2026-01-01T00:00:00Z"), "--signed-at"
    ),
    out_dir: Path = typer.Option(Path("workflow_artifacts"), "--out-dir"),
) -> None:
    att = workflow_service.create_attestation_esign(
        signer_id=signer_id,
        signer_name=signer_name,
        statement=statement,
        signed_at=signed_at,
    )
    path = out_dir / "attestations" / f"esign_{att['attestation_sha256'][:12]}.json"
    _write_json(path, att)
    console.print(f"[green]esign_attestation={path}[/green]")


@esign_app.command("freeze")
def esign_freeze(
    attestation_path: Path = typer.Option(..., "--attestation"),
    frozen_at: str = typer.Option(
        _env_default("CLAW_FROZEN_AT", "2026-01-01T00:00:00Z"), "--frozen-at"
    ),
) -> None:
    att = _read_json(attestation_path)
    frozen = workflow_service.freeze_attestation(attestation=att, frozen_at=frozen_at)
    _write_json(attestation_path, frozen)
    console.print(f"[green]esign_attestation={attestation_path}[/green]")


@esign_app.command("export")
def esign_export(
    out_dir: Path = typer.Option(Path("workflow_bundle"), "--out-dir"),
    timeline_path: Path = typer.Option(..., "--timeline"),
    receipt_path: Path = typer.Option(..., "--receipt"),
    esign_path: Path = typer.Option(..., "--esign"),
    liability_path: Path = typer.Option(..., "--liability"),
    agreement_path: Path = typer.Option(..., "--agreement"),
    dispute_path: Optional[Path] = typer.Option(None, "--dispute"),
    created_at: str = typer.Option(
        _env_default("CLAW_PACK_CREATED_AT", "2026-01-01T00:00:00Z"), "--created-at"
    ),
) -> None:
    _export_bundle(
        out_dir=out_dir,
        timeline_path=timeline_path,
        receipt_path=receipt_path,
        esign_path=esign_path,
        liability_path=liability_path,
        agreement_path=agreement_path,
        dispute_path=dispute_path,
        created_at=created_at,
    )
    console.print(f"[green]bundle={out_dir}[/green]")


@liability_app.command("new")
def liability_new(
    subject_id: str = typer.Option(..., "--subject-id"),
    role: str = typer.Option(..., "--role"),
    capacity: str = typer.Option("individual", "--capacity"),
    control_asserted: bool = typer.Option(True, "--control-asserted"),
    access_asserted: bool = typer.Option(True, "--access-asserted"),
    valid_from: str = typer.Option(
        _env_default("CLAW_VALID_FROM", "2026-01-01T00:00:00Z"), "--valid-from"
    ),
    valid_to: str = typer.Option(
        _env_default("CLAW_VALID_TO", "2027-01-01T00:00:00Z"), "--valid-to"
    ),
    out_dir: Path = typer.Option(Path("workflow_artifacts"), "--out-dir"),
) -> None:
    att = workflow_service.create_attestation_liability(
        subject_id=subject_id,
        role=role,
        capacity=capacity,
        control_asserted=control_asserted,
        access_asserted=access_asserted,
        valid_from=valid_from,
        valid_to=valid_to,
        exclusions=[],
    )
    path = out_dir / "attestations" / f"liability_{att['attestation_sha256'][:12]}.json"
    _write_json(path, att)
    console.print(f"[green]liability_attestation={path}[/green]")


@liability_app.command("freeze")
def liability_freeze(
    attestation_path: Path = typer.Option(..., "--attestation"),
    frozen_at: str = typer.Option(
        _env_default("CLAW_FROZEN_AT", "2026-01-01T00:00:00Z"), "--frozen-at"
    ),
) -> None:
    att = _read_json(attestation_path)
    frozen = workflow_service.freeze_attestation(attestation=att, frozen_at=frozen_at)
    _write_json(attestation_path, frozen)
    console.print(f"[green]liability_attestation={attestation_path}[/green]")


@liability_app.command("export")
def liability_export(
    out_dir: Path = typer.Option(Path("workflow_bundle"), "--out-dir"),
    timeline_path: Path = typer.Option(..., "--timeline"),
    receipt_path: Path = typer.Option(..., "--receipt"),
    esign_path: Path = typer.Option(..., "--esign"),
    liability_path: Path = typer.Option(..., "--liability"),
    agreement_path: Path = typer.Option(..., "--agreement"),
    dispute_path: Optional[Path] = typer.Option(None, "--dispute"),
    created_at: str = typer.Option(
        _env_default("CLAW_PACK_CREATED_AT", "2026-01-01T00:00:00Z"), "--created-at"
    ),
) -> None:
    _export_bundle(
        out_dir=out_dir,
        timeline_path=timeline_path,
        receipt_path=receipt_path,
        esign_path=esign_path,
        liability_path=liability_path,
        agreement_path=agreement_path,
        dispute_path=dispute_path,
        created_at=created_at,
    )
    console.print(f"[green]bundle={out_dir}[/green]")


agreement_app = typer.Typer(help="Agreement workflow.")
app.add_typer(agreement_app, name="agreement")


@agreement_app.command("new")
def agreement_new(
    title: str = typer.Option(..., "--title"),
    content_file: Path = typer.Option(..., "--content-file"),
    party: List[str] = typer.Option([], "--party"),
    created_at: str = typer.Option(
        _env_default("CLAW_CREATED_AT", "2026-01-01T00:00:00Z"), "--created-at"
    ),
    out_dir: Path = typer.Option(Path("workflow_artifacts"), "--out-dir"),
) -> None:
    content = content_file.read_text(encoding="utf-8")
    agreement = workflow_service.create_agreement(
        title=title, parties=party, content=content, created_at=created_at
    )
    path = out_dir / "agreements" / agreement["agreement_id"] / "agreement.json"
    _write_json(path, agreement)
    console.print(f"[green]agreement={path}[/green]")


@agreement_app.command("redline")
def agreement_redline(
    agreement_path: Path = typer.Option(..., "--agreement"),
    base_version_id: str = typer.Option(..., "--base-version-id"),
    ops_json: Optional[str] = typer.Option(None, "--ops"),
    ops_file: Optional[Path] = typer.Option(None, "--ops-file"),
    new_content_file: Path = typer.Option(..., "--content-file"),
    created_at: str = typer.Option(
        _env_default("CLAW_CREATED_AT", "2026-01-01T00:00:00Z"), "--created-at"
    ),
) -> None:
    agreement = _read_json(agreement_path)
    if ops_json:
        ops = json.loads(ops_json)
    elif ops_file:
        ops = json.loads(ops_file.read_text(encoding="utf-8"))
    else:
        ops = []
    new_content = new_content_file.read_text(encoding="utf-8")
    updated = workflow_service.propose_redline(
        agreement=agreement,
        base_version_id=base_version_id,
        ops=ops,
        new_content=new_content,
        created_at=created_at,
    )
    _write_json(agreement_path, updated)
    console.print(f"[green]agreement={agreement_path}[/green]")


@agreement_app.command("accept")
def agreement_accept(
    agreement_path: Path = typer.Option(..., "--agreement"),
    version_id: str = typer.Option(..., "--version-id"),
    accepted_at: str = typer.Option(
        _env_default("CLAW_ACCEPTED_AT", "2026-01-01T00:00:00Z"), "--accepted-at"
    ),
) -> None:
    agreement = _read_json(agreement_path)
    updated = workflow_service.accept_version(
        agreement=agreement, version_id=version_id, accepted_at=accepted_at
    )
    _write_json(agreement_path, updated)
    console.print(f"[green]agreement={agreement_path}[/green]")


@agreement_app.command("freeze")
def agreement_freeze(
    agreement_path: Path = typer.Option(..., "--agreement"),
    frozen_at: str = typer.Option(
        _env_default("CLAW_FROZEN_AT", "2026-01-01T00:00:00Z"), "--frozen-at"
    ),
) -> None:
    agreement = _read_json(agreement_path)
    frozen = workflow_service.freeze_agreement(agreement=agreement, frozen_at=frozen_at)
    _write_json(agreement_path, frozen)
    console.print(f"[green]agreement={agreement_path}[/green]")


@agreement_app.command("export")
def agreement_export(
    out_dir: Path = typer.Option(Path("workflow_bundle"), "--out-dir"),
    timeline_path: Path = typer.Option(..., "--timeline"),
    receipt_path: Path = typer.Option(..., "--receipt"),
    esign_path: Path = typer.Option(..., "--esign"),
    liability_path: Path = typer.Option(..., "--liability"),
    agreement_path: Path = typer.Option(..., "--agreement"),
    dispute_path: Optional[Path] = typer.Option(None, "--dispute"),
    created_at: str = typer.Option(
        _env_default("CLAW_PACK_CREATED_AT", "2026-01-01T00:00:00Z"), "--created-at"
    ),
) -> None:
    _export_bundle(
        out_dir=out_dir,
        timeline_path=timeline_path,
        receipt_path=receipt_path,
        esign_path=esign_path,
        liability_path=liability_path,
        agreement_path=agreement_path,
        dispute_path=dispute_path,
        created_at=created_at,
    )
    console.print(f"[green]bundle={out_dir}[/green]")


dispute_app = typer.Typer(help="Dispute packet workflow.")
app.add_typer(dispute_app, name="dispute")


@dispute_app.command("new")
def dispute_new(
    claim: List[str] = typer.Option(..., "--claim"),
    references_file: Path = typer.Option(..., "--references"),
    timelines_file: Optional[Path] = typer.Option(None, "--timelines"),
    created_at: str = typer.Option(
        _env_default("CLAW_CREATED_AT", "2026-01-01T00:00:00Z"), "--created-at"
    ),
    out_dir: Path = typer.Option(Path("workflow_artifacts"), "--out-dir"),
) -> None:
    references = json.loads(references_file.read_text(encoding="utf-8"))
    timelines = (
        json.loads(timelines_file.read_text(encoding="utf-8")) if timelines_file else []
    )
    packet = workflow_service.build_dispute_packet(
        claims=claim, references=references, timelines=timelines, created_at=created_at
    )
    path = out_dir / "disputes" / f"{packet['packet_id']}.json"
    _write_json(path, packet)
    console.print(f"[green]dispute_packet={path}[/green]")


@dispute_app.command("export")
def dispute_export(
    out_dir: Path = typer.Option(Path("workflow_bundle"), "--out-dir"),
    timeline_path: Path = typer.Option(..., "--timeline"),
    receipt_path: Path = typer.Option(..., "--receipt"),
    esign_path: Path = typer.Option(..., "--esign"),
    liability_path: Path = typer.Option(..., "--liability"),
    agreement_path: Path = typer.Option(..., "--agreement"),
    dispute_path: Optional[Path] = typer.Option(None, "--dispute"),
    created_at: str = typer.Option(
        _env_default("CLAW_PACK_CREATED_AT", "2026-01-01T00:00:00Z"), "--created-at"
    ),
) -> None:
    _export_bundle(
        out_dir=out_dir,
        timeline_path=timeline_path,
        receipt_path=receipt_path,
        esign_path=esign_path,
        liability_path=liability_path,
        agreement_path=agreement_path,
        dispute_path=dispute_path,
        created_at=created_at,
    )
    console.print(f"[green]bundle={out_dir}[/green]")


# ---------------------------------------------------------------------------
# Entry point
# ---------------------------------------------------------------------------


def main() -> None:
    app()


if __name__ == "__main__":
    main()
