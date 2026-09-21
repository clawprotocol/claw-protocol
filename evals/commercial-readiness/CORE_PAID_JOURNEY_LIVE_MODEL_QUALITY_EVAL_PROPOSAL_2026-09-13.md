# Bounded real-model quality evaluation — proposal only (not executed)

Prepared 2026-09-13 on `stabilize/phase3b-paid-entry` after the completion-event close.  
**Do not run until explicitly approved.** Stub output is not model-quality proof.

This expands `CORE_PAID_JOURNEY_LIVE_MODEL_PROPOSAL` (`maxPrimaryDraftCalls: 2`, `maxRepairCalls: 2`, `approvalRequired: true`) with a full call inventory, enforceable limits, and a dollar cap.

## Purpose

Assess **actual visible agreement quality and continuity** on a live premium model (`gpt-4o` via `resolve_llm_model_for_access_class("premium")`) for two named cases, through the existing paid create UI:

1. Harbor/Ironvale consulting — interview, then **review** (recipient approval / proposal / owner revision).
2. Named SaaS — interview, then **direct signing**.

Do not treat this as a launch gate. Do not combine it with stub-model workflow identities.

## Named cases

**Harbor Peak / Ironvale (existing)**  
`CORE_PAID_JOURNEY_SPARSE_INTAKE` then `CORE_PAID_JOURNEY_FILLED_INTAKE`. Expected facts stay Harbor Peak Analytics LLC (Consultant) / Maya Chen + Ironvale Manufacturing Inc. (Client) / Jordan Hale; $48,000; twelve months from October 1, 2026; Delaware; AI workflow; consultant owns pre-existing tools; client owns deliverables after payment.

**Orion Harbor / Northwind SaaS (named, already in-repo)**  
Sparse: `Need a SaaS subscription agreement`  
Filled (`PHASE4C1_COMPLETE_SAAS`): 12-month SaaS subscription between Orion Harbor LLC (Provider) and Northwind Retail Inc. (Customer); hosted platform access and standard onboarding; $48,000 annual, net 30; New York; hosted platform only — no professional services.

Do not invent Orion Labs / Contoso / Acme counterparties. `Orion Harbor LLC` is the established named SaaS fixture, not the forbidden `Orion Labs` label.

## Every model call that can fire

All live calls go through `call_legal_llm`. Premium class resolves to `CLAW_LLM_MODEL_PREMIUM` or default `gpt-4o`. Token prices used for the cap (OpenAI list, per 1M): input $2.50, cached input $1.25, output $10.00.

| # | HTTP / trigger | `call_purpose` | Default max output | When it fires on this eval |
|---|---|---|---|---|
| 1 | `POST /api/agreements/parse` (`ai_model_class=premium`) | `structured_extraction` | 1200 | Each intake submit (sparse + filled) |
| 2 | `POST /api/agreements/premium-missing-facts` | `missing_facts` | 900 (`CLAW_PREMIUM_MISSING_FACTS_MAX_TOKENS`) | Clarification / gap questions before full draft |
| 3 | `POST /api/agreements/premium-full-draft` primary | `agreement_drafting` | 8000 (`CLAW_PREMIUM_FULL_DRAFT_MAX_TOKENS`) | One authoritative draft per case |
| 4 | Same handler, JSON parse regen | `agreement_drafting` (`repair_status=regen`) | 8000 | Automatic, once, if primary is non-JSON and below substance floor |
| 5 | Same handler, quality/substance repair | `conditional_repair` | 8000 | Automatic, once, if quality/intent/substance grade fails |
| 6 | Same handler, leak-sanitize retry | `agreement_drafting` (`repair_status=retry`) | 8000 | Automatic, once, if returned text leaks dev context |
| 7 | User “Retry Pro draft” / `server_full_draft_retry` | `agreement_drafting` (+ possible 4–6) | 8000 | Manual only; count against primary budget |
| 8 | `POST /api/agreements/premium-refine` `action=update` | `explicit_revision` | 12000 | Only if owner refine UI is used (not required if A4 is server apply of a proposal) |
| 9 | Premium refine `ask_missing` / `ready` | `explicit_revision` | 2000 | Out of scope unless the live UI invokes them |
| 10 | Draft revise helper | `structured_revision` | route-specific (350–960+) | Out of scope unless a paid-create revision path calls it |
| 11 | Recipient negotiation / risk triage | `recipient_negotiation` | 768 | Harbor review proposal only, if that surface calls the model |
| 12 | `premium-review` / `finalize_audit` / `review_route` | `premium_review` / `finalize_audit` / `review_route` | 2000 / 3000 / 2200 | **Out of scope** — abort if they appear |
| 13 | Free one-pager / basic parse fallback | `free_one_pager` / basic parse | 1200 / 350 | **Out of scope** — paid eval stays premium; no silent basic downgrade |

