"""J7 auth/claim authority — production finalize-auth, same canonical agreement ID.

Playwright J7 cases that mock finalize-auth and substitute a canned owned ID are
not authority for this invariant. This TestClient path is:

  POST /v1/workspace/anonymous-session
  → POST /api/agreements/draft  (guest Free Agreement persistence)
  → POST /v1/workspace/auth-continuation
  → POST /v1/workspace/finalize-auth  (production finalize_auth → _migrate_drafts_for_claim)
  → usage-economics agreement_owner lookup
"""

from __future__ import annotations

import pytest
from fastapi.testclient import TestClient

from backend.main import app
from backend.security.anonymous_session_store import reset_anonymous_session_store_for_tests
from backend.services.agreement_draft_store import load_draft
from backend.tests.conftest_auth_security import auth_secrets, make_test_auth_headers, mint_anonymous_session
from backend.tests.entitlement_test_support import ensure_org_pro_entitlement
from backend.usage_economics.store import UsageEconomicsStore


@pytest.fixture()
def isolated_usage(tmp_path, monkeypatch: pytest.MonkeyPatch, auth_secrets):
    monkeypatch.setenv("CLAW_DATA_DIR", str(tmp_path))
    monkeypatch.setenv("CLAW_USAGE_ECONOMICS_DB_PATH", str(tmp_path / "usage_eco.sqlite3"))
    monkeypatch.setenv("CLAW_ECONOMICS_DB_PATH", str(tmp_path / "economics.sqlite3"))

    import backend.economics.store as eco_store_mod
    import backend.usage_economics.store as ue_store_mod

    ue_store_mod._store = None
    eco_store_mod._store = None
    reset_anonymous_session_store_for_tests()
    usage = UsageEconomicsStore(str(tmp_path / "usage_eco.sqlite3"))
    usage.init_schema()
    yield usage
    ue_store_mod._store = None
    eco_store_mod._store = None
    reset_anonymous_session_store_for_tests()


def _guest_draft_payload() -> dict:
    return {
        "title": "Anonymous Free Agreement",
        "jurisdiction": "Oklahoma",
        "parties": [
            {"name": "Red Mesa Logistics LLC", "role": "Client"},
            {"name": "Harbor Peak Automation LLC", "role": "Service Provider"},
        ],
        "purpose": "Professional technology and consulting services.",
        "payment_terms": "$96,000 milestone installments",
        "duration": "12 months",
    }


def test_anonymous_free_agreement_survives_finalize_auth_same_canonical_id(isolated_usage):
    """Auth-before-checkout authority: same ID, owner org:anon-* → org:user-*."""
    client = TestClient(app)
    anon_org, _token, headers = mint_anonymous_session(client)

    created = client.post(
        "/api/agreements/draft",
        headers={**headers, "Content-Type": "application/json"},
        json=_guest_draft_payload(),
    )
    assert created.status_code == 200, created.text
    anonymous_agreement_id = created.json()["id"]
    assert anonymous_agreement_id
    persisted = load_draft(anonymous_agreement_id)
    assert persisted is not None
    assert persisted.get("id") == anonymous_agreement_id

    pre = isolated_usage.get_agreement_owner_row(anonymous_agreement_id)
    assert pre is not None
    pre_owner = pre["subject_ref"]
    assert pre_owner == f"org:{anon_org}"
    assert isolated_usage.list_agreement_ids_for_subject(pre_owner) == [anonymous_agreement_id]

    user_id = "j7-auth-claim-owner"
    target_org = f"user-{user_id}"
    # Product contract: _migrate_drafts_for_claim defers import until the target is Pro.
    # This is fixture entitlement, not Stripe settlement.
    ensure_org_pro_entitlement(target_org, user_id=user_id)

    cont = client.post(
        "/v1/workspace/auth-continuation",
        headers=headers,
        json={
            "agreement_id": anonymous_agreement_id,
            "destination_path": "/app/create",
            "workflow_stage": "starter",
            "auth_purpose": "claim",
        },
    )
    assert cont.status_code == 200, cont.text
    continuation_id = cont.json()["continuation_id"]
    assert continuation_id

    finalize = client.post(
        "/v1/workspace/finalize-auth",
        headers={**headers, **make_test_auth_headers(user_id)},
        json={"continuation_id": continuation_id, "claim_method": "magic_link"},
    )
    assert finalize.status_code == 200, finalize.text
    body = finalize.json()
    migrated_ids = list(body.get("migrated_agreement_ids") or [])
    assert body.get("migrated_agreement_count") == 1
    assert migrated_ids == [anonymous_agreement_id]
    destination = str(body.get("destination_path") or "")
    assert f"agreementId={anonymous_agreement_id}" in destination
    assert body.get("org_id") == target_org

    post = isolated_usage.get_agreement_owner_row(anonymous_agreement_id)
    assert post is not None
    post_owner = post["subject_ref"]
    assert post_owner == f"org:{target_org}"
    assert post.get("claim_method") == "magic_link"
    assert post.get("anonymous_source_org") == anon_org
    assert isolated_usage.list_agreement_ids_for_subject(post_owner) == [anonymous_agreement_id]
    assert isolated_usage.list_agreement_ids_for_subject(pre_owner) == []
    assert isolated_usage.owner_subject_for_agreement(anonymous_agreement_id) == post_owner
    print(
        "J7_AUTH_CLAIM_TRACE "
        f"anonymous_agreement_id={anonymous_agreement_id} "
        f"pre_auth_owner={pre_owner} "
        f"finalize_migrated_ids={migrated_ids} "
        f"post_auth_agreement_id={anonymous_agreement_id} "
        f"post_auth_owner={post_owner} "
        f"resume_destination={destination}"
    )
