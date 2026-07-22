# VS01 envelope provenance — staged rollout preflight

**Code baseline (envelope attestation):** `a041dff74bb17014871033b8ce9cee884b8f3e36` (`a041dff7`)  
**Staging fail-closed secret policy:** successor commit on this branch (see git history for `agreement_signing_token.py` staging strictness).  
**Rollback tip (parent of attestation):** `b3b98a56a50624f06737be910c83e26b9d93b961` (`b3b98a56`)  
**Do not deploy from:** `b3b98a56` alone, or any dirty/uncommitted tree.

This document is the preflight record for **Platform** pre-canary confirmation. It does **not** authorize canary deployment.

---

## 1. Configuration and key management

### 1.1 Secret identity

| Item | Value |
|------|--------|
| Primary env | `CLAW_AGREEMENT_SIGNING_TOKEN_SECRET` |
| Alias | `CLAW_SIGNING_TOKEN_SECRET` |
| Resolver | `backend/config/agreement_signing_token.py` → `resolve_signing_token_secret_raw()` |
| Used for | Recipient/signer HMAC tokens **and** `envelopeAttestation` HMAC (`vs01.signing_envelope_attestation/v1`) |
| Frontend | **Never** present. No `VITE_*` binding. Operator copy may mention the **variable name** only. |

### 1.2 Enforced environment policy (after staging fail-closed fix)

| `CLAW_ENVIRONMENT` | Secret policy | On missing / blank / malformed / fallback-derived |
|--------------------|---------------|-----------------------------------------------------|
| `local` / `dev` / `test` | Shared in-process fallback **permitted** | Mint/attest may proceed; readiness `signing_token_secret_source=fallback`, `signing_token_configured=false` |
| **`staging`** | **Same as production — fail closed** | HTTP **422** `signing_token_secret_not_configured` for mint / envelope attest / reissue / signer-complete (with portable); public verify returns `envelope_attestation_valid=false`, reason `signing_token_secret_not_configured` |
| `production` / `prod` | Fail closed (unchanged) | Same 422 / fail-closed verify behavior |

**Forbidden in staging/production:** silently using the shared fallback digest, or setting the env var to the fallback material / namespace string.

### 1.2.1 Exact Platform actions (external — required before canary)

1. **Provision** an explicit staging secret via the approved secret manager (Railway/Render/Fly/etc.). Value: long random (e.g. `openssl rand -hex 32`). Never reuse the in-process fallback digest.
2. **Confirm readiness only via booleans + source classification** (never print/log the secret or any MAC):

```bash
# Admin-authenticated; never prints secret values
curl -sS -H "x-claw-admin-secret: $CLAW_ADMIN_SECRET" \
  "$STAGING_API/admin/runtime-summary" | jq '{
    signing_token_configured,
    signing_token_secret_configured,
    signing_token_secret_source,
    signing_token_env_var_detected,
    review_link_mint_enabled
  }'

curl -sS "$STAGING_API/api/agreements/access/policy" | jq '{
  signing_token_configured,
  signing_token_secret_source,
  signing_token_env_var_detected,
  review_link_mint_enabled
}'
```

**Platform pass criteria (exact readiness signal):**

| Field | Required value |
|-------|----------------|
| `signing_token_configured` | `true` |
| `signing_token_secret_source` | `"explicit"` |
| `signing_token_env_var_detected` | `"CLAW_AGREEMENT_SIGNING_TOKEN_SECRET"` or `"CLAW_SIGNING_TOKEN_SECRET"` |
| `review_link_mint_enabled` | `true` |

Reject if `signing_token_secret_source` is `"fallback"` or `"absent"`.

3. **Wire** the alert definitions in §3.1 in the monitoring platform (or record a signed waiver).
4. **Capture** staging baselines (packet-block rate, signing abandonment, public-verify 5xx, provenance 400 rate) before any canary traffic.

### 1.3 Secret must not leak

