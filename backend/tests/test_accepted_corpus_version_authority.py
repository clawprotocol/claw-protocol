import hashlib

import pytest
from fastapi.testclient import TestClient

from backend.main import app
from backend.services.agreement_draft_store import load_draft, save_draft
from backend.usage_economics import store as usage_economics_store_mod
from backend.utils.agreement_version_store import AgreementVersionStore

pytestmark = pytest.mark.unit

_ORG_H = {"X-Claw-Org-Id": "accepted-version-test-org"}
_ACCEPT_H = {**_ORG_H, "X-Claw-Review-First-Persist": "1"}
_CORPUS = "PAID PRO SERVICES AGREEMENT\n\n" + ("Exact accepted operative provision. " * 80)


@pytest.fixture(autouse=True)
def _isolated_store(monkeypatch, tmp_path):
    monkeypatch.setenv("CLAW_DATA_DIR", str(tmp_path))
    monkeypatch.setenv("CLAW_AGREEMENT_DB_PATH", str(tmp_path / "agreements.sqlite3"))
    monkeypatch.setenv("CLAW_USAGE_ECONOMICS_DB_PATH", str(tmp_path / "usage.sqlite3"))
    usage_economics_store_mod._store = None  # noqa: SLF001
    yield
    usage_economics_store_mod._store = None  # noqa: SLF001


def _create(client: TestClient, party_count: int = 2) -> tuple[str, dict]:
    parties = [
        {
            "name": f"Canonical Legal Entity {index + 1} LLC",
            "role": "owner" if index == 0 else "signer",
            "email": f"signer{index + 1}@example.test",
            "signer_name": f"Display Signer {index + 1}",
            "signer_title": "Authorized Signer",
        }
        for index in range(party_count)
    ]
    response = client.post(
        "/api/agreements/draft",
        headers=_ACCEPT_H,
        json={
            "title": "Paid Pro Authority Test",
            "jurisdiction": "TX",
            "parties": parties,
            "purpose": _CORPUS,
            "payment_terms": "Net 30",
        },
    )
    assert response.status_code == 200
    return response.json()["id"], response.json()["draft"]


def _accept(client: TestClient, agreement_id: str):
    return client.post(
        f"/api/agreements/{agreement_id}/accepted-corpus",
        headers=_ACCEPT_H,
        json={},
    )


@pytest.mark.parametrize("party_count", [2, 3, 4])
def test_acceptance_creates_backend_version_with_exact_corpus_and_parties(party_count):
    client = TestClient(app)
    agreement_id, draft = _create(client, party_count)

    response = _accept(client, agreement_id)

    assert response.status_code == 200
    authority = response.json()["accepted_version"]
    assert authority["agreement_id"] == agreement_id
    assert authority["version_id"].startswith("av_")
    assert authority["corpus_sha256"] == hashlib.sha256(_CORPUS.encode("utf-8")).hexdigest()
    stored = AgreementVersionStore().get_version_by_id(version_id=authority["version_id"])
    assert stored["body_markdown"] == _CORPUS
    assert stored["body_sha256"] == authority["corpus_sha256"]
    assert stored["authority_state"] == "accepted"
    assert [p["legal_name"] for p in stored["parties"]] == [
        p["name"] for p in draft["parties"]
    ]
    assert [p["ordinal"] for p in stored["parties"]] == list(range(party_count))
    assert all("signer_name" not in p and "signer_title" not in p for p in stored["parties"])
    fetched = client.get(f"/api/agreements/{agreement_id}", headers=_ORG_H)
    assert fetched.status_code == 200
    assert fetched.json()["accepted_version"] == authority


def test_identical_retry_returns_same_version_and_changed_retry_cannot_overwrite():
    client = TestClient(app)
    agreement_id, _draft = _create(client)
    first = _accept(client, agreement_id)
    second = _accept(client, agreement_id)
    assert first.status_code == second.status_code == 200
    assert second.json()["accepted_version"] == first.json()["accepted_version"]

    raw = load_draft(agreement_id)
    raw["purpose"] = f"{_CORPUS}\nMaterially changed after acceptance."
    save_draft(raw)
    changed = _accept(client, agreement_id)
    assert changed.status_code == 409
    stored = AgreementVersionStore().get_accepted_version(agreement_id=agreement_id)
    assert stored is not None
    assert stored["body_markdown"] == _CORPUS

    changed_parties = load_draft(agreement_id)
    changed_parties["purpose"] = _CORPUS
    changed_parties["parties"][0], changed_parties["parties"][1] = (
        changed_parties["parties"][1],
        changed_parties["parties"][0],
    )
    save_draft(changed_parties)
    party_retry = _accept(client, agreement_id)
    assert party_retry.status_code == 409
    unchanged = AgreementVersionStore().get_accepted_version(agreement_id=agreement_id)
    assert unchanged is not None
    assert unchanged["parties"] == stored["parties"]


def test_version_creation_failure_prevents_acceptance_success(monkeypatch):
    client = TestClient(app, raise_server_exceptions=False)
    agreement_id, _draft = _create(client)

    def _fail(*_args, **_kwargs):
        raise RuntimeError("injected_version_failure")

    monkeypatch.setattr(AgreementVersionStore, "create_accepted_version", _fail)
    response = _accept(client, agreement_id)
    assert response.status_code == 500
    assert AgreementVersionStore().get_accepted_version(agreement_id=agreement_id) is None


