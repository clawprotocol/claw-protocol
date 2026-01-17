#!/usr/bin/env bash
set -euo pipefail
set +H 2>/dev/null || true

if [[ $# -ne 1 ]]; then
  echo "Usage: scripts/verify_receipt.sh receipts/epoch-0002.json" >&2
  exit 1
fi

RECEIPT="$1"
TX_JSON="/tmp/claw.verify.tx.json"
TX_ERR="/tmp/claw.verify.tx.err"

python3 - <<'PY' "$RECEIPT" || exit 1
import json, sys
path = sys.argv[1]
with open(path, "r", encoding="utf-8") as fh:
    r = json.load(fh)
required = ["epoch", "txid", "op_return_hex", "network"]
missing = [k for k in required if not r.get(k)]
if missing:
    raise SystemExit("Missing required fields: " + ", ".join(missing))
PY

EPOCH="$(python3 -c 'import json,sys; print(json.load(open(sys.argv[1], "r", encoding="utf-8")).get("epoch",""))' "$RECEIPT")"
TXID="$(python3 -c 'import json,sys; print(json.load(open(sys.argv[1], "r", encoding="utf-8")).get("txid",""))' "$RECEIPT")"
OP_RETURN_HEX="$(python3 -c 'import json,sys; print(json.load(open(sys.argv[1], "r", encoding="utf-8")).get("op_return_hex",""))' "$RECEIPT")"
BLOCKHASH="$(python3 -c 'import json,sys; print(json.load(open(sys.argv[1], "r", encoding="utf-8")).get("blockhash",""))' "$RECEIPT")"

if [[ -n "$BLOCKHASH" ]]; then
  bitcoin-cli getrawtransaction "$TXID" true "$BLOCKHASH" >"$TX_JSON" 2>"$TX_ERR"
else
  bitcoin-cli getrawtransaction "$TXID" true >"$TX_JSON" 2>"$TX_ERR"
fi

if [[ -s "$TX_ERR" || ! -s "$TX_JSON" ]]; then
  echo "FAIL: getrawtransaction error or empty output" >&2
  echo "stderr: $TX_ERR" >&2
  echo "stdout: $TX_JSON" >&2
  if [[ -s "$TX_ERR" ]]; then
    cat "$TX_ERR" >&2
  fi
  exit 1
fi

python3 - <<'PY' "$TX_JSON" "$EPOCH" "$TXID" "$OP_RETURN_HEX" || exit 1
import json, sys
path, epoch, txid, ophex = sys.argv[1:5]
with open(path, "r", encoding="utf-8") as fh:
    tx = json.load(fh)
vout = tx.get("vout", [])
match_hex = None
for o in vout:
    spk = o.get("scriptPubKey", {}) or {}
    if spk.get("type") == "nulldata":
        asm = spk.get("asm", "")
        if ophex in asm:
            match_hex = spk.get("hex")
            break
if not match_hex:
    print("FAIL: OP_RETURN not found/mismatch", file=sys.stderr)
    sys.exit(1)
print(f"OK: {epoch} txid={txid} op_return={ophex} nulldata_hex={match_hex}")
PY

