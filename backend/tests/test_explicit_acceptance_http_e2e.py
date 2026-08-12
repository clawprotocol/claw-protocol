"""HTTP end-to-end explicit-accept security (authenticated request context)."""

from __future__ import annotations

import pytest
from fastapi.testclient import TestClient

from backend.main import app
from backend.services.agreement_draft_store import load_draft, save_draft
from backend.tests.entitlement_test_support import ensure_headers_entitled
from backend.usage_economics import store as usage_economics_store_mod

pytestmark = pytest.mark.unit

_OWNER = {"X-Claw-Org-Id": "ea-http-owner-org", "X-Claw-Test-Auth-User-Id": "ea-http-owner"}
_OTHER = {"X-Claw-Org-Id": "ea-http-other-org", "X-Claw-Test-Auth-User-Id": "ea-http-other"}
_OTHER_USER = {
    "X-Claw-Org-Id": "ea-http-owner-org",
    "X-Claw-Test-Auth-User-Id": "ea-http-intruder",
}

SLA = (
    "Section Alpha\n\ntarget monthly uptime availability of 99.5%, excluding scheduled maintenance\n\n"
    + ("z" * 600)
)


@pytest.fixture(autouse=True)
def _env(tmp_path, monkeypatch: pytest.MonkeyPatch):
    monkeypatch.setenv("CLAW_ENVIRONMENT", "test")
    monkeypatch.setenv("CLAW_DATA_DIR", str(tmp_path))
    monkeypatch.setenv("CLAW_ECONOMICS_DB_PATH", str(tmp_path / "economics.sqlite3"))
    monkeypatch.setenv("CLAW_USAGE_ECONOMICS_DB_PATH", str(tmp_path / "usage.sqlite3"))
    monkeypatch.setenv("CLAW_USAGE_ECONOMICS_ENABLED", "1")
    from backend.economics.store import reset_economics_store_for_tests

    reset_economics_store_for_tests()
    usage_economics_store_mod._store = None  # noqa: SLF001
    ensure_headers_entitled(_OWNER)
    # Attacker orgs intentionally NOT entitled — cross-tenant must fail closed.
    yield
    reset_economics_store_for_tests()
    usage_economics_store_mod._store = None  # noqa: SLF001


def _create_with_pending_import(
    client: TestClient,
    *,
    imported: str = SLA,
    headers: dict | None = None,
) -> tuple[str, str, str]:
    h = headers or _OWNER
    create = client.post(
        "/api/agreements/draft",
        headers=h,
        json={
            "title": "EA HTTP",
            "jurisdiction": "DE",
            "parties": [{"name": "O", "role": "owner"}, {"name": "R", "role": "party"}],
            "purpose": "p",
            "payment_terms": "",
            "duration": None,
            "due_date": None,
            "effective_date": None,
        },
    )
    assert create.status_code == 200, create.text
    aid = create.json()["id"]
    raw = load_draft(aid)
    base = "Section Alpha\n\nSection Beta\n\n" + ("z" * 600)
    raw["server_full_document_text"] = base
    raw["premium_server_full_document_text"] = base
    save_draft(raw)
    imp = client.post(
        f"/api/agreements/{aid}/pro-redline/import-text",
        headers=h,
        json={"imported_text": imported},
    )
    assert imp.status_code == 200, imp.text
    raw2 = load_draft(aid)
    pending = (raw2.get("pro_redline_v1") or {}).get("pending_import") or {}
    pid = str(pending.get("id") or "")
    assert pid
    prior = str(raw2.get("server_full_document_text") or "")
    return aid, pid, prior


def test_http_successful_exact_acceptance_persists_audit_and_sot() -> None:
    client = TestClient(app)
    aid, pid, _prior = _create_with_pending_import(client)
    acc = client.post(f"/api/agreements/{aid}/pro-redline/accept-import", headers=_OWNER, json={})
    assert acc.status_code == 200, acc.text
    raw = load_draft(aid)
    assert "99.5%" in (raw.get("server_full_document_text") or "")
    rec = raw.get("explicit_acceptance_v1") or {}
    assert rec.get("tenant_id")
    assert rec.get("actor_id")
    assert rec.get("agreement_id") == aid
    assert rec.get("content_sha256")
    assert rec.get("accepted_at")
    assert rec.get("source_action") == "pro_redline_accept_import"
    assert rec.get("source_proposal_id") == pid
    assert "uptime_99_5" in (rec.get("accepted_fingerprint_codes") or [])
    audit = raw.get("audit_log") or []
    assert any(
        isinstance(e, dict)
        and (
            e.get("event_type") in {"pro_redline_accepted", "owner_accepted_revision", "field_updated"}
            or "accept" in str(e.get("event_type") or "").lower()
            or "accept" in str(e.get("field") or "").lower()
        )
        for e in audit
    ) or bool(rec.get("record_id"))


