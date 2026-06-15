"""Fully-executed agreement notification email (summary + proof link; no agreement body)."""

from __future__ import annotations

from dataclasses import dataclass

from backend.services.email.templates.email_layout import (
    email_document_shell,
    html_escape,
    render_cta_button,
    render_fallback_link_block,
    render_paragraph,
    render_summary_panel,
)


@dataclass(frozen=True)
class SigningCompleteEmail:
    subject: str
    html: str
    text: str


def build_signing_complete_email(
    *,
    party_name: str,
    agreement_title: str,
    proof_url: str,
    party_names: list[str] | None = None,
) -> SigningCompleteEmail:
    name = (party_name or "").strip() or "there"
    title = (agreement_title or "").strip() or "Untitled agreement"
    url = (proof_url or "").strip()
    entities = [str(n).strip() for n in (party_names or []) if str(n).strip()]
    if not entities:
        entities = [name]
    parties_line = " · ".join(entities)
    subject = f"Completed: {title}"

    summary_rows = [
        ("Agreement type", title),
        ("Parties", parties_line),
        ("Status", "Fully signed"),
    ]
    inner = (
        render_paragraph(f"Hi {html_escape(name)},")
        + render_paragraph(
            f"<strong style=\"color:inherit;\">{html_escape(title)}</strong> is fully signed on LawDog. "
            "All required parties have completed signing."
        )
        + render_summary_panel(summary_rows)
        + render_paragraph(
            "Your signed record and verification details are available at the link below."
        )
        + (render_cta_button(href=url, label="View signed agreement") if url else "")
        + (render_fallback_link_block(href=url) if url else "")
    )
    html = email_document_shell(inner_html=inner)

    text = (
        f"Hi {name},\n\n"
        f"{title} is fully signed on LawDog. All required parties have completed signing.\n\n"
        f"Agreement type: {title}\n"
        f"Parties: {parties_line}\n"
        f"Status: Fully signed\n\n"
    )
    if url:
        text += f"View signed agreement: {url}\n"

    return SigningCompleteEmail(subject=subject, html=html, text=text)
