from __future__ import annotations

from unittest.mock import MagicMock, patch

import pytest

from backend.anchoring.execution import (
    ThirdPartyAnchorExecutionProvider,
    submit_commitment_for_network,
)
from backend.anchoring.execution.normalize import normalize_submission_result
from backend.anchoring.execution.providers import LocalRpcBitcoinExecutionProvider


def test_normalize_submission_maps_txid() -> None:
    n = normalize_submission_result(
        {"txid": "ab" * 32, "status": "pending", "external_id": "ext1"}
    )
    assert n.state == "submitted_unconfirmed"
    assert n.txid == "ab" * 32
    assert n.external_anchor_id == "ext1"


def test_third_party_stub_submit(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.delenv("CLAW_THIRD_PARTY_ANCHOR_BASE_URL", raising=False)
    monkeypatch.delenv("CLAW_THIRD_PARTY_ANCHOR_API_KEY", raising=False)
    p = ThirdPartyAnchorExecutionProvider()
    out = p.submit_anchor("aa" * 32, "btc", "bitcoin-testnet", None)
    assert out.state == "submitted_unconfirmed"
    assert out.txid and out.txid.startswith("stub:third_party:")


@patch("backend.anchoring.execution.providers.BitcoinCoreRpcAnchorAdapter")
def test_submit_commitment_for_network_delegates_to_local_rpc(
    mock_cls: MagicMock, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setenv("CLAW_ANCHOR_BITCOIN_PROVIDER", "local_rpc_bitcoin")
    inst = MagicMock()
    inst.broadcast_commitment.return_value = "cd" * 32
    mock_cls.return_value = inst
    txid = submit_commitment_for_network("bitcoin-testnet", "ee" * 32)
    assert txid == "cd" * 32
    inst.broadcast_commitment.assert_called_once_with("bitcoin-testnet", "ee" * 32)


@patch("backend.anchoring.execution.providers.BitcoinCoreRpcAnchorAdapter")
def test_local_rpc_bitcoin_provider_submit(mock_cls: MagicMock) -> None:
    inst = MagicMock()
    inst.broadcast_commitment.return_value = "ff" * 32
    mock_cls.return_value = inst
    p = LocalRpcBitcoinExecutionProvider()
    n = p.submit_anchor("11" * 32, "btc", "bitcoin-testnet", {})
    assert n.txid == "ff" * 32
    assert n.state == "submitted_unconfirmed"


@patch("backend.anchoring.execution.http_anchor_providers.requests.post")
def test_public_broadcast_bitcoin_submits_raw_hex(
    mock_post: MagicMock, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setenv("CLAW_ANCHOR_BITCOIN_PROVIDER", "public_broadcast_bitcoin")
    mock_resp = MagicMock()
    mock_resp.status_code = 200
    mock_resp.text = "ab" * 32
    mock_post.return_value = mock_resp
    raw = "02" * 200
    txid = submit_commitment_for_network(
        "bitcoin-testnet",
        "ee" * 32,
        metadata={"signed_raw_tx_hex": raw},
    )
    assert txid == "ab" * 32
    mock_post.assert_called_once()
