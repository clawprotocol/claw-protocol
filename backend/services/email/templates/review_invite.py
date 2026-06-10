"""Review invitation email (summary context + link; no agreement body)."""

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
class ReviewInviteEmail:
    subject: str
    html: str
    text: str


def build_review_invite_email(
    *,
    party_name: str,
    agreement_title: str,
    review_url: str,
    requesting_party_name: str = "",
    party_names: list[str] | None = None,
) -> ReviewInviteEmail:
    name = (party_name or "").strip() or "there"
    title = (agreement_title or "").strip() or "Untitled agreement"
    url = (review_url or "").strip()
    requester = (requesting_party_name or "").strip() or "The agreement owner"
    entities = [str(n).strip() for n in (party_names or []) if str(n).strip()]
    if not entities:
        entities = [name]
    parties_line = " · ".join(entities)
    subject = f"Action required: Review {title}"

    summary_rows = [
        ("Agreement type", title),
        ("Requested by", requester),
        ("Parties", parties_line),
        ("Status", "Nothing is signed yet"),
    ]
    inner = (
        render_paragraph(f"Hi {html_escape(name)},")
        + render_paragraph(
            f"<strong style=\"color:inherit;\">{html_escape(requester)}</strong> asked you to review "
            f"<strong style=\"color:inherit;\">{html_escape(title)}</strong> on LawDog."
        )
        + render_summary_panel(summary_rows)
        + render_paragraph(
            "Open the secure review page to read the agreement. If everything looks correct, "
            "you can approve it. If something needs to change, you can request revisions. "
            "This is a review step only — <strong style=\"color:inherit;\">nothing is signed yet</strong> "
            "and nothing is legally binding until all parties sign."
        )
        + render_cta_button(href=url, label="Open secure review")
        + render_fallback_link_block(href=url)
    )
    html = email_document_shell(inner_html=inner)

    text = (
        f"Hi {name},\n\n"
        f"{requester} asked you to review {title} on LawDog.\n\n"
        f"Agreement type: {title}\n"
        f"Requested by: {requester}\n"
        f"Parties: {parties_line}\n"
        f"Status: Nothing is signed yet\n\n"
        "Open the secure review page to read the agreement. You can approve it if it looks correct, "
        "or request revisions if something needs to change. This is a review step only — "
        "nothing is signed yet.\n\n"
        f"Open secure review: {url}\n"
    )

    return ReviewInviteEmail(subject=subject, html=html, text=text)
