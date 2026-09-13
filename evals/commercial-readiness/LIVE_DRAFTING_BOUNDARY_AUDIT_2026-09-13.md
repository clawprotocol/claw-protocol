# Live drafting boundary audit — blocked, not launch-ready

## Decision

Stop further paid attempts until the demonstrated output/identity/failure-contract defects are repaired using the saved response as no-spend regression evidence. The OpenAI credential and paid model work. The first real consulting draft did **not** become usable paid review paper. The SaaS case and both recipient paths were not reached in this evaluation. Earlier stub workflow passes remain separate.

No push, deployment, customer charge, external email, hosted configuration change, subscription-price change, or free-utility routing change. HEAD remains `0470d44a6304dd6ec605cd3dfbb867279360058a` on `stabilize/phase3b-paid-entry`. Preparation changes are local and uncommitted. Existing result directories are untouched.

## Authorization and actual service configuration

- User authorized up to **$8 total** provider spend for two synthetic cases, with no customer charges, external emails, or deployment.
- Railway staging `claw-protocol`: premium/regen `gpt-5.4`, basic `gpt-4o-mini`. The earlier proposal's paid `gpt-4o` assumption was not the staging setting. No model setting was changed.
- User described the public one-page/two-party utility as GPT-4o. Record the more specific staging `gpt-4o-mini` setting as a configuration clarification, not authorization to switch it. This evaluation used paid Create, not a public-utility acceptance test.
- Credential retrieved from the explicitly scoped service in memory. No raw credential was printed, written to an artifact, or supplied to the frontend. Local test identity/JWKS files remain uncommitted in protected results.
- Production frontend build + local production backend handlers; synthetic Pro identity with local ES256 verification and Supabase SDK storage. Hosted auth, Stripe, email, and staging behavior remain unproven.

## Evidence that counts

Latest real-provider run:

`results/quality-eval-live/20260913T193125Z-7488/`

- `identity.json`: HEAD + tracked diff SHA-256 + all 3,992 source-file hashes, including untracked preparation sources.
- Tracked-diff SHA-256: `426abcee81449098e920fe812fcc7cf5e10eb172a0b794acb22acfde5956c620`.
- `consulting-premium-result.json`: exact production HTTP response, not a manufactured fixture.
- `consulting-model-endpoints.json`: captured requests/responses for the premium parse and draft.
- `api.log`: completion length and truncation outcome.
- `consulting-last-page.txt`, browser screenshot and failure log: recovery screen, no usable paid paper.
- `budget-summary.json`: cumulative approval ledger totals, including the first attempt.

Result: consulting failed on `generation_outcome=degraded`; SaaS not run because the browser runner stops at the first failed case. No automatic browser rerun. This is **not** a full desktop/mobile quality pass.

## Confirmed blockers

### 1. Duplicate full agreement exhausts output budget

The real primary call returned `gpt-5.4-2026-03-05`, 5,347 prompt tokens, **8,000 completion tokens**, and `finish_reason=length`.

The 41,042-character raw response contains complete, byte-identical copies under both `authoritative_draft` and `document_text`: each is 18,677 characters, SHA-256 `9bdd7356c7f3ce13cd43478bc1bd945144e0b2eb36ab92f369ba2f9a90b3212d`. The surrounding JSON cuts off during `agreement_intelligence.quality_flags`.

The production system prompt expressly permits this duplication (`backend/routers/agreements_v2_api.py`, `_premium_full_draft_system_prompt`). Duplication is a demonstrated contributor to output exhaustion, not evidence that increasing the token limit alone will make the service reliable. The prompt/output contract has not been repaired in this turn.

### 2. Redacted identities are not restored on this path

The live premium parse returned `parties: []`. The draft contains `[ORG_1]`, `[ORG_2]`, `[EMAIL_1]`, and `[EMAIL_2]` in place of the supplied synthetic legal names/emails. The draft's own validation fails on `unresolved_bracket_placeholder`.

Source inspection: `llm_router._messages_after_user_airlock` forwards the airlock's minimized/redacted user content, and `call_legal_llm` returns model text without a corresponding identity-restoration step. Do not disable the privacy policy or introduce an unscoped/global identity map. Any repair must preserve privacy and bind restoration to the exact request/authorized agreement, rejecting unknown or conflicting placeholders.

### 3. Truncated JSON is mislabeled as successful authoritative paper

The response simultaneously says:

| Field | Observed value |
|---|---|
| `generation_outcome` | `degraded` |
| `server_generation_failure_code` | `output_truncated` |
| `agreement_validation.passed` | `false` |
| `generation_ok` | `true` |
| `retryable` | `false` |
| `document_text`, `authoritative_draft`, `server_full_document_text` | raw truncated JSON, 41,042 characters each |

