import json
from pathlib import Path

from backend.handlers.anchor_adapter import BitcoinCoreRpcAnchorAdapter


class FakeAdapter(BitcoinCoreRpcAnchorAdapter):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self.calls = []

    def _rpc_call(self, method, params):
        self.calls.append((method, params))
        if method == "createrawtransaction":
            return "rawtx"
        if method == "fundrawtransaction":
            return {"hex": "funded"}
        if method == "signrawtransactionwithwallet":
            return {"complete": True, "hex": "signed"}
        if method == "sendrawtransaction":
            return "txid123"
        raise RuntimeError("unexpected method")


def test_broadcast_commitment_uses_wallet_flow(tmp_path):
    cookie = tmp_path / ".cookie"
    cookie.write_text("user:pass", encoding="utf-8")
    adapter = FakeAdapter(rpc_url="http://127.0.0.1:18332", cookie_path=str(cookie), wallet="w")

    txid = adapter.broadcast_commitment("bitcoin-testnet", "aa" * 32)
    assert txid == "txid123"

    methods = [m for (m, _p) in adapter.calls]
    assert methods == [
        "createrawtransaction",
        "fundrawtransaction",
        "signrawtransactionwithwallet",
        "sendrawtransaction",
    ]
