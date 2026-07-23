"""Adversarial multi-writer protection for recipient_delivery_v1 registry."""

from __future__ import annotations

import copy

import pytest

from backend.services.agreement_draft_store import (
    DraftCasConflictError,
    load_draft,
    save_draft,
    save_draft_cas,
)
from backend.services.recipient_delivery_registry import (
    KIND_SAME_EMAIL_RESEND,
    activate_invite_replacement,
    begin_invite_replacement,
    get_registry,
    get_registry_revision,
    get_replacement_generation,
    is_jti_superseded,
    jti_invite_access_denied,
    record_invite_sent,
    supersede_active_invite,
)

pytestmark = pytest.mark.unit


@pytest.fixture()
def data_dir(monkeypatch, tmp_path):
    monkeypatch.setenv("CLAW_DATA_DIR", str(tmp_path))
    monkeypatch.setenv("CLAW_ENVIRONMENT", "test")
    return tmp_path


def _seed(aid: str, *, jti: str = "jti-A") -> dict:
    draft = {
        "id": aid,
        "title": "Multiwriter",
        "parties": [{"id": "p2", "role": "party", "email": "cp@example.com"}],
        "audit_log": [],
        "recipient_delivery_v1": {"v": 1, "recipients": {}},
    }
    record_invite_sent(
        draft,
        phase="review",
        participant_id="p2",
        jti=jti,
        email="cp@example.com",
        audit_log=draft["audit_log"],
    )
    save_draft(draft, preserve_newer_recipient_delivery=False)
    return load_draft(aid)


def _active(draft: dict, pid: str = "p2") -> str:
    row = (get_registry(draft).get("recipients") or {}).get(f"review:{pid}") or {}
    return str(row.get("active_jti") or "").strip()


def test_stale_generic_save_cannot_lose_cas_activated_jti(data_dir):
    aid = "ag_mw_stale_save"
    draft = _seed(aid, jti="jti-A")
    stale = copy.deepcopy(draft)
    stale["title"] = "stale-title-edit"

    # CAS activate B
    d1 = copy.deepcopy(draft)
    rev0 = get_registry_revision(d1)
    gen0 = get_replacement_generation(d1, phase="review", participant_id="p2")
    begin_invite_replacement(
        d1,
        phase="review",
        participant_id="p2",
        kind=KIND_SAME_EMAIL_RESEND,
        new_jti="jti-B",
        email="cp@example.com",
        expected_generation=gen0,
        expected_revision=rev0,
        agreement_id=aid,
        locked_version_id="",
        mode="review",
        audit_log=d1.setdefault("audit_log", []),
    )
    save_draft_cas(d1, expected_revision=rev0)
    rev1 = get_registry_revision(d1)
    gen1 = get_replacement_generation(d1, phase="review", participant_id="p2")
    activate_invite_replacement(
        d1,
        phase="review",
        participant_id="p2",
        email="cp@example.com",
        expected_generation=gen1,
        expected_revision=rev1,
        audit_log=d1.setdefault("audit_log", []),
    )
    save_draft_cas(d1, expected_revision=rev1)
    assert _active(load_draft(aid)) == "jti-B"

    # Stale generic save tries to write old registry (A) + title change.
    save_draft(stale)  # preserve newer registry
    final = load_draft(aid)
    assert final.get("title") == "stale-title-edit"
    assert _active(final) == "jti-B"
    assert is_jti_superseded(final, "jti-A", "review", "p2")
    assert not is_jti_superseded(final, "jti-B", "review", "p2")


def test_stale_generic_save_cannot_empty_registry(data_dir):
    aid = "ag_mw_empty"
    draft = _seed(aid, jti="jti-A")
    assert _active(draft) == "jti-A"
    stale = {"id": aid, "title": "wiped", "parties": draft["parties"], "audit_log": []}
    save_draft(stale)
    final = load_draft(aid)
    assert final.get("title") == "wiped"
    assert _active(final) == "jti-A"
    assert get_registry_revision(final) >= 1


