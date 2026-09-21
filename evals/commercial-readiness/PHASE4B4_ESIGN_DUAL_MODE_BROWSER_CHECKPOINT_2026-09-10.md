# Phase 4B.4 checkpoint — `/app/esign/:documentId` dual-mode authority

Authoritative repository: `lawdog-repo`  
Branch: `stabilize/phase3b-paid-entry`  
Started from exact HEAD: `5b1c9de4` (`record phase 4B.3 public agreement verification checkpoint`)  
Nothing was pushed. This is **not** a launch authorization. `/app/quick`, sign-in, admin, and other Phase 4B pages were not begun.

Phase 4B.4 proves `/app/esign/:documentId` has two legitimate modes and no third readable mode. URL data, portable packets, session storage, local documents, and browser caches cannot authorize paper or completion.

Phase 4B.2 `/agreements/:id/sign` remains LawDog’s canonical professional agreement-signing ceremony and was not changed.

## Runtime-supported entries

Query-sensitive access — derived from `resolveEsignDocumentAccess` / `matchAppRoute` (not a second sitemap). Default `recipient-esign` manifest `access` stays `recipient_token` so Phase 4A’s 134-route inventory is unchanged.

| Mode | Query | Classification that must not be lost |
|---|---|---|
| Owner preparation | `?agreement_bridge=1` | `authenticated` — not public recipient access. Requires session + org-scoped document content. |
| Recipient signing | `?vs01_recipient_sign=1` | `recipient_token` — publicly reachable, never publicly readable without a validated sign-mode token. |
| Bare / malformed | no mode flag, or missing token | `public` but **not** `recipient_token`. Generic unavailable. No document or signer information. |
| Ambiguous | `agreement_bridge=1` and `vs01_recipient_sign=1` | `authenticated` — not public recipient access. |

Coverage fails closed if owner bridge is classified as public recipient access, if recipient mode loses public reachability, or if bare/ambiguous URLs become readable.

## Named gate

`scripts/run_phase4b4_esign_browser_gate.sh`

1. `frontend/node_modules/.bin/vitest run src/launch/phase4b4EsignDualModeCoverage.test.ts` — **1/1 passed**.
2. Playwright `frontend/playwright.phase4b4.config.ts` — `e2e/phase4b4/**`, retries 0, **workers=2**, Chrome desktop 1280×800 + mobile 390×844, baseURL `http://127.0.0.1:4173`. Starts its own Vite (`reuseExistingServer: false`). Fixtures intercept `/api/**`, `/v1/**`, `/health`, and `/version` only — not the Vite module graph.

**16/16 passed (33.2s).**

## Browser proof (desktop + mobile)

Deterministic server-attested packets and owner document bytes only. No live model, Stripe, email, or staging. Existing portable-only QA tests remain visual supplements and are **not** commercial authorization.

| Case | Result |
|---|---|
| Valid owner bridge | Authenticated entitled owner loads server document content. Forged local corpus never appears. No public packet GET. |
| Wrong-owner / signed-out owner | Other org → generic unavailable after content 403. Signed-out → sign-in required. No paper. |
| Valid recipient first-open + reload | Token validated; server packet required. Locked paper is the attested corpus. Token stripped; `vs01_recipient_sign=1` retained. Reload revalidates. |
| Assigned-field isolation | Current signer’s signature is editable. Other signer’s field is visible and read-only. |
| Completion + replay | One POST attributed by persisted `signer_role_id` + `participant_id`. Replay does not add a second role. |
| Bare / malformed / ambiguous | Generic “This signing page is unavailable.” No paper, no packet GET on bare entry. |
| Token tamper / missing packet / revision mismatch | Unavailable. No paper. |
| Retryable network failure | Retry control. No local paper. Success after retry uses the server packet. |
| Mobile 390×844 | No horizontal overflow; Finish signing remains reachable. |

Cross-document, wrong-party, expired token, forged local corpus, and hash/revision mismatch fail closed.

## Durable backend contracts (not manufactured in the client)

| Mode | Contract |
|---|---|
| Owner | `GET /v1/documents/{id}/content` (Bearer + org). Seed remains `POST /api/agreements/{id}/vs01-signing-seed`. |
| Recipient | `GET /api/agreements/access/validate` + token-bound `GET /api/agreements/public/{id}/vs01-signing-packet?t=` + `POST .../vs01-signer-complete`. |
| Packet GET | Missing/invalid token → 403 `recipient_token_required` or 404. Review-mode / wrong aid → 404. No unauthenticated packet read. |

No required mode was missing a server contract. This batch did not invent client-side paper authority.

## Production seams added (smallest cluster)

