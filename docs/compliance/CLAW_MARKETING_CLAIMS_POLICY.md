# CLAW marketing claims policy (draft — **counsel review required**)

Internal guardrail for public copy. This is not legal advice for CLAW’s own marketing—engage counsel before launch campaigns.

## Approved themes

- Workflow, execution, records, receipts, verification links, audit-friendliness, speed, clarity of UX.
- “Informational” / “classification support” for AI-adjacent features, with explicit “not legal advice.”
- Honest comparison to seat-based e-sign on **pricing model**, not on legal effect.

## Prohibited or restricted

- “Fully compliant,” “instant compliance,” “court-approved,” “bulletproof,” “court-proof.”
- “Legally binding in all jurisdictions / all 50 states” (unless counsel-approved with narrow, sourced conditions).
- “Replaces your lawyer,” “attorney review included,” or implying an attorney–client relationship.
- Guarantees of enforceability, outcome, or suitability for a specific matter without qualification.
- Notarization claims unless a real notary workflow exists and is described accurately.

## Required adjacent language (material contexts)

Where features touch agreements, e-sign, or legal-adjacent AI:

- CLAW is **not a law firm** and does **not** provide **legal advice**.
- Use of CLAW does **not** create an **attorney–client relationship**.
- Suitability and enforceability can depend on **facts, jurisdiction, and counsel review**.

## Competitors

- Name competitors only with factual, non-misleading comparisons.
- Do not imply feature parity where it does not exist.

## Social proof

- Testimonials, badges, and rankings require substantiation and context; avoid cherry-picking.

## Implementation reference

- Forbidden substring list: `frontend/src/launch/pricingContent.ts` (`FORBIDDEN_PUBLIC_CLAIMS`).
- Pricing page aggregate guard: `frontend/src/launch/pricingCompliance.test.ts`.
