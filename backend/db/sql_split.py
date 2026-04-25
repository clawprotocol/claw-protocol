"""Split SQL migration files into executable statements (no sqlite3 ``executescript`` on Postgres)."""

from __future__ import annotations


def split_sql_statements(script: str) -> list[str]:
    """
    Lexical split on semicolons at end-of-line (good enough for our checked-in migrations).

    Strips ``--`` line comments coarsely for empty detection only; migration bodies avoid embedded `;`.
    """
    parts: list[str] = []
    buf: list[str] = []
    for line in script.splitlines():
        stripped = line.strip()
        if stripped.startswith("--"):
            continue
        buf.append(line)
        if stripped.endswith(";"):
            block = "\n".join(buf).strip()
            buf = []
            if block.endswith(";"):
                block = block[:-1].strip()
            if block:
                parts.append(block)
    tail = "\n".join(buf).strip()
    if tail:
        parts.append(tail)
    return parts
