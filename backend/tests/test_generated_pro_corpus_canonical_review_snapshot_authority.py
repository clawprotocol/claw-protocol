"""Generated Pro corpus → real snapshot POST → GET reload parity.

Joins production premium-full-draft (provider mocked) with production
canonical-review-snapshot persist/GET. Does not seed the snapshot independently
of the generation response.
"""

from __future__ import annotations

import json

import pytest
from fastapi.testclient import TestClient

import backend.routers.agreements_v2_api as av2
from backend.main import app
from backend.services.accepted_review_snapshot import sha256_hex_text
from backend.tests.entitlement_test_support import ensure_headers_entitled
from backend.usage_economics import store as usage_economics_store_mod

pytestmark = pytest.mark.unit

_ORG_H = {
    "X-Claw-Org-Id": "test-org-gtm-gen-snapshot",
    "X-Claw-Test-Auth-User-Id": "owner-gtm-gen-snapshot",
}

# Operational scope only — keep clause-family intake keywords below the 10k complex floor,
# and keep length >900 so the simple-consulting 6k size guard does not apply.
_INTAKE = (
    "Draft a Professional Services Agreement between Red Mesa Logistics LLC (Client) "
    "and Harbor Peak Automation LLC (Service Provider). Harbor Peak will evaluate warehouse "
    "operations at the El Paso cross-dock, optimize inbound scan workflows, automate daily "
    "exception reporting, and implement dashboard integrations for the Client operations team. "
    "The engagement covers four milestone deliveries over twelve months: discovery, workflow "
    "redesign, automation rollout, and hypercare. Total commercial fee is $96,000 payable in "
    "four equal milestone installments after written acceptance of each milestone. Authorized "
    "signers are Sarah Mitchell, CEO of Red Mesa Logistics LLC, and Michael Torres, President "
    "of Harbor Peak Automation LLC. The parties want a complete written agreement they can "
    "review and execute, including the commercial bargain, duration, and Delaware law."
)

_CORPUS = """PROFESSIONAL SERVICES AGREEMENT

This Professional Services Agreement ("Agreement") is entered into by and between Red Mesa Logistics LLC ("Client") and Harbor Peak Automation LLC ("Service Provider").

RECITALS

Client operates warehouse and cross-dock operations and wishes to retain Service Provider to evaluate operations, optimize workflows, automate reporting, and implement dashboard integrations. Service Provider is willing to perform those services on the terms of this Agreement.

1. SCOPE OF SERVICES. Service Provider shall perform commercially reasonable consulting, implementation, and reporting services, including: (a) evaluation of warehouse operations at the El Paso cross-dock; (b) optimization of inbound scan workflows; (c) automation of daily exception reporting; and (d) dashboard integrations for Client's operations team. Deliverables for each milestone shall be described in writing and accepted or rejected by Client within ten (10) business days.

2. FEES AND PAYMENT. Client shall pay Service Provider a total fee of $96,000, payable in four equal milestone installments of $24,000 after written acceptance of each milestone. Invoices are due net thirty (30) days. Late amounts accrue interest at the lesser of 1.5% per month or the maximum rate permitted by law.

3. TERM AND TERMINATION. The term is twelve (12) months from the Effective Date unless earlier terminated. Either party may terminate for cause upon written notice and a fifteen (15) day opportunity to cure a material breach, or for convenience upon thirty (30) days' written notice. Upon termination, Client shall pay for accepted milestones and authorized work in process.

4. CONFIDENTIALITY. Each party shall hold the other party's non-public business, operational, and technical information in confidence and use it only to perform this Agreement. These obligations survive for three (3) years after termination, and indefinitely for trade secrets.

5. INTELLECTUAL PROPERTY. Service Provider assigns to Client all right, title, and interest in work product, deliverables, and inventions created specifically for Client under this Agreement, excluding Service Provider's pre-existing tools, templates, and know-how. Service Provider grants Client a perpetual, non-exclusive license to use those pre-existing materials as embodied in the deliverables.

6. LIMITATION OF LIABILITY. Neither party is liable for indirect, incidental, special, or consequential damages. Except for confidentiality breaches, willful misconduct, or infringement indemnity, each party's aggregate liability is capped at fees paid in the twelve (12) months preceding the claim.

7. INDEMNITY. Each party shall defend and indemnify the other against third-party claims arising from its gross negligence or willful misconduct in performing this Agreement.

8. GOVERNING LAW. This Agreement is governed by the laws of the State of Delaware, without regard to conflict-of-laws principles. The parties consent to exclusive venue in the state or federal courts located in Delaware.

9. NOTICES. All notices must be in writing and delivered by certified mail or confirmed email to the notice addresses designated by the parties, and are effective on confirmed receipt.

10. ENTIRE AGREEMENT. This Agreement, including any written milestone statements, is the entire agreement and may be amended only by a writing signed by both parties. Electronic signatures are valid and binding. If any provision is unenforceable, the remainder remains in effect.

IN WITNESS WHEREOF, the parties have executed this Agreement as of the Effective Date by their duly authorized signatories.

CLIENT:
Red Mesa Logistics LLC
By: ____________________
Name: Sarah Mitchell
Title: CEO
Date: ______________

SERVICE PROVIDER:
Harbor Peak Automation LLC
By: ____________________
Name: Michael Torres
Title: President
Date: ______________
""".strip()


@pytest.fixture(autouse=True)
def _reset_usage_economics_singleton():
    usage_economics_store_mod._store = None  # noqa: SLF001
    yield
    usage_economics_store_mod._store = None  # noqa: SLF001


