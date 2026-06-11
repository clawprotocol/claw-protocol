from __future__ import annotations

import pytest
from fastapi.testclient import TestClient

from backend.main import app


@pytest.fixture()
def isolated_agreement_env(monkeypatch: pytest.MonkeyPatch, tmp_path):
    monkeypatch.setenv("CLAW_DATA_DIR", str(tmp_path))
    monkeypatch.setenv("CLAW_USAGE_ECONOMICS_ENABLED", "1")
    monkeypatch.setenv("CLAW_USAGE_ECONOMICS_DB_PATH", str(tmp_path / "usage.sqlite3"))
    monkeypatch.setenv("CLAW_AGREEMENT_SIGNING_TOKEN_SECRET", "unit-test-recipient-proposal-stage")
    yield tmp_path


def _draft_with_reviewer(client: TestClient, org_hdr: dict) -> tuple[str, dict]:
    r = client.post(
        "/api/agreements/draft",
        headers=org_hdr,
        json={
            "title": "Services",
            "jurisdiction": "CA",
            "parties": [
                {"name": "Owner", "role": "owner"},
                {"name": "Reviewer", "role": "party"},
            ],
            "purpose": "Payment within thirty (30) days after receipt.",
            "payment_terms": "Net 30",
            "duration": None,
            "due_date": None,
            "effective_date": None,
        },
    )
    assert r.status_code == 200, r.text
    aid = r.json()["id"]
    draft = r.json()["draft"]
    reviewer_id = draft["parties"][1]["id"]
    return aid, {"draft": draft, "reviewer_id": reviewer_id}


def test_recipient_proposal_stage_then_finalize(monkeypatch, isolated_agreement_env):
    client = TestClient(app)
    org = {"X-Claw-Org-Id": "org-stage-finalize"}
    aid, ctx = _draft_with_reviewer(client, org)
    reviewer_id = ctx["reviewer_id"]
    draft = ctx["draft"]

    mint = client.post(
        f"/api/agreements/{aid}/recipient-access-token",
        headers=org,
        json={
            "mode": "review",
            "role": "reviewer",
            "recipient_party_id": reviewer_id,
            "inviter_display_name": "Owner",
        },
    )
    assert mint.status_code == 200, mint.text
    tok = mint.json()["token"]
    rh = {"X-Claw-Recipient-Access-Token": tok}

    stage = client.post(
        f"/api/agreements/{aid}/recipient-proposal/stage",
        headers=rh,
        json={
            "instruction": "Change payment timing to fifteen (15) days.",
            "proposer_id": reviewer_id,
            "proposer_display_name": "Reviewer",
            "draft": {
                "title": draft["title"],
                "jurisdiction": draft["jurisdiction"],
                "parties": draft["parties"],
                "purpose": "Payment within fifteen (15) days after receipt.",
                "payment_terms": draft["payment_terms"],
                "duration": draft.get("duration"),
                "due_date": draft.get("due_date"),
                "effective_date": draft.get("effective_date"),
            },
            "rendered_html": "<p>Payment within fifteen (15) days after receipt.</p>",
        },
    )
    assert stage.status_code == 200, stage.text
    proposal_id = stage.json()["proposal_id"]
    assert proposal_id

    missing = client.post(
        f"/api/agreements/{aid}/recipient-proposal",
        headers=rh,
        json={},
    )
    assert missing.status_code == 400
    assert missing.json().get("detail") == "proposal_id_required"

    finalized = client.post(
        f"/api/agreements/{aid}/recipient-proposal",
        headers=rh,
        json={"proposal_id": proposal_id},
    )
    assert finalized.status_code == 200, finalized.text
    assert finalized.json().get("proposal_id") == proposal_id
    pending = [
        e
        for e in finalized.json()["draft"]["audit_log"]
        if e.get("event_type") == "recipient_proposal_pending"
    ]
    assert len(pending) == 1
    assert pending[0]["value"]["proposal_id"] == proposal_id


def test_stage_derives_proposer_from_token_when_body_empty(monkeypatch, isolated_agreement_env):
    client = TestClient(app)
    org = {"X-Claw-Org-Id": "org-token-proposer"}
    aid, ctx = _draft_with_reviewer(client, org)
    reviewer_id = ctx["reviewer_id"]
    draft = ctx["draft"]

    mint = client.post(
        f"/api/agreements/{aid}/recipient-access-token",
        headers=org,
        json={
            "mode": "review",
            "role": "reviewer",
            "recipient_party_id": reviewer_id,
            "inviter_display_name": "Owner",
        },
    )
    assert mint.status_code == 200, mint.text
    tok = mint.json()["token"]
    rh = {"X-Claw-Recipient-Access-Token": tok}

    stage = client.post(
        f"/api/agreements/{aid}/recipient-proposal/stage",
        headers=rh,
        json={
            "instruction": "Change payment timing to fifteen (15) days.",
            "proposer_id": "",
            "draft": {
                "title": draft["title"],
                "jurisdiction": draft["jurisdiction"],
                "parties": draft["parties"],
                "purpose": "Payment within fifteen (15) days after receipt.",
                "payment_terms": draft["payment_terms"],
                "duration": draft.get("duration"),
                "due_date": draft.get("due_date"),
                "effective_date": draft.get("effective_date"),
            },
            "rendered_html": "<p>updated</p>",
        },
    )
    assert stage.status_code == 200, stage.text
    body = stage.json()
    assert body.get("proposer_id") == reviewer_id
    assert body.get("proposer_id_source") == "token"


