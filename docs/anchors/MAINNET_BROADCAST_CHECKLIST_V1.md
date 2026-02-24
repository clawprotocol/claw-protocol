# CLAW Mainnet Broadcast Checklist (v1)

Status: Operational Checklist · Release-Step Only · Human-in-the-Loop

---

## 0) Hard Rules (Do Not Skip)
- Broadcast MUST only occur from a dedicated broadcast host.
- Broadcast MUST require explicit opt-in:
  - CLAW_ENABLE_BROADCAST=1
- If uncertain, STOP and run dry-run again.
- Never broadcast from verifier-only deployment environments.

---

## 1) Preconditions
- You have a finalized bundle JSON for the batch (exported and verified).
- You have the OP_RETURN hex payload computed from the bundle.
- You have created (or confirmed) a funded wallet with spendable UTXOs.
- You have a change address ready (optional but recommended).

---

## 2) Required Environment Variables (Broadcast Host)
- CLAW_BUNDLE=path/to/<batch>.bundle.json
- BTC_COOKIE_FILE=/path/to/bitcoin/.cookie
- BTC_WALLET=<wallet_name>
- FEE_RATE_SATVB=<sat/vB> (default ok)
- CHANGE_ADDRESS=<address> (recommended)
- CLAW_ENABLE_BROADCAST=0 (default MUST be 0 until final step)

Network note:
- Confirm bitcoin-cli is connected to MAINNET before continuing.

---

## 3) Verify Bitcoin Core Context (Before Any Transaction Build)
Run:
- bitcoin-cli getblockchaininfo
  - chain MUST be "main"
- bitcoin-cli getwalletinfo
  - walletname MUST match BTC_WALLET
- bitcoin-cli getbalances (or listunspent)
  - confirm sufficient UTXOs

STOP IF:
- chain is not "main"
- wallet is not loaded
- balance is insufficient

---

## 4) Confirm Bundle Integrity (Must Pass)
Run:
- backend/scripts/verify_batch_bundle.py on the bundle file

STOP IF:
- ok != True

---

## 5) Dry-Run Broadcast Script (Must Print “ok (dry-run)”)
Run with:
- CLAW_ENABLE_BROADCAST=0
Expect:
- ok (dry-run)
- batch_id printed
- op_return printed (ascii + hex)
- funded fee printed

STOP IF:
- any RPC errors occur
- signing_incomplete occurs
- output does not show expected batch_id/op_return

---

## 6) Final Broadcast (Release-Step Only)
Set:
- CLAW_ENABLE_BROADCAST=1

Run the broadcast script again.

Expect:
- ok (broadcast)
- txid printed

STOP IF:
- txid not returned
- script prints refusal message or errors

Immediately record:
- txid
- timestamp
- batch_id
- op_return_hex

---

## 7) Post-Broadcast Verification
- Confirm tx appears in mempool:
  - bitcoin-cli getrawtransaction <txid> true
- Confirm OP_RETURN is present and matches expected payload.
- After confirmations:
  - update docs/STATE.md (mainnet anchor entry)
  - create docs/anchors/ANCHOR_FINAL_<batch>.md (final record)

---

## 8) Safety Notes
- Never reuse old bundles for a new anchor.
- Any change in leaves changes merkle root and commitment.
- Any change in commitment requires a new payload and new PSBT.

---

End of checklist.
