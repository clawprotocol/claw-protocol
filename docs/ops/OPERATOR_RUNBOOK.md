# LawDog operator runbook (internal)

**Start here for launch week:** [Launch operator playbook](LAUNCH_OPERATOR_PLAYBOOK.md) — chronological staging → load test → launch-day → first hours → rollback (copy/paste).

**Companion:** [Operator access policy](OPERATOR_ACCESS_POLICY.md) — substance-minimized support and break-glass discipline. **Deep env/worker detail:** [Environment topology](../architecture/ENV_TOPOLOGY.md). **Postgres launch default (single DSN):** [Launch database profile](LAUNCH_DATABASE_PROFILE.md). **HTTP smoke:** [Deploy smoke test](DEPLOY_SMOKE_TEST.md).

---

## 1. Purpose

Give founders and operators a **short, concrete** production posture for LawDog launch: **minimize routine access to user content**, ship with **safe defaults**, and know **what to check** before and after deploy. This is **not** legal advice, a compliance certification, or a substitute for customer agreements or regulatory programs.

---

## 2. Launch posture summary

- **Proof and verification** are designed to be **strong and deterministic** (hashes, receipts, verify flows).
- **Operator routine** should be **metadata-first** (IDs, statuses, error codes, timestamps)—not reading agreement text or uploads by default.
- **Infrastructure** can always reach disks/DBs; **discipline** is what keeps launch posture acceptable (see access policy).
- **Secrets and admin** are gated; **debug and dev-only surfaces** stay off in production-like environments.

---

## 3. Required production env/config

Set explicitly; do not rely on “works on my laptop” defaults.

| Variable / topic | Production expectation |
|------------------|-------------------------|
| **`CLAW_ENVIRONMENT`** | Use a non-dev label (e.g. `production` or your hoster’s standard). Affects CORS and other dev-ish defaults when combined with unset tight origins—see `backend/main.py`. |
| **`CLAW_DATABASE_URL` / `DATABASE_URL`** | **Preferred:** one shared Postgres URL for all domain schemas; leave `CLAW_*_DATABASE_URL` overrides **unset** unless you intentionally split clusters — [Launch database profile](LAUNCH_DATABASE_PROFILE.md). |
| **`CLAW_ADMIN_SECRET`** | **Set** on any shared/staging/prod API that exposes admin routes. Callers must send **`x-claw-admin-secret`**; without a configured secret, production-like behavior should deny admin (see access policy §8). |
| **`CLAW_DEBUG`** | **Off** (`0` / unset in prod). Turn on **only** briefly for a diagnosed incident, then revert. Verbose behavior and extra surfaces are unsafe to leave on. |
| **`CLAW_RECIPIENT_ACCESS_TOKEN_REQUIRED`** | **`1`** for launch if product policy is “magic links / `t=` tokens required.” Aligns SPA `access/policy` with backend enforcement of recipient reads/writes when economics or this flag is strict. |
| **CORS** | Set **`CLAW_CORS_ALLOW_ORIGINS`** to an explicit comma-separated list of **allowed browser origins** (your SPA origin(s)). Empty + non-local environment should **not** fall back to wide open. |
| **`VITE_API_BASE` / same-origin** | **Preferred for launch:** **same-origin** SPA + API (one site, reverse proxy to API). Then `VITE_API_BASE` can be empty or relative. **Split-origin:** set **`VITE_API_BASE`** to the **full API origin** (scheme + host, no trailing slash) at **build time**; that origin **must** appear in `CLAW_CORS_ALLOW_ORIGINS`. |

Also required for real recipient/sign links: **`CLAW_AGREEMENT_SIGNING_TOKEN_SECRET`** (stable per environment). Optional hardening: **`CLAW_RECIPIENT_LINK_MINT_KEY`** so minting links requires **`X-Claw-Recipient-Link-Mint-Key`**.

Paths, DB files, worker scheduling, and chain RPC: see [ENV_TOPOLOGY.md](../architecture/ENV_TOPOLOGY.md). **Batch anchoring (Bitcoin canonical + mandatory Dogecoin mirror, weekly cadence, `CLAW_ANCHORING_ENABLED=1` for receipt-batch drain):** [ANCHORING_LAUNCH_RUNBOOK.md](ANCHORING_LAUNCH_RUNBOOK.md), [ANCHORING_AWS_LAUNCH.md](ANCHORING_AWS_LAUNCH.md).

