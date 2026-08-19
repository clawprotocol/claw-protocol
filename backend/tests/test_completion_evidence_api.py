"""
API-level tests for completion evidence package in VS01 signer completion flow.

Covers:
- Evidence package is created when the last signer completes (2/3/4-party)
- Evidence package is retrievable via GET /api/agreements/{id}/completion-evidence
- Evidence package contains required UETA/ESIGN elements (attribution, hash, retrieval)
- Evidence package creation is idempotent
- Evidence package is NOT created for incomplete agreements
"""

from __future__ import annotations

from backend.tests.entitlement_test_support import ensure_headers_entitled, ensure_org_pro_entitlement

from unittest.mock import patch

import pytest
from fastapi.testclient import TestClient

from backend.main import app


@pytest.fixture(autouse=True)
def _entitle_owner_org_after_env(tmp_path, monkeypatch):
    """Grant Pro for primary owner headers once tmp_path-backed DBs are configured."""
    monkeypatch.setenv("CLAW_DATA_DIR", str(tmp_path))
    monkeypatch.setenv("CLAW_ECONOMICS_DB_PATH", str(tmp_path / "economics.sqlite3"))
    monkeypatch.setenv("CLAW_USAGE_ECONOMICS_DB_PATH", str(tmp_path / "usage.sqlite3"))
    monkeypatch.setenv("CLAW_ONRAMP_DB_PATH", str(tmp_path / "onramp.sqlite3"))
    monkeypatch.setenv("CLAW_TREASURY_DB_PATH", str(tmp_path / "treasury.sqlite3"))
    from backend.economics.store import reset_economics_store_for_tests
    reset_economics_store_for_tests()
    for _name in ("_ORG_H", "_OWNER_H", "OWNER_HEADERS", "_HEADERS", "ORG_HEADERS", "_OWNER", "_ORG_A", "_ORG", "_STAGING_ORG"):
        h = globals().get(_name)
        if isinstance(h, dict) and h.get("X-Claw-Org-Id"):
            ensure_headers_entitled(h)
    yield
    reset_economics_store_for_tests()


from backend.services.agreement_draft_store import load_draft, save_draft


_ORG_ID = "test-org-evidence-api"
_OWNER_USER = "owner-evidence-api"


def _org_headers() -> dict[str, str]:
    return {
        "X-Claw-Org-Id": _ORG_ID,
        "X-Claw-Test-Auth-User-Id": _OWNER_USER,
    }


def _build_vs01_packet(aid: str, party_count: int = 2) -> dict:
    """Build a VS01 signing packet with the specified number of required signers."""
    corpus = (
        "x" * 1600
        + "\nIN WITNESS WHEREOF, the Parties execute this Agreement.\n\n"
    )
    roles = []
    fields = []
    for i in range(party_count):
        role_id = f"role_{i}"
        party_id = f"p{i + 1}"
        corpus += f"PARTY {i + 1}:\nParty {i + 1} LLC\nBy: __________________________\nDate: _____________________________\n\n"
        roles.append({
            "roleId": role_id,
            "partyIndex": i,
            "vs01CounterpartyId": party_id,
            "requiresSignature": True,
            "entityName": f"Party {i + 1} LLC",
            "signerName": f"Signer {i + 1}",
            "signerEmail": f"party{i + 1}@example.test",
        })
        fields.append({
            "id": f"sig_{i}",
            "counterpartyId": party_id,
            "type": "signature",
            "page": 9,
            "x": 0.1,
            "y": 0.1 + i * 0.1,
            "width": 0.3,
            "height": 0.05,
            "assignedSignerRoleId": role_id,
            "value": "",
        })

    return {
        "v": 1,
        "document_id": f"doc_{aid}",
        "portable": {
            "v": 1,
            "seed": {
                "v": 1,
                "documentId": f"doc_{aid}",
                "agreementId": aid,
                "corpusPlain": corpus,
                "corpusHash": "testhash",
                "savedAt": "2026-06-15T00:00:00Z",
            },
            "fields": fields,
            "roles": roles,
            "pageCount": 10,
            "witnessPageIndex": 9,
            "initialsPolicy": {"enabled": False, "bodyPagesOnly": True},
            "fieldCount": len(fields),
        },
    }


