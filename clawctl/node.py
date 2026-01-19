from __future__ import annotations

import os
import subprocess
import time
from pathlib import Path
from typing import Optional

import typer
from rich.console import Console

app = typer.Typer(help="Run CLAW nodes (API, verifier-only).", no_args_is_help=True)
console = Console()

PROJECT_ROOT = Path(__file__).resolve().parents[1]


def _is_listening(host: str, port: int) -> bool:
    # macOS: lsof is usually present
    try:
        r = subprocess.run(
            ["bash", "-lc", f"lsof -i :{port} | grep LISTEN >/dev/null 2>&1"],
            cwd=str(PROJECT_ROOT),
        )
        return r.returncode == 0
    except Exception:
        return False


@app.command()
def api(
    port: int = typer.Option(8000, help="Port to bind"),
    host: str = typer.Option("127.0.0.1", help="Host to bind"),
    reload: bool = typer.Option(False, help="Enable auto-reload (dev only)"),
) -> None:
    """
    Run the CLAW API node (FastAPI via uvicorn).
    """
    if _is_listening(host, port):
        console.print(f"[yellow]Port {port} already in use. If CLAW is running, stop it first.[/yellow]")
        raise typer.Exit(1)

    env = os.environ.copy()
    env.setdefault("CLAW_NODE_MODE", "api")

    cmd = [
        "uvicorn",
        "backend.main:app",
        "--host",
        host,
        "--port",
        str(port),
    ]
    if reload:
        cmd.append("--reload")

    console.print(f"[cyan]Starting CLAW API node on http://{host}:{port}[/cyan]")
    # Run in foreground so logs are visible
    subprocess.run(cmd, cwd=str(PROJECT_ROOT), env=env)


@app.command()
def verifier(
    port: int = typer.Option(8000, help="Port to bind"),
    host: str = typer.Option("127.0.0.1", help="Host to bind"),
    reload: bool = typer.Option(False, help="Enable auto-reload (dev only)"),
) -> None:
    """
    Run a verifier-only node (API disabled from doing write/anchor actions).
    Backend must enforce CLAW_NODE_MODE=verifier.
    """
    if _is_listening(host, port):
        console.print(f"[yellow]Port {port} already in use. If CLAW is running, stop it first.[/yellow]")
        raise typer.Exit(1)

    env = os.environ.copy()
    env["CLAW_NODE_MODE"] = "verifier"

    cmd = [
        "uvicorn",
        "backend.main:app",
        "--host",
        host,
        "--port",
        str(port),
    ]
    if reload:
        cmd.append("--reload")

    console.print(f"[cyan]Starting CLAW verifier node on http://{host}:{port}[/cyan]")
    subprocess.run(cmd, cwd=str(PROJECT_ROOT), env=env)