def test_stage_infers_single_reviewer_without_token_pid(monkeypatch, isolated_agreement_env):
    client = TestClient(app)
    org = {"X-Claw-Org-Id": "org-infer-proposer"}
    aid, ctx = _draft_with_reviewer(client, org)
    reviewer_id = ctx["reviewer_id"]
    draft = ctx["draft"]

    mint = client.post(
        f"/api/agreements/{aid}/recipient-access-token",
        headers=org,
        json={
            "mode": "review",
            "role": "reviewer",
            "inviter_display_name": "Owner",
        },
    )
    assert mint.status_code == 200, mint.text
    tok = mint.json()["token"]
    rh = {"X-Claw-Recipient-Access-Token": tok}

    stage = client.post(
        f"/api/agreements/{aid}/recipient-proposal/stage",
        headers=rh,
        json={
            "instruction": "Change payment timing to fifteen (15) days.",
            "proposer_id": "",
            "draft": {
                "title": draft["title"],
                "jurisdiction": draft["jurisdiction"],
                "parties": draft["parties"],
                "purpose": "Payment within fifteen (15) days after receipt.",
                "payment_terms": draft["payment_terms"],
                "duration": draft.get("duration"),
                "due_date": draft.get("due_date"),
                "effective_date": draft.get("effective_date"),
            },
            "rendered_html": "<p>updated</p>",
        },
    )
    assert stage.status_code == 200, stage.text
    body = stage.json()
    assert body.get("proposer_id") == reviewer_id
    assert body.get("proposer_id_source") == "inferred_single_reviewer"


def _stage_body_no_proposer(draft: dict) -> dict:
    return {
        "instruction": "Change payment timing to fifteen (15) days.",
        "proposer_id": "",
        "draft": {
            "title": draft["title"],
            "jurisdiction": draft["jurisdiction"],
            "parties": draft["parties"],
            "purpose": "Payment within fifteen (15) days after receipt.",
            "payment_terms": draft["payment_terms"],
            "duration": draft.get("duration"),
            "due_date": draft.get("due_date"),
            "effective_date": draft.get("effective_date"),
        },
        "rendered_html": "<p>updated</p>",
    }


def test_stage_infers_assumed_owner_counterparty_without_explicit_owner(
    monkeypatch, isolated_agreement_env
):
    """Paid-pro style: both parties role=party; index 0 treated as owner."""
    client = TestClient(app)
    org = {"X-Claw-Org-Id": "org-assumed-owner"}
    r = client.post(
        "/api/agreements/draft",
        headers=org,
        json={
            "title": "Services",
            "jurisdiction": "CA",
            "parties": [
                {"name": "Client Co", "role": "party"},
                {"name": "Service Provider", "role": "party"},
            ],
            "purpose": "Payment within thirty (30) days after receipt.",
            "payment_terms": "Net 30",
            "duration": None,
            "due_date": None,
            "effective_date": None,
        },
    )
    assert r.status_code == 200, r.text
    aid = r.json()["id"]
    draft = r.json()["draft"]
    reviewer_id = draft["parties"][1]["id"]

    mint = client.post(
        f"/api/agreements/{aid}/recipient-access-token",
        headers=org,
        json={
            "mode": "review",
            "role": "reviewer",
            "inviter_display_name": "Client Co",
        },
    )
    assert mint.status_code == 200, mint.text
    tok = mint.json()["token"]
    rh = {"X-Claw-Recipient-Access-Token": tok}

    stage = client.post(
        f"/api/agreements/{aid}/recipient-proposal/stage",
        headers=rh,
        json=_stage_body_no_proposer(draft),
    )
    assert stage.status_code == 200, stage.text
    body = stage.json()
    assert body.get("proposer_id") == reviewer_id
    assert body.get("proposer_id_source") == "inferred_single_reviewer"


