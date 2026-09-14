# Incremental live quality-eval authorization — prepared, inactive

Prepared 2026-09-14 on `stabilize/phase3b-paid-entry` after HEAD `aaeabe9f`.  
**Do not run `--live` until this card is explicitly approved and the sidecar is activated.**  
This is not a live-quality pass and not launch authorization.

Do not reuse `CORE_PAID_JOURNEY_LIVE_MODEL_QUALITY_EVAL_PROPOSAL_2026-09-13.md`.  
Do not create a replacement ledger, relabel historical calls, change models, or reset counters.  
Do not raise `LIMITS` in `backend/quality_eval_budget.py`. The increment sidecar is the only later activation path.

Ledger inspected read-only: `evals/commercial-readiness/results/quality-eval-approved-20260913.sqlite3`.  
Inactive sidecar: `evals/commercial-readiness/quality-eval-increment-20260914.inactive.json` (`active: false`).

## Enforced controls (already in code)

The existing cumulative ledger remains the only ledger. Reservations stay atomic.

| Control | Current enforcement | When sidecar is later activated |
|---|---|---|
| Historical counters | Unchanged (11 attempts; reserved **$0.611731** / 1,223,462 units) | Still counted; never reset |
| Dollar ceiling | **$8.00** / 16,000,000 units | Unchanged |
| Additional reserved vs baseline 1,223,462 | Not granted | **At most $1.00** additional reserved, including across restarts |
| `primary` | 2/2 exhausted | **+2** (two filled drafts) |
| `bootstrap_parse` | 2/2 exhausted | **+2** (two basic parses) |
| `parse` | 3/4 | **+2** (two premium parses) |
| `clarification` | 0/4 | **up to +2** used |
| `repair` | 1/2 | **at most +1** |
| Global attempts | 11/16 | **20** (11 + 2+2+2+2+1) |
| `free_one_pager` / leftover `bootstrap_one_pager` | Rejected as soon as the sidecar is attached | Still rejected **before** any provider call |
| `explicit_revision`, `structured_revision`, `recipient_negotiation`, `premium_review`, `finalize_audit`, `review_route` | Rejected when sidecar is attached | Still rejected before provider contact |
| Replacement / empty ledger | Rejected (`increment_rejects_replacement_ledger`) | Rejected |

The leftover one-pager slot is **not** an allowance. A one-pager, revision, negotiation, or other excluded purpose aborts the evaluation. Do not spend leftover `bootstrap_one_pager` (3/4), leftover `revision`, or leftover `negotiation`.

While `active` remains **false**, exhausted `primary` and `bootstrap_parse` still block a live run. Remaining dollars do **not** raise those buckets.

## Why remaining dollars do not authorize this run

| Field | Ledger (unchanged) |
|---|---|
| Model | `gpt-5.4` (bootstrap `gpt-4o-mini` only) |
| Halted | no |
| Ceiling | **$8.00** / 16_000_000 units |
| Attempts | **11 / 16** |
| Known usage | **$0.249751** (all 11 attempts `complete`) |
| Reserved (never refunded) | **$0.611731** |
| Unknown usage | 0 |
| Dollar room vs reserved | $7.388269 |

Remaining dollars are unused capacity under the ceiling. They do **not** authorize exhausted `primary` or `bootstrap_parse`.

## Proposed independent model samples

Two filled intakes only. Sparse interview stays offline-only. After those two samples exist, reopen the **same** saved agreements in fresh desktop and mobile contexts **without regeneration**.

| Sample | Input | Premium model | Basic bootstrap | Primary output bound |
|---|---|---|---|---|
| Harbor consulting | `CORE_PAID_JOURNEY_FILLED_INTAKE` | `gpt-5.4` | `gpt-4o-mini` | 8000 |
| Orion Harbor / Northwind SaaS | quality-eval SaaS filled intake (hosted platform only, no professional services) | `gpt-5.4` | `gpt-4o-mini` | 8000 |

This two-sample evaluation is **limited evidence**, not proof of arbitrary-input reliability. Complete live-paper review remains part of quality acceptance; browser success alone does not establish quality.

Live runner (only after explicit activation + approval):

```
.venv/bin/python scripts/run_quality_eval_local.py --live \
  --preflight <matching PASS dir> \
  --offline-journey-evidence <matching OFFLINE_JOURNEY_PASS dir> \
  --case all
```

Both evidence dirs must carry the same `source_files_sha256` as the live tree. `QUALITY_EVAL_OFFLINE_JOURNEY` stays unset during `--live`. No recipient send, Stripe, email, or refine clicks.

Date/completion Apply is a local revision + snapshot persist. It is **not** a `call_legal_llm`.

If the authentic production journey requires more than this inventory, stop, keep the evidence, and write a revised explicit authorization. Do not reshape the journey to make the cheaper test pass. A budget interruption is not a product-quality pass.

## Every provider call that can fire

All live calls go through `call_legal_llm` and the existing ledger. Prices stay `backend/quality_eval_budget.py`: `gpt-5.4` 5/30 half-microdollars; `gpt-4o-mini` 1/2 (rounded up).

