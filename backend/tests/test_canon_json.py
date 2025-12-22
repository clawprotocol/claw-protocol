import hashlib

from utils.canon_json import canon_json_bytes


def test_vector_a_bytes_and_hash():
    obj = {"b": 2, "a": 1}
    b = canon_json_bytes(obj)
    assert b == b'{"a":1,"b":2}'
    assert hashlib.sha256(b).hexdigest() == "43258cff783fe7036d8a43033f830adfc60ec037382473548ac742b888292777"


def test_vector_b_bytes_and_hash():
    obj = {
        "z": {"b": True, "a": False},
        "a": [{"y": 2, "x": 1}, 3],
    }
    b = canon_json_bytes(obj)
    assert b == b'{"a":[{"x":1,"y":2},3],"z":{"a":false,"b":true}}'
    assert hashlib.sha256(b).hexdigest() == "c693f3ca7f1fd8f343087b280a187b2b8bd6a8b04c932a31418ef83f45ef3b72"



def test_vector_c_bytes_and_hash():
    obj = {"msg": "line1\nline2", "quote": "\"ok\""}
    b = canon_json_bytes(obj)
    # NOTE: in a Python bytes literal, the newline is escaped as \\n and quotes as \\".
    assert b == b'{"msg":"line1\\nline2","quote":"\\"ok\\""}'
    assert hashlib.sha256(b).hexdigest() == "fc111a672e6b56207f80825809fe0b1d39f9fd4c5bbdda33e22c281527cb804b"
