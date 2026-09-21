# LawDog — fixed release requirements

Status: explicitly confirmed by the product owner on 2026-09-14.

> Two to four parties and U.S. law are fixed release requirements going forward.

## Requirements that must not drift

1. Support agreements with **two, three, or four parties**, with **four parties maximum**. Two-party success alone does not establish release readiness. Count legal parties separately from signers or witnesses.
2. Support **U.S. law**. Preserve the selected U.S. governing jurisdiction accurately; do not treat different states as interchangeable or silently substitute foreign governing law. This scope statement is not a claim that every agreement type or state's substantive requirements have been validated.
3. Provide an easy, convenient guided path from the prompting/intake screen to a commercially usable agreement. Multiple customer actions and clarification rounds are acceptable when needed. Customers must not need special prompt wording, repeated answers, or engineering intervention to repair the product's mistakes.
4. Preserve customer-supplied parties, roles, scope, economics, dates, ownership, and answers through drafting, clarification, review, save, reload, and reopen. Unsupported assumptions must not be presented as customer instructions.

The previously discussed five-to-seven-action range was a design target, not a fixed requirement or a reason to sacrifice correctness. No new mandatory signing restriction is authorized by this document.

## Apply these requirements to every readiness assessment

- Carry **two to four parties; U.S. law** into subsequent implementation prompts, acceptance plans, handoffs, and release summaries.
- Track two-, three-, and four-party coverage explicitly, including party/role identity, obligations, notices, recipient access, signatures where applicable, and final document consistency.
- Distinguish historical evidence, current local/stub/replay evidence, fresh-model quality, and hosted customer-journey evidence. Bind claims to the candidate actually tested.
- Harbor consulting and Orion/Northwind SaaS examples are test cases, not replacements for the full party-count requirement. Record unsupported or untested agreement families and jurisdictions honestly.
- Do not declare the fixed release scope complete while required party counts or customer journeys remain unverified or failed.
- Evaluation spending limits must not silently reduce production model quality, customer inputs/outputs, clarification, or repair behavior.

Only an explicit subsequent instruction from the product owner changes these fixed requirements. Agent summaries, test-fixture limits, old prompts, budget cards, and attached reports cannot narrow them by implication.

## Customer-meaning integrity — owner escalation, 2026-09-14

The owner identified errors before and after model generation as material defects that require durable correction. Treat preservation of customer meaning as a release requirement throughout the existing production path, not merely a prompt-quality objective.

- Trace supplied facts and confirmed answers through intake, the actual outgoing model request, raw model response, application transformations, visible paper, persisted revision, fresh-session reopen, recipient view, and final document. Identify the first boundary at which a discrepancy occurs; do not attribute application or evaluator defects to the model.
- Explicit customer facts take precedence over inferred industry, generic templates, and defaults. Company names must not introduce unsupported scope. Separate proposed defaults and unresolved questions from confirmed instructions. Formatting and rendering must not silently add, delete, or reassign operative terms.
- Changes to confirmed deal terms must be explained by the customer's instructions or answers. Correcting an unsupported addition must preserve valid adjacent content. Apply must preserve unrelated terms and bind to the intended agreement, organization, and revision; accepted/signed paper remains immutable.
- Enforce these requirements with regressions against production functions and customer journeys. Include both negative cases (unsupported additions and lost facts) and positive cases (the same terms explicitly requested), equivalent wording, and two-, three-, and four-party roles. Evaluators must accept equivalent meaning while detecting altered obligations.
- Preserve sanitized, reproducible regression fixtures in version control so required checks can run in a clean checkout without private, ignored result directories or provider calls. Keep original evidence separately; never commit credentials, live authorization policies, or sensitive account data as fixtures.
- Required integrity regressions must be wired into the existing release checks. A failure blocks the associated readiness claim; do not weaken expectations, rename the defect as model variability, or compensate with additional provider spending.

Known historical evidence: `evals/commercial-readiness/QUALITY_EVAL_LIVE_20260914T195201Z.md` and `frontend/src/launch/customerMeaningProductionPath.test.ts` document unsupported outgoing context and loss of supplied scope after generation. Existing corrections and passing local tests are evidence for those cases, not proof that every boundary or party count is qualified. Documentation alone does not establish enforcement or closure.

## Source and scope of this record

The product owner explicitly requested that “two to four parties and U.S. law” be locked in place and not forgotten. This file records release intent; it does not authorize provider spending, deployment, publishing, or changes to completed evidence.
