"""Shared HTML email layout helpers (Outlook-safe tables, explicit light-theme colors)."""

from __future__ import annotations

# Explicit palette — avoids dark-mode clients inheriting unreadable text/background pairs.
COLOR_PAGE_BG = "#f4f4f5"
COLOR_CARD_BG = "#ffffff"
COLOR_TEXT_PRIMARY = "#111827"
COLOR_TEXT_SECONDARY = "#4b5563"
COLOR_TEXT_MUTED = "#6b7280"
COLOR_BORDER = "#d1d5db"
COLOR_PANEL_BG = "#f3f4f6"
COLOR_LINK = "#1d4ed8"
COLOR_CTA_BG = "#111827"
COLOR_CTA_TEXT = "#ffffff"

_FONT = "Arial, Helvetica, sans-serif"


def html_escape(value: str) -> str:
    return (
        (value or "")
        .replace("&", "&amp;")
        .replace("<", "&lt;")
        .replace(">", "&gt;")
        .replace('"', "&quot;")
    )


def email_document_shell(*, inner_html: str) -> str:
    """Outlook-safe outer wrapper with forced light color scheme."""
    return f"""<!DOCTYPE html>
<html lang="en" xmlns="http://www.w3.org/1999/xhtml" xmlns:v="urn:schemas-microsoft-com:vml">
<head>
<meta http-equiv="Content-Type" content="text/html; charset=UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<meta name="color-scheme" content="light">
<meta name="supported-color-schemes" content="light">
<title>LawDog</title>
</head>
<body bgcolor="{COLOR_PAGE_BG}" style="margin:0;padding:0;background-color:{COLOR_PAGE_BG};color:{COLOR_TEXT_PRIMARY};">
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" bgcolor="{COLOR_PAGE_BG}" style="background-color:{COLOR_PAGE_BG};">
<tr>
<td align="center" style="padding:24px 16px;">
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" bgcolor="{COLOR_CARD_BG}" style="max-width:560px;background-color:{COLOR_CARD_BG};border:1px solid {COLOR_BORDER};border-radius:8px;">
<tr>
<td style="padding:28px 24px;font-family:{_FONT};font-size:16px;line-height:1.55;color:{COLOR_TEXT_PRIMARY};">
{inner_html}
</td>
</tr>
</table>
<p style="margin:16px 0 0;font-family:{_FONT};font-size:12px;line-height:1.5;color:{COLOR_TEXT_MUTED};text-align:center;">
Sent by LawDog · Secure agreement review
</p>
</td>
</tr>
</table>
</body>
</html>"""


def render_paragraph(text: str, *, secondary: bool = False) -> str:
    color = COLOR_TEXT_SECONDARY if secondary else COLOR_TEXT_PRIMARY
    return (
        f'<p style="margin:0 0 16px;font-family:{_FONT};font-size:16px;'
        f'line-height:1.55;color:{color};">{text}</p>'
    )


def render_cta_button(*, href: str, label: str) -> str:
    safe_href = html_escape(href)
    safe_label = html_escape(label)
    return f"""<table role="presentation" cellspacing="0" cellpadding="0" border="0" style="margin:8px 0 20px;">
<tr>
<td align="left" bgcolor="{COLOR_CTA_BG}" style="border-radius:6px;background-color:{COLOR_CTA_BG};">
<a href="{safe_href}" style="display:inline-block;padding:14px 24px;font-family:{_FONT};font-size:16px;font-weight:600;color:{COLOR_CTA_TEXT};text-decoration:none;border-radius:6px;background-color:{COLOR_CTA_BG};">{safe_label}</a>
</td>
</tr>
</table>"""


def render_fallback_link_block(*, href: str, heading: str = "Secure review link (fallback)") -> str:
    safe_href = html_escape(href)
    safe_heading = html_escape(heading)
    return f"""<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" bgcolor="{COLOR_PANEL_BG}" style="margin-top:8px;border:1px solid {COLOR_BORDER};background-color:{COLOR_PANEL_BG};border-radius:6px;">
<tr>
<td style="padding:16px;font-family:{_FONT};">
<p style="margin:0 0 8px;font-size:13px;font-weight:600;color:{COLOR_TEXT_SECONDARY};">{safe_heading}</p>
<p style="margin:0 0 10px;font-size:13px;line-height:1.5;color:{COLOR_TEXT_SECONDARY};">If the button above does not work, copy and paste this link into your browser:</p>
<p style="margin:0;font-size:12px;line-height:1.5;word-break:break-all;color:{COLOR_TEXT_MUTED};"><a href="{safe_href}" style="color:{COLOR_LINK};text-decoration:underline;">{safe_href}</a></p>
</td>
</tr>
</table>"""


def render_summary_panel(rows: list[tuple[str, str]]) -> str:
    body_rows: list[str] = []
    for label, value in rows:
        if not (value or "").strip():
            continue
        body_rows.append(
            f'<tr><td style="padding:6px 0;font-family:{_FONT};font-size:14px;line-height:1.45;'
            f'color:{COLOR_TEXT_SECONDARY};width:38%;vertical-align:top;"><strong style="color:{COLOR_TEXT_PRIMARY};">'
            f"{html_escape(label)}</strong></td>"
            f'<td style="padding:6px 0;font-family:{_FONT};font-size:14px;line-height:1.45;'
            f'color:{COLOR_TEXT_PRIMARY};vertical-align:top;">{html_escape(value)}</td></tr>'
        )
    if not body_rows:
        return ""
    return f"""<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" bgcolor="{COLOR_PANEL_BG}" style="margin:0 0 20px;border:1px solid {COLOR_BORDER};background-color:{COLOR_PANEL_BG};border-radius:6px;">
<tr><td style="padding:16px;">
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0">
{"".join(body_rows)}
</table>
</td></tr>
</table>"""
