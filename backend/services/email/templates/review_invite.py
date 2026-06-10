"""Review invitation email (title + link only; no agreement body)."""

from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True)
class ReviewInviteEmail:
    subject: str
    html: str
    text: str


def build_review_invite_email(*, party_name: str, agreement_title: str, review_url: str) -> ReviewInviteEmail:
    name = (party_name or "").strip() or "there"
    title = (agreement_title or "").strip() or "Untitled agreement"
    url = (review_url or "").strip()
    subject = f"Review requested: {title}"

    html = f"""<!DOCTYPE html>
<html>
<body style="font-family: system-ui, sans-serif; line-height: 1.5; color: #111;">
  <p>Hi { _html_escape(name) },</p>
  <p>You have been asked to review <strong>{ _html_escape(title) }</strong>.</p>
  <p><a href="{ _html_escape(url) }" style="display:inline-block;padding:12px 20px;background:#111;color:#fff;text-decoration:none;border-radius:6px;">Open review</a></p>
  <p style="font-size:14px;color:#555;">Or copy this link into your browser:<br><a href="{ _html_escape(url) }">{ _html_escape(url) }</a></p>
</body>
</html>"""

    text = (
        f"Hi {name},\n\n"
        f"You have been asked to review {title}.\n\n"
        f"Open review: {url}\n"
    )

    return ReviewInviteEmail(subject=subject, html=html, text=text)


def _html_escape(value: str) -> str:
    return (
        (value or "")
        .replace("&", "&amp;")
        .replace("<", "&lt;")
        .replace(">", "&gt;")
        .replace('"', "&quot;")
    )
