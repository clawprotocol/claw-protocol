# Phase 1 access-contract checkpoint — 2026-09-08

Phase 0 commit: `0ec5887c`

Phase 1 commits:

- `19a43277` — unify application route access policy
- `98fd5208` — authenticate paid owner data reads
- `67c396d7` — bind entitlements to the active user session

## Commercial objective

Make paid-user entry, owner data loading, and plan state deterministic before changing the agreement-generation workflow. This phase reduces contradictory browser state and access behavior; it does not claim that the complete paid experience is ready to launch.

## Changes delivered

### One route and access contract

- A canonical manifest classifies each application route as public, guest workflow, authenticated, paid, recipient-token, or administrator-only.
- The app-wide session gate consumes that manifest instead of maintaining a separate handwritten route list.
- Previously omitted owner routes—signing status, verification, field review, and usage receipts—now consistently require a validated session.
- Recipient-token links remain public regardless of whether the token is the first or a later query parameter.
- Unknown `/app/...` routes show a controlled not-found screen rather than falling through to the public homepage.

### One owner-data request boundary

- Owner and paid-workspace reads now use one request client that hydrates the current access token and applies the current organization identity.
- Document-layout analysis, field-review writes, protected document previews, usage receipts, receipt bundles, and signed-document receipt reads use this boundary.
- Protected PDF and image previews are fetched with owner credentials and rendered from a local object URL; browser media requests no longer silently omit authorization headers.

### Session-bound organization and entitlement state

- Paid access is not granted from the browser cache while authentication is unresolved or signed out.
- Entitlements refresh after authentication, token changes, workspace binding changes, and checkout updates.
- Same-tab and cross-tab organization/entitlement changes notify the mounted application immediately.
- Sign-out clears access tokens, subscription authority, paid-checkout authority, paid session markers, demo authority, and the prior account's organization binding.
- The production billing screen no longer lets customers edit the server-bound workspace id. The field remains available only as an explicit development diagnostic.

## Verification results

| Check | Phase 0 baseline | Phase 1 result |
|---|---:|---:|
| Focused route/auth/owner-data/session checks | not applicable | 96 passed / 0 failed |
| Full frontend test inventory | 9,364 | 9,423 |
| Persistent frontend failures | 241 | 241 (same assertion set) |
| Full-run load-only timeouts | not recorded | 4; isolated rerun 26 passed / 0 failed |
| Backend collection | 1,445 | 1,445 |
| Full backend suite | 1,444 passed / 1 skipped / 0 failed | 1,444 passed / 1 skipped / 0 failed |
| Frontend production build | passed | passed |

The raw Phase 1 full-run report showed 9,178 passed and 245 failed assertions across 208 files. Comparing the machine-readable reports found exactly four additions, all unchanged long-running paid-document tests that crossed the five-second timeout under full-suite load. Those four files passed 26/26 when rerun together. No new Phase 1 test failed and no new persistent failure was identified.

## Release decision

Phase 1 is complete and regression-neutral relative to the Phase 0 baseline. It materially improves paid-user state stability, but LawDog is **not yet commercially ready** because 241 pre-existing frontend assertions remain red and the authenticated paid sitemap has not yet passed a browser-level release matrix against a deployed environment.

## Recommended next phase

Phase 2 should convert the persistent frontend failure inventory into a release gate, prioritized by the paid customer journey:

1. sign in and restore the correct workspace and plan;
2. create and freeze one authoritative paid agreement;
3. reopen it from the dashboard without corpus or signer drift;
4. review, send, sign, and retrieve the final record and receipt;
5. run those paths as a browser matrix for paid, free, recipient, signed-out, and wrong-account states.

The release threshold should be zero failures in that paid-journey gate plus no unexplained increase in the full-suite failure set.
