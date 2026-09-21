# Live two-sample quality-eval — 20260914T195201Z-5037

Authorized increment executed 2026-09-14 on `stabilize/phase3b-paid-entry` HEAD `aaeabe9f`.  
This is **not** a live-quality pass and **not** launch authorization.

## Execution identity

| Field | Value |
|---|---|
| Result dir | `evals/commercial-readiness/results/quality-eval-live/20260914T195201Z-5037` |
| Matching preflight | `quality-eval-preflight/20260914T194132Z-3559` (`PASS`) |
| Matching offline | `quality-eval-offline-journey/20260914T194232Z-3885` (`OFFLINE_JOURNEY_PASS`) |
| Policy | uncommitted copy `quality-eval-increment-20260914.authorized-copy.json` |
| Policy sha256 | `fc56737498beaa15777c07d293e9cb90cf679285305e959a2042582e646c93a1` |
| Default sidecar | still `active: false` / `authorization: null` |
| Increment flags | `increment_authorized=true`, `increment_active=true`, `authorized_increment_copy` |

## Classification

| Kind | Result |
|---|---|
| Budget interrupt | No. Ceiling $8, not halted. Additional reserved **$0.358980** of the $1.00 increment. |
| Infrastructure | No. Railway credentials and `gpt-5.4` contact succeeded. |
| Product / display | **Yes.** Painted Harbor first draft replaced supplied scope with generic “professional consulting… statement of work” and used “Service Provider” in §1. |
| Content quality | **Yes.** Browser first-draft check failed. Server paper invented `as of October 1, 2026` before the date answer. SaaS sample was not generated. Apply, GET, reopen not reached. |

Browser assertion: `harbor_first_draft_meaning: missing_supplied_scope,missing_term_duration`.  
Reproduced offline against the saved painted paper and premium JSON.

## Usage (official ledger, not reset)

Baseline 11 attempts / 1,223,462 units ($0.611731 reserved).

After this run: **15** attempts / **1,941,421** units; reserved **$0.970711**; known usage **$0.366909**; halted **no**.

New complete attempts (2026-09-14):

| Bucket | Model | Purpose | Reserved units |
|---|---|---|---|
| bootstrap_parse | gpt-4o-mini | structured_extraction | 2,829 |
| parse | gpt-5.4 | structured_extraction | 63,010 |
| primary | gpt-5.4 | agreement_drafting | 370,915 |
| repair | gpt-5.4 | conditional_repair | 281,205 |

Increment remaining if later re-approved: +1 primary, +1 bootstrap_parse, +1 parse, ≤2 clarification, **0 repair**. Global 15/20. Restart does not renew this allowance.

## Harbor complete-paper review (partial; first draft only)

Server `document_text` keeps parties, $48,000, Delaware, AI workflow implementation, twelve (12) months from October 1, 2026, consultant pre-existing tools, and client ownership of deliverables after payment. Invoice timing stays an open question (`needs_details`). Date/completion panels were visible and optional.

Painted article dropped “AI workflow implementation” and the labeled Effective Date; duration is present as “twelve (12) months” (checker requires “twelve months” / “12 months”). Opening no longer says `as of October 1, 2026`.

Unauthorized / extra server terms not supplied by the customer include termination for convenience, a 30-day cure, and a perpetual license for embedded pre-existing tools.

`canProceedWithoutAnswer` was not changed.

## SaaS

Not generated. Stopped after Harbor first-draft failure. No additional provider call was made.

## Convenience

Not recorded (journey stopped before continuation.json). Customer effort **not assessed**. Scripted action reached filled Harbor intake only.

## Stop

Do not rerun `--live` without a new explicit authorization. Do not regenerate to repair observation.
