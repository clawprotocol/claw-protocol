# LawDog commercial-readiness register

Authoritative repository: `lawdog-repo`  
Branch: `stabilize/phase3b-paid-entry`  
Register date: 2026-09-14 (America/Chicago) / 2026-09-14 UTC  
Live-eval increment proposal: `QUALITY_EVAL_INCREMENTAL_AUTHORIZATION_2026-09-14.md` (inactive sidecar prepared; not authorized, not executed)  
Continuity C3/C4 close: `68775a946b09a48708fb4ef6eff55e327acea7ed+src-185caa72f8f6a3c6c444dd22163afa65d032219b+run-20260914T143749Z-71780`  
Date/completion official identity: `96cd7248d803a8bdf2d8072ab409d242e6a255f5+src-ba7dbe25691bf522da2a95a9b68db31fbacc694b+run-20260914T155024Z-82989`  
Official verified fingerprint (C5 close, unchanged): `ba7dbe25691bf522da2a95a9b68db31fbacc694b`  
Customer-meaning offline identity: `quality-eval-offline-journey/20260914T220448Z-23971` (`OFFLINE_JOURNEY_PASS`, Harbor live-replay + SaaS stub). Prior passing offline `20260914T204736Z-13517` and `20260914T212614Z-18825` preserved.  
Official stub gate on this working tree: `d261556bfcf99cb7b6b1eaf6966f4fb583af7f11+src-1ddff56f95efd470971acff04d43eae0b3a1b85c+run-20260915T030701Z-59511` — **green** (18/18, `viewport_incomplete=0`, `gate_green=true`). C4, C5, payment-reload, and A1–B3 passed desktop+mobile, including final-page chrome title and `Fully signed (2 of 2)`. Historical green `src-64516accffb1` / `src-ff7d2316bb6a` / `src-60a08067992d` are preserved and **do not certify** these official hashed files. Failed official `run-20260915T030552Z-59051` (Playwright import parse; no tests run) is preserved. Credited prior three-/four-party approval/sign/final binding: `quality-eval-offline-journey/20260915T023527Z-54673` and `20260915T023759Z-55236`. Presentation rematches on this candidate: three-party `20260915T031303Z-60761`, four-party `20260915T031535Z-61160`, Harbor+SaaS `--case all` `20260915T032105Z-61873` (acceptance-stub; not official Harbor A1–B3; not fresh-model). Quality-eval `source_files_sha256` changes when campaign files are added — rematch `--offline-journey --case all` on the checkpoint tree before any later live run.  
Failed official dirs preserved (do not treat as closed): `6ebace85+src-33b6422e9e5d+run-20260914T205116Z-13943` (14/18; C4 + payment-reload), `c1792058+src-23cf8ee072e4+run-20260914T212958Z-19236` (10/18), `c1792058+src-ab06059f160c+run-20260914T215409Z-22195` (16/18; C5 only).  
Base HEAD: `c179205829e01242af694571452bd521ec6d61af`  
Customer-meaning commit: `d6a6b539e7c82dc7dcca8ee180e0664e3f3aae01`

This register is **not** a launch authorization. This batch cannot establish launch readiness. Status labels are reconciled against the latest official evidence; older pass/fail marks are not carried forward when the candidate or proof surface changed.

Legend:

- **closed on this candidate** — demonstrated on the current product source with preserved evidence
- **not verified on this candidate** — implemented or previously exercised, but not re-proven on this HEAD/fingerprint
- **not implemented** — no production path exists yet
- **product decision open** — behavior exists; changing it is out of scope until separately approved

Owners are unknown unless a checkpoint names one.

---

## 1. Returning-customer editor continuity