1. **`resolveEsignDocumentAccess`** — query-sensitive classification; owner bridge is not public recipient access.
2. **`bootstrapVs01RecipientSigningAuthority`** — sign-mode token required; server packet required; portable must match attested agreement/document/revision/corpus/roles.
3. **`getVs01UrlBootstrap`** — IDs and magic-link session only. Does not hydrate paper from URL/local/portable. Strips token; keeps reload keys.
4. **Public packet GET** — token-bound. Client sends `t=`.
5. **`RecipientSigningView`** — paper from the server-attested portable passed by the wizard. Other signers’ fields stay read-only. Missing server authority is unavailable/retry, not local signing.
6. **Owner prepare** — does not strip `agreement_bridge`; does not session-hydrate a competing corpus.

`AgreementSignGate` / `parseAgreementSignPath` / Phase 4B.2 coverage were not edited.

## Verification (required order)

| Step | Result |
|---|---|
| Named Phase 4B.4 browser gate | **16/16 passed** (33.2s, `--workers=2`, retries=0) |
| Phase 4B.3 | **16/16 passed** (26.1s, `--workers=2`) |
| Phase 4B.2 | **16/16**. Combined `--workers=2` hung after desktop enumeration on Vite/`AgreementBuilderIntake.tsx` (same class as prior 4A/4B.2 contention). Quiet split: invert-retryable **14/14** (2.2m, `--workers=1`) + retryable **2/2** (11.2s). Do not treat the hung combined run as a product regression. |
| Phase 4B.1 | **16/16 passed** (54.1s, `--workers=2`) |
| Combined Phase 4A 134 | **134/134 passed** (2.8m, `--workers=1`) |
| Phase 1 access contract | **18 files / 100 passed** (was 96; +4 query-sensitive esign access cases) |
| Phase 2 paid-journey | **exit 0** (critical backend **121** + frontend **97 files / 925 passed**) |
| Extra backend ownership / signing | **76 passed** — document content ownership, frozen signing authority, envelope-provenance tamper, packet token read, invite delivery, recipient control center, owner-session integration, signing-token JTI, staging token fail-closed, proof auth boundary, plus `test_agreements_api_v2.py -k "vs01_signing_seed or vs01_signing_packet or public_vs01"` |
| Focused this-batch Vitest | **11 files / 110 passed** (0 failures in 4B.4 files) |
| Production build | `tsc -b && vite build` — **✓ built in 8.66s** |
| Complete frontend suite (exactly once) | **9,505 / 9,309 / 196** (369s) |

## Authority contracts preserved

- Phase 4A paid-owner gate and Phase 4B.1–4B.3 were not weakened.
- No assertion, timeout, or retry added to Playwright configs.
- No fabricated token, lock, or packet in the client.
- Portable-only QA is not commercial authorization.
- `/agreements/:id/sign` was not started as a change and remains the canonical signing ceremony.
- `/app/quick`, sign-in, and admin were not begun.

## Comparison with latest remainder `9,498 / 9,309 / 189`

```bash
cd frontend && ./node_modules/.bin/vitest run --reporter=json --outputFile=/tmp/phase4b4/frontend-full.json
```

| Check | Latest (4B.3) | This run |
|---|---:|---:|
| Inventory | 9,498 | 9,505 |
| Passed | 9,309 | 9,309 |
| Raw failed assertions | 189 | 196 |
| Failed suites | 327 | 329 |

This batch added focused unit coverage for query-sensitive esign access (coverage + access + route/currentUser/dashboard cases). Inventory +7. All tests in the touched 4B.4 unit files passed (0 failures in those files). Passed unchanged / failed +7 is leftover variance (TEST511, TEST341, `json_parse` / source-window flaps), not this-batch closures and not a 4B.4 product regression. **Do not subtract leftovers from `9,498 / 9,309 / 189`. Do not rebaseline unrelated variance.**

Playwright 16 is outside this inventory.

## How to re-run

```bash
scripts/run_phase4b4_esign_browser_gate.sh
scripts/run_phase4b3_public_verify_browser_gate.sh
scripts/run_phase4b2_recipient_signing_browser_gate.sh
# If the combined 4B.2 --workers=2 run hangs on Vite, split:
# (cd frontend && ./node_modules/.bin/playwright test --config playwright.phase4b2.config.ts --workers=1 --grep-invert "retryable network")
# (cd frontend && ./node_modules/.bin/playwright test --config playwright.phase4b2.config.ts --workers=1 -g "retryable network")
scripts/run_phase4b1_recipient_review_browser_gate.sh
(cd frontend && ./node_modules/.bin/playwright test --config playwright.phase4a.config.ts --workers=1 --reporter=line)
```
