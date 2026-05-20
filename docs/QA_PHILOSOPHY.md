# LawDog GTM QA — Testing Philosophy

This document defines **how** we test before Genesis launch. It complements the **what** in `QA_MATRIX.md`, `GTM_SCENARIOS.md`, and `MANUAL_QA_RUNBOOK.md`.

---

## Core belief: test the AHA moment, not the feature list

LawDog wins when a user feels:

> “This understood my messy situation and gave me something I’d actually sign.”

QA should prioritize **felt outcomes** over checkbox feature coverage. A flow can pass every technical step and still fail GTM if the premium draft feels generic, timid, or untrustworthy.

---

## Emotional realism

Real users do not write legal memos. They write:

- half-sentences at 11pm on mobile
- contradictions (“non-exclusive” then “exclusive worldwide”)
- emotional subtext (“my ex-business partner is ghosting me”)
- wrong jurisdiction guesses
- copy-paste from ChatGPT that conflicts with their first paragraph

**Fixture prompts** in `qa/fixtures/` exist to reproduce this. Manual testers should read prompts aloud as if texting a friend — if it sounds too polished, add friction.

---

## Mobile-first assumptions

GTM traffic skews mobile Safari/Chrome. Assume:

- soft keyboards resize the intake textarea
- checkout return URLs open in new tabs
- recipient links are opened on phone without a desktop second monitor
- PDF/export is reviewed on a small screen

Desktop-only QA misses the highest-risk signing and checkout paths.

---

## Anonymous friction minimization

The default path is **anonymous create → value → optional upgrade**. QA must verify:

- no auth wall before first draft value
- free tier is usable without explaining tiers
- upgrade appears as acceleration, not punishment
- post-checkout restore does not lose draft context

Any step that forces account creation before perceived value is a **GTM defect**, not a “later” issue.

---

## Recipient virality importance

Many agreements fail at the **recipient**, not the drafter. Test:

- link open cold (no LawDog account)
- clarity of what they’re being asked to do
- trust cues (who sent this, what happens if they sign)
- review/suggest-edit flows without intimidating legal jargon
- signing continuity after review

A beautiful owner draft that confuses recipients fails virality.

---

## Premium differentiation focus

Free must feel **complete enough to trust for simple cases**. Pro must feel **materially smarter** on:

- ambiguity resolution
- party/term completeness
- industry-appropriate clauses
- polish (recitals, defined terms, signature blocks)

QA should explicitly score premium using `PREMIUM_AHA_RUBRIC.md` side-by-side with the same prompt on free (where applicable).

---

## Checkout continuity

Stripe redirects break user mental models. Treat as first-class:

- return URL preserves agreement id and tier intent
- premium hydration after payment (no “starter text flash”)
- browser back/forward during checkout
- network retry / API degraded banners

---

## Failure recovery over happy-path-only

Production users hit: API 503, OpenAI timeout, webhook delay, stale tabs, double-click pay. QA matrices include **Failure Recovery** rows — a passing happy path with no recovery story is incomplete.

---

## Scope discipline for this QA system

| In scope | Out of scope |
|----------|----------------|
| Manual matrices, rubrics, fixtures, runbooks | Enterprise QA platforms |
| Lightweight result templates | New analytics vendors |
| Reuse of existing smoke scripts | CI redesign |
| Documented pass/fail tracking | Product/pricing changes |

---

## Related docs

| Doc | Purpose |
|-----|---------|
| `QA_MATRIX.md` | Master pass/fail matrices |
| `GTM_SCENARIOS.md` | 40+ realistic scenario library |
| `PREMIUM_AHA_RUBRIC.md` | 1–5 scoring for premium feel |
| `MANUAL_QA_RUNBOOK.md` | Step-by-step execution |
| `RELEASE_CHECKLIST.md` | Post-deploy infra smoke |
| `qa/fixtures/` | Reusable synthetic prompts |