| Field | Value |
|---|---|
| Customer impact | A paying owner must reopen the saved agreement in a new browser and keep editing the latest paper. After a dashboard reset, they must finish a remaining payment answer with Apply — not merely keep a pending string in storage. |
| Evidence date/source | Official unfiltered stub gate `68775a946b09a48708fb4ef6eff55e327acea7ed+src-185caa72f8f6a3c6c444dd22163afa65d032219b+run-20260914T143749Z-71780`: Playwright **16/16** tests, **32/32** required viewport rows, `viewport_incomplete=0`, `gate_green=true`. Fingerprint unchanged before/after that run. C4 server persist was already demonstrated on the failed official run `68775a94+src-faecc6ebfd2f+run-20260914T044437Z-61434` (desktop `453d7ba8-…` / `crs_11ee0155…`; mobile `dfad3eeb-…` / `crs_ebfbd580…`; 2908 chars, monthly + net-60 + $48,000) and earlier `src-116906b6c009`. Failed C4 runs preserved (do not delete). |
| Status | **C3 historically closed** on `src-185caa72f8f6` / re-passed on `src-ba7dbe25691b`. **C4 historically closed** on `src-185caa72f8f6`. Those historical closes stay historical. Failed later fingerprints (`src-33b6422e9e5d`, `src-23cf8ee072e4`) are **not** closed. **C3 and C4 re-passed on the current fingerprint** `src-60a08067992d` (`run-20260914T220815Z-24500`, desktop C4 `96740c45-…` / `crs_ff6cf73e…`, 2924 chars, monthly + net-60). Not a launch authorization. |
| Owner | unknown |
| Exit criterion | Independent desktop **and** mobile passes for `C3_fresh_context_editable_reopen` and `C4_resume_apply_after_dashboard_reset`, bound to server snapshot identity and the visible editable document. Source-string checks are not sufficient. **Met on `src-185caa72f8f6`.** |

## 2. Real-model output quality

| Field | Value |
|---|---|
| Customer impact | Harbor/Ironvale paper from the live model must be commercially usable, not only stub-shaped. |
| Evidence date/source | Failed live increment `quality-eval-live/20260914T195201Z-5037` preserved. Current offline correction `quality-eval-offline-journey/20260914T220448Z-23971`: Harbor live-replay + SaaS stub, desktop+mobile, `model_calls=0`, `OFFLINE_JOURNEY_PASS`. Prior passing offline dirs preserved. Ledger inspected only. |
| Status | **offline customer-meaning correction verified** through the production path against captured Harbor bodies. **Fresh live Harbor + SaaS quality remains unverified.** Replay is not fresh-model evidence. Official stub gate on `src-60a08067992d` is green; that is not live-model quality. |
| Owner | unknown |
| Exit criterion | Separately authorized live `gpt-5.4` run of Harbor consulting and Orion Harbor/Northwind SaaS through production draft/clarification/display/reopen. Accept only if the opening does not invent an undefined Effective Date, consulting completion is asked or already supplied without invented milestones/SLAs, the SaaS control stays hosted-access-only, and `canProceedWithoutAnswer` remains true. Exhausted `primary` (2/2) and `bootstrap_parse` (2/2) block that run until a new approval. Remaining dollars do not authorize those buckets. |

Ledger snapshot (inspected, not modified): ceiling **$8.00** / stored ceiling `16000000`, model `gpt-5.4`, not halted, attempts **15**, known-usage **$0.366909**, reserved **$0.970711** (1,941,421 units), unknown-usage **0**. Buckets used: `primary` 3, `parse` 4, `bootstrap_parse` 3, `repair` 2, `bootstrap_one_pager` 3. Under the previous increment (sidecar still inactive): **1 primary remaining**, **0 repair remaining**, global 15/20 if attached. Do not execute or renew.

## 3. Billing and entitlements

| Field | Value |
|---|---|
| Customer impact | Paid create, checkout return, and entitlement gating must not charge or unlock the wrong workspace. |
| Evidence date/source | Phase 3B paid-entry / returning-paid checkpoints (2026-09-09). Not re-run on this HEAD. |
| Status | **not verified on this candidate.** Stripe, ledger writes, and hosted billing changes were not part of this batch and are **not implemented** as new work here. |
| Owner | unknown |
| Exit criterion | Isolated paid-entry proof plus a separately authorized live Stripe/entitlement pass. This batch must not alter the budget ledger. |

