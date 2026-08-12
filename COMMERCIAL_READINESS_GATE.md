# Commercial readiness gate

**Verdict: NO — not commercially ready.**

Captured: 2026-08-10 (uncommitted working tree). Evidence from CI-like local suites under `CLAW_ENVIRONMENT=test`.

Machine-readable baselines:

- `evals/commercial-readiness/baselines/backend-junit-post.xml`
- `evals/commercial-readiness/baselines/frontend-vitest-post.json`
- `evals/commercial-readiness/baselines/failure_register_backend_post.json`
- `evals/commercial-readiness/baselines/failure_register_frontend_post.json`

| # | Gate | Status | Evidence | Blocking defects | Owner | Exit criteria |
|---|---|---|---|---|---|---|
| 1 | Drafting and legal-output safety | **FAIL** | Explicit-accept binding + semantic fingerprint gates added; FE suite still 528 failing (SoT/corpus/assertion clusters). Offline eval path ≠ live path (`evals/draft-quality/LIVE_OFFLINE_PARITY.md`). | Unauthorized inventing floors mitigated in unit/API gates; full product drafting path not suite-green; eval parity closed. | Agreements / Paid Pro | FE/BE release suites green (or approved quarantines only); live/offline parity proven; independent legal review scheduled. |
| 2 | Authentication, authorization, tenant isolation | **FAIL** | Backend still has residual auth/signing failures (~22 bad tests post-remediation). Autouse entitlement grants reviewed to avoid attacker-org Pro. | Remaining failures in VS01 signer complete, patch5a signing gaps, receipt/proof boundaries, usage guest session. | Auth / Security | Those modules green; cross-tenant denial tests pass without weakening. |
| 3 | Privacy, retention, deletion, customer-data handling | **NOT ASSESSED** | No dedicated deletion/retention suite re-run as release gate in this pass. | Missing evidence for DSAR/deletion, retention TTLs in production config. | Privacy / Platform | Documented retention + deletion tests green against staging-like DB. |
| 4 | Secret management and application security | **BLOCKED** | Blinding keys ignored via `.gitignore`; packets directory ignored; keys not in git history (`git ls-files` empty). Explicit-accept Boolean bypass removed. | Staging signing secret fail-closed covered by existing tests; full secret inventory not completed this pass. | Security | Secret scan clean on RC commit; no KEY/packet artifacts tracked. |
| 5 | Billing, subscriptions, quotas, entitlements | **FAIL** | Guest→Genesis→Pro enforced (`entitlement_required`). Test harness grants Pro via `entitlement_test_support`. Residual usage-economics guest/summary failures. | Authenticated Free tier removed; suite not fully green on guest burst/summary + a few entitlement edges. | Billing | Usage/entitlement suites green; production paywall copy verified. |
| 6 | Reliability, monitoring, alerting, failure recovery | **NOT ASSESSED** | Recovery workflow FE tests still failing (TEST426 cluster in FE register). | No production alerting evidence attached. | SRE | Recovery tests green; runbooks + alerts for draft/signing/email. |
| 7 | Backup, restore, incident response, rollback | **NOT ASSESSED** | No backup/restore drill evidence in this pass. | — | SRE / Ops | Documented restore drill on staging with RPO/RTO. |
| 8 | Auditability and customer support | **PARTIAL / FAIL** | Explicit acceptance records persist `explicit_acceptance_v1` on redline/proposal paths; audit event coverage incomplete for all accept surfaces. | Need support-facing audit query path proven. | Agreements / Support | Acceptance + signing audit queryable per tenant. |
| 9 | Terms, privacy disclosures, AI/legal disclaimers, human-review | **NOT ASSESSED** | Not reviewed in this engineering pass. | — | Legal / Product | Counsel-approved copy on create/review/sign. |
| 10 | CI, deployment, migrations, release approval, rollback | **FAIL** | Required suites not green; uncommitted ~19k+ line candidate cannot bind immutable eval manifest. | No RC commit; CI would fail on current FE/BE totals. | Release Eng | Green CI on tagged RC; migration plan; rollback owner. |
| 11 | Product onboarding and critical customer journeys | **FAIL** | Entitlement paywall changes Guest/Genesis/Pro journeys; FE Paid Pro journeys heavily failing. | Create→review→sign not suite-proven end-to-end after entitlement cutover. | Product / QA | Journey tests + staging smoke green. |
| 12 | Draft-quality evidence, historical validation, independent legal review | **BLOCKED** | Packet completeness / H0 offline path closed; no paid gens authorized; parity gate closed. | Cannot score until live path parity + green suites + RC hash. | Draft Quality / Legal | See `LIVE_OFFLINE_PARITY.md` exit criteria. |

## Suite totals (this pass)

| Suite | Passed | Failed | Errors | Skipped | Total |
|---|---:|---:|---:|---:|---:|
| Backend (post-remediation) | 1294 | 22 | 0 | 1 | 1317 |
| Frontend (post-remediation) | 7593 | 528 | 0 | 0 | 8121 |

Baseline before this remediation pass: backend 1119/185 fail; frontend ~7595/526 fail.

## Quarantines

**None approved.** No skips added for security, money, tenant isolation, agreement integrity, or customer data.

## Paid evaluation authorization

**Denied** until:

1. Required release suites green except explicitly approved noncritical quarantines
2. Live/offline evaluation parity demonstrated
3. Change set reviewable and decomposed
4. Stable RC commit hash bound into immutable manifest
5. Separate API budget authorization
