#!/usr/bin/env bash
set -euo pipefail

NETWORK="testnet"
FILE=""
WALLET=""
ANCHOR="0"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --network) NETWORK="$2"; shift 2 ;;
    --file) FILE="$2"; shift 2 ;;
    --wallet) WALLET="$2"; shift 2 ;;
    --anchor) ANCHOR="1"; shift 1 ;;
    *) echo "Unknown arg: $1"; exit 1 ;;
  esac
done

if [[ -z "$FILE" || -z "$WALLET" ]]; then
  echo "Usage: $0 --network testnet|mainnet --file <file> --wallet <wallet> [--anchor]"
  exit 1
fi

if [[ ! -f "$FILE" ]]; then
  echo "File not found: $FILE"
  exit 1
fi

# Optional: if you have scripts/btc_rpc_env.sh, source it here.
# If not, backend/handlers/bitcoin_opreturn.py may already have defaults/env usage.
# source scripts/btc_rpc_env.sh

python3 claw_genesis_commitment.py "$FILE" "$NETWORK" "$WALLET" ${ANCHOR:+--anchor}