## 4. Delivery and signing

| Field | Value |
|---|---|
| Customer impact | Review recipients and direct signers must read the locked owner paper; owner final record must bind the same receipt. |
| Evidence date/source | Official 16/16 + 32/32 viewport rows on `src-185caa72f8f6` (`run-20260914T143749Z-71780`), including A1–A4 and B1–B3. Earlier 12/12 `b34bd2ab+src-3790aeb0` did not include C3/C4. |
| Status | **not verified on this candidate** as launch-ready. A1–A4 and B1–B3 passed as stub regressions on `src-60a08067992d`. Live email remains unauthorized. |
| Owner | unknown |
| Exit criterion | Official desktop/mobile rows A1–A4 and B1–B3 pass on the same fingerprint as closed C3/C4, without live email. |

## 5. Tenant and data protection

| Field | Value |
|---|---|
| Customer impact | Organization switch, revision isolation, and new-agreement clearing must not leak paper or payment answers across tenants or agreements. |
| Evidence date/source | `REVISION_ISOLATION_CHECKPOINT_2026-09-13.md`. Apply session-handler rebind refuses a different agreement’s live paper. New-agreement clearing remains intentional. |
| Status | **not verified on this candidate** as a dedicated tenant/data-protection campaign. Isolation helpers and new-agreement clearing remain regressions on `src-185caa72f8f6`; they are not a launch proof. |
| Owner | unknown |
| Exit criterion | Org-switch abort, superseded V1/V2 isolation, and “Create new agreement” clearing still pass. |

## 6. Operational recovery and support

| Field | Value |
|---|---|
| Customer impact | Failed retrieval/save and lost responses must stay honest; retries must not overwrite newer paper or claim completion. |
| Evidence date/source | Payment isolation + revision-isolation checkpoints. Create-resume now always GETs the canonical snapshot; Apply recoveries fail closed if intake/structured draft cannot be restored. |
| Status | Create-reopen recovery and Apply-after-reset customer completion are demonstrated on `src-185caa72f8f6`. Broader support console / sitemap / live-service ops are **not implemented**. |
| Owner | unknown |
| Exit criterion | Failed GET/save and lost-response paths remain fail-closed on the official fingerprint that closes C3 and C4. Admin/support surfaces require a later bounded batch. |

## 7. Launch-facing product and value claims

| Field | Value |
|---|---|
| Customer impact | Marketing, sitemap, and public value claims must not outrun proven product behavior. |
| Evidence date/source | `PHASE4A_PAID_SITEMAP_BROWSER_CHECKPOINT_2026-09-09.md`. Not continued in later paid-journey batches. |
| Status | **not implemented** as current work. **Not verified on this candidate.** |
| Owner | unknown |
| Exit criterion | Separate sitemap/claims batch after editor continuity and live-model quality are closed. |

## 8. Date and acceptance-detail gaps

| Field | Value |
|---|---|
| Customer impact | Opening Effective Date vs term start, and consulting completion meaning, must stay distinct facts. A keyword `undefined_acceptance_criteria` warning is not the defect. |
| Evidence date/source | Official unfiltered stub gate `96cd7248d803a8bdf2d8072ab409d242e6a255f5+src-ba7dbe25691bf522da2a95a9b68db31fbacc694b+run-20260914T155024Z-82989`: Playwright **18/18**, required viewport rows **34/34**, `gate_green=true`. Fingerprint unchanged before/after. C5 desktop `09db763d-…` / `crs_33f3831b…` and mobile `538874f3-…` / `crs_4d9f0af4…`, digest `ab5f44aa…`, 2903 chars, labeled Effective Date + completion sentence. Checkpoint: `PAID_DRAFT_DATE_COMPLETION_CHECKPOINT_2026-09-14.md`. Failed official runs preserved. |
| Status | **C5 historically closed** on `src-ba7dbe25691b` as stub-workflow + saved-response offline behavior. That historical close stays historical. Failed later fingerprints (`src-23cf8ee072e4`, `src-ab06059f160c`) are **not** closed. **C5 re-passed on the current fingerprint** `src-60a08067992d` (desktop `33738947-…` / `crs_bf2078d3…`, 2999 chars, labeled Effective Date + completion sentence). **Fresh live-model quality still unverified.** Not a launch authorization. `canProceedWithoutAnswer: true` unchanged. |
| Owner | unknown |
| Exit criterion | Desktop and mobile C5: missing-fact question, explicit answer, durable revision, visible paper, and fresh reopen agree; resolved questions do not reappear; SaaS control stays hosted-access-only. **Met on `src-ba7dbe25691b` for the stub path.** Live-model quality is a separate exit. |

