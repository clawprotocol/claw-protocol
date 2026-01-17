#!/usr/bin/env bash
set -euo pipefail
set +H 2>/dev/null || true

WALLET="claw_anchor_v0"
PSBT_FILE="proofs/epoch-0002.psbt.txt"
RECEIPT_FILE="proofs/epoch-0002.broadcast.json"

WALLETINFO_FILE="/tmp/walletinfo.json"
WPP_FILE="/tmp/wpp.json"
FINAL_FILE="/tmp/final.json"
TXID_FILE="/tmp/txid.txt"
ERR_FILE="/tmp/bitcoin-cli.err"
WALLETUNLOCK_OUT="/tmp/walletpassphrase.out"

die() {
  echo "ERROR: $*" >&2
  exit 1
}

require_file() {
  local f="$1"
  [[ -f "$f" ]] || die "Missing file: $f"
}

require_nonempty_file() {
  local f="$1"
  [[ -s "$f" ]] || die "Expected non-empty file: $f"
}

print_file_snippet() {
  local f="$1"
  echo "File snippet (first 200 chars):" >&2
  head -c 200 "$f" >&2 || true
  echo >&2
}

require_json_file() {
  local f="$1"
  if ! python3 -c 'import json,sys; json.load(open(sys.argv[1], "r", encoding="utf-8"))' "$f"; then
    print_file_snippet "$f"
    die "Invalid JSON in: $f"
  fi
}

run_cli() {
  local out="$1"
  shift
  : >"$ERR_FILE"
  if ! bitcoin-cli "$@" >"$out" 2>"$ERR_FILE"; then
    echo "bitcoin-cli failed: $*" >&2
    tail -n 80 "$ERR_FILE" >&2 || true
    exit 1
  fi
}

require_file "$PSBT_FILE"
mkdir -p "$(dirname "$RECEIPT_FILE")"

# Extract PSBT base64 (first token that starts with cHNidP)
# NOTE: If broadcast fails with missing/spent input, rebuild the PSBT first.
PSBT="$(awk '/^cHNidP/{print; exit}' "$PSBT_FILE")"
if [[ -z "$PSBT" || "$PSBT" != cHNidP* ]]; then
  die "PSBT not found or malformed in $PSBT_FILE"
fi

echo "IMPORTANT: Do NOT type quotes unless quotes are literally part of the passphrase."
read -r -s -p "Wallet passphrase: " PASS; echo
run_cli "$WALLETUNLOCK_OUT" -rpcwallet="$WALLET" walletpassphrase "$PASS" 600
unset PASS

# Check unlock status via JSON file (no pipes)
run_cli "$WALLETINFO_FILE" -rpcwallet="$WALLET" getwalletinfo
require_nonempty_file "$WALLETINFO_FILE"
require_json_file "$WALLETINFO_FILE"

UNLOCK_STATUS="$(python3 -c 'import json,time,sys; j=json.load(open(sys.argv[1], "r", encoding="utf-8")); u=j.get("unlocked_until",0); now=int(time.time()); print(f"unlocked_until={u} now={now} unlocked={u>now}")' "$WALLETINFO_FILE" || exit 1)"
echo "$UNLOCK_STATUS"
if [[ "$UNLOCK_STATUS" != *"unlocked=True"* ]]; then
  die "Wallet appears locked; run walletpassphrase again"
fi

# Process PSBT
run_cli "$WPP_FILE" -rpcwallet="$WALLET" walletprocesspsbt "$PSBT"
require_nonempty_file "$WPP_FILE"
require_json_file "$WPP_FILE"

FINAL_PSBT="$(python3 -c 'import json,sys; data=json.load(open(sys.argv[1], "r", encoding="utf-8")); psbt=data.get("psbt"); import sys as s; s.exit("Missing psbt in walletprocesspsbt result") if not psbt else print(psbt)' "$WPP_FILE" || exit 1)"

# Finalize PSBT
run_cli "$FINAL_FILE" -rpcwallet="$WALLET" finalizepsbt "$FINAL_PSBT"
require_nonempty_file "$FINAL_FILE"
require_json_file "$FINAL_FILE"

FINAL_HEX="$(python3 -c 'import json,sys; data=json.load(open(sys.argv[1], "r", encoding="utf-8")); hex_tx=data.get("hex"); import sys as s; s.exit("Missing hex in finalizepsbt result") if not hex_tx else print(hex_tx)' "$FINAL_FILE" || exit 1)"

if [[ "${DRY_RUN-}" == "1" ]]; then
  echo "DRY_RUN=1 set; not broadcasting."
  echo "Finalized PSBT JSON: $FINAL_FILE"
  exit 0
fi

# Broadcast
run_cli "$TXID_FILE" -rpcwallet="$WALLET" sendrawtransaction "$FINAL_HEX"
require_nonempty_file "$TXID_FILE"
TXID="$(cat "$TXID_FILE")"
echo "Broadcasted TXID: $TXID"

# Write receipt
python3 - <<'PY' "$RECEIPT_FILE" "$TXID" "$FINAL_HEX" "$WALLET" "$PSBT_FILE"
import json, sys, time
receipt, txid, hex_tx, wallet, psbt_file = sys.argv[1:6]
data = {
    "epoch": "epoch-0002",
    "txid": txid,
    "hex": hex_tx,
    "unix_time": int(time.time()),
    "wallet": wallet,
    "psbt_file": psbt_file,
}
with open(receipt, "w", encoding="utf-8") as fh:
    json.dump(data, fh, indent=2, sort_keys=True)
    fh.write("\n")
PY
echo "Wrote receipt: $RECEIPT_FILE"