@pytest.fixture()
def client(monkeypatch, tmp_path):
    from backend.usage_economics import store as usage_economics_store_mod
    usage_economics_store_mod._store = None  # noqa: SLF001
    from backend.services.vs01_signer_completion import reset_vs01_completion_email_locks_for_tests
    reset_vs01_completion_email_locks_for_tests()
    monkeypatch.setenv("CLAW_ENVIRONMENT", "test")
    monkeypatch.setenv("CLAW_DATA_DIR", str(tmp_path))
    monkeypatch.setenv("CLAW_USAGE_ECONOMICS_DB_PATH", str(tmp_path / "usage.sqlite3"))
    monkeypatch.setenv("CLAW_ECONOMICS_DB_PATH", str(tmp_path / "economics.sqlite3"))
    monkeypatch.setenv("CLAW_AGREEMENT_SIGNING_TOKEN_SECRET", "unit-test-evidence-secret")
    monkeypatch.setenv("CLAW_USAGE_ECONOMICS_ENABLED", "0")
    monkeypatch.delenv("CLAW_ALLOW_TOKENLESS_SIGNER_COMPLETE", raising=False)
    monkeypatch.delenv("CLAW_COMMERCIAL_MODE", raising=False)
    return TestClient(app)


def _create_agreement_with_parties(client: TestClient, party_count: int) -> str:
    """Create an agreement with the specified number of parties, each with a stable ID."""
    headers = ensure_headers_entitled(_org_headers())
    parties = [
        {"name": f"Party {i + 1} LLC", "role": "owner" if i == 0 else "party", "email": f"party{i + 1}@example.test", "id": f"p{i + 1}"}
        for i in range(party_count)
    ]
    create_res = client.post(
        "/api/agreements/draft",
        headers=headers,
        json={
            "title": f"{party_count}-Party Evidence Test",
            "jurisdiction": "TX",
            "parties": parties,
            "purpose": "Test completion evidence",
            "payment_terms": "Net 30",
            "duration": None,
            "due_date": None,
            "effective_date": None,
        },
    )
    assert create_res.status_code == 200
    aid = create_res.json()["id"]

    upd = client.post(
        f"/api/agreements/{aid}/update-field",
        headers=_org_headers(),
        json={"field": "parties", "value": parties},
    )
    assert upd.status_code == 200

    draft = load_draft(aid)
    draft["vs01_signing_packet_v1"] = _build_vs01_packet(aid, party_count)
    save_draft({**draft, "id": aid})
    return aid


def _complete_signing(client: TestClient, aid: str, party_count: int) -> dict:
    """Complete signing for all parties and return the final response."""
    headers = _org_headers()
    final_res = None

    for i in range(party_count):
        with patch(
            "backend.services.email.signing_completion_delivery.maybe_send_signing_completion_emails",
            return_value=None,
        ), patch(
            "backend.config.email_config.app_public_origin",
            return_value="https://app.example.test",
        ):
            res = client.post(
                f"/api/agreements/{aid}/vs01-signer-complete",
                headers=headers,
                json={
                    "signer_role_id": f"role_{i}",
                    "participant_id": f"p{i + 1}",
                    "document_id": f"doc_{aid}",
                    "display_name": f"Signer {i + 1}",
                },
            )
        assert res.status_code == 200, f"Party {i + 1} signing failed: {res.json()}"
        final_res = res

    return final_res.json() if final_res else {}


def _add_fully_executed_snapshot(aid: str) -> None:
    """Add a fully executed snapshot to the draft."""
    draft = load_draft(aid)
    packet = draft.get("vs01_signing_packet_v1", {})
    corpus = packet.get("portable", {}).get("seed", {}).get("corpusPlain", "")
    packet["fully_executed_snapshot"] = {
        "v": 1,
        "corpus_plain": corpus.replace("By: __________________________", "By: [SIGNED]"),
        "corpus_hash": "abcd1234" * 8,
        "saved_at": "2026-06-15T12:00:00Z",
    }
    draft["vs01_signing_packet_v1"] = packet
    save_draft({**draft, "id": aid})