## 9. Unresolved-payment signing policy

| Field | Value |
|---|---|
| Customer impact | Review, share, and sign remain available while payment timing is unanswered (`canProceedWithoutAnswer: true`). |
| Evidence date/source | Unchanged. Harbor filled intake still has no payment terms. Consulting notice/payment replay tests still pass. |
| Status | **product decision open.** This repair did not flip the flag. |
| Owner | unknown |
| Exit criterion | Separate product approval before requiring payment answers to proceed. |

---

## Official stub-workflow identities (do not collapse)

| Identity | What it proved | What it did not prove |
|---|---|---|
| `b34bd2ab+src-3790aeb0+run-20260914T025812Z-46358` | Implemented stub workflow 12/12 after revision isolation | Fresh-context editable create reopen; Apply after dashboard reset |
| `68775a94+src-0f2f34467a35+run-20260914T033222Z-51067` | Mandatory C3/C4 rows visible when failing (4 failed, viewport_incomplete=4) | C3/C4 customer outcomes |
| `68775a94+src-8b4e0af052f5+run-20260914T034149Z-52850` | C3 desktop+mobile pass; original 6×2 stub workflow still green | C4 Apply (`payment_clarification_apply_unavailable`) |
| `68775a94+src-116906b6c009+run-20260914T040331Z-56990` | C3 pass; C4 Apply persisted `crs_26c5bcb8…` monthly + “Payment is due net 60” on the same agreement | Official C4 row (visible-document poll timed out) |
| `68775a94+src-faecc6ebfd2f+run-20260914T044437Z-61434` | 14/16 tests; C3 desktop+mobile pass; C4 server persist 2908-char monthly+net-60+$48,000 | Official C4 row: unbounded optional-alert `textContent()` + `res.json().catch(() => ({}))` + substring snapshot-create match; 600000ms timeout |
| `68775a94+src-185caa72f8f6+run-20260914T143749Z-71780` | Official 16/16 tests; 32/32 viewport rows; `gate_green=true`; C3 and C4 desktop+mobile closed | Date/completion meaning; live-model quality; billing; delivery launch |
| `96cd7248+src-c0f5e6f9b4df+run-20260914T153730Z-80809` | 16/18; C3/C4 and payment-reload green; C5 panel mounted | C5 first-draft still invented undefined Effective Date |
| `96cd7248+src-ba7dbe25691b+run-20260914T155024Z-82989` | Official 18/18 tests; 34/34 required viewport rows; `gate_green=true`; C3/C4 kept; C5 desktop+mobile closed | Fresh live-model quality; hosted billing/authentication/delivery/ops; launch |
| `aaeabe9f+src-d80e4cdf9e82+run-20260914T181043Z-92178` | Official 18/18 stub **regression** after increment-reservation hook in `quality_eval_budget.py`; C3/C4/C5 customer outcomes still pass. Fingerprint changed; do not attribute the C5 close to this source automatically | Fresh live-model quality; increment sidecar still inactive; launch |
| `6ebace85+src-33b6422e9e5d+run-20260914T205116Z-13943` | C3 and C5 desktop+mobile still passed on the customer-meaning source. Fingerprint changed: `llm_router.py` now consults local live-replay before the acceptance stub (production never honors it; this run had replay unset and used stub papers) | Official **not green**: payment-reload and C4 desktop+mobile failed (14/18, `viewport_incomplete=2`). Do not treat C4 as closed on this fingerprint. Fresh live quality; hosted readiness |
| `c1792058+src-23cf8ee072e4+run-20260914T212958Z-19236` | Payment-reload desktop+mobile passed. C4 snapshot-create POSTed | Official **not green** (10/18). C4 visible fees stayed pending; A1–A4 minted only the owner review token; C5 Apply 503 empty premium-full-draft. Not closed. |
| `c1792058+src-ab06059f160c+run-20260914T215409Z-22195` | 16/18; C4, payment-reload, A1–A4 desktop+mobile passed | Official **not green**: C5 desktop+mobile `waitForResponse` on snapshot-create; uvicorn `premium-full-draft-empty-output-forbidden` 503. Not closed. |
| `c1792058+src-60a08067992d+run-20260914T220815Z-24500` | Official 18/18 tests; required viewport rows complete; `gate_green=true`; C3/C4/C5 and payment-reload desktop+mobile passed on the uncommitted customer-meaning tree | Fresh live-model quality; hosted billing/authentication/delivery/ops; launch. **Does not certify later product-file changes.** |
| `d261556bfcf9+src-ff7d2316bb6a+run-20260914T232443Z-34707` | Official rematch after applied-revision authority / payer-confirmation / snapshot confirmed-answer files changed: 18/18, `viewport_incomplete=0`, `gate_green=true`; C3/C4/C5 and payment-reload desktop+mobile | Fresh live-model quality; three-/four-party browser generation; four-party recipient/final docs; hosted billing/authentication/delivery/ops; launch |

