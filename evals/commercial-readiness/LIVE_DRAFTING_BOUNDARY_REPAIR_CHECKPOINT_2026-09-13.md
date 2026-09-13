# Drafting boundary repaired; live consulting retry completed

## Decision

The requested output/identity boundary repair is implemented locally, and real-model testing resumed. The consulting retry now produces visible, correctly named paper and preserves that exact visible text on refresh. **This is a technical drafting-path pass, not commercial-quality acceptance or launch readiness.** The SaaS case and recipient actions on the newly generated agreement were not exercised.

Starting HEAD: `0470d44a6304dd6ec605cd3dfbb867279360058a`, branch `stabilize/phase3b-paid-entry`. No push, deployment, customer charge, external email, hosted configuration change, model migration, or subscription-price change. All previous failed evidence and the cumulative approval ledger were preserved.

## Repairs

1. **One model-authored body.** The premium prompt now requests the full paper only in `authoritative_draft`; it no longer invites a second full copy in `document_text`. Existing server normalization supplies the compatibility alias. Models and token ceilings are unchanged.
2. **Request-scoped identity restoration.** The airlock still applies privilege policy, masking, and minimization before provider dispatch. A caller-owned map survives only for that call, with consistent identifiers across its user messages. Only tokens actually sent after minimization can restore. Structured responses restore string values through JSON decode/re-encode; unknown tokens, reserved input tokens, and identity-bearing schema keys fail closed. No shared identity singleton, persisted mapping, or new authority grant. Default non-agreement redaction behavior is unchanged.
3. **Incomplete/invalid output is not authority.** Truncation and raw JSON cannot become successful agreement paper just by exceeding a character threshold. Degraded prose must pass substance and document validation. The final HTTP boundary also withholds all paper aliases if validation explicitly failed, returning an honest retry.
4. **Named recital validation.** The final-boundary fix exposed a false negative for `between Named LLC ("Consultant") and Named Inc. ("Client")`. That form now requires both distinct identities in the intake; Consultant was not simply added to a generic role-only shortcut.