| Channel | Status |
|---------|--------|
| Process logs | Secrets never logged (`env_bootstrap.py`). Missing-secret logs use reason codes only. |
| Admin/runtime APIs | Booleans + env **var name** only. |
| Public verify | Digests + `envelope_attestation_valid` / reason — **no** MAC, no secret. |
| Authenticated draft/packet APIs | May return `envelopeAttestation.mac` (integrity tag, not the secret). Treat as non-secret but do not log alongside corpus. |
| Client bundle | Not bundled. |

### 1.4 Ownership, access, rotation

| Role | Responsibility |
|------|----------------|
| **Rotation owner** | On-call platform/ops owner for the API service secrets (Railway/Render/Fly secrets store). Product engineering owns attestation semantics. |
| **Access** | Secret lives only in the host secrets store for the API (and workers that mint/validate tokens). Not in frontend build env, not in client repos, not in chat logs. |
| **Source of truth** | Platform secret manager for that environment; documented inventory in `docs/ENVIRONMENT.md` / `docs/architecture/ENV_TOPOLOGY.md`. |

### 1.5 Key-rotation compatibility policy (explicit)

**Current implementation:** single-secret HMAC; **no key ID (`kid`)** and no dual-key verify window.

**Documented policy for this release:**

1. **Do not rotate** `CLAW_AGREEMENT_SIGNING_TOKEN_SECRET` during the canary window for `a041dff7`.
2. When rotation is required later:
   - Schedule a maintenance window.
   - Deploy/rotate secret on the API.
   - **Invalidated immediately:** outstanding recipient/signer tokens minted under the old secret; stored `envelopeAttestation.mac` values under the old secret.
   - **Public verify:** returns `envelope_attestation_valid: false`, reason `attestation_mac_invalid` until re-attestation (fail closed — does not advertise forged digests).
   - **Re-attestation path:** owner **reissue** or **re-dispatch** (`signing-packet/reissue` / `signing-links-sent`) so the server recomputes digests and writes a new MAC under the current secret. SoT bytes must remain unchanged.
3. Dual-key / `kid` verification is **out of scope** for `a041dff7`; track as a follow-up if zero-downtime rotation is required.

### 1.6 Missing/invalid key operational alert

| Signal | Where |
|--------|--------|
| HTTP **422** `signing_token_secret_not_configured` | Mint, access validate, envelope attest, signer-complete (recipient path) |
| Startup warning | `[env] CLAW_AGREEMENT_SIGNING_TOKEN_SECRET ... unset` on production-like envs |
| Deploy readiness | Production only: `GET /admin/deploy-readiness` |

Wire platform alerts on **422 rate** for that code and on deploy-readiness `missing_keys` containing `CLAW_AGREEMENT_SIGNING_TOKEN_SECRET` (production).

---

## 2. Persistence and backward compatibility

### 2.1 Storage

- Additive JSON on `draft.vs01_signing_packet_v1.portable`:
  - `envelopeProvenance` (SHA-256 digests)
  - `envelopeAttestation` (`hmac-sha256` MAC)
- Persisted via existing agreement draft store (file or Postgres `agreement_drafts.payload` JSONB).
- **No new migration, index, or capacity plan required** (~1–2 KB per packet).

### 2.2 Behavior without prior provenance

| Surface | Legacy packet (no provenance / no MAC) |
|---------|----------------------------------------|
| Invite dispatch (`signing-links-sent`) | Server **attests** from `seed.corpusPlain` + roles; persists provenance + MAC. Missing client provenance allowed. |
| Reissue | Fresh attest; SoT substitution vs stored seed rejected. |
| Signer complete (with `portable_packet`) | Attest + reject SoT swap / forged digests. |
| Signer complete (no portable body) | No provenance gate. |
| Public verify | **Fail closed** for envelope fields: `envelope_provenance: null`, `envelope_attestation_valid: false`, reason `attestation_mac_invalid` until a write path persists server attestation. Other verify fields unchanged. |