| # | Trigger | `call_purpose` | Bucket / model | Output bound | This increment |
|---|---|---|---|---|---|
| 1 | Paid Create `POST /parse` `ai_model_class=basic` | `structured_extraction` | `bootstrap_parse` / `gpt-4o-mini` | 350 | **2 required** |
| 2 | Paid Create `POST /parse` `ai_model_class=premium` | `structured_extraction` | `parse` / `gpt-5.4` | 1200 | **2 required** |
| 3 | `POST /premium-missing-facts` | `missing_facts` | `clarification` / `gpt-5.4` | 900 | 0–2 possible |
| 4 | `POST /premium-full-draft` primary | `agreement_drafting` | `primary` / `gpt-5.4` | 8000 | **2 required** |
| 5 | Same handler JSON regen | `agreement_drafting` `repair=regen` | `repair` / `gpt-5.4` | 8000 | At most **1** total |
| 6 | Quality/substance repair | `conditional_repair` | `repair` / `gpt-5.4` | 8000 | Shares the one repair |
| 7 | Leak-sanitize retry | `agreement_drafting` `repair=retry` | `repair` / `gpt-5.4` | 8000 | Shares the one repair |
| 8 | User Retry Pro draft | `agreement_drafting` | `primary` | 8000 | **Forbidden** |
| 9 | `premium-refine` / revision purposes | revision | `revision` | 2000–12000 | **Rejected before provider** |
| 10 | Recipient negotiation | `recipient_negotiation` | `negotiation` | 768 | **Rejected before provider** |
| 11 | `premium_review` / `finalize_audit` / `review_route` / `free_one_pager` | excluded | — | — | **Rejected before provider** |

Parsing is a model call. Automatic regen/repair/sanitize are model calls. They all count.

## Activation procedure (not executed in this batch)

The committed file `quality-eval-increment-20260914.inactive.json` stays `active: false` and `authorization: null`.  
Do not flip it. Product source hashes **exclude** increment policy files so activating or selecting a copy does not stale matching no-spend evidence.

Exact later order:

1. **Written approval** of this card (the $1 / two-sample increment). This batch is not that approval.
2. **Activate a copy**, never the committed sidecar:
   - Copy the inactive JSON to a new path (not committed).
   - Set `"active": true`.
   - Set `"authorization": {"kind": "explicit_increment_approval", "max_additional_reserved_usd": 1.0}`.
3. **Identify the product source** (`HEAD` + `product_source_hashes`, increment JSON excluded).
4. **Matching no-spend checks** on that source: page-entry preflight `PASS` and filled-only `--offline-journey` `OFFLINE_JOURNEY_PASS` with the same `source_files_sha256`.
5. **Execute** only:

```
.venv/bin/python scripts/run_quality_eval_local.py --live \
  --preflight <matching PASS dir> \
  --offline-journey-evidence <matching OFFLINE_JOURNEY_PASS dir> \
  --increment-policy <authorized-copy.json> \
  --authorize-increment \
  --case all
```

Both `--authorize-increment` **and** an active copy with the authorization record are required. Either missing stops **before** Railway credential retrieval or any provider call. The selected path, `policy_sha256`, `increment_active`, and `increment_authorized` are written to `identity.json`.

Restart does not renew the increment. The official ledger remains required; replacement ledgers are rejected.

## Stop conditions

Stop and do not retry if any of the following occur:

- Ledger `halted`, model other than `gpt-5.4` / approved `gpt-4o-mini` bootstrap, or source hash ≠ matching preflight or offline-journey evidence
- A second increment `repair` would be reserved
- One-pager, revision, negotiation, or any excluded purpose appears
- User Retry Pro draft, refine, recipient send, Stripe, email, deploy, or ledger rewrite
- Snapshot-create POST / authorized GET parse or HTTP failure (do not convert to `{}`)
- Harbor opening invents an undefined Effective Date after Apply, consulting completion is invented (milestones / deemed acceptance / SLAs), or SaaS paper changes supplied net-30 / annual / duration / hosted-only scope or gains an invented acceptance obligation
- `canProceedWithoutAnswer` is flipped false
- Budget interrupt (call/dollar/increment limit). Report that separately; it is not a quality pass

## Quality bar (live output only)

Accept only if both saved agreements, after clarification where needed, snapshot-create, independent GET, visible paper, and fresh-browser reopen, keep:

- Distinct effective date, service start, invoice date, and signature date unless the customer connected them
- Missing facts as a question or visibly unresolved state
- Harbor completion only from customer-supplied criteria
- Hosted SaaS payment timing, annual fee basis, duration, hosted-only scope, and no invented project-acceptance obligation
- Supplied parties, work, fees, payment instructions, and unrelated terms
- Harbor Apply remainder (after stripping authorized date/completion decorations) matches the first draft; unrelated ownership, fee, liability, and notice terms stay intact
- First-draft and after-Apply revision identities recorded separately; after-Apply paper matches POST, independent GET, display, and reopen
- Convenience recorded as first usable draft vs complete journey; scripted actions distinguished from customer effort (`not_assessed` unless measured)

A prepared evaluation is not a live-quality pass. A live-quality pass is not launch authorization. Manual-edit recovery stays **unverified** unless that path is separately exercised.

## Required runnable artifacts before approval

- Corrected `assertSaasCustomerMeaning` / `saasPaperReady` in `frontend/src/launch/qualityEvalCustomerPaper.ts`
- Session token authority in `frontend/src/account/currentUser.ts`
- Inactive increment sidecar + `backend/quality_eval_increment.py`
- `scripts/run_quality_eval_local.py --offline-journey --filled-only` and live requiring both evidence dirs
- This card, describing the **enforced** limits (no leftover one-pager allowance)
