"""Fully-executed agreement notification email (summary + signed view link; no agreement body)."""

from __future__ import annotations

from dataclasses import dataclass

from backend.services.email.templates.email_layout import (
    email_document_shell,
    html_escape,
    render_cta_button,
    render_fallback_link_block,
    render_paragraph,
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
    view_signed_url: str,
    completed_at_display: str,
    party_summary_lines: list[str],
    download_url: str | None = None,
) -> SigningCompleteEmail:
    name = (party_name or "").strip() or "there"
    title = (agreement_title or "").strip() or "Untitled agreement"
    view_url = (view_signed_url or "").strip()
    completed = (completed_at_display or "").strip() or "Recently"
    download = (download_url or "").strip()
    subject = f"Completed agreement: {title}"

    party_html_items = "".join(
        f'<li style="margin:0 0 6px;">{html_escape(line)}</li>' for line in party_summary_lines if line.strip()
    )
    party_block = (
        f'<p style="margin:0 0 8px;font-family:Arial,Helvetica,sans-serif;font-size:16px;'
        f'line-height:1.55;color:#111827;"><strong>Parties:</strong></p>'
        f'<ul style="margin:0 0 16px;padding-left:20px;font-family:Arial,Helvetica,sans-serif;'
        f'font-size:15px;line-height:1.5;color:#111827;">{party_html_items}</ul>'
        if party_html_items
        else ""
    )

    inner = (
        render_paragraph(f"Hi {html_escape(name)},")
        + render_paragraph("Your agreement is fully signed.")
        + render_paragraph(f"<strong>Agreement:</strong> {html_escape(title)}")
        + render_paragraph(f"<strong>Completed:</strong> {html_escape(completed)}")
        + party_block
        + render_paragraph("View completed agreement:")
        + (render_cta_button(href=view_url, label="View completed agreement") if view_url else "")
        + (render_fallback_link_block(href=view_url) if view_url else "")
    )
    if download and download != view_url:
        inner += (
            render_paragraph("Download completed agreement/proof:")
            + render_cta_button(href=download, label="Download agreement")
            + render_fallback_link_block(href=download)
        )

    inner += render_paragraph(
        "Sent by LawDog. LawDog is software, not a law firm.",
        secondary=True,
    )
    html = email_document_shell(inner_html=inner)

    text_lines = [
        f"Hi {name},",
        "",
        "Your agreement is fully signed.",
        "",
        f"Agreement: {title}",
        f"Completed: {completed}",
        "",
    ]
    if party_summary_lines:
        text_lines.append("Parties:")
        for line in party_summary_lines:
            if line.strip():
                text_lines.append(f"* {line}")
        text_lines.append("")
    if view_url:
        text_lines.append(f"View completed agreement:\n{view_url}")
        text_lines.append("")
    if download and download != view_url:
        text_lines.append(f"Download completed agreement/proof:\n{download}")
        text_lines.append("")
    text_lines.append("Sent by LawDog. LawDog is software, not a law firm.")

    return SigningCompleteEmail(subject=subject, html=html, text="\n".join(text_lines))
