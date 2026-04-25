import json
from unittest.mock import MagicMock, patch

from backend.handlers.anchor_adapter import BitcoinCoreRpcAnchorAdapter, DogecoinCoreRpcAnchorAdapter


def _rpc_method_from_call(c: MagicMock) -> str:
    payload = c.kwargs.get("json")
    if isinstance(payload, dict):
        return str(payload["method"])
    return str(json.loads(payload)["method"])


@patch("backend.handlers.anchor_adapter.requests.post")
def test_bitcoin_broadcast_commitment_uses_wallet_flow(mock_post: MagicMock, tmp_path):
    cookie = tmp_path / ".cookie"
    cookie.write_text("user:pass", encoding="utf-8")

    def response_json(payload: dict) -> MagicMock:
        r = MagicMock()
        r.raise_for_status = MagicMock()
        r.json = MagicMock(return_value=payload)
        return r

    mock_post.side_effect = [
        response_json({"result": "rawtx", "error": None}),
        response_json({"result": {"hex": "funded"}, "error": None}),
        response_json({"result": {"complete": True, "hex": "signed"}, "error": None}),
        response_json({"result": "txid123", "error": None}),
    ]

    adapter = BitcoinCoreRpcAnchorAdapter(rpc_url="http://127.0.0.1:18332", cookie_path=str(cookie), wallet="w")
    txid = adapter.broadcast_commitment("bitcoin-testnet", "aa" * 32)
    assert txid == "txid123"

    methods = [_rpc_method_from_call(c) for c in mock_post.call_args_list]
    assert methods == [
        "createrawtransaction",
        "fundrawtransaction",
        "signrawtransactionwithwallet",
        "sendrawtransaction",
    ]


@patch("backend.handlers.anchor_adapter.requests.post")
def test_dogecoin_broadcast_commitment_same_rpc_sequence(mock_post: MagicMock, tmp_path):
    cookie = tmp_path / ".cookie"
    cookie.write_text("user:pass", encoding="utf-8")

    def response_json(payload: dict) -> MagicMock:
        r = MagicMock()
        r.raise_for_status = MagicMock()
        r.json = MagicMock(return_value=payload)
        return r

    mock_post.side_effect = [
        response_json({"result": "rawtx", "error": None}),
        response_json({"result": {"hex": "funded"}, "error": None}),
        response_json({"result": {"complete": True, "hex": "signed"}, "error": None}),
        response_json({"result": "doge_tx_1", "error": None}),
    ]

    adapter = DogecoinCoreRpcAnchorAdapter(rpc_url="http://127.0.0.1:44555", cookie_path=str(cookie))
    txid = adapter.broadcast_commitment("dogecoin-testnet", "bb" * 32)
    assert txid == "doge_tx_1"

    methods = [_rpc_method_from_call(c) for c in mock_post.call_args_list]
    assert methods == [
        "createrawtransaction",
        "fundrawtransaction",
        "signrawtransactionwithwallet",
        "sendrawtransaction",
    ]
