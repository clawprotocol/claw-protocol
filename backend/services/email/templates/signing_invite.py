"""Signing invitation email (summary context + VS01 signing link; no agreement body)."""

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
class SigningInviteEmail:
    subject: str
    html: str
    text: str


def build_signing_invite_email(
    *,
    party_name: str,
    agreement_title: str,
    signing_url: str,
    requesting_party_name: str = "",
    party_names: list[str] | None = None,
) -> SigningInviteEmail:
    name = (party_name or "").strip() or "there"
    title = (agreement_title or "").strip() or "Untitled agreement"
    url = (signing_url or "").strip()
    requester = (requesting_party_name or "").strip() or "The agreement owner"
    entities = [str(n).strip() for n in (party_names or []) if str(n).strip()]
    if not entities:
        entities = [name]
    parties_line = " · ".join(entities)
    subject = f"Action required: Sign {title}"

    summary_rows = [
        ("Agreement type", title),
        ("Requested by", requester),
        ("Parties", parties_line),
        ("Status", "Ready for your signature"),
    ]
    inner = (
        render_paragraph(f"Hi {html_escape(name)},")
        + render_paragraph(
            f"<strong style=\"color:inherit;\">{html_escape(requester)}</strong> sent "
            f"<strong style=\"color:inherit;\">{html_escape(title)}</strong> for signature on LawDog."
        )
        + render_summary_panel(summary_rows)
        + render_paragraph(
            "Each party can sign independently. The agreement is complete after everyone signs. "
            "Open your secure signing link when you are ready."
        )
        + render_cta_button(href=url, label="Open signing link")
        + render_fallback_link_block(href=url)
    )
    html = email_document_shell(inner_html=inner)

    text = (
        f"Hi {name},\n\n"
        f"{requester} sent {title} for signature on LawDog.\n\n"
        f"Agreement type: {title}\n"
        f"Requested by: {requester}\n"
        f"Parties: {parties_line}\n"
        f"Status: Ready for your signature\n\n"
        "Each party can sign independently. The agreement is complete after everyone signs.\n\n"
        f"Open signing link: {url}\n"
    )

    return SigningInviteEmail(subject=subject, html=html, text=text)
