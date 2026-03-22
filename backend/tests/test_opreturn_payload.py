import pytest

from backend.handlers.bitcoin_opreturn import build_claw_opreturn_payload

pytestmark = pytest.mark.invariant

def test_opreturn_payload_format():
    epoch_root = "01" * 32
    payload_hex = build_claw_opreturn_payload(epoch_root, 100, 243)

    assert payload_hex.startswith("434c415701")  # "CLAW" + 0x01
    assert len(payload_hex) == 90  # 45 bytes