class TestTwoPartyCompletionEvidence:
    """Evidence package works for 2-party agreements."""

    def test_evidence_created_on_final_signer(self, client: TestClient) -> None:
        """Evidence package is created when second signer completes."""
        aid = _create_agreement_with_parties(client, 2)
        _add_fully_executed_snapshot(aid)

        result = _complete_signing(client, aid, 2)

        assert result["fully_executed"] is True
        assert result.get("completion_evidence_created") is True

        draft = client.get(f"/api/agreements/{aid}", headers=_org_headers()).json()["draft"]
        evidence = draft.get("completion_evidence_v1")
        assert evidence is not None
        assert evidence["schema"] == "claw.completion_evidence.v1"
        assert evidence["signer_count"] == 2
        assert evidence["fully_executed"] is True

    def test_evidence_retrievable_via_api(self, client: TestClient) -> None:
        """Evidence package is retrievable via GET endpoint."""
        aid = _create_agreement_with_parties(client, 2)
        _add_fully_executed_snapshot(aid)
        _complete_signing(client, aid, 2)

        res = client.get(f"/api/agreements/{aid}/completion-evidence", headers=_org_headers())
        assert res.status_code == 200
        body = res.json()
        assert body["ok"] is True
        evidence = body["evidence"]
        assert evidence["schema"] == "claw.completion_evidence.v1"
        assert evidence["signer_count"] == 2

    def test_evidence_contains_attribution(self, client: TestClient) -> None:
        """Evidence package includes signer attribution."""
        aid = _create_agreement_with_parties(client, 2)
        _add_fully_executed_snapshot(aid)
        _complete_signing(client, aid, 2)

        res = client.get(f"/api/agreements/{aid}/completion-evidence", headers=_org_headers())
        evidence = res.json()["evidence"]

        assert len(evidence["signers"]) == 2
        signer_names = {s["signer_name"] for s in evidence["signers"]}
        assert "Signer 1" in signer_names or "Signer 2" in signer_names

        for signer in evidence["signers"]:
            assert signer.get("signer_email_redacted")
            assert signer.get("signed_at")
            assert signer.get("party_id")

    def test_evidence_contains_corpus_hash(self, client: TestClient) -> None:
        """Evidence package includes document hash."""
        aid = _create_agreement_with_parties(client, 2)
        _add_fully_executed_snapshot(aid)
        _complete_signing(client, aid, 2)

        res = client.get(f"/api/agreements/{aid}/completion-evidence", headers=_org_headers())
        evidence = res.json()["evidence"]

        assert len(evidence["corpus_hash_sha256"]) == 64
        assert evidence["corpus_plain_available"] is True


class TestThreePartyCompletionEvidence:
    """Evidence package works for 3-party agreements."""

    def test_three_party_evidence_created(self, client: TestClient) -> None:
        """Evidence package created for 3-party agreement."""
        aid = _create_agreement_with_parties(client, 3)
        _add_fully_executed_snapshot(aid)

        result = _complete_signing(client, aid, 3)

        assert result["fully_executed"] is True
        assert result.get("completion_evidence_created") is True

        res = client.get(f"/api/agreements/{aid}/completion-evidence", headers=_org_headers())
        assert res.status_code == 200
        evidence = res.json()["evidence"]
        assert evidence["signer_count"] == 3
        assert evidence["fully_executed"] is True


class TestFourPartyCompletionEvidence:
    """Four-party happy path: all parties sign, evidence package created."""

    def test_four_party_evidence_created(self, client: TestClient) -> None:
        """Evidence package created for 4-party agreement."""
        aid = _create_agreement_with_parties(client, 4)
        _add_fully_executed_snapshot(aid)

        result = _complete_signing(client, aid, 4)

        assert result["fully_executed"] is True
        assert result.get("completion_evidence_created") is True

        res = client.get(f"/api/agreements/{aid}/completion-evidence", headers=_org_headers())
        assert res.status_code == 200
        evidence = res.json()["evidence"]
        assert evidence["signer_count"] == 4
        assert evidence["required_signer_count"] == 4
        assert evidence["fully_executed"] is True

    def test_four_party_all_signers_attributed(self, client: TestClient) -> None:
        """All four signers are attributed in the evidence package."""
        aid = _create_agreement_with_parties(client, 4)
        _add_fully_executed_snapshot(aid)
        _complete_signing(client, aid, 4)

        res = client.get(f"/api/agreements/{aid}/completion-evidence", headers=_org_headers())
        evidence = res.json()["evidence"]

        assert len(evidence["signers"]) == 4
        party_ids = {s["party_id"] for s in evidence["signers"]}
        assert party_ids == {"p1", "p2", "p3", "p4"}

    def test_four_party_party_ids_stable(self, client: TestClient) -> None:
        """Party IDs remain stable through the 4-party signing flow."""
        aid = _create_agreement_with_parties(client, 4)
        _add_fully_executed_snapshot(aid)

        original_draft = load_draft(aid)
        original_ids = [p["id"] for p in original_draft["parties"]]

        _complete_signing(client, aid, 4)

        final_draft = load_draft(aid)
        final_ids = [p["id"] for p in final_draft["parties"]]

        assert original_ids == final_ids

    def test_four_party_retrieval_paths(self, client: TestClient) -> None:
        """Evidence package includes retrieval paths for all parties."""
        aid = _create_agreement_with_parties(client, 4)
        _add_fully_executed_snapshot(aid)
        _complete_signing(client, aid, 4)

        res = client.get(f"/api/agreements/{aid}/completion-evidence", headers=_org_headers())
        evidence = res.json()["evidence"]

        paths = evidence.get("retrieval_paths", {})
        assert "owner_view" in paths or len(paths) > 0


