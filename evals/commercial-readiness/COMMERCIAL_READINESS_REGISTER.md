# LawDog commercial-readiness register

Authoritative repository: `lawdog-repo`  
Branch: `stabilize/phase3b-paid-entry`  
Register date: 2026-09-14 (America/Chicago) / 2026-09-14 UTC  
Candidate HEAD: `68775a946b09a48708fb4ef6eff55e327acea7ed`  
Official verified fingerprint: `185caa72f8f6a3c6c444dd22163afa65d032219b`  
Official identity: `68775a946b09a48708fb4ef6eff55e327acea7ed+src-185caa72f8f6a3c6c444dd22163afa65d032219b+run-20260914T143749Z-71780`  
Continuity implementation commit (same fingerprint): `22e2a03eeffd5785ca3284a1ec206a1d864e803e`

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
| Status | **C3 closed on this candidate** (desktop and mobile). **C4 closed on this candidate** (desktop and mobile), including customer-visible completion: snapshot-create POST, independent authorized GET, visible operative paper, and fresh-context editable reopen plus a supported edit action. Not a launch authorization. |
| Owner | unknown |
| Exit criterion | Independent desktop **and** mobile passes for `C3_fresh_context_editable_reopen` and `C4_resume_apply_after_dashboard_reset`, bound to server snapshot identity and the visible editable document. Source-string checks are not sufficient. **Met on `src-185caa72f8f6`.** |

## 2. Real-model output quality

| Field | Value |
|---|---|
| Customer impact | Harbor/Ironvale paper from the live model must be commercially usable, not only stub-shaped. |
| Evidence date/source | `LIVE_DRAFTING_BOUNDARY_REPAIR_CHECKPOINT_2026-09-13.md`. Ledger `evals/commercial-readiness/results/quality-eval-approved-20260913.sqlite3` inspected only (2026-09-14). Consulting retry produced named paper; SaaS live dispatch and recipient actions on real-model paper were not exercised. |
| Status | **not verified on this candidate.** Prior consulting retry is a technical drafting-path pass, not commercial acceptance. |
| Owner | unknown |
| Exit criterion | Every required live-eval bucket reconciled, including exhausted `primary` (2/2) and `bootstrap_parse` (2/2). Remaining dollars or other buckets do not authorize more calls. No live-testing proposal is open. |

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
| Customer impact | Opening “Effective Date” vs term start, and limited scope/acceptance detail (`undefined_acceptance_criteria`), can still confuse a paying customer. |
| Evidence date/source | Called out as remaining in `REVISION_ISOLATION_CHECKPOINT_2026-09-13.md` and earlier payment checkpoints. |
| Status | **not implemented** in this batch. Keep visible. |
| Owner | unknown |
| Exit criterion | Dedicated quality/acceptance-detail batch with Harbor evidence; do not hide these gaps behind stub 12/12 or C3-only passes. |

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
| `68775a94+src-185caa72f8f6+run-20260914T143749Z-71780` | Official 16/16 tests; 32/32 viewport rows; `gate_green=true`; C3 and C4 desktop+mobile closed | Live-model quality, billing, delivery launch, tenant/ops campaign, sitemap/claims |

Harbor filled intake remains: fixed $48,000, no invoicing schedule, no net-30. Official I2 stays party-name `agreement-intake-clarification`.
