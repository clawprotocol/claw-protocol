"""Restore only exact identities removed from this agreement request, after model return.

No persistence, global registry, guessed names, or authorization grants. The caller owns
the map for one call. Outbound masking and privilege policy remain in the AI airlock.
"""
from __future__ import annotations

import json
import re

IDENTITY_TOKEN = re.compile(r"\[(?:ORG|NAME|EMAIL|PHONE|ADDRESS|ACCOUNT|SSN|CASE_ID)_[A-Za-z0-9_]+\]", re.I)


class AgreementIdentityError(ValueError):
    """Metadata-only failure; never include the input, completion, or binding map."""


def restore_agreement_identities(text: str, bindings: dict[str, str]) -> str:
    def restore_string(value: str) -> str:
        def replace(match: re.Match[str]) -> str:
            original = bindings.get(match.group(0))
            if original is None:
                raise AgreementIdentityError("unbound_agreement_identity")
            return original
        # One pass: restored user text cannot recursively expand another token.
        return IDENTITY_TOKEN.sub(replace, value)

    def restore_value(value):
        if isinstance(value, str):
            return restore_string(value)
        if isinstance(value, list):
            return [restore_value(item) for item in value]
        if isinstance(value, dict):
            if any(IDENTITY_TOKEN.search(key) for key in value):
                raise AgreementIdentityError("identity_in_schema_key")
            return {key: restore_value(item) for key, item in value.items()}
        return value

    stripped = text.strip()
    if stripped.startswith(("{", "```")) or (stripped.startswith("[") and not IDENTITY_TOKEN.match(stripped)):
        # Do not repair truncated JSON or substitute into serialized string escapes.
        # The route handles JSON failure/truncation without treating it as paper.
        try:
            parsed = json.loads(stripped)
        except json.JSONDecodeError:
            return text
        return json.dumps(restore_value(parsed), ensure_ascii=False)
    return restore_string(text)