### 2.3 Rollback safety

| Rollback target | Storage | Semantics |
|-----------------|---------|-----------|
| **`b3b98a56`** (parent) | Preserves nested JSON; opaque `Dict` round-trip. **No corruption.** | Loses server HMAC gate. Client may still show digests; public verify won’t enforce MAC. |
| **`1dea0d47`** | Same opaque preservation. | No envelope awareness; fields ignored. |

Prior releases do **not** strip or rewrite `envelopeAttestation`. Misrepresentation risk on rollback is limited to weaker verification, not data loss.

### 2.4 Rollback procedure (deployable)

1. Redeploy API (and matching frontend if co-shipped) from Git SHA **`b3b98a56`** / image tagged to that SHA.
2. Confirm `GET /version` → `git_commit` starts with `b3b98a56`.
3. No DB down-migration.
4. Re-run `python3 scripts/deploy_smoke.py` against the rolled-back staging API.

---

## 3. Observability — dashboards and alerts

**In-repo today:** error **codes** on HTTP 400/422 and two exception log lines; **no** Datadog/Sentry dashboards for these signals.

### 3.1 Required alert definitions (create in monitoring before canary traffic)

All alerts must **exclude** agreement body text, signer PII, emails, and secret values. Allowed: `agreement_id`, `detail.code`, HTTP status, route, `surface`, counts, digests **prefixes ≤16 hex chars** if already logged by product.

| Alert ID | Signal | Query / rule (platform-agnostic) | Severity | Notes |
|----------|--------|----------------------------------|-------------|-------|
| `vs01.packet_block.canonical_sig_lines` | `canonical_signature_lines_not_rendered` | Frontend/client readiness logs or RUM custom event; spike vs 7d baseline | P1 during canary | Client-only string today — enable structured client telemetry or scrape CI/synthetic logs |
| `vs01.provenance.dispatch_reject` | Invite/reissue/complete **400** with `detail.code` matching `forged_*` / `envelope_*` / `accepted_sot_*` / `provenance_copied_*` | API access log: path ∈ `{signing-links-sent, signing-packet/reissue, vs01-signer-complete}` AND status=400 | P0 | Include `detail.code` dimension |
| `vs01.provenance.forged_sot` | `forged_accepted_sot_digest` | Same, code exact match | P0 | Tamper indicator |
| `vs01.provenance.forged_packet_or_manifest` | `forged_packet_digest` \| `forged_signer_manifest_digest` \| `forged_packet_layout_digest` | Same | P0 | |
| `vs01.public_verify.attestation_fail` | Public verify responses with `envelope_attestation_valid=false` **or** reason ∈ `{stored_provenance_tamper, attestation_mac_invalid}` | Sample `/api/agreements/public/*/verify` JSON (or structured log once added) | P1 | Expect residual legacy packets until re-dispatch; baseline before alerting |
| `vs01.secret.missing` | HTTP **422** `signing_token_secret_not_configured` | Global | P0 | |
| `vs01.synthetic.j4_j7` | Playwright/synthetic journeys J4 / J7 Prepare / J7 full-chain | CI or staging synthetic schedule | P1 | Not production traffic |

### 3.2 Suggested dashboard panels

1. Rate of provenance **400** by `detail.code` and route (15m / 24h).
2. Rate of **422** `signing_token_secret_not_configured`.
3. Public verify: % `envelope_attestation_valid=true` among responses that include the field.
4. Packet-block: `canonical_signature_lines_not_rendered` count (client).
5. Staging synthetic: last J4×2 / J7 Prepare / J7 full-chain result + duration.

### 3.3 Logging gap (follow-up, not blocking storage)

Provenance rejects currently return HTTP 400 **without** a dedicated structured log line for `detail.code`. Prefer adding `logger.info("envelope_provenance_rejected code=%s surface=%s agreement_id=%s", ...)` in a later change — **out of scope for this preflight commit** unless separately authorized.