Harbor filled intake remains: fixed $48,000, no invoicing schedule, no net-30. Official I2 stays party-name `agreement-intake-clarification`.

---

## 10. Finite release queue (supportable paid release)

This queue is the remaining customer-facing work. Items are not launch claims. Reuse existing evidence; defer nonessential polish. C3/C4/C5 stub closes stay closed unless new regression evidence appears.

| ID | Customer outcome | Kind | Next action | Observable exit |
|---|---|---|---|---|
| Q1 | Live two-to-four-party paper is commercially usable through intake → draft → clarification where needed → Apply → snapshot-create → authorized GET → visible paper → fresh editable reopen | **offline two-party correction verified** on `20260914T220448Z-23971`. **Official rematch** `src-ff7d2316bb6a` 18/18. **Applied four-party persist** and **four local review recipients** demonstrated on `20260914T234030Z-36986`. **Generated body is not payer confirmation.** **Browser generate → question → Apply** for four-party not demonstrated. **Four-party sign/final receipt not demonstrated** (0 sign tokens). **TEST465 remains mocked**; official A1–B3 is two-party Harbor only. **Live Harbor sample still failed** (`20260914T195201Z-5037`). Three- and four-party **fresh-model** quality is **not verified**. | Preserve live, offline, official, and persist dirs. Next live eval is the four-sample card in `QUALITY_EVAL_NEXT_LIVE_AUTHORIZATION_PREPARED_2026-09-14.md` (`--case release_scope`). Do not activate or renew the 2026-09-14 inactive sidecar. Two-party green does not close three- or four-party readiness. | All four *fresh-model* papers meet the campaign quality bar, tracked separately by party count; same agreement/snapshot identity; `canProceedWithoutAnswer` unchanged. Not launch. |
| Q2 | Hosted authentication: a paying owner can sign in and reach paid Create without a synthetic local JWT | **partial on older staging `160079e`** (admin-assisted test login → dashboard → paid Create → resume `49d15cdc` → reload → logout). Local session lifecycle is not on that deploy. Customer-initiated magic-link/email login remains unverified. | After this candidate is deployed to staging, repeat the hosted session pass on the new revision. Cross-account isolation still needs a second authorized session. | Real hosted session on the candidate opens `/app/create` and sees intake; no provider drafting required |
| Q3 | Paid access / billing: checkout return unlocks the correct workspace only | **missing evidence** (Phase 3B not re-run on this HEAD) | Separately authorized Stripe/entitlement pass; no ledger rewrite | Checkout return entitles the owner org only; wrong-org remains blocked |
| Q4 | Recipient delivery: review or direct-sign recipients read the locked owner paper | **missing evidence** as launch-ready; A1–B3 passed as stub regressions on `src-185caa72f8f6` / re-passed on `src-ba7dbe25691b` | After Q1, reuse stub A/B rows; live email remains unauthorized | Official A1–B3 still green on the current fingerprint; live email is a later increment |
| Q5 | Final documents: owner final record binds the same receipt the recipient signed | **local stub presentation rematched** for 2/3/4-party chrome title + required-signer status; **not launch-ready** | Same as Q4; do not add sitemap/marketing work | Owner final view shows the locked corpus, corpus heading, required-signer status, and receipt id |
| Q6 | Tenant isolation: org switch, revision isolation, and new-agreement clearing do not leak paper or answers | **missing evidence** as a dedicated campaign; helpers exist | One local isolation check (no provider spend) while Q1 is pending; later hosted org-switch | Org-switch abort, V1/V2 isolation, and Create-new clearing still pass |
| Q7 | Essential operational recovery: failed GET/save and lost Apply stay fail-closed | **missing evidence** beyond C3/C4 create-reopen | Keep C3/C4 closed; add support-console only if a reproduced defect appears | Failed GET/Apply remain fail-closed; no silent empty JSON |
| Q8 | Manual-edit recovery after reopen | **missing evidence** | Defer until Q1 live pass; mark unverified until directly exercised | Owner can edit, cancel/restore, and keep the same snapshot identity |
| P1 | Require payment answers before review/sign (`canProceedWithoutAnswer: false`) | **product decision** | Do not change the flag in this queue | Separate product approval |
| D1 | Date-line wrapping (`October 1,\\n2026`) | **product decision** / presentation | Defer; not a quality pass by itself | Separate display batch |

