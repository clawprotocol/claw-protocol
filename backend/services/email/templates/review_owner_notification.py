"""Owner status email after an external reviewer approves (dashboard link only; no review invite)."""

from __future__ import annotations

from dataclasses import dataclass


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

    html = f"""<!DOCTYPE html>
<html>
<body style="font-family: system-ui, sans-serif; line-height: 1.5; color: #111;">
  <p>Hi { _html_escape(owner) },</p>
  <p><strong>{ _html_escape(reviewer) }</strong> approved <strong>{ _html_escape(title) }</strong>.</p>
  <p>Track review progress and next steps from your dashboard.</p>
  <p><a href="{ _html_escape(url) }" style="display:inline-block;padding:12px 20px;background:#111;color:#fff;text-decoration:none;border-radius:6px;">Open dashboard</a></p>
  <p style="font-size:14px;color:#555;">Or copy this link into your browser:<br><a href="{ _html_escape(url) }">{ _html_escape(url) }</a></p>
</body>
</html>"""

    text = (
        f"Hi {owner},\n\n"
        f"{reviewer} approved {title}.\n\n"
        f"Track review progress from your dashboard:\n{url}\n"
    )

    return ReviewOwnerNotificationEmail(subject=subject, html=html, text=text)


def _html_escape(value: str) -> str:
    return (
        (value or "")
        .replace("&", "&amp;")
        .replace("<", "&lt;")
        .replace(">", "&gt;")
        .replace('"', "&quot;")
    )