---

## 4. Deployment topology decision

| Pattern | When to use | Notes |
|---------|-------------|--------|
| **Same-origin** | Default for launch | Browser sees one origin; API behind same host/path prefix. Simplest CORS story and cookie/session patterns if you add them later. |
| **Split-origin** | SPA on CDN/domain A, API on domain B | Must configure **CORS** + correct **`VITE_API_BASE`** at build. Higher chance of misconfiguration; test recipient links and workspace flows in staging. |

**Worker:** run `python -m backend.workers.run_anchor_worker` on a **schedule** (e.g. **EventBridge** → ECS/Lambda) with the **same** `CLAW_DATA_DIR` / `*_DB_PATH` / `CLAW_ANCHORING_DB_PATH` / **`CLAW_DATABASE_URL` / `CLAW_ANCHORING_DATABASE_URL`** (when anchoring uses Postgres) / blob config as the API unless roles are deliberately split. Set **`CLAW_ANCHORING_ENABLED=1`** so receipt-batch `anchor_jobs` drain automatically. Default canonical cadence hint: `CLAW_ANCHOR_CADENCE_DAYS=14`. Lean launch uses **public Bitcoin broadcast** + **Blockchair Dogecoin** (no Core RPC on the worker) unless you override `CLAW_ANCHOR_*_PROVIDER` — see `docs/ops/ANCHORING_AWS_LAUNCH.md`.

---

## 5. What operators may do

- Run **health / version / deploy-readiness** checks (with admin secret where required).
- Tune **non-content** config: rate limits, CORS, anchor network policy, feature flags, TTLs for recipient tokens.
- Use **metadata** from logs, metrics, tickets: agreement IDs, HTTP status, error **codes**, receipt or verification IDs, timestamps.
- **Break-glass** access per §8—**narrow, reason-coded, logged**.
- **Restore from backup** and **rotate secrets** using your platform’s standard processes (treat backups as sensitive as primary stores). **Postgres anchoring:** enable managed **automated backups** and optional **PITR** per vendor; document RPO/RTO at the infrastructure layer — see [Postgres day-one](../architecture/POSTGRES_DAY_ONE.md) § backup / restore.

---

## 6. What operators may not do

- **Browse** production agreement JSON on disk, SQLite rows of draft text, or blob stores **for routine support or curiosity**.
- **Paste** agreement body, payment details, or tokens into **Slack**, **analytics**, or **ticketing** tools.
- Leave **`CLAW_DEBUG` on**, leave **`CLAW_ADMIN_SECRET` unset** on shared APIs, or mount **dev-only routes** (e.g. internal dev storage smoke) in production without an explicit decision.
- **Claim** SOC 2, HIPAA, legal **privilege**, or **certified e-sign compliance** in customer-facing copy unless you have an actual attestation or program—see §12.

---

## 7. Metadata-first support workflow

Aligned with [OPERATOR_ACCESS_POLICY.md](OPERATOR_ACCESS_POLICY.md) §5.

1. Ask for **agreement ID**, **what they clicked**, **exact error message** (or screenshot), and **time (UTC)**.
2. Use **verify / receipt references** and **workflow state** (draft, sent, locked, signed)—not full text.
3. If reproduction needs more, ask the user for **redacted** or **minimal** excerpts they are willing to share—**not** “send us the whole agreement” by default.
4. Escalate to **substance** only when necessary and under **break-glass** (§8).

---

## 8. Break-glass workflow

Exceptional access to **content** (opening drafts, memory blobs, LLM traces, raw exports) must be:

- **Rare** — not the default support path.  
- **Narrow** — one agreement or artifact, least data, shortest time.  
- **Reason-coded** — e.g. production incident, abuse investigation, **explicit user authorization** for support.  
- **Logged** — ticket note (who/when/why/scope) at minimum.

Privileged **HTTP** actions that the product already audits append to **JSONL** when enabled:

- **`CLAW_BREAK_GLASS_AUDIT`** — default on; set to `0`/`false` only if you intentionally disable file writes (not recommended for prod unless you replace with another audit path).  
- **`CLAW_BREAK_GLASS_LOG_PATH`** — optional override; default under **`CLAW_DATA_DIR`/logs/break_glass_audit.jsonl**.

See `backend/ops/break_glass_audit.py` for schema and action codes. **Never** log secrets, tokens, or user substance in that stream.

---

## 9. Pre-launch smoke checklist

**Ordered checklist (staging → launch):** [Launch operator playbook](LAUNCH_OPERATOR_PLAYBOOK.md).

- **`make validate`** (or CI equivalent): backend tests + frontend production build.  
- **`docs/LAUNCH_SMOKE_CHECKLIST.md`**: manual flows (home, app entry, create agreement, e-sign, billing).  
- **Staging with production-like env:** create agreement → **recipient link** open → read + one recipient action (e.g. approve or signing step) with **`CLAW_RECIPIENT_ACCESS_TOKEN_REQUIRED=1`** if that is launch policy.  
- **Deploy smoke:** `make deploy-smoke` / `scripts/deploy_smoke.py` — ordered gates `/health` → `/v1/readyz` → `/admin/deploy-readiness` → optional agreement/timeline writes → operator summary from deploy-readiness; details in [DEPLOY_SMOKE_TEST.md](DEPLOY_SMOKE_TEST.md).  
- Confirm **CORS** + **`VITE_API_BASE`** match your chosen same-origin or split-origin layout.

---

## 10. Post-deploy checks

| Check | How |
|--------|-----|
| API up | `GET /health` or `GET /v1/healthz` → OK payload (**liveness**; no DB). |
| DB readiness (configured Postgres domains) | `GET /v1/readyz` → **200** when every **configured** launch Postgres domain pings OK (or that domain is on SQLite → `skipped`); **503** if any configured probe fails. Usage-economics metering Postgres is **not** included — see `GET /admin/deploy-readiness`. |
| Build identity | `GET /version` — environment, node mode, anchor mode, mainnet flag. |
| Readiness | `GET /admin/deploy-readiness` with **`x-claw-admin-secret`** when `CLAW_ADMIN_SECRET` is set (includes **`anchoring_postgresql`** when a Postgres anchoring DSN is set). |
| Worker | Scheduled run exits **0**; logs show no stuck crash loop; anchor errors visible in DB/log fields if any. |
| Recipient policy | SPA loads **`/api/agreements/access/policy`** and behavior matches minted links + strict flags. |

---

## 11. Features to disable or treat cautiously (privacy-sensitive users)

Treat as **higher sensitivity** or **optional** until product and privacy docs catch up:

- **Agreement Memory / search / indexer** — document-derived text in stores and optional LLM use; disable or limit via product flags and env if you have a “minimal footprint” offering.  
- **LLM-assisted drafting / negotiation** — prompts and completions are substance-adjacent; do not log full prompts/completions (see access policy §7).  
- **File upload / layout / OCR pipelines** — treat extracts like agreement body.  
- **Public agreement verify** — only enable when intentional (`CLAW_PUBLIC_AGREEMENT_VERIFY` and related); scope is **public proof**, not full confidentiality.  
- **Public feed API** — if enabled, understand what metadata/events are exposed.  
- **Internal/dev routes** — e.g. dev storage smoke: **off** in production unless explicitly opted in.

---

## 12. Honest launch caveat

- **Proof is strong** when used as designed: deterministic bundles, verification flows, and chain commitments where configured—**operators should not oversell** “immutable” or “court-ready” without context.  
- **Confidentiality boundaries are still tightening** — recipient tokens, workspace scoping, and operator-minimized practice **reduce** casual exposure; they do **not** make the platform “invisible” to someone with full disk access.  
- **No certification/compliance overclaim** — LawDog is **not** sold as SOC 2–certified, HIPAA-compliant, or a substitute for qualified legal counsel unless you have separate, factual documentation.

---

*Internal runbook for LawDog launch. Revise as ops and architecture mature.*
