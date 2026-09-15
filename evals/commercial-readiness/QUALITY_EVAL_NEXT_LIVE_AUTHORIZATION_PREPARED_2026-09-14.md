# Next live release-scope authorization — prepared, not executed

Prepared 2026-09-14 after local acceptance on
`c179205829e01242af694571452bd521ec6d61af+src-60a08067992df2c93fd78ea930a4bc8456b62486`.

**This card supersedes the earlier two-sample Harbor/SaaS-only proposal on this filename.**  
The two-sample inventory (2+2+2, repair 0, clarification 0) is not enough for the fixed release scope.

Owner authorized this card’s four-sample grant on 2026-09-15: $2.50 additional reserved, 4+4+4 primary/parse/bootstrap_parse, 4 conditional clarification, 4 conditional repair, attempt ceiling 35. That supersedes the pending-approval wording for this grant only. It is not launch authorization and does not activate `quality-eval-increment-20260914.inactive.json`.

Campaign facts: `RELEASE_SCOPE_QUALIFICATION_CAMPAIGN_2026-09-14.md` and
`frontend/src/launch/releaseScopeQualificationCampaign.ts`.

Matching no-spend evidence for a later live run of the **same product files**:

- Offline Harbor/SaaS: `quality-eval-offline-journey/20260915T032105Z-61873` (`OFFLINE_JOURNEY_PASS`, `model_calls=0`). Older `20260914T220448Z-23971` is preserved and is not hash-identical to this candidate.
- Official stub: `d261556bfcf99cb7b6b1eaf6966f4fb583af7f11+src-1ddff56f95efd470971acff04d43eae0b3a1b85c+run-20260915T030701Z-59511` (`gate_green=true`). Historical `src-60a08067992d` / `src-64516accffb1` do not certify these official hashed files.

Campaign and register files added after that rematch change quality-eval `source_files_sha256`.  
Before any later `--live`, rematch `--offline-journey --case all` on the checkpoint tree and use **that** PASS dir. Do not treat `61873` as hash-identical after this documentation checkpoint. Official fingerprint `src-1ddff56f95ef` still maps the official hashed product files unless those files change.

## Ledger (inspected only; not modified)

`evals/commercial-readiness/results/quality-eval-approved-20260913.sqlite3`

| Field | Value |
|---|---|
| Attempts | **15** (all `complete`) |
| Reserved | **1,941,421** units / **$0.970711** |
| Known usage | **$0.366909** |
| Ceiling | **$8.00** / 16,000,000 units |
| Dollar room vs reserved | **$7.029289** |
| Model | `gpt-5.4` |
| Halted | no |
| `primary` | 3 |
| `parse` | 4 |
| `bootstrap_parse` | 3 |
| `repair` | 2 |
| `bootstrap_one_pager` | 3 |

Purposes already recorded: `structured_extraction` 7, `agreement_drafting` 3, `conditional_repair` 2, `free_one_pager` 3.

Previous increment sidecar `quality-eval-increment-20260914.inactive.json` remains **`active: false`**.  
If that sidecar were still attached: **one `primary` remaining**, **one `parse` remaining**, **one `bootstrap_parse` remaining**, **two `clarification` remaining**, **zero `repair` remaining**, global **15/20**.

That leftover inventory is **not enough** for four production samples. Do not activate that sidecar.

## Repair wording (do not treat as a permanent ban)

Repair allowance under the **previous** increment is exhausted (`repair` 2/2 if that sidecar is counted). That exhaustion:

- blocks reactivating or renewing **that** sidecar’s repair slot
- does **not** permanently ban a **separately authorized** future repair grant

This card **does** grant conditional repair for authentic production quality-gate behavior. Do not reshape production model, input/output, clarification, or repair to fit evaluation limits.

## What this batch already used

Failed live Harbor sample: `quality-eval-live/20260914T195201Z-5037`. SaaS was not live-generated.

Offline correction `20260914T220448Z-23971` made **no provider calls**.

## Proposed new increment (not created, not activated)

Preserve this ledger. No replacement, no counter reset, no `LIMITS` raise in `quality_eval_budget.py`.

Four filled independent samples through the current runner (`--case release_scope`). Sparse interview stays offline-only. Harbor date/completion Apply remains local persist on this candidate — not `call_legal_llm`. After the four samples exist, reopen the **same** saved agreements in fresh desktop and mobile contexts **without regeneration**.

| Sample | Input | Premium | Bootstrap | Bound |
|---|---|---|---|---|
| Harbor consulting | `CORE_PAID_JOURNEY_FILLED_INTAKE` | `gpt-5.4` | `gpt-4o-mini` | 8000 |
| Orion Harbor / Northwind SaaS | hosted platform only, no professional services; $48,000 annual; net 30; New York | `gpt-5.4` | `gpt-4o-mini` | 8000 |
| Three-party IP / royalty | `TEST490` + `TEST477` signers; Oklahoma | `gpt-5.4` | `gpt-4o-mini` | 8000 |
| Four-party precision medicine | `TEST487_PRODUCTION_INTAKE`; Massachusetts | `gpt-5.4` | `gpt-4o-mini` | 8000 |