def test_revoke_after_activate_leaves_no_usable_token(data_dir):
    aid = "ag_mw_revoke"
    draft = _seed(aid, jti="jti-A")
    d1 = copy.deepcopy(draft)
    rev0 = get_registry_revision(d1)
    gen0 = get_replacement_generation(d1, phase="review", participant_id="p2")
    begin_invite_replacement(
        d1,
        phase="review",
        participant_id="p2",
        kind=KIND_SAME_EMAIL_RESEND,
        new_jti="jti-B",
        email="cp@example.com",
        expected_generation=gen0,
        expected_revision=rev0,
        agreement_id=aid,
        locked_version_id="",
        mode="review",
        audit_log=d1.setdefault("audit_log", []),
    )
    save_draft_cas(d1, expected_revision=rev0)
    rev1 = get_registry_revision(d1)
    gen1 = get_replacement_generation(d1, phase="review", participant_id="p2")
    activate_invite_replacement(
        d1,
        phase="review",
        participant_id="p2",
        email="cp@example.com",
        expected_generation=gen1,
        expected_revision=rev1,
        audit_log=d1.setdefault("audit_log", []),
    )
    save_draft_cas(d1, expected_revision=rev1)

    # Revoke latest
    cur = load_draft(aid)
    base = get_registry_revision(cur)
    revoked = supersede_active_invite(
        cur, phase="review", participant_id="p2", audit_log=cur.setdefault("audit_log", [])
    )
    save_draft_cas(revoked, expected_revision=base)
    final = load_draft(aid)
    assert is_jti_superseded(final, "jti-A", "review", "p2")
    assert is_jti_superseded(final, "jti-B", "review", "p2")
    assert jti_invite_access_denied(final, "jti-A", "review", "p2", commercial=True)
    assert jti_invite_access_denied(final, "jti-B", "review", "p2", commercial=True)


def test_completion_supersede_interleaved_with_stale_resend_state(data_dir):
    aid = "ag_mw_complete"
    draft = _seed(aid, jti="jti-A")
    # Activate B
    d1 = copy.deepcopy(draft)
    rev0 = get_registry_revision(d1)
    gen0 = get_replacement_generation(d1, phase="review", participant_id="p2")
    begin_invite_replacement(
        d1,
        phase="review",
        participant_id="p2",
        kind=KIND_SAME_EMAIL_RESEND,
        new_jti="jti-B",
        email="cp@example.com",
        expected_generation=gen0,
        expected_revision=rev0,
        agreement_id=aid,
        locked_version_id="",
        mode="review",
        audit_log=d1.setdefault("audit_log", []),
    )
    save_draft_cas(d1, expected_revision=rev0)
    rev1 = get_registry_revision(d1)
    gen1 = get_replacement_generation(d1, phase="review", participant_id="p2")
    activate_invite_replacement(
        d1,
        phase="review",
        participant_id="p2",
        email="cp@example.com",
        expected_generation=gen1,
        expected_revision=rev1,
        audit_log=d1.setdefault("audit_log", []),
    )
    save_draft_cas(d1, expected_revision=rev1)

    # Completion-like supersede of B
    cur = load_draft(aid)
    base = get_registry_revision(cur)
    done = supersede_active_invite(
        cur,
        phase="review",
        participant_id="p2",
        jti="jti-B",
        audit_log=cur.setdefault("audit_log", []),
    )
    save_draft_cas(done, expected_revision=base)

    # Stale in-flight resend world still holding A→C cannot CAS over completion
    stale = copy.deepcopy(draft)
    with pytest.raises(DraftCasConflictError):
        begin_invite_replacement(
            stale,
            phase="review",
            participant_id="p2",
            kind=KIND_SAME_EMAIL_RESEND,
            new_jti="jti-C",
            email="cp@example.com",
            expected_generation=gen0,
            expected_revision=rev0,
            agreement_id=aid,
            locked_version_id="",
            mode="review",
            audit_log=stale.setdefault("audit_log", []),
        )
        save_draft_cas(stale, expected_revision=rev0)

    final = load_draft(aid)
    assert jti_invite_access_denied(final, "jti-A", "review", "p2", commercial=True)
    assert jti_invite_access_denied(final, "jti-B", "review", "p2", commercial=True)
    assert jti_invite_access_denied(final, "jti-C", "review", "p2", commercial=True)