Parsing is a model call. Clarifications are a model call. Automatic regen/repair/sanitize are model calls. Client retries are model calls. They all count.

## Proposed journey (after approval)

1. Isolated `CLAW_DATA_DIR`. `CLAW_LLM_ACCEPTANCE_STUB` unset/0. Record `requested_model`, `returned_model`, `call_purpose`, `repair_status`, prompt/completion/total tokens, and estimated USD per call.
2. Harbor: sparse → answer clarifications → filled intake → painted paper → review recipient approval; include proposal + owner revision only if those surfaces do not require extra uncapped refine calls.
3. SaaS: sparse → clarifications → filled intake → painted paper → **direct signing** (no mandatory review).
4. Judge **visible** article text (same Q1/Q2/I1–I3 contracts, plus role binding and no invented parties). Then judge continuity: refresh/dashboard reopen, and the chosen recipient path. Do not score stub chrome or length/hash alone.
5. Stop the process if any hard limit is hit. Do not click unbounded “Retry Pro draft.”

## Enforceable limits (approval card)

Implement as env guards around `call_legal_llm` for this eval only. Exceeding a limit must fail closed (no live call).

| Limit | Cap | Rationale |
|---|---|---|
| Cases | 2 | Harbor review + SaaS direct sign |
| `structured_extraction` | 4 | sparse+filled × 2 cases |
| `missing_facts` | 4 | same |
| Primary `agreement_drafting` without `repair_status` | 2 | one successful primary per case; matches existing proposal |
| Automatic `regen` + `repair` + `retry` | 2 total (`maxRepairCalls`) | existing proposal; do not allow the full 6-call automatic stack |
| User Retry Pro draft | 0 unless primary returned truncated/unavailable | extra primary would break the 2-call cap |
| `explicit_revision` / `structured_revision` | 2 | one Harbor owner revision if the UI needs it |
| `recipient_negotiation` | 1 | Harbor proposal only |
| `premium_review` / `finalize_audit` / `review_route` / `free_one_pager` | 0 | not part of this eval |
| **Total `call_legal_llm` invocations** | **16** | hard process abort |
| **Total estimated USD** | **$8.00** | hard abort; typical expected ~$2–5 at gpt-4o list rates |

Expected spend if both primaries pass without repair: about four parses + four missing-facts + two drafts ≈ $1–3.  
Worst allowed spend (two repairs, one revision, one negotiation, large prompts) should still stay under $8. If telemetry projects over $8 before a call, skip that call and mark the case `blocked`.

Abort immediately on: live email, Stripe, staging deploy, Settings/admin, Billing, sitemap work, or any model other than the configured premium chat model.

## Quality bar (live output only)

Pass only if both cases:

- Paint the declared parties, roles, fee, term, start (Harbor), governing law, and scope without inventing forbidden counterparties or `[insert]` / lorem / TBD filler.
- Do not remap Harbor↔Client or Orion Harbor↔Customer in the visible article.
- Keep the same paper through refresh and the chosen recipient path (review **or** direct sign).
- Distinguish receipt-pending from receipt-bound if a ceremony is completed; do not require a second signature to recover.

Date-line wrapping remains a known presentation issue (`date_line_broken`) and is not a quality pass by itself.

## Not claimed / not run

This document is a proposal. No live-provider calls were made. Acceptance-stub Harbor/Ironvale workflow proof remains the only executed customer-path evidence. Live-model quality remains **unproven**.

No launch claim.
