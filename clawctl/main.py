from __future__ import annotations

import hashlib
import json
import os
import subprocess
import sys
import time
from pathlib import Path
from typing import Optional, List

import requests
import typer
from rich import box
from rich.console import Console
from rich.panel import Panel
from rich.prompt import Confirm
from rich.table import Table

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

# --- Config loading --------------------------------------------------------


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

    # Env override
    env_server = os.getenv("CLAW_SERVER")
    if env_server:
        config["server"] = env_server

    return config


def get_server_url(server_override: Optional[str]) -> str:
    config = load_config()
    base = server_override or config.get("server") or PROJECT_DEFAULTS["server"]
    return base.rstrip("/")


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
    # macOS / Linux – best-effort kill
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
    running = _backend_running()
    if running:
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


# ---------------------------------------------------------------------------
# Core protocol commands: extract, proof, sign, timestamp
# ---------------------------------------------------------------------------

@app.command()
def extract(
    file: Path = typer.Argument(..., exists=True, dir_okay=False),
    server: Optional[str] = typer.Option(
        None, "--server", "-s", help="Override backend server URL"
    ),
    save: bool = typer.Option(
        False, "--save", help="Save clauses JSON under ./clauses/"
    ),
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

    # If it's a clauses JSON file, load directly; otherwise first extract.
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

    This is v0: a local CLAWCHAIN-style receipt. Later we can plug this
    into on-chain anchoring or remote timestamp services.
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

    # 1) EXTRACT
    res = _post_file("/extract", file, server)
    clauses = res.get("clauses", res)
    if not isinstance(clauses, list):
        console.print("[red]Extract did not return a list of clauses.[/red]")
        raise typer.Exit(1)

    # 2) PROOF
    proof_res = _post_json("/proof", {"clauses": clauses}, server)

    # 3) SIGN
    sign_res = _post_file(
        "/sign",
        file,
        server,
        extra_data={"role": role, "note": "Agent pipeline auto-sign"},
    )

    # 4) TIMESTAMP (local)
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

    # Pretty summary
    table = Table(title="Agent Pipeline Summary", box=box.SIMPLE_HEAVY)
    table.add_column("Step", style="cyan")
    table.add_column("Result", style="white", overflow="fold")
    table.add_row("Extract", f"{len(clauses)} clauses")
    table.add_row("Proof", json.dumps({k: proof_res.get(k) for k in list(proof_res)[:5]}, indent=2))
    table.add_row("Sign", json.dumps({k: sign_res.get(k) for k in list(sign_res)[:5]}, indent=2))
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

    This is intentionally primitive for now and meant for manual testing.
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

    # Python version
    table.add_row("Python", sys.version.replace("\n", " "))

    # venv
    venv = os.environ.get("VIRTUAL_ENV")
    table.add_row("Virtualenv", venv or "<none>")

    # uvicorn check
    uv = run_subprocess(["which", "uvicorn"], capture=True)
    table.add_row("uvicorn", uv.stdout.strip() or "<not found>")

    # Backend process
    table.add_row("Backend running", "yes" if _backend_running() else "no")

    # HTTP reachability
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
    )
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
            '# You can override with CLAW_SERVER env var.\n'
        )
        config_path.write_text(config_body, encoding="utf-8")

    console.print(
        Panel(
            f"Initialized CLAW project at [bold]{target}[/bold]",
            border_style="green",
        )
    )


# ---------------------------------------------------------------------------
# Entry point
# ---------------------------------------------------------------------------

def main() -> None:
    app()


if __name__ == "__main__":
    main()
