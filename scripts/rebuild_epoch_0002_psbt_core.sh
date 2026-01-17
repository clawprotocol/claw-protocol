#!/usr/bin/env bash
set -euo pipefail
set +H 2>/dev/null || true

WALLET="claw_anchor_v0"
PSBT_FILE="proofs/epoch-0002.psbt.txt"
CHANGE_ADDRESS="bc1qsfctel4rp0m2cy9lhmqcucyknln2v5wpxwnenw"
OPRETURN_HEX="21d426b7dbc77815f6c8def37065c36cb9a37893cc6b27db4846738e3464f9a3"

WCFP_FILE="/tmp/walletcreatefundedpsbt.json"
DECODE_FILE="/tmp/decoded_psbt.json"
ERR_FILE="/tmp/bitcoin-cli.err"

die() {
  echo "ERROR: $*" >&2
  exit 1
}

require_nonempty_file() {
  local f="$1"
  [[ -s "$f" ]] || die "Expected non-empty file: $f"
}

require_json_file() {
  local f="$1"
  if ! python3 -c 'import json,sys; json.load(open(sys.argv[1], "r", encoding="utf-8"))' "$f"; then
    echo "Invalid JSON in: $f" >&2
    head -c 200 "$f" >&2 || true
    echo >&2
    exit 1
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

mkdir -p "$(dirname "$PSBT_FILE")"

run_cli "$WCFP_FILE" -rpcwallet="$WALLET" walletcreatefundedpsbt \
  '[]' \
  "[{\"data\":\"$OPRETURN_HEX\"}]" \
  0 \
  "{\"changeAddress\":\"$CHANGE_ADDRESS\",\"replaceable\":true}" \
  true
require_nonempty_file "$WCFP_FILE"
require_json_file "$WCFP_FILE"

PSBT="$(python3 -c 'import json,sys; j=json.load(open(sys.argv[1], "r", encoding="utf-8")); print(j.get("psbt",""))' "$WCFP_FILE" || exit 1)"
if [[ -z "$PSBT" || "$PSBT" != cHNidP* ]]; then
  die "walletcreatefundedpsbt did not return a valid PSBT"
fi

printf '%s\n' "$PSBT" >"$PSBT_FILE"
echo "Wrote PSBT to $PSBT_FILE"

run_cli "$DECODE_FILE" -rpcwallet="$WALLET" decodepsbt "$PSBT"
require_nonempty_file "$DECODE_FILE"
require_json_file "$DECODE_FILE"

python3 -c 'import json,sys; j=json.load(open(sys.argv[1], "r", encoding="utf-8")); vin=j.get("tx", {}).get("vin", []); print("Selected inputs (vin):"); print(json.dumps(vin, indent=2))' "$DECODE_FILE"