def test_stage_fails_ambiguous_multiple_counterparties(monkeypatch, isolated_agreement_env):
    client = TestClient(app)
    org = {"X-Claw-Org-Id": "org-ambiguous"}
    r = client.post(
        "/api/agreements/draft",
        headers=org,
        json={
            "title": "Services",
            "jurisdiction": "CA",
            "parties": [
                {"name": "Owner", "role": "owner"},
                {"name": "Reviewer A", "role": "party"},
                {"name": "Reviewer B", "role": "party"},
            ],
            "purpose": "Payment within thirty (30) days after receipt.",
            "payment_terms": "Net 30",
            "duration": None,
            "due_date": None,
            "effective_date": None,
        },
    )
    assert r.status_code == 200, r.text
    aid = r.json()["id"]
    draft = r.json()["draft"]

    mint = client.post(
        f"/api/agreements/{aid}/recipient-access-token",
        headers=org,
        json={
            "mode": "review",
            "role": "reviewer",
            "inviter_display_name": "Owner",
        },
    )
    assert mint.status_code == 200, mint.text
    tok = mint.json()["token"]
    rh = {"X-Claw-Recipient-Access-Token": tok}

    stage = client.post(
        f"/api/agreements/{aid}/recipient-proposal/stage",
        headers=rh,
        json=_stage_body_no_proposer(draft),
    )
    assert stage.status_code == 400, stage.text
    assert stage.json().get("detail") == "proposer_id_required"


def test_stage_preserves_canonical_draft_in_pro_redline_only(monkeypatch, isolated_agreement_env):
    """Staged proposal corpus is separate; canonical purpose unchanged until owner applies."""
    client = TestClient(app)
    org = {"X-Claw-Org-Id": "org-corpus-separate"}
    aid, ctx = _draft_with_reviewer(client, org)
    reviewer_id = ctx["reviewer_id"]
    draft = ctx["draft"]
    original_purpose = draft["purpose"]

    mint = client.post(
        f"/api/agreements/{aid}/recipient-access-token",
        headers=org,
        json={
            "mode": "review",
            "role": "reviewer",
            "recipient_party_id": reviewer_id,
            "inviter_display_name": "Owner",
        },
    )
    assert mint.status_code == 200, mint.text
    rh = {"X-Claw-Recipient-Access-Token": mint.json()["token"]}

    stage = client.post(
        f"/api/agreements/{aid}/recipient-proposal/stage",
        headers=rh,
        json={
            "instruction": "Payment timing changed",
            "proposer_id": reviewer_id,
            "proposer_display_name": "Reviewer",
            "draft": {
                "title": draft["title"],
                "jurisdiction": draft["jurisdiction"],
                "parties": draft["parties"],
                "purpose": "Payment within fifteen (15) days after receipt.",
                "payment_terms": draft["payment_terms"],
                "duration": draft.get("duration"),
                "due_date": draft.get("due_date"),
                "effective_date": draft.get("effective_date"),
            },
            "rendered_html": "<p>Payment within fifteen (15) days after receipt.</p>",
        },
    )
    assert stage.status_code == 200, stage.text
    proposal_id = stage.json()["proposal_id"]

    loaded = client.get(f"/api/agreements/{aid}", headers=org)
    assert loaded.status_code == 200, loaded.text
    loaded_draft = loaded.json()["draft"]
    assert loaded_draft["purpose"] == original_purpose
    staged_map = (loaded_draft.get("pro_redline_v1") or {}).get("staged_recipient_proposals") or {}
    assert proposal_id in staged_map
    assert staged_map[proposal_id]["draft"]["purpose"] == "Payment within fifteen (15) days after receipt."
    pending = [
        e for e in loaded_draft.get("audit_log") or [] if e.get("event_type") == "recipient_proposal_pending"
    ]
    assert pending == []


def test_finalize_staged_proposal_queues_audit_without_mutating_canonical_purpose(
    monkeypatch, isolated_agreement_env
):
    client = TestClient(app)
    org = {"X-Claw-Org-Id": "org-finalize-corpus"}
    aid, ctx = _draft_with_reviewer(client, org)
    reviewer_id = ctx["reviewer_id"]
    draft = ctx["draft"]
    original_purpose = draft["purpose"]

    mint = client.post(
        f"/api/agreements/{aid}/recipient-access-token",
        headers=org,
        json={
            "mode": "review",
            "role": "reviewer",
            "recipient_party_id": reviewer_id,
            "inviter_display_name": "Owner",
        },
    )
    assert mint.status_code == 200, mint.text
    rh = {"X-Claw-Recipient-Access-Token": mint.json()["token"]}

    stage = client.post(
        f"/api/agreements/{aid}/recipient-proposal/stage",
        headers=rh,
        json={
            "instruction": "Payment timing changed",
            "proposer_id": reviewer_id,
            "draft": {
                "title": draft["title"],
                "jurisdiction": draft["jurisdiction"],
                "parties": draft["parties"],
                "purpose": "Payment within fifteen (15) days after receipt.",
                "payment_terms": draft["payment_terms"],
                "duration": draft.get("duration"),
                "due_date": draft.get("due_date"),
                "effective_date": draft.get("effective_date"),
            },
            "rendered_html": "<p>updated</p>",
        },
    )
    assert stage.status_code == 200, stage.text
    proposal_id = stage.json()["proposal_id"]

    finalized = client.post(
        f"/api/agreements/{aid}/recipient-proposal",
        headers=rh,
        json={"proposal_id": proposal_id},
    )
    assert finalized.status_code == 200, finalized.text
    out_draft = finalized.json()["draft"]
    assert out_draft["purpose"] == original_purpose
    pending = [
        e for e in out_draft.get("audit_log") or [] if e.get("event_type") == "recipient_proposal_pending"
    ]
    assert len(pending) == 1
    assert pending[0]["value"]["draft"]["purpose"] == "Payment within fifteen (15) days after receipt."


