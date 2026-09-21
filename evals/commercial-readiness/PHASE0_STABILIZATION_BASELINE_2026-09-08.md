# Phase 0 stabilization baseline — 2026-09-08

Base commit: `f69f1e81`

## Scope

This phase repairs test execution and dependency reproducibility only. It does not change LawDog product behavior, agreement output, entitlement policy, or release expectations.

## Infrastructure corrections

- Vitest inline projects now inherit the root Vite/React configuration and explicitly use the same automatic JSX runtime as the application.
- Backend runtime dependencies used by authentication, document processing, receipts, persistence, and proof flows are declared in `pyproject.toml`, resolved in `uv.lock`, and present in the Docker/Railway `requirements.txt` manifest.

## Verification results

| Check | Before Phase 0 | After Phase 0 |
|---|---:|---:|
| Representative frontend auth/dashboard tests | 6 passed / 17 failed | 23 passed / 0 failed |
| Full frontend suite | 8,689 passed / 675 failed | 9,123 passed / 241 failed |
| Frontend `React is not defined` failures | present | 0 |
| Backend collection | blocked by missing `jwt` | 1,445 collected |
| Full backend suite | not runnable from `uv sync` environment | 1,444 passed / 1 skipped / 0 failed |
| Frontend production build | passed | passed |

The frontend correction removes 434 infrastructure-induced failures. The remaining 241 failed assertions are not quarantined and continue to block a commercial release.

## Remaining frontend failure shape

- 241 failed assertions across 204 failed test files.
- 14 files fail during suite loading with `Cannot read properties of undefined (reading 'source')`.
- Failure names overlap heavily across document/corpus authority, signing/recipient identity, authentication/billing, and recovery/hydration behavior.
- Keyword grouping is diagnostic only and intentionally overlaps: 132 document/corpus, 90 signing/recipient, 53 authentication/billing, and 39 recovery/hydration matches.

## Release treatment

- Do not update expected hashes, snapshots, or exclusion manifests merely to reduce the failure count.
- Do not authorize paid generation or a commercial release while the critical frontend suite remains red.
- Phase 1 should unify route/access policy and authenticated API behavior before agreement-flow refactoring.
