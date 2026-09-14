# Release-scope qualification campaign — prepared 2026-09-14

Fixed requirements: **two to four legal parties, four maximum, U.S. law.**  
Two-party Harbor/SaaS success does not establish three- or four-party readiness. States are not interchangeable.

This campaign reuses the current quality-eval runner and existing fixtures. It does not replace official or quality-eval infrastructure.

Machine-readable facts: `frontend/src/launch/releaseScopeQualificationCampaign.ts`.

## Bound

Four filled samples only:

| Order | Sample | Legal parties | Fixture reused | Governing law |
|---|---|---|---|---|
| 1 | two-party consulting | Harbor Peak Analytics LLC; Ironvale Manufacturing Inc. | `CORE_PAID_JOURNEY_FILLED_INTAKE` | Delaware |
| 2 | two-party SaaS | Orion Harbor LLC; Northwind Retail Inc. | existing quality-eval SaaS filled intake | New York |
| 3 | three-party IP license / royalty | Stonebridge Wellness LLC; NovaPath Learning Inc.; ClearSpring Distribution LLC | `TEST490_THREE_PARTY_REVENUE_SHARE_INTAKE` + `TEST477_THREE_PARTY` signers | Oklahoma |
| 4 | four-party precision-medicine platform | Lumen Bioinformatics Inc.; Thalassa Data Systems LLC; Coastal Meridian Analytics LLC; Vanguard Regulatory Sciences Ltd. | `TEST487_PRODUCTION_INTAKE` | Massachusetts |

Sparse Harbor/SaaS interview remains offline-only. Do not add a fifth sample, extra families, or a new harness.

## Expected facts defined before output evaluation

### 1. Two-party consulting

- Consultant: Harbor Peak Analytics LLC — AI workflow implementation; keeps pre-existing tools; signer Maya Chen.
- Client: Ironvale Manufacturing Inc. — owns deliverables after payment; signer Jordan Hale.
- Economics: $48,000 fixed fee. Term: twelve months starting October 1, 2026.
- Law: Delaware.
- Authorized clarification if asked: Effective Date is the October 1, 2026 service start; completion is Client's written confirmation that the implemented AI workflow is in operational use.
- Do not invent milestones, SLAs, CRM/sales work, or an undefined Effective Date.

### 2. Two-party SaaS

- Provider: Orion Harbor LLC — hosted platform access and standard onboarding only; no professional services; signer Avery Cole.
- Customer: Northwind Retail Inc. — hosted access only; signer Casey Reed.
- Economics: $48,000 annually, net 30. Term: twelve months.
- Law: New York.
- Do not invent consulting deliverables, project acceptance, or a changed net term.

### 3. Three-party IP license and royalty

- Stonebridge Wellness LLC — owns original wellness videos and written course materials; grants adaptation/hosting rights; keeps original-content ownership; **45%** of subscription revenue; signer Sandra Wells.
- NovaPath Learning Inc. — adapts and hosts the materials; owns platform code and its improvements; **35%**; signer Caleb Price.
- ClearSpring Distribution LLC — markets and sells subscriptions; handles sales, customer contracts, billing, and account management; **20%**; signer Maya Coleman.
- Coordinator is **not** a party, signer, notice recipient, or beneficiary.
- Law: Oklahoma.
- Do not invent a fourth legal party, substitute Delaware/New York/Massachusetts, or collapse the three roles into one provider.

### 4. Four-party precision-medicine platform

- Lumen Bioinformatics Inc. (Platform Developer) — $250,000 execution / $400,000 alpha / $350,000 validation acceptance; signer Dr. Elena Vasquez.
- Thalassa Data Systems LLC (Data Infrastructure Provider) — $180,000 pipeline readiness / $220,000 production cutover; signer Marcus Webb.
- Coastal Meridian Analytics LLC (Analytics Integrator) — $150,000 analytics delivery / $175,000 UAT; signer Priya Nair.
- Vanguard Regulatory Sciences Ltd. (Regulatory Compliance Advisor) — $95,000 regulatory gap assessment / $105,000 audit readiness; signer James O'Sullivan. U.S. notice address is Harrisburg, Pennsylvania.
- Term: 24 months with two optional 12-month renewals. Total $1,925,000.
- Law: Massachusetts.
- Keep distinct mailing vs notice addresses. Do not invent North Star / Harbor / Stonebridge parties or substitute Oklahoma/Delaware/New York.

## Production path to exercise

For every sample, the authentic paid path is:

intake → clarification where production asks → visible paper → save / snapshot-create → fresh-session reopen → local recipient participation → final-document consistency.

Recipient contexts stay **local** until hosted delivery is separately authorized. Official I2 stays party-name `agreement-intake-clarification`. `canProceedWithoutAnswer: true` is unchanged.

Do not reshape production model, inputs, outputs, clarification, or repair to fit evaluation limits.

## What each result class establishes

| Evidence | Establishes | Does not establish |
|---|---|---|
| Official stub `c1792058+src-60a08067992d+run-20260914T220815Z-24500` | Two-party Harbor **local workflow** including clarification, visible paper, save, reopen, local recipient A1–B3, C3–C5 | Three- or four-party workflow; fresh-model quality; hosted auth/billing/email |
| Offline `quality-eval-offline-journey/20260914T220448Z-23971` | Two-party Harbor **live-replay** + SaaS **stub** local workflow; `model_calls=0` | Fresh-model quality; three- or four-party drafting |
| Existing TEST477 / TEST487 / TEST429 / TEST465 tests | Three- and four-party **local** identity, corpus, signer, and recipient-isolation helpers | Browser production path; fresh-model quality |
| Later authorized `--live --case release_scope` | Fresh `gpt-5.4` drafting quality for all four samples, including conditional repair if production fires it | Hosted authentication, Stripe, live email, staging |
| Hosted Q2–Q5 | Still remaining | Not part of this campaign |

`--case all` remains the Harbor + SaaS pair so existing offline rematch stays valid. `--case release_scope` is the four-sample live mode. Offline journey refuses three-party, four-party, and `release_scope` because there is no matching stub/replay for those intakes.

## No-spend work in this batch

- Checkpoint the green customer-meaning tree and these instructions locally; do not push.
- Define the four-sample facts before evaluating three- or four-party outputs.
- Reuse the current runner; add case selection only.
- Preserve official 18/18 and existing two-party regressions.
- Run existing three- / four-party focused tests plus campaign fact/paper checks.
- TEST465 four-party field isolation still runs; its later dashboard `signedCount` assertion currently fails because `recordVs01SignerCompletion` now requires a confirmed server completion payload the test mock does not supply. That is leftover VS01 completion-confirmation drift, not a new campaign harness. Official two-party A1–B3 remains the local recipient proof. Do not treat TEST465 as a four-party recipient close.
- Prepare — do not execute — one fresh-model authorization that covers the actual four-sample inventory and conditional repair.

## Do not

- Execute `--live`, activate or renew `quality-eval-increment-20260914.inactive.json`, or raise `LIMITS`.
- Push, deploy, mutate hosted state, or send live email.
- Treat two-party green as release-scope complete.
- Invent a replacement official four-party Playwright gate in this campaign.