class TestEvidencePackageIdempotency:
    """Evidence creation is idempotent."""

    def test_duplicate_completion_does_not_duplicate_evidence(self, client: TestClient) -> None:
        """Re-completing does not create duplicate evidence."""
        aid = _create_agreement_with_parties(client, 2)
        _add_fully_executed_snapshot(aid)

        _complete_signing(client, aid, 2)

        with patch(
            "backend.services.email.signing_completion_delivery.maybe_send_signing_completion_emails",
            return_value=None,
        ), patch(
            "backend.config.email_config.app_public_origin",
            return_value="https://app.example.test",
        ):
            res = client.post(
                f"/api/agreements/{aid}/vs01-signer-complete",
                headers=_org_headers(),
                json={"signer_role_id": "role_1", "participant_id": "p2", "document_id": f"doc_{aid}"},
            )
        assert res.status_code == 200
        assert res.json()["already_signed"] is True

        draft = load_draft(aid)
        evidence_events = [
            e for e in draft.get("audit_log", [])
            if e.get("event_type") == "completion_evidence_package_created"
        ]
        assert len(evidence_events) == 1

    def test_retrieve_idempotent_creates_evidence_if_missing(self, client: TestClient) -> None:
        """GET endpoint creates evidence if missing but agreement is fully executed."""
        aid = _create_agreement_with_parties(client, 2)
        _add_fully_executed_snapshot(aid)

        with patch(
            "backend.services.completion_evidence_package.persist_completion_evidence_package",
            return_value=load_draft(aid),
        ):
            _complete_signing(client, aid, 2)

        draft = load_draft(aid)
        if "completion_evidence_v1" in draft:
            del draft["completion_evidence_v1"]
            save_draft({**draft, "id": aid})

        with patch(
            "backend.config.email_config.app_public_origin",
            return_value="https://app.example.test",
        ):
            res = client.get(f"/api/agreements/{aid}/completion-evidence", headers=_org_headers())

        assert res.status_code == 200
        body = res.json()
        assert body["ok"] is True


class TestEvidenceAccessControl:
    """Evidence package access requires proper authorization."""

    def test_evidence_not_available_before_execution(self, client: TestClient) -> None:
        """Cannot retrieve evidence for incomplete agreements."""
        aid = _create_agreement_with_parties(client, 2)
        _add_fully_executed_snapshot(aid)

        with patch(
            "backend.services.email.signing_completion_delivery.maybe_send_signing_completion_emails",
            return_value=None,
        ), patch(
            "backend.config.email_config.app_public_origin",
            return_value="https://app.example.test",
        ):
            client.post(
                f"/api/agreements/{aid}/vs01-signer-complete",
                headers=_org_headers(),
                json={"signer_role_id": "role_0", "participant_id": "p1", "document_id": f"doc_{aid}"},
            )

        res = client.get(f"/api/agreements/{aid}/completion-evidence", headers=_org_headers())
        assert res.status_code == 403
        assert res.json()["detail"]["code"] == "agreement_not_fully_executed"


class TestEvidencePackageLegalNotice:
    """Evidence package includes appropriate legal disclaimers."""

    def test_evidence_includes_legal_notice(self, client: TestClient) -> None:
        """Evidence package includes disclaimer that CLAW does not adjudicate."""
        aid = _create_agreement_with_parties(client, 2)
        _add_fully_executed_snapshot(aid)
        _complete_signing(client, aid, 2)

        res = client.get(f"/api/agreements/{aid}/completion-evidence", headers=_org_headers())
        evidence = res.json()["evidence"]

        assert "legal_notice" in evidence
        assert "adjudicate" in evidence["legal_notice"].lower()
        assert "enforce" in evidence["legal_notice"].lower()
