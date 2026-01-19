#!/usr/bin/env bash
set -euo pipefail
set +H 2>/dev/null || true

TXID="3eaaf70572bb446a063e485663aa6119503eb36676134a9ca24257316f29777a"
BLOCKHASH="00000000000000000001ccdb40d1421db560897676d4fad8c54f834a3e182993"
WANT_OPRETURN="21d426b7dbc77815f6c8def37065c36cb9a37893cc6b27db4846738e3464f9a3"

TX_JSON="/tmp/epoch0002.tx.json"
TX_ERR="/tmp/epoch0002.tx.err"

die() {
  echo "FAIL: $*" >&2
  exit 1
}

bitcoin-cli getrawtransaction "$TXID" true "$BLOCKHASH" >"$TX_JSON" 2>"$TX_ERR"

if [[ -s "$TX_ERR" || ! -s "$TX_JSON" ]]; then
  echo "FAIL: getrawtransaction error or empty output" >&2
  if [[ -s "$TX_ERR" ]]; then
    echo "stderr:" >&2
    cat "$TX_ERR" >&2
  fi
  exit 1
fi

python3 - <<'PY' "$TX_JSON" "$WANT_OPRETURN" || exit 1
import json, sys
path, want = sys.argv[1], sys.argv[2]
with open(path, "r", encoding="utf-8") as fh:
    tx = json.load(fh)
vout = tx.get("vout", [])
match_hex = None
for o in vout:
    spk = o.get("scriptPubKey", {}) or {}
    if spk.get("type") == "nulldata":
        asm = spk.get("asm", "")
        if want in asm:
            match_hex = spk.get("hex")
            break
if match_hex:
    print("OK: epoch-0002 OP_RETURN matches")
    if match_hex:
        print(f"nulldata hex: {match_hex}")
    sys.exit(0)
print("FAIL: OP_RETURN not found/mismatch")
sys.exit(1)
PY

