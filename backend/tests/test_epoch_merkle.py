# backend/tests/test_epoch_merkle.py
import pytest
from backend.handlers.epoch_merkle import merkle_root_and_paths, merkle_verify

pytestmark = pytest.mark.invariant


def test_merkle_determinism_and_inclusion():
    commits = [
        "00" * 32,
        "11" * 32,
        "22" * 32,
    ]

    root, paths_by_leaf, commits_sorted = merkle_root_and_paths(commits)
    assert len(paths_by_leaf) == 3
    assert commits_sorted == sorted(commits, key=lambda c: bytes.fromhex(c))

    # Verify inclusion for each sorted leaf (deterministic)
    for c in commits_sorted:
        assert c in paths_by_leaf
        assert merkle_verify(c, root, paths_by_leaf[c])


def test_odd_duplication_stability():
    commits = [
        "aa" * 32,
        "bb" * 32,
        "cc" * 32,
        "dd" * 32,
        "ee" * 32,  # odd -> duplication
    ]

    root1, paths1, sorted1 = merkle_root_and_paths(commits)
    root2, paths2, sorted2 = merkle_root_and_paths(commits)

    assert root1 == root2
    assert sorted1 == sorted2

    assert len(paths1) == len(paths2) == 5
    for c in sorted1:
        assert merkle_verify(c, root1, paths1[c])
        assert merkle_verify(c, root2, paths2[c])