Kinds: **reproduced defect** = failing official evidence on current behavior; **missing evidence** = not proven on the needed surface; **product decision** = behavior exists and must not be changed without approval.

Nonessential items deferred: public sitemap/value claims (register §7), admin/support console beyond fail-closed recovery, extra agreement families, live recipient email.

---

## 11. Release-scope qualification (2–4 parties, U.S. law)

| Field | Value |
|---|---|
| Customer impact | A paying owner must reach a commercially usable agreement for two, three, or four legal parties under the selected U.S. jurisdiction, without special prompt wording or engineering repair. |
| Evidence date/source | Campaign `RELEASE_SCOPE_QUALIFICATION_CAMPAIGN_2026-09-14.md`. Official rematch `src-1ddff56f95ef` / `run-20260915T030701Z-59511` (18/18). Historical official `src-64516accffb1` / `src-ff7d2316bb6a` / `src-60a08067992d` preserved and do not certify these files. Presentation rematches: three-party `20260915T031303Z-60761`, four-party `20260915T031535Z-61160`, Harbor+SaaS `20260915T032105Z-61873`. Credited prior binding runs `20260915T023527Z-54673` / `20260915T023759Z-55236`. Fresh-model authorization prepared, not executed. |
| Status | **two-party official stub rematched** on `src-1ddff56f95ef` including final chrome title and `2 of 2`. **Local 3-/4-party approval/sign/final binding credited** on `54673` / `55236`. **Final-page title and required-signer chrome rematched** on `60761` / `61160` (same stub digests; corpus heading over stale JV draft title; required signers from legal-party rows, not completed count). TEST465 stays mocked. **fresh-model quality unverified.** **hosted auth/billing/email remaining.** Not launch. |
| Owner | unknown |
| Exit criterion | Separate two-, three-, and four-party fresh-model passes on the campaign facts, plus hosted Q2–Q5. A two-party Harbor/SaaS pass is not the exit. |