---

## 4. Staged rollout design

### 4.1 Artifact identity (immutable)

| Field | Value |
|-------|--------|
| Git commit | `a041dff74bb17014871033b8ce9cee884b8f3e36` |
| Short | `a041dff7` |
| Build | From that checkout only: backend image `lawdog-api:a041dff7` (or platform SHA inject) + frontend `npm run build` from same commit if UI ships with it |
| Post-deploy proof | `GET /version` → `git_commit` == full SHA (or platform-truncated equivalent) |

### 4.2 Canary cohort

| Phase | Cohort | Duration |
|-------|--------|----------|
| **C0** | Staging API only; internal operators; synthetic J4/J7 | ≥ 2 hours continuous + one full synthetic suite |
| **C1** | Staging + ≤10% of entitled paid-Pro create/sign traffic (or single dogfood org) if traffic splitting exists; else remain staging-only | ≥ 24 hours |
| **C2** | Full staging; production canary only after separate authorization | — |

If the host has **no** traffic split, treat **staging dogfood org + synthetics** as the entire canary.

### 4.3 Success criteria (no material regression)

Relative to 7-day staging baseline (or last green week):

| Metric | Success |
|--------|---------|
| `canonical_signature_lines_not_rendered` | No material increase (≤ +10% absolute rate, or zero new clusters) |
| Provenance validation 400s (`forged_*` / envelope rejects) | **≈0** unexpected; any `forged_*` investigated as abuse/bug within 1h |
| Signing abandonment (invite → first signature) | No material increase (≤ +5 pp) |
| Public verify hard failures (5xx) | No increase; attestation `false` only for known pre-attest legacy packets |
| J4 synthetic | 2/2 pass, each ≤ 60s |
| J7 Prepare + full-chain | Pass within existing timeouts |
| Secret configured | Remains `true` entire window |

### 4.4 Rollback triggers (immediate)

Roll back to **`b3b98a56`** if any of:

1. Spike in provenance **400** affecting legitimate owner dispatch/sign (not synthetic forge tests).
2. Spike in `canonical_signature_lines_not_rendered` blocking packet ready.
3. Material rise in signing abandonment or public verify **5xx**.
4. `signing_token_secret_not_configured` appearing in staging after deploy (misconfig).
5. `GET /version` SHA mismatch vs `a041dff7` (wrong artifact).
6. Data corruption / draft load failures (unexpected; should not occur).

### 4.5 Rollback target deployability

| Target | Status |
|--------|--------|
| `b3b98a56` | **Confirmed parent** of `a041dff7`; prior release tip with client-side provenance only. Deployable by redeploying that Git SHA / image. No migration rollback. |

---

## 5. Preflight checklist

### 5.1 Engineering (local — completed when commit lands)

- [x] Staging fails closed in code (no shared fallback)
- [x] Readiness exposes only `signing_token_configured` + `signing_token_secret_source` (+ env var **name**)
- [x] Focused backend tests for local/test fallback, staging/prod fail-closed, surface fail-closed

### 5.2 Platform (external — next gate; do **not** request canary until done)

- [ ] Deploy/build from the successor commit that includes staging fail-closed (not `b3b98a56`, not dirty)
- [ ] Provision explicit staging secret in approved secret manager
- [ ] Confirm readiness signal: `signing_token_configured=true` **and** `signing_token_secret_source=explicit`
- [ ] Wire §3.1 alerts in monitoring (or signed waiver)
- [ ] Capture baselines before canary
- [ ] Rollback image/SHA `b3b98a56` available
- [ ] No secret rotation during canary window

---

## 6. Preflight verdict status

**Engineering verdict target after this fix:** `READY FOR PLATFORM PRE-FLIGHT`  
**Canary authorization:** not requested here — Platform must complete §5.2 and supply non-sensitive readiness/baseline evidence.