def _env(monkeypatch: pytest.MonkeyPatch, tmp_path) -> None:
    monkeypatch.setenv("CLAW_ENVIRONMENT", "test")
    monkeypatch.setenv("CLAW_DATA_DIR", str(tmp_path))
    monkeypatch.setenv("CLAW_USAGE_ECONOMICS_DB_PATH", str(tmp_path / "usage.sqlite3"))
    monkeypatch.setenv("CLAW_ECONOMICS_DB_PATH", str(tmp_path / "economics.sqlite3"))
    monkeypatch.setenv("RESEND_API_KEY", "re_test")
    monkeypatch.setenv("EMAIL_FROM", "LawDog <notifications@lawdog.me>")
    monkeypatch.setenv("CLAW_APP_PUBLIC_ORIGIN", "https://app.example.com")
    monkeypatch.delenv("CLAW_COMMERCIAL_MODE", raising=False)
    monkeypatch.setattr(av2, "OPENAI_API_KEY", "sk-test-gtm-gen-snapshot")


def _context() -> dict:
    return {
        "title": "Professional Services Agreement",
        "jurisdiction": "Delaware",
        "parties": [
            {"name": "Red Mesa Logistics LLC", "role": "Client"},
            {"name": "Harbor Peak Automation LLC", "role": "Service Provider"},
        ],
        "purpose": "Warehouse operations consulting, workflow automation, and dashboard integrations.",
        "payment_terms": "$96,000 in four milestone installments",
        "agreement_family": "consulting_agreement",
        "duration": "12 months",
    }


def _provider_json() -> dict:
    return {
        "title": "Professional Services Agreement",
        "agreement_family": "consulting_agreement",
        "document_text": _CORPUS,
        "key_terms_found": [
            "Fees",
            "Confidentiality",
            "Governing law",
            "Notices",
            "Term and termination",
        ],
        "missing_material_info": [],
    }


def test_generated_pro_corpus_persists_as_canonical_review_snapshot(monkeypatch, tmp_path):
    _env(monkeypatch, tmp_path)
    headers = ensure_headers_entitled(dict(_ORG_H))
    monkeypatch.setattr(av2, "call_legal_llm", lambda *a, **k: json.dumps(_provider_json()))
    client = TestClient(app)

    create = client.post(
        "/api/agreements/draft",
        headers=headers,
        json={
            "title": "Professional Services Agreement",
            "jurisdiction": "Delaware",
            "parties": [
                {
                    "id": "p_owner",
                    "name": "Red Mesa Logistics LLC",
                    "role": "owner",
                    "email": "owner@example.com",
                },
                {
                    "id": "p_cp",
                    "name": "Harbor Peak Automation LLC",
                    "role": "party",
                    "email": "cp@example.com",
                },
            ],
            "purpose": "Professional technology and consulting services.",
            "payment_terms": "$96,000 milestone installments",
        },
    )
    assert create.status_code == 200, create.text
    agreement_id = create.json()["id"]
    assert agreement_id

    gen = client.post(
        "/api/agreements/premium-full-draft",
        headers=headers,
        json={
            "intake_text": _INTAKE,
            "agreement_id": agreement_id,
            "context": _context(),
        },
    )
    assert gen.status_code == 200, gen.text
    gen_body = gen.json()
    assert gen_body.get("generation_ok") is True
    document_text = (gen_body.get("document_text") or "").strip()
    server_full = (gen_body.get("server_full_document_text") or "").strip()
    assert document_text
    assert server_full
    assert document_text == server_full
    selected = server_full
    assert selected == _CORPUS
    generated_hash = sha256_hex_text(selected)

    posted = client.post(
        f"/api/agreements/{agreement_id}/canonical-review-snapshot",
        headers=headers,
        json={
            "corpus_plain": selected,
            "generation_session_id": "gtm_gen_snapshot",
            "claimed_digest": generated_hash,
        },
    )
    assert posted.status_code == 200, posted.text
    snap = posted.json()["snapshot"]
    assert snap["agreement_id"] == agreement_id
    persisted = (snap.get("corpus_plain") or "").strip()
    persisted_hash = sha256_hex_text(persisted)
    assert persisted == selected
    assert persisted_hash == generated_hash
    assert snap["corpus_sha256"] == generated_hash
    assert snap["corpus_length"] == len(selected)
    snapshot_id = snap["snapshot_id"]
    assert snapshot_id

    reloaded = client.get(
        f"/api/agreements/{agreement_id}/canonical-review-snapshot",
        headers=headers,
    )
    assert reloaded.status_code == 200, reloaded.text
    got = reloaded.json()["snapshot"]
    retrieved = (got.get("corpus_plain") or "").strip()
    reload_hash = sha256_hex_text(retrieved)
    assert got["agreement_id"] == agreement_id
    assert got["snapshot_id"] == snapshot_id
    assert retrieved == selected
    assert reload_hash == generated_hash == persisted_hash
    assert got["corpus_sha256"] == generated_hash
    assert got["corpus_length"] == len(selected)

    print(
        "GTM_GENERATED_PRO_SNAPSHOT_AUTHORITY_TRACE "
        f"agreementId={agreement_id} "
        f"generatedLen={len(selected)} generatedHash={generated_hash} "
        f"snapshotId={snapshot_id} "
        f"persistedLen={len(persisted)} persistedHash={persisted_hash} "
        f"reloadLen={len(retrieved)} reloadHash={reload_hash}"
    )
