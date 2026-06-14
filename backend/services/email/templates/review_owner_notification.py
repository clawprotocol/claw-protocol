"""Owner status email after an external reviewer approves (dashboard link only; no review invite)."""

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
class ReviewOwnerNotificationEmail:
    subject: str
    html: str
    text: str


def build_review_owner_notification_email(
    *,
    owner_name: str,
    agreement_title: str,
    reviewer_display_name: str,
    dashboard_url: str,
) -> ReviewOwnerNotificationEmail:
    owner = (owner_name or "").strip() or "there"
    title = (agreement_title or "").strip() or "Untitled agreement"
    reviewer = (reviewer_display_name or "").strip() or "A reviewer"
    url = (dashboard_url or "").strip()
    subject = f"Review update: {reviewer} approved {title}"

    summary_rows = [
        ("Agreement type", title),
        ("Approved by", reviewer),
        ("Status", "Reviewer approved — track next steps on your dashboard"),
    ]
    inner = (
        render_paragraph(f"Hi {html_escape(owner)},")
        + render_paragraph(
            f"<strong style=\"color:inherit;\">{html_escape(reviewer)}</strong> approved "
            f"<strong style=\"color:inherit;\">{html_escape(title)}</strong>."
        )
        + render_summary_panel(summary_rows)
        + render_paragraph(
            "Track review progress, see who still needs to respond, and take the next step from your dashboard.",
            secondary=True,
        )
        + render_cta_button(href=url, label="Open dashboard")
        + render_fallback_link_block(href=url, heading="Secure dashboard link (fallback)")
    )
    html = email_document_shell(inner_html=inner)

    text = (
        f"Hi {owner},\n\n"
        f"{reviewer} approved {title}.\n\n"
        f"Agreement type: {title}\n"
        f"Approved by: {reviewer}\n\n"
        f"Track review progress from your dashboard:\n{url}\n"
    )

    return ReviewOwnerNotificationEmail(subject=subject, html=html, text=text)


def build_review_owner_signing_ready_notification_email(
    *,
    owner_name: str,
    agreement_title: str,
    reviewer_display_name: str,
    signing_prep_url: str,
    dashboard_url: str,
) -> ReviewOwnerNotificationEmail:
    """All required reviews complete — guide owner to prepare/open signing, not generic dashboard."""
    owner = (owner_name or "").strip() or "there"
    title = (agreement_title or "").strip() or "Untitled agreement"
    reviewer = (reviewer_display_name or "").strip() or "A reviewer"
    prep_url = (signing_prep_url or "").strip()
    _dash_url = (dashboard_url or "").strip()
    subject = f"Review complete: prepare to sign {title}"

    summary_rows = [
        ("Agreement type", title),
        ("Latest approval", reviewer),
        ("Status", "All reviews complete — prepare signature links and sign"),
    ]
    inner = (
        render_paragraph(f"Hi {html_escape(owner)},")
        + render_paragraph(
            f"All required reviews are complete for "
            f"<strong style=\"color:inherit;\">{html_escape(title)}</strong>."
        )
        + render_paragraph(
            f"<strong style=\"color:inherit;\">{html_escape(reviewer)}</strong> was the latest reviewer to approve."
        )
        + render_summary_panel(summary_rows)
        + render_paragraph(
            "Open your signing prep page to review field placement, open your signing view, and share counterparty links.",
            secondary=True,
        )
        + render_cta_button(href=prep_url, label="Prepare signature links")
        + render_fallback_link_block(href=prep_url, heading="Secure link (fallback)")
    )
    html = email_document_shell(inner_html=inner)

    text = (
        f"Hi {owner},\n\n"
        f"All required reviews are complete for {title}.\n"
        f"Latest approval: {reviewer}\n\n"
        f"Prepare signature links and start signing:\n{prep_url}\n"
    )

    return ReviewOwnerNotificationEmail(subject=subject, html=html, text=text)