def test_commercial_fail_closed_on_missing_registry(data_dir):
    draft = {
        "id": "ag_mw_missing",
        "parties": [{"id": "p2", "role": "party", "email": "cp@example.com"}],
        "audit_log": [],
    }
    assert jti_invite_access_denied(draft, "jti-X", "review", "p2", commercial=True) is True
    # Legacy remains permissive when registry absent.
    assert jti_invite_access_denied(draft, "jti-X", "review", "p2", commercial=False) is False


def test_commercial_fail_closed_on_emptied_active(data_dir):
    aid = "ag_mw_emptied_active"
    draft = _seed(aid, jti="jti-A")
    # Simulate corrupted emptied active without superseding list entry.
    reg = get_registry(draft)
    row = reg["recipients"]["review:p2"]
    row["active_jti"] = None
    row["active_jti_fp"] = None
    draft["recipient_delivery_v1"] = reg
    assert jti_invite_access_denied(draft, "jti-A", "review", "p2", commercial=True) is True
    # Legacy is_jti_superseded alone would not deny when active empty and not listed.
    assert is_jti_superseded(draft, "jti-A", "review", "p2") is False


def test_preserve_keeps_unrelated_draft_fields(data_dir):
    aid = "ag_mw_fields"
    draft = _seed(aid, jti="jti-A")
    # Advance registry via record of new jti
    cur = load_draft(aid)
    base = get_registry_revision(cur)
    record_invite_sent(
        cur,
        phase="review",
        participant_id="p2",
        jti="jti-B",
        email="cp@example.com",
        audit_log=cur.setdefault("audit_log", []),
    )
    save_draft_cas(cur, expected_revision=base)

    stale = copy.deepcopy(draft)
    stale["purpose"] = "updated-purpose"
    stale["payment_terms"] = "Net 15"
    save_draft(stale)
    final = load_draft(aid)
    assert final.get("purpose") == "updated-purpose"
    assert final.get("payment_terms") == "Net 15"
    assert _active(final) == "jti-B"


def test_equal_revision_empty_recipients_cannot_erase_durable(data_dir):
    aid = "ag_mw_eq_rev_empty"
    draft = _seed(aid, jti="jti-A")
    rev = get_registry_revision(draft)
    assert rev >= 1
    attack = {
        "id": aid,
        "title": "eq-rev-wipe",
        "parties": draft["parties"],
        "audit_log": [],
        "recipient_delivery_v1": {"v": 1, "revision": rev, "recipients": {}},
    }
    save_draft(attack)
    final = load_draft(aid)
    assert final.get("title") == "eq-rev-wipe"
    assert _active(final) == "jti-A"
    assert get_registry_revision(final) == rev
    durable_reg = get_registry(draft)
    assert get_registry(final) == durable_reg


def test_inflated_revision_empty_registry_cannot_erase_durable(data_dir):
    aid = "ag_mw_inflated_empty"
    draft = _seed(aid, jti="jti-A")
    rev = get_registry_revision(draft)
    attack = {
        "id": aid,
        "title": "inflated-wipe",
        "parties": draft["parties"],
        "audit_log": [],
        "recipient_delivery_v1": {"v": 1, "revision": rev + 100, "recipients": {}},
    }
    save_draft(attack)
    final = load_draft(aid)
    assert final.get("title") == "inflated-wipe"
    assert _active(final) == "jti-A"
    assert get_registry_revision(final) == rev


def test_inflated_revision_forged_active_jti_cannot_replace_durable(data_dir):
    aid = "ag_mw_forged_jti"
    draft = _seed(aid, jti="jti-A")
    rev = get_registry_revision(draft)
    forged = copy.deepcopy(draft)
    forged["title"] = "forged"
    forged["recipient_delivery_v1"] = {
        "v": 1,
        "revision": rev + 50,
        "recipients": {
            "review:p2": {
                "phase": "review",
                "participant_id": "p2",
                "active_jti": "jti-FORGED",
                "active_jti_fp": "deadbeef",
                "superseded_jtis": [],
                "superseded_jti_fps": [],
                "pending_replacement": None,
                "replacement_generation": 0,
            }
        },
    }
    save_draft(forged)
    final = load_draft(aid)
    assert final.get("title") == "forged"
    assert _active(final) == "jti-A"
    assert jti_invite_access_denied(final, "jti-FORGED", "review", "p2", commercial=True)
    assert not jti_invite_access_denied(final, "jti-A", "review", "p2", commercial=True)


