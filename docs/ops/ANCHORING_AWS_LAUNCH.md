# LawDog anchoring — lean launch (provider broadcast)

Production-oriented summary for **Bitcoin canonical** + **Dogecoin mirror** with **no self-hosted chain nodes** on the worker. Proof model is unchanged: batch-root commitments, deterministic receipts, Merkle roots — only **execution** and **ops assumptions** are lean.

**Also read:** [ANCHORING_LAUNCH_RUNBOOK.md](ANCHORING_LAUNCH_RUNBOOK.md), [ENV_TOPOLOGY.md](../architecture/ENV_TOPOLOGY.md).

---

## 1. Target architecture (minimal)

| Layer | Role |
|-------|------|
| **App / API** | Orchestration, proof layer, batch close → `anchoring.sqlite3` receipt batches + `anchor_jobs`. |
| **Anchor worker** | `python -m backend.workers.run_anchor_worker` on a **schedule**; drains queues including `drain_receipt_batch_anchor_jobs`. |
| **Bitcoin broadcast** | Public Esplora/mempool-style HTTP API (`POST /tx` + status). Default base derived from `CLAW_ANCHOR_CANONICAL_BITCOIN_NETWORK` unless `CLAW_ANCHOR_BTC_PUBLIC_BROADCAST_BASE_URL` is set. **~$0** marginal cost. |
| **Dogecoin mirror** | Blockchair **push** + **transaction dashboard** for status. Optional `CLAW_ANCHOR_BLOCKCHAIR_API_KEY`. **Near-zero** pay-as-you-go. |
| **Signing** | **Offline / out-of-band:** operator (or tooling) builds and signs OP_RETURN txs; worker reads **signed raw hex** from `CLAW_ANCHOR_SIGNED_RAW_TX_DIR` (`<anchor_job_id>.hex` or `<commitment>.hex`) or from caller `metadata` where applicable. |
| **Scheduler** | EventBridge / cron — align with **`CLAW_ANCHOR_CADENCE_DAYS`** (default **14** days for canonical cycle). |

No AWS pruned Bitcoin/Dogecoin nodes, no always-on RPC, no Tatum, no node wallet runway in observability when HTTP providers are selected.

---

## 2. Cadence (explicit)

| Setting | Meaning |
|---------|---------|
| **`CLAW_ANCHOR_CADENCE_DAYS`** (default **14**) | Operator scheduling hint: target days between **canonical Bitcoin** anchor windows. |
| **`CLAW_ANCHOR_DOGE_MIRROR_EVERY_NTH_BATCH`** (default **2**) | Enqueue a Dogecoin mirror job every **Nth** receipt-batch **close**. Default **2** ⇒ mirror on every **second** batch close — aligned with a **28-day** mirror rhythm when batches track a **14-day** Bitcoin cycle. Set to **`1`** to mirror every batch (legacy density). |

Bitcoin remains **canonical**; Dogecoin remains a **real on-chain mirror** when a mirror job exists.

---

## 3. Durable jobs (batch-ready → queue)

On receipt-batch close:

1. Batch → `ready_to_anchor` (Merkle root fixed).
2. At least one `anchor_jobs` row: **`chain=btc`**, `status=queued`.
3. When the close sequence matches **`CLAW_ANCHOR_DOGE_MIRROR_EVERY_NTH_BATCH`**, a second row: **`chain=doge`**, same `target_root_sha256`.

The worker drains **Bitcoin first**; Dogecoin runs only after Bitcoin for that root is not blocked (see runbook).

---

## 4. Fully anchored (batch row)

- **Both** chains have jobs **and** both `confirmed` → `fully_anchored`.
- **Only Bitcoin** job exists (mirror skipped for that batch) → batch promotes to **`fully_anchored`** when Bitcoin is **`confirmed`**.

---

## 5. Operator workflow (low touch)

**Normal case**

1. Scheduler runs the worker on the chosen cadence (e.g. every 14 days).
2. Stage signed raw tx hex files for queued jobs (or inject via integration you control).
3. Worker broadcasts via public APIs; confirmation poll uses the same HTTP providers.
4. Operator intervenes on **alerts** (stale submitted, backlog, broadcast errors).

**Not required for lean launch:** node uptime, RPC VPN wiring, pruned disk plans, or “anchor node wallet top-up” runbooks — fees live in the **signing wallets** you use offline, not on Core nodes in the cloud.

---

## 6. Deprecations / legacy

- **`local_rpc_bitcoin`** / **`local_rpc_dogecoin`**: still supported for dev (`CLAW_ANCHOR_ENV=local` defaults) or explicit `CLAW_ANCHOR_*_PROVIDER` overrides.
- **`third_party_anchor`**: unchanged generic HTTP client.
- **`BITCOIN_RPC_*` / `DOGECOIN_RPC_*`**: required only when using **local RPC** providers; observability skips RPC ping when `public_broadcast_bitcoin` / `blockchair_dogecoin` is active.

---

## 7. Explorer links

- `CLAW_ANCHOR_BTC_EXPLORER_TX_URL` / `CLAW_ANCHOR_DOGE_EXPLORER_TX_URL` — `{txid}` templates for operators (defaults include mempool.space / Blockchair).
