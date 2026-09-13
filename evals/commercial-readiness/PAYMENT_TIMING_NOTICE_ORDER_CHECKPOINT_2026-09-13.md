# Payment-timing clarification and notice-order checkpoint — 2026-09-13

Authoritative repository: `lawdog-repo`  
Branch: `stabilize/phase3b-paid-entry`  
Started from exact HEAD: `290b4339` (`290b43397800f2e47ed23419f2de43937eb21e9b`) — drafting-boundary repair. Working tree matched that commit except untracked `evals/commercial-readiness/results/`. Nothing was reset or overwritten. Nothing was pushed.

This is **not** a launch authorization and is **not** a live-model quality pass.

## Official stub workflow identity

`290b43397800f2e47ed23419f2de43937eb21e9b+src-9837bb383f5bf6a0fc4edcfdc70e4356fec4ee42+run-20260913T233709Z-15303`

Evidence (not committed):

`evals/commercial-readiness/results/core-paid-journey-acceptance/290b43397800-src-9837bb383f5b-live-4188-4189-stub-model-run-20260913T233709Z-15303`

Saved live consulting replay source (unchanged, offline only):

`evals/commercial-readiness/results/quality-eval-live/20260913T231438Z-12993/`

Harbor filled intake is unchanged: fixed $48,000, no invoicing schedule, no net-30.

## Defects repaired

1. **Invented payment timing.** The saved consulting draft presented installment invoicing and net-30 as agreed facts while `missing_material_info`, `missing_material_terms`, and `recommended_questions` were empty. The model omitted the unknown; quality review did not compare fee amount to supplied timing; repair did not receive `user_gap_answers`; the frontend treated invented body words (`fee` / `invoice` / `thirty days`) as enough to suppress the question.

   Shared deterministic post-pass now strips invented timing from the Fees/Payment section only and appends a visible question: `How should the fixed fee be invoiced, and when is payment due?` Long bodies stay authoritative (`needs_details` / recommended clarifications). Confirmed gap answers keep the draft language and are not re-asked. Repair payloads now forward `user_gap_answers`. Frontend material questions key off intake + confirmed answers, not invented body text. `canProceedWithoutAnswer` remains true so review/direct-sign readiness is unchanged.

2. **Notice numbering.** Working-draft hydrate appended `13. NOTICES` after §12, then `relocateMisplacedNoticesSectionBeforeGoverningLaw` always moved it in front of Governing Law, producing visible `13` before `11`/`12`. Relocate now moves a notices heading only when its number is lower than Governing Law (the existing `11` after `12`/`13` case). Missing headings insert at the first `If to`, not at Governing Law. Accepted/signed paper is not rewritten; reads/reloads stay on the existing SoT passthrough.

No parallel drafting pipeline. Accepted/signed bytes are not mutated by this repair.

## Focused proof

| Check | Result |
|---|---|
| Saved live JSON still invents timing and asks nothing | reproduced |
| Missing timing → clarification; installment / invoice-due language stripped; $48,000 and termination 30-day cure kept | pass |
| Supplied timing retained and not re-asked | pass |
| Automatic-repair body still surfaces the question | pass |
| Repair payload forwards gap answers | pass |
| Production `POST /premium-full-draft` offline replay (monkeypatched LLM, no network) | pass |
| Acceptance-stub `net thirty` is not treated as agreed | pass |
| Working-draft hydrate: coherent section order; emails, parties, signer blocks kept; second hydrate idempotent | pass |
| Accepted visible paper (`13` before `11`) unchanged after polish/reload | pass |
| Harbor filled intake still has no payment timing | pass |

`backend/tests/test_unconfirmed_payment_timing_replay.py`: **7 passed**  
Focused vitest (saved replay + notice details + family regression): **32 passed**

## Verification on final product source

| Check | Result |
|---|---|
| Official desktop/mobile core gate | **10/10 tests**, required rows complete, `gate_green=True`, exit 0 |
| Core matrix/authority unit checks | **19/19** |
| Production `tsc -b && vite build` | passed |
| Full frontend suite | not rerun |

`test_premium_full_draft_invokes_repair_on_quality_fail` still returns 503 `agreement_validation_failed` for the thin logo fixture after the earlier validation-withhold boundary. That assertion was not weakened.

## Ledger (inspected, not modified)

File: `evals/commercial-readiness/results/quality-eval-approved-20260913.sqlite3`

| Item | Value |
|---|---|
| Ceiling | **$8.00**, model `gpt-5.4`, not halted |
| Total attempts | **11 / 16**, remaining **5** |
| Known-usage cost upper | **$0.249751** |
| Reserved upper | **$0.611731** |
| Unknown-usage attempts | **0** |

| Bucket | Used | Cap | Remaining |
|---|---|---|---|
| parse | 3 | 4 | 1 |
| clarification | 0 | 4 | 4 |
| **primary** | **2** | **2** | **0** |
| repair | 1 | 2 | 1 |
| revision | 0 | 2 | 2 |
| negotiation | 0 | 1 | 1 |
| bootstrap_parse | 2 | 2 | 0 |
| bootstrap_one_pager | 3 | 4 | 1 |

Provider spending did **not** increase. No live model calls, Stripe, email, push, or deploy.

## Attempt-cap proposal (not applied)

The two planned **primary** attempts are exhausted. Do not increase limits, reset counters, or relabel attempts without explicit approval. If another live consulting/SaaS **primary** is later required, the needed change is `LIMITS["primary"]` **2 → 3** in `backend/quality_eval_budget.py` (one additional primary only). Repair still has 1 remaining. This proposal is not an approval.

## Remaining defects

- Live-model quality remains unproven except the prior consulting retry, which still is not commercial acceptance. SaaS live dispatch and recipient actions on real-model paper were not exercised.
- Opening “Effective Date” vs term start date, and limited scope/acceptance detail (`undefined_acceptance_criteria`), were out of this repair.
- Settings/admin, sitemap, full-suite cleanup, and live-service testing were not started.

No launch claim.
