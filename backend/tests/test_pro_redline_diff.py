"""Unit tests for deterministic Pro redline block diff."""

from backend.agreements.pro_redline_diff import compute_pro_redline_block_diff


def test_replace_emits_single_changed_block() -> None:
    base = "Intro\n\nOld middle\n\nOutro"
    imp = "Intro\n\nNew middle\n\nOutro"
    blocks, changed = compute_pro_redline_block_diff(base, imp)
    kinds = [b["kind"] for b in blocks]
    assert "changed" in kinds
    changed_blocks = [b for b in blocks if b["kind"] == "changed"]
    assert len(changed_blocks) == 1
    assert changed_blocks[0]["removed_text"] == "Old middle"
    assert changed_blocks[0]["added_text"] == "New middle"
    assert changed == 1


def test_insert_only_added() -> None:
    base = "A\n\nB"
    imp = "A\n\nB\n\nC"
    blocks, changed = compute_pro_redline_block_diff(base, imp)
    assert any(b["kind"] == "added" for b in blocks)
    assert changed >= 1


def test_equal_documents_zero_changes() -> None:
    t = "Same\n\nBlock"
    blocks, changed = compute_pro_redline_block_diff(t, t)
    assert changed == 0