### Exact purpose counts to authorize

These counts match the authentic paid Create path: one basic parse, one premium parse, and one premium-full-draft per sample. Production may then fire **one** quality-gate repair per primary. `missing_facts` is a provider call if that route runs; Harbor/SaaS history used **0**, but three- and four-party papers must not be rewritten to avoid it.

| Purpose / bucket | Count | Why |
|---|---|---|
| `bootstrap_parse` | **4** | one basic parse per sample |
| `parse` | **4** | one premium parse per sample |
| `primary` | **4** | one premium-full-draft per sample |
| `repair` | **4** (conditional) | one quality-gate repair per sample if production fires it; unused slots stay unused |
| `clarification` | **4** (conditional) | one `missing_facts` per sample if production calls it; Harbor date/completion Apply is still local persist |
| `revision` / `negotiation` / `bootstrap_one_pager` / excluded purposes | **0** | leftover one-pager and excluded routes remain unspendable |

**Total attempt ceiling for this increment:** 15 existing + **20** new = **35**.  
**Maximum additional reservation:** **$2.50** / **5,000,000** units above the current reserved **$0.970711**. Do not refund prior reservations. Do not spend the unused $7.03 without this cap.

`canProceedWithoutAnswer: true` stays unchanged. Official I2 stays party-name `agreement-intake-clarification`.

### Sidecar contents for this authorized grant

Create a **new** authorized copy; do not flip `quality-eval-increment-20260914.inactive.json`. The copy is not committed.

```json
{
  "active": false,
  "authorization": {
    "kind": "explicit_increment_approval",
    "max_additional_reserved_usd": 2.5
  },
  "ledger_required_basename": "quality-eval-approved-20260913.sqlite3",
  "approval_baseline_attempts": 15,
  "approval_baseline_reserved_units": 1941421,
  "approval_baseline_reserved_usd": 0.970711,
  "max_additional_reserved_usd": 2.5,
  "max_additional_reserved_units": 5000000,
  "global_attempt_cap_when_active": 35,
  "additional_allowance": {
    "primary": 4,
    "bootstrap_parse": 4,
    "parse": 4,
    "clarification": 4,
    "repair": 4,
    "revision": 0,
    "negotiation": 0,
    "bootstrap_one_pager": 0
  },
  "excluded_purposes": [
    "explicit_revision",
    "finalize_audit",
    "free_one_pager",
    "premium_review",
    "recipient_negotiation",
    "review_route",
    "structured_revision"
  ]
}
```

Activation also requires updating `backend/quality_eval_live_prepare.py` so
`authorization.max_additional_reserved_usd` may be **2.5** for this sidecar.
The current hard-check equals **1.0** and would reject this grant. Do not change
that check, and do not create the sidecar, until the later written approval.

`increment_reservation_gate` already reads `additional_allowance` from the
active policy. Do not raise `LIMITS`.

### Stop conditions

Stop, keep evidence, and write a revised authorization (do not improvise spend) if any of:

1. A call would use an excluded purpose (`free_one_pager`, `explicit_revision`, `structured_revision`, `recipient_negotiation`, `premium_review`, `finalize_audit`, `review_route`).
2. A sample would need a second repair, a second clarification, or any extra primary/parse beyond the one-each inventory.
3. Global attempts would exceed **35**, or additional reserved would exceed **$2.50**.
4. Ledger `halted` becomes true, or the model is not `gpt-5.4` for premium / `gpt-4o-mini` for bootstrap.
5. Preflight or offline-journey `source_files_sha256` does not match the live tree.
6. The authentic production journey requires more than this inventory. Do **not** shorten customer inputs/outputs, skip Apply, skip repair, or downgrade models to finish cheaper.
7. The first failing sample fails the customer-meaning bar. Do not spend later samples to “use up” the grant. Evaluate in order: consulting, saas, three_party, four_party.
8. Three- or four-party paper does not persist after a first usable draft, or persist hangs on clarification. Fix the demonstrated path; do not skip the sample.
9. Any hosted mutation, Stripe, email, push, or ledger rewrite is requested.

## Later live runner (only after a new written approval + new active sidecar + matching rematch)

```
.venv/bin/python scripts/run_quality_eval_local.py --live \
  --preflight <matching PASS dir after checkpoint rematch> \
  --offline-journey-evidence <matching offline --case all rematch> \
  --case release_scope
```

`QUALITY_EVAL_OFFLINE_JOURNEY` stays unset during `--live`. No recipient send, Stripe, email, or refine clicks. Recipient participation stays on the official two-party local A1–B3 path plus existing three-/four-party local isolation tests until hosted delivery is separately authorized.

`--case all` remains Harbor + SaaS only.

## Do not

- Activate `quality-eval-increment-20260914.inactive.json`
- Treat exhausted prior repair as a forever ban on this **new** repair grant
- Execute `--live` from this card
- Push, deploy, or mutate hosted state
- Claim three- or four-party fresh-model quality from two-party evidence
