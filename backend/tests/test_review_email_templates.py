"""Unit tests for review email template presentation."""

from __future__ import annotations

from backend.services.email.templates.email_layout import (
    COLOR_CARD_BG,
    COLOR_CTA_TEXT,
    COLOR_PAGE_BG,
    COLOR_TEXT_PRIMARY,
)
from backend.services.email.templates.review_invite import build_review_invite_email
from backend.services.email.templates.review_owner_notification import build_review_owner_notification_email


def test_review_invite_subject_and_context() -> None:
    email = build_review_invite_email(
        party_name="Iron Vale Systems Inc",
        agreement_title="Consulting Agreement",
        review_url="https://app.example.com/agreements/a/review?t=abc",
        requesting_party_name="Blue Canyon Analytics LLC",
        party_names=["Blue Canyon Analytics LLC", "Iron Vale Systems Inc"],
    )
    assert email.subject == "Action required: Review Consulting Agreement"
    assert "Blue Canyon Analytics LLC" in email.html
    assert "Iron Vale Systems Inc" in email.html
    assert "Nothing is signed yet" in email.html
    assert "approve it" in email.html.lower()
    assert "request revisions" in email.html.lower()
    assert "Nothing is signed yet" in email.text
    assert "payment_terms" not in email.html.lower()


def test_review_invite_uses_styled_fallback_link_block() -> None:
    email = build_review_invite_email(
        party_name="Pat",
        agreement_title="NDA",
        review_url="https://app.example.com/agreements/a/review?t=abc",
    )
    assert "Open secure review" in email.html
    assert "Secure review link (fallback)" in email.html
    assert 'bgcolor="' in email.html
    assert email.html.count("https://app.example.com/agreements/a/review?t=abc") >= 2


def test_review_invite_explicit_light_theme_colors() -> None:
    email = build_review_invite_email(
        party_name="Pat",
        agreement_title="NDA",
        review_url="https://app.example.com/agreements/a/review?t=abc",
    )
    assert f'bgcolor="{COLOR_PAGE_BG}"' in email.html
    assert f'bgcolor="{COLOR_CARD_BG}"' in email.html
    assert f"color:{COLOR_TEXT_PRIMARY}" in email.html
    assert f"color:{COLOR_CTA_TEXT}" in email.html
    assert 'name="color-scheme" content="light"' in email.html


def test_review_owner_notification_subject_and_layout() -> None:
    email = build_review_owner_notification_email(
        owner_name="Owner Co",
        agreement_title="Consulting Agreement",
        reviewer_display_name="Iron Vale Systems Inc",
        dashboard_url="https://app.example.com/app?focus=ag-1",
    )
    assert email.subject == "Review update: Iron Vale Systems Inc approved Consulting Agreement"
    assert "Open dashboard" in email.html
    assert "Secure dashboard link (fallback)" in email.html
    assert 'name="color-scheme" content="light"' in email.html
    assert "/review?t=" not in email.html
