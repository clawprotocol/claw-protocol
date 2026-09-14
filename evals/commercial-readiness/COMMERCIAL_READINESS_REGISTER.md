# LawDog commercial-readiness register

Authoritative repository: `lawdog-repo`  
Branch: `stabilize/phase3b-paid-entry`  
Register date: 2026-09-14 (America/Chicago) / 2026-09-14 UTC  
Continuity C3/C4 close: `68775a946b09a48708fb4ef6eff55e327acea7ed+src-185caa72f8f6a3c6c444dd22163afa65d032219b+run-20260914T143749Z-71780`  
Date/completion official identity: `96cd7248d803a8bdf2d8072ab409d242e6a255f5+src-ba7dbe25691bf522da2a95a9b68db31fbacc694b+run-20260914T155024Z-82989`  
Official verified fingerprint (this batch): `ba7dbe25691bf522da2a95a9b68db31fbacc694b`  
Candidate HEAD at official run: `96cd7248d803a8bdf2d8072ab409d242e6a255f5`  
Implementation commit (same fingerprint): `95ebe9525041e9e62436bd6e49e7bcb4440ef487`

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
| Status | **C3 closed on this candidate** (desktop and mobile). **C4 closed on this candidate** (desktop and mobile), including customer-visible completion: snapshot-create POST, independent authorized GET, visible operative paper, and fresh-context editable reopen plus a supported edit action. Re-passed as regressions on `src-ba7dbe25691b`. Not a launch authorization. |
| Owner | unknown |
| Exit criterion | Independent desktop **and** mobile passes for `C3_fresh_context_editable_reopen` and `C4_resume_apply_after_dashboard_reset`, bound to server snapshot identity and the visible editable document. Source-string checks are not sufficient. **Met on `src-185caa72f8f6`.** |

## 2. Real-model output quality

| Field | Value |
|---|---|
| Customer impact | Harbor/Ironvale paper from the live model must be commercially usable, not only stub-shaped. |
| Evidence date/source | `LIVE_DRAFTING_BOUNDARY_REPAIR_CHECKPOINT_2026-09-13.md`. Ledger `evals/commercial-readiness/results/quality-eval-approved-20260913.sqlite3` inspected only (2026-09-14). Consulting retry produced named paper; SaaS live dispatch and recipient actions on real-model paper were not exercised. |
| Status | **not verified on this candidate.** Prior consulting retry is a technical drafting-path pass, not commercial acceptance. Fresh live Harbor + SaaS quality is the next bounded evaluation; it is not authorized by this batch. |
| Owner | unknown |
| Exit criterion | Separately authorized live `gpt-5.4` run of Harbor consulting and Orion Harbor/Northwind SaaS through production draft/clarification/display/reopen. Accept only if the opening does not invent an undefined Effective Date, consulting completion is asked or already supplied without invented milestones/SLAs, the SaaS control stays hosted-access-only, and `canProceedWithoutAnswer` remains true. Exhausted `primary` (2/2) and `bootstrap_parse` (2/2) block that run until a new approval. Remaining dollars do not authorize those buckets. |

Ledger snapshot (inspected, not modified): ceiling **$8.00** / stored ceiling `16000000`, model `gpt-5.4`, not halted, attempts **11/16**, known-usage **$0.249751**, reserved **$0.611731**, unknown-usage **0**. `primary` 2/2 and `bootstrap_parse` 2/2 exhausted.

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
| Status | **not verified on this candidate** as launch-ready. Review/direct-sign wording and accepted/signed immutability were not changed in this repair; those rows passed as regressions on the C4-closing fingerprint. |
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
| Status | **C5 closed on this candidate** as stub-workflow + saved-response offline behavior. **Fresh live-model quality still unverified.** Hosted billing/authentication/delivery/ops still require their own evidence. Not a launch authorization. `canProceedWithoutAnswer: true` unchanged. |
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

Harbor filled intake remains: fixed $48,000, no invoicing schedule, no net-30. Official I2 stays party-name `agreement-intake-clarification`.