The degraded-response helper's truncated keep-floor accepts any sufficiently long string and then derives success from keeping that body. Raw incomplete JSON is not an authoritative contract. Recovery material must remain separate from signable paper. The observed browser stayed on recovery; **this run does not show that signing was unlocked or an invalid agreement was frozen**.

### 4. Clarification quality still requires acceptance

The output supplies monthly/net-30 payment defaults even though the input specified only a $48,000 fixed fee. Its later metadata asks whether invoicing should be upfront, monthly, or milestone-based. The engineering acceptance criterion remains: material proposed terms must be identified and confirmed through the interview, not represented as user-agreed facts. No legal sufficiency or enforceability certification is made here.

## Evaluation corrections — do not blame the product for these

First real attempt: `results/quality-eval-live/20260913T190740Z-5733/`.

- The initial guard assumed premium-only calls. Production paid Create actually runs a basic parse/one-pager bootstrap before the premium parse/draft. The guard blocked that basic request, which exercised the existing heuristic fallback.
- The initial browser assertion also read a transient local preview before the premium request finished. Its missing-Delaware assertion is **not** evidence about a completed model draft.
- That fallback screen showed generated/check-completed labels while generation was active. A separate no-spend normal-basic-response audit did not reproduce those labels in its held-premium snapshot. Treat the fallback-state inconsistency separately; do not generalize it to every successful basic parse.

No-spend routing observation: `results/quality-eval-paid-entry-audit/20260913T192458Z-6870/`. Basic parse succeeded against the production handler's stub; premium parse was held in flight. Requests were `basic` then `premium`. The audit failed because its original assertion incorrectly forbade that existing bootstrap. The later test correction records the inventory instead; it has not been rerun or promoted to a launch gate.

The resumed live evaluation preserved product routing, counted the existing bootstrap, and waited for the actual `/premium-full-draft` response before evaluating the visible article. Earlier artifacts were not merged into its result.

## Spend and safeguards

Same persistent ledger throughout: `results/quality-eval-approved-20260913.sqlite3`. It was **not reset**.

| Cumulative real calls | Count |
|---|---:|
| Premium parsing (includes first interrupted evaluation) | 2 |
| Basic bootstrap parsing | 1 |
| Basic bootstrap one-pager attempts | 2 |
| Premium primary drafts | 1 |
| Premium repair/revision/negotiation | 0 |
| Total | **6** |

Known-usage cost upper estimate: **$0.145788**; unknown-usage attempts: **0**. Conservative reservations retained: **$0.250195**, not actual spend. This is usage-based accounting, not a provider invoice.

The local-only guard reserves before dispatch, disables SDK retries, rejects unknown purposes/models, uses a durable transactional ledger, never refunds uncertain reservations, and blocks at the same $8/16-call total ceiling. Premium primary limit 2 and premium automatic repair limit 2 remain. Observed basic bootstrap is separately bounded to two parse calls and four one-pager attempts, all within the same global ceilings. Mini cannot be substituted for premium drafting. Unused approval is not authorization to reset attempt counts or silently relabel retries.

Official pricing checked for [GPT-5.4](https://developers.openai.com/api/docs/models/gpt-5.4) and [GPT-4o mini](https://developers.openai.com/api/docs/models/gpt-4o-mini). Mini reservations conservatively round its prices upward to retain integer units in the existing ledger; no caching discounts are assumed.

## Verification and cleanup

- Latest unchanged-source no-spend preflight: `results/quality-eval-preflight/20260913T192908Z-7269/` — **12/12**, production-built Create fresh/reload and signing-network recovery, three repeats on desktop and mobile, no browser retries.
- Budget + existing core backend tests before resumed live run: **39 passed**. After adding an explicit mixed-pipeline 16-call-ceiling test: **40 passed**. This later test-only proof is separate and does not change the tested live product source.
- Production frontend typecheck/build passed in the real run; build 9.76s.
- No full frontend suite rerun or baseline change.
- Each runner cleaned up its own process groups. After the final live run, a read-only listener check found ports 4190/4191 idle. No broad process kill.

## Next bounded repair

Use the captured response for offline tests first. Make the model return one complete canonical body; construct backward-compatible aliases on the server. Ensure truncated JSON and failed validation cannot produce successful/signable authority. Restore redacted identities only through verified, request-scoped bindings, preserving the privacy policy. Then check that material missing facts become visible clarification choices.

Preserve the existing review/direct-sign workflow and frozen-document contracts. Run focused negative/positive cases and the core workflow gate on one unchanged source before resuming paid evaluation. Keep all previous spend and failed evidence. Do not start Settings/admin or expand sitemap work while the actual drafting boundary remains blocked. Do not call this launch-ready.