def test_lock_accepts_backend_version_and_rejects_arbitrary_and_cross_agreement(monkeypatch):
    from backend.routers import agreements_v2_api

    monkeypatch.setattr(agreements_v2_api, "_signing_approval_gate_errors", lambda _draft: [])
    client = TestClient(app)
    agreement_a, _ = _create(client)
    agreement_b, _ = _create(client)
    accepted_a = _accept(client, agreement_a).json()["accepted_version"]
    accepted_b = _accept(client, agreement_b).json()["accepted_version"]

    ok = client.put(
        f"/api/agreements/{agreement_a}/signing-lock",
        headers=_ORG_H,
        json={
            "accepted_version_id": accepted_a["version_id"],
            "corpus_sha256": accepted_a["corpus_sha256"],
            "locked_at": "2026-07-17T12:00:00Z",
            "locked_by": "owner",
        },
    )
    assert ok.status_code == 200
    assert ok.json()["signing_lock"]["locked_version_id"] == accepted_a["version_id"]
    assert ok.json()["signing_lock"]["content_sha256"] == accepted_a["corpus_sha256"]

    arbitrary_agreement, _ = _create(client)
    arbitrary = client.put(
        f"/api/agreements/{arbitrary_agreement}/signing-lock",
        headers=_ORG_H,
        json={
            "locked_version_id": "8d475b24-897c-4e3e-95a2-a3e5d272b2cd",
            "locked_at": "2026-07-17T12:00:00Z",
        },
    )
    assert arbitrary.status_code == 400
    assert arbitrary.json()["detail"] == "accepted_corpus_version_not_found"

    cross = client.put(
        f"/api/agreements/{agreement_b}/signing-lock",
        headers=_ORG_H,
        json={
            "accepted_version_id": accepted_a["version_id"],
            "locked_at": "2026-07-17T12:00:00Z",
        },
    )
    assert cross.status_code == 409
    assert cross.json()["detail"] == "accepted_corpus_version_agreement_mismatch"
    assert accepted_b["version_id"] != accepted_a["version_id"]


def test_lock_rejects_corpus_and_party_order_mismatch(monkeypatch):
    from backend.routers import agreements_v2_api

    monkeypatch.setattr(agreements_v2_api, "_signing_approval_gate_errors", lambda _draft: [])
    client = TestClient(app)

    corpus_agreement, _ = _create(client)
    corpus_authority = _accept(client, corpus_agreement).json()["accepted_version"]
    corpus_draft = load_draft(corpus_agreement)
    corpus_draft["purpose"] = f"{_CORPUS}\nChanged"
    save_draft(corpus_draft)
    corpus_lock = client.put(
        f"/api/agreements/{corpus_agreement}/signing-lock",
        headers=_ORG_H,
        json={
            "accepted_version_id": corpus_authority["version_id"],
            "locked_at": "2026-07-17T12:00:00Z",
        },
    )
    assert corpus_lock.status_code == 409
    assert corpus_lock.json()["detail"] == "accepted_corpus_mismatch"

    party_agreement, _ = _create(client, 4)
    party_authority = _accept(client, party_agreement).json()["accepted_version"]
    party_draft = load_draft(party_agreement)
    party_draft["parties"][1], party_draft["parties"][2] = (
        party_draft["parties"][2],
        party_draft["parties"][1],
    )
    save_draft(party_draft)
    party_lock = client.put(
        f"/api/agreements/{party_agreement}/signing-lock",
        headers=_ORG_H,
        json={
            "accepted_version_id": party_authority["version_id"],
            "locked_at": "2026-07-17T12:00:00Z",
        },
    )
    assert party_lock.status_code == 409
    assert party_lock.json()["detail"] == "accepted_corpus_party_order_mismatch"


def test_submitted_hash_mismatch_and_legacy_unversioned_lock_are_safe(monkeypatch):
    from backend.routers import agreements_v2_api

    monkeypatch.setattr(agreements_v2_api, "_signing_approval_gate_errors", lambda _draft: [])
    client = TestClient(app)
    agreement_id, _ = _create(client)
    authority = _accept(client, agreement_id).json()["accepted_version"]
    mismatch = client.put(
        f"/api/agreements/{agreement_id}/signing-lock",
        headers=_ORG_H,
        json={
            "accepted_version_id": authority["version_id"],
            "corpus_sha256": "0" * 64,
            "locked_at": "2026-07-17T12:00:00Z",
        },
    )
    assert mismatch.status_code == 409
    assert mismatch.json()["detail"] == "accepted_corpus_mismatch"

    legacy_id, _ = _create(client)
    legacy = client.put(
        f"/api/agreements/{legacy_id}/signing-lock",
        headers=_ORG_H,
        json={"locked_at": "2026-07-17T12:00:00Z"},
    )
    assert legacy.status_code == 409
    assert legacy.json()["detail"] == "accepted_corpus_version_required"
    fetched = client.get(f"/api/agreements/{legacy_id}", headers=_ORG_H)
    assert fetched.status_code == 200
    assert fetched.json()["accepted_version"] is None