def test_http_cross_tenant_accept_denied_no_sot_mutation() -> None:
    client = TestClient(app)
    aid, _pid, prior = _create_with_pending_import(client)
    ensure_headers_entitled(_OTHER)  # other org entitled but not owner
    denied = client.post(
        f"/api/agreements/{aid}/pro-redline/accept-import",
        headers=_OTHER,
        json={},
    )
    assert denied.status_code in (401, 403), denied.text
    raw = load_draft(aid)
    assert (raw.get("server_full_document_text") or "") == prior
    assert not raw.get("explicit_acceptance_v1")


def test_http_cross_user_same_org_accept_binds_actor() -> None:
    """Acceptance establishes from authenticated actor; different user still owner-org may pass org guard.

    Product owner-mutation is org-scoped in test auth; actor_id must still bind the caller.
    """
    client = TestClient(app)
    aid, _pid, _prior = _create_with_pending_import(client)
    acc = client.post(
        f"/api/agreements/{aid}/pro-redline/accept-import",
        headers=_OTHER_USER,
        json={},
    )
    # Org matches → mutation may succeed; record must bind intruder actor, not owner.
    if acc.status_code == 200:
        rec = (load_draft(aid).get("explicit_acceptance_v1") or {})
        assert rec.get("actor_id") == "ea-http-intruder"
    else:
        assert acc.status_code in (401, 403)


def test_http_boolean_body_accepted_true_ignored_without_pending() -> None:
    client = TestClient(app)
    create = client.post(
        "/api/agreements/draft",
        headers=_OWNER,
        json={
            "title": "EA",
            "jurisdiction": "DE",
            "parties": [{"name": "O", "role": "owner"}],
            "purpose": "p",
            "payment_terms": "",
            "duration": None,
            "due_date": None,
            "effective_date": None,
        },
    )
    aid = create.json()["id"]
    prior = str(load_draft(aid).get("server_full_document_text") or "")
    # No pending import — client Boolean cannot invent an acceptance.
    r = client.post(
        f"/api/agreements/{aid}/pro-redline/accept-import",
        headers=_OWNER,
        json={"accepted": True, "owner_explicit_accept": True},
    )
    assert r.status_code == 400, r.text
    assert (load_draft(aid).get("server_full_document_text") or "") == prior


def test_http_reused_proposal_id_after_accept_fails_closed() -> None:
    client = TestClient(app)
    aid, pid, _ = _create_with_pending_import(client)
    assert client.post(
        f"/api/agreements/{aid}/pro-redline/accept-import", headers=_OWNER, json={}
    ).status_code == 200
    # Pending cleared — reuse of proposal cannot re-accept.
    again = client.post(
        f"/api/agreements/{aid}/pro-redline/accept-import",
        headers=_OWNER,
        json={"source_proposal_id": pid, "accepted": True},
    )
    assert again.status_code == 400, again.text


def test_http_unauthorized_recipient_cannot_accept_import() -> None:
    client = TestClient(app)
    aid, _pid, prior = _create_with_pending_import(client)
    raw = load_draft(aid)
    parties = raw.get("parties") or []
    reviewer_id = None
    for p in parties:
        if isinstance(p, dict) and str(p.get("role") or "") == "party":
            reviewer_id = p.get("id")
            break
    if not reviewer_id:
        pytest.skip("no reviewer party id")
    mint = client.post(
        f"/api/agreements/{aid}/recipient-access-token",
        headers=_OWNER,
        json={
            "mode": "review",
            "role": "reviewer",
            "recipient_party_id": reviewer_id,
            "inviter_display_name": "Owner",
        },
    )
    if mint.status_code != 200:
        pytest.skip("recipient mint unavailable")
    tok = mint.json()["token"]
    denied = client.post(
        f"/api/agreements/{aid}/pro-redline/accept-import",
        headers={"X-Claw-Recipient-Access-Token": tok},
        json={},
    )
    assert denied.status_code in (401, 403), denied.text
    assert (load_draft(aid).get("server_full_document_text") or "") == prior


def test_http_rejected_acceptance_atomicity_when_gate_blocks(monkeypatch: pytest.MonkeyPatch) -> None:
    """If persist gate fails after pending exists, SoT must not mutate."""
    import backend.routers.agreements_v2_api as v2

    client = TestClient(app)
    aid, _pid, prior = _create_with_pending_import(client)

    def _block(**kwargs):
        from backend.agreements.semantic_term_authority import AuthorityFinding, AuthorityGateResult

        return AuthorityGateResult(
            ok=False,
            blocked=True,
            findings=[
                AuthorityFinding(
                    code="acceptance_content_mismatch",
                    severity="blocker",
                    message="forced",
                )
            ],
        )

    monkeypatch.setattr(v2, "assert_persistable_paid_pro_corpus", _block)
    r = client.post(f"/api/agreements/{aid}/pro-redline/accept-import", headers=_OWNER, json={})
    assert r.status_code == 409, r.text
    raw = load_draft(aid)
    assert (raw.get("server_full_document_text") or "") == prior
    assert not raw.get("explicit_acceptance_v1")
    # Pending import remains for retry (atomicity: no silent accept).
    pending = (raw.get("pro_redline_v1") or {}).get("pending_import")
    assert isinstance(pending, dict)