def test_authorized_cas_can_still_update_registry(data_dir):
    aid = "ag_mw_cas_ok"
    draft = _seed(aid, jti="jti-A")
    cur = load_draft(aid)
    base = get_registry_revision(cur)
    record_invite_sent(
        cur,
        phase="review",
        participant_id="p2",
        jti="jti-B",
        email="cp@example.com",
        audit_log=cur.setdefault("audit_log", []),
    )
    save_draft_cas(cur, expected_revision=base)
    final = load_draft(aid)
    assert _active(final) == "jti-B"
    assert get_registry_revision(final) > base
    assert is_jti_superseded(final, "jti-A", "review", "p2")


def test_record_invite_opened_cas_preserves_lifecycle(data_dir):
    from backend.services.agreement_draft_store import save_draft_cas
    from backend.services.recipient_delivery_registry import (
        PENDING_DELIVERY,
        record_invite_opened,
    )

    aid = "ag_mw_opened"
    draft = _seed(aid, jti="jti-A")
    d1 = copy.deepcopy(draft)
    rev0 = get_registry_revision(d1)
    gen0 = get_replacement_generation(d1, phase="review", participant_id="p2")
    begin_invite_replacement(
        d1,
        phase="review",
        participant_id="p2",
        kind=KIND_SAME_EMAIL_RESEND,
        new_jti="jti-B",
        email="cp@example.com",
        expected_generation=gen0,
        expected_revision=rev0,
        agreement_id=aid,
        locked_version_id="",
        mode="review",
        audit_log=d1.setdefault("audit_log", []),
    )
    save_draft_cas(d1, expected_revision=rev0)
    pending = load_draft(aid)
    row = (get_registry(pending).get("recipients") or {}).get("review:p2") or {}
    assert (row.get("pending_replacement") or {}).get("status") == PENDING_DELIVERY
    assert _active(pending) == "jti-A"
    base = get_registry_revision(pending)
    audit = list(pending.get("audit_log") or [])
    record_invite_opened(
        pending,
        phase="review",
        participant_id="p2",
        jti="jti-A",
        audit_log=audit,
    )
    pending["audit_log"] = audit
    save_draft_cas(pending, expected_revision=base)
    final = load_draft(aid)
    row = (get_registry(final).get("recipients") or {}).get("review:p2") or {}
    assert _active(final) == "jti-A"
    assert (row.get("pending_replacement") or {}).get("new_jti") == "jti-B"
    assert (row.get("pending_replacement") or {}).get("status") == PENDING_DELIVERY
    assert row.get("last_opened_at")
    assert get_registry_revision(final) > base
    # Concurrent equal-rev generic wipe cannot drop opened lifecycle either.
    wipe = {
        "id": aid,
        "title": "post-open-wipe",
        "parties": final["parties"],
        "audit_log": [],
        "recipient_delivery_v1": {
            "v": 1,
            "revision": get_registry_revision(final),
            "recipients": {},
        },
    }
    save_draft(wipe)
    after = load_draft(aid)
    assert after.get("title") == "post-open-wipe"
    assert _active(after) == "jti-A"
    row2 = (get_registry(after).get("recipients") or {}).get("review:p2") or {}
    assert (row2.get("pending_replacement") or {}).get("new_jti") == "jti-B"
    assert row2.get("last_opened_at") == row.get("last_opened_at")


def test_postgres_cas_path_shares_revision_guard_helpers(data_dir):
    """
    File-store exercises the same revision compare used by Postgres FOR UPDATE CAS.

    A live Postgres transactional race is not run here (no CLAW_AGREEMENT_DATABASE_URL
    in unit tests); Postgres uses the same expected_revision check inside a
    SELECT … FOR UPDATE transaction in `_save_draft_postgres_cas`.
    """
    from backend.services import agreement_draft_store as store

    assert hasattr(store, "_save_draft_postgres_cas")
    assert hasattr(store, "_save_draft_postgres_preserving")
    # Structural guarantee: cas function performs FOR UPDATE compare.
    import inspect

    body = inspect.getsource(store._save_draft_postgres_cas)
    assert "FOR UPDATE" in body
    assert "expected_revision" in body
    body_p = inspect.getsource(store._save_draft_postgres_preserving)
    assert "FOR UPDATE" in body_p
    assert "_preserve_security_owned_recipient_delivery" in body_p
