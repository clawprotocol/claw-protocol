# backend/exporter.py

from typing import Any, Dict, List
from textwrap import indent


def packet_to_json_export(packet: Dict[str, Any]) -> Dict[str, Any]:
    """
    For now, JSON export is just the packet itself.
    This is a hook for future transformations.
    """
    return packet


def packet_to_markdown(packet: Dict[str, Any]) -> str:
    """
    Render a proof packet as a human-readable Markdown 'clausebook'.
    """
    lines: List[str] = []

    lines.append(f"# CLAW Proof Packet")
    lines.append("")
    lines.append(f"- Version: `{packet.get('version')}`")
    lines.append(f"- Generated At (unix): `{packet.get('generated_at')}`")
    lines.append(f"- Role: `{packet.get('role')}`")
    lines.append(f"- Document Hash: `{packet.get('document_hash')}`")
    lines.append(f"- Clause Count: `{packet.get('clause_count')}`")
    lines.append("")

    clauses = packet.get("clauses") or []
    lines.append("## Clauses")
    lines.append("")

    for c in clauses:
        cid = c.get("id")
        section = c.get("section") or ""
        text = c.get("text") or ""
        chash = c.get("hash")

        header = f"### {cid}"
        if section:
            header += f" — {section}"

        lines.append(header)
        lines.append("")
        lines.append(indent(text, prefix="> "))
        lines.append("")
        if chash:
            lines.append(f"`hash: {chash}`")
            lines.append("")

    # Risk flags
    risk_flags = packet.get("risk_flags") or []
    if risk_flags:
        lines.append("## Risk Flags")
        lines.append("")
        for rf in risk_flags:
            idx = rf.get("clause_index")
            tag = rf.get("tag")
            lvl = rf.get("level")
            expl = rf.get("explanation")
            snippet = rf.get("snippet") or ""
            lines.append(f"- **Clause {idx+1}** — `{tag}` ({lvl})")
            if expl:
                lines.append(f"  - {expl}")
            if snippet:
                lines.append(f"  - Snippet: `{snippet[:120]}`")
        lines.append("")

    return "\n".join(lines)