def test_stage_invalid_token_returns_403_not_500(monkeypatch, isolated_agreement_env):
    monkeypatch.setenv("CLAW_RECIPIENT_ACCESS_TOKEN_REQUIRED", "1")
    client = TestClient(app)
    org = {"X-Claw-Org-Id": "org-bad-token"}
    aid, ctx = _draft_with_reviewer(client, org)
    reviewer_id = ctx["reviewer_id"]
    draft = ctx["draft"]

    stage = client.post(
        f"/api/agreements/{aid}/recipient-proposal/stage",
        headers={"X-Claw-Recipient-Access-Token": "not-a-valid-token"},
        json={
            "instruction": "Payment timing changed",
            "proposer_id": reviewer_id,
            "draft": {
                "title": draft["title"],
                "jurisdiction": draft["jurisdiction"],
                "parties": draft["parties"],
                "purpose": "Payment within fifteen (15) days after receipt.",
                "payment_terms": draft["payment_terms"],
                "duration": draft.get("duration"),
                "due_date": draft.get("due_date"),
                "effective_date": draft.get("effective_date"),
            },
            "rendered_html": "<p>updated</p>",
        },
    )
    assert stage.status_code == 403, stage.text
    assert stage.status_code != 500


def test_stage_missing_instruction_returns_400(monkeypatch, isolated_agreement_env):
    client = TestClient(app)
    org = {"X-Claw-Org-Id": "org-no-instruction"}
    aid, ctx = _draft_with_reviewer(client, org)
    reviewer_id = ctx["reviewer_id"]
    draft = ctx["draft"]

    mint = client.post(
        f"/api/agreements/{aid}/recipient-access-token",
        headers=org,
        json={
            "mode": "review",
            "role": "reviewer",
            "recipient_party_id": reviewer_id,
            "inviter_display_name": "Owner",
        },
    )
    assert mint.status_code == 200, mint.text
    rh = {"X-Claw-Recipient-Access-Token": mint.json()["token"]}

    stage = client.post(
        f"/api/agreements/{aid}/recipient-proposal/stage",
        headers=rh,
        json={
            "instruction": "   ",
            "proposer_id": reviewer_id,
            "draft": {
                "title": draft["title"],
                "jurisdiction": draft["jurisdiction"],
                "parties": draft["parties"],
                "purpose": "Payment within fifteen (15) days after receipt.",
                "payment_terms": draft["payment_terms"],
                "duration": draft.get("duration"),
                "due_date": draft.get("due_date"),
                "effective_date": draft.get("effective_date"),
            },
            "rendered_html": "<p>updated</p>",
        },
    )
    assert stage.status_code == 400, stage.text
    assert stage.json().get("detail") == "instruction_required"


def test_stage_requires_proposer_without_token(monkeypatch, isolated_agreement_env):
    client = TestClient(app)
    org = {"X-Claw-Org-Id": "org-no-token-proposer"}
    aid, ctx = _draft_with_reviewer(client, org)
    draft = ctx["draft"]

    stage = client.post(
        f"/api/agreements/{aid}/recipient-proposal/stage",
        json={
            "instruction": "Change payment timing to fifteen (15) days.",
            "proposer_id": "",
            "draft": {
                "title": draft["title"],
                "jurisdiction": draft["jurisdiction"],
                "parties": draft["parties"],
                "purpose": "Payment within fifteen (15) days after receipt.",
                "payment_terms": draft["payment_terms"],
                "duration": draft.get("duration"),
                "due_date": draft.get("due_date"),
                "effective_date": draft.get("effective_date"),
            },
            "rendered_html": "<p>updated</p>",
        },
    )
    assert stage.status_code in (400, 401, 403)
    if stage.status_code == 400:
        assert stage.json().get("detail") == "proposer_id_required"