The implementation follows the [official incomplete-response guidance](https://developers.openai.com/api/docs/guides/structured-outputs): an output-length stop is incomplete, not successful JSON. Paid testing retained [GPT-5.4](https://developers.openai.com/api/docs/models/gpt-5.4); existing basic routing remains GPT-4o mini as configured in staging.

## Saved-response regression, no provider spend

Original evidence: `results/quality-eval-live/20260913T193125Z-7488/`.

- Exact 41,042-character failed response is rejected as authoritative output, irrespective of length.
- Its complete 18,677-character embedded agreement string was extracted **in an offline test only** to reproduce the identity failure. Restoration produces 18,857 characters with Harbor/Ironvale, Consultant/Client, and both supplied emails, and passes structural validation. This test does not promote the old truncated response into an accepted document.
- Portable negatives cover unknown identities, multiple messages, separate requests, JSON escaping, minimized-away bindings, privilege blocks, and final HTTP truthfulness.

Four old reliability expectations that explicitly promoted truncated/insufficient output were replaced with stronger failure/retry assertions: persistently thin body, degraded diagnostics, long truncated output, and insufficient substance. Their bodies and failure conditions remain. Valid substantive prose recovery remains covered and passing.

## Verification on final repaired product source

| Check | Result |
|---|---|
| Consolidated focused backend checks, 13 files | **185 passed, 0 failed, 0 skipped** |
| Backend evidence | `results/drafting-boundary-offline-20260913/focused.xml` |
| Final core desktop/mobile workflow gate | **10/10 tests, 28/28 required rows, exit 0** |
| Core matrix/authority unit checks | **19/19** |
| Production-built no-spend preflight | **12/12**, both viewports, three repeats, no retries |
| Production typecheck/build | Passed in preflight and live runner |
| Full frontend suite | Not rerun; no baseline change |

Final core identity:
`0470d44a6304dd6ec605cd3dfbb867279360058a+src-c24401496a4d23735db0745d3dd24468286e2bec+run-20260913T230951Z-12459`.

Preflight: `results/quality-eval-preflight/20260913T231237Z-12806/`.

The first attempted core run could not bind its local port inside the sandbox. The next run's core matrix passed, but the command failed because a standalone quality diagnostic was accidentally collected without its required results folder. The core configuration now names its own spec explicitly. Those earlier runs are retained, not substituted for the final pass. An intermediate green core run predates the final validation-boundary change and is not the final source identity above.

A wider diagnostic also found three old `test_agreements_api_v2.py` signing tests expecting unbound modern locks to succeed. All three still failed when the changed premium response/prompt functions were restored from HEAD in process. No signing assertions or authority contracts were weakened to make them pass; this was a scoped comparison, not a clean full-HEAD baseline run.

## Real consulting retry — what actually happened

Evidence: `results/quality-eval-live/20260913T231438Z-12993/`.

The runner required a passed, matching-source preflight, production frontend build, isolated real backend, and the existing cumulative ledger. Local synthetic ES256 identity was used; this does not prove live hosted authentication.

- Sparse intake displayed clarification; completed intake followed the real paid drafting path.
- Five provider calls: basic parse, basic one-pager, premium parse, primary draft, one automatic repair. The repair is counted, not hidden as a first-pass success.
- Primary: GPT-5.4, 5,481 input / 3,807 output tokens. Repair: 1,576 input / 1,430 output tokens. The earlier truncation outcome did not recur.
- Final response: `generation_ok=true`, `generation_outcome=ok`, document validation passed, no generation failure code; **6,901-character server agreement**.
- Visible article: **7,395 characters**, with Harbor Peak Analytics LLC as Consultant, Ironvale Manufacturing Inc. as Client, the $48,000 fee, twelve-month term/date, Delaware, and supplied ownership terms and signer emails.
- Visible text after refresh is byte-identical: SHA-256 `113f43a7cda59b9809a9139c9eb58a5afd627ec25c2d435b6ab1f8e55e2cee65`.
- The visible/server length difference includes display/notices hydration. This run does **not** claim end-to-end frozen-hash equality through a new recipient ceremony.
- Browser case: **1/1 desktop passed**. Real-model mobile, the SaaS case, and real-generated recipient review/signing remain unproved. Earlier stub workflow passes stay separate.

## Actual wording review — still fails final commercial acceptance

The visible draft is readable and correctly identifies the parties, but important product-quality gaps remain:

1. The intake supplied a fixed $48,000 fee, not an invoicing schedule or due interval. The draft supplies installments during the term and net-30 payment without asking. `missing_material_info` and recommended questions are empty. The next repair should require confirmation of material missing payment terms instead of presenting those defaults as agreed facts.
2. The visible notice section is numbered **13**, inserted before **11. Governing Law** and **12. Miscellaneous**. This is an observable presentation/assembly defect, not a provider connectivity problem.
3. The opening references an undefined `Effective Date`; the term section contains the actual start date. Scope/acceptance detail is also limited (the structural validator warns about undefined acceptance criteria).

This is an engineering/content-consistency review, not legal sufficiency or enforceability certification. Do not send this test agreement to real customers or treat the browser pass as commercial-grade drafting approval.

## Cumulative spend and cleanup

Unchanged ledger: `results/quality-eval-approved-20260913.sqlite3`.

- **11 total provider calls**, including all earlier failed work.
- Known-usage cost upper estimate **$0.249751**; unknown-usage attempts **0**.
- Conservative reserved upper amount **$0.611731**, not actual spend; original ceiling **$8**.
- The two planned primary attempts are now used (one original truncated attempt, one repaired-source retry). No counter reset, retry relabeling, or cap increase was performed. The SaaS primary was not dispatched into a known exhausted primary-call cap.
- Each runner stopped its own processes. Read-only listener check found ports 4188–4191 idle. No broad process kill.

Next: use this saved successful response to repair material-question handling and notice numbering without more provider spending. Before another primary generation, explicitly reconcile the attempt cap while retaining the same cumulative $8 ledger. Settings/admin, remaining sitemap coverage, full-suite reconciliation, live auth/email/Stripe/staging, and launch authorization remain separate.
