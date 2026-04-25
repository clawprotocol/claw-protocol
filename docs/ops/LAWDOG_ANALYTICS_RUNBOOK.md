# LawDog analytics — operator runbook (trust-first)

Product analytics are **first-party**: in-browser queue + `CustomEvent("claw:product-event")`, enriched with `session_id`, `flow`, `step`, `traffic_source`, and `timestamp`. `traffic_source` comes from optional `?src=` (e.g. `csn`, `doginal`, `twitter`) and defaults to `direct`. There is **no** canvas/device fingerprinting. This is **not** a full analytics platform — wire your own listener or forwarder if you export events.

## Funnel events (primary journey)

Typical **agreement** path (happy path):

| Order | Event | Meaning |
|------:|--------|---------|
| 1 | `homepage_loaded` | Marketing home rendered |
| 2 | `agreement_started` | User committed to create (intake) |
| 3 | `agreement_created` | Draft persisted (id issued) |
| 4 | `ready_to_send_viewed` / `send_clicked` | Review → send intent |
| 5 | `record_created` | Claim strip eligible (conversion surface) |
| 6 | `claim_record_viewed` | Claim card shown |
| 7 | `claim_record_clicked` | User engaged Save / Keep going — may include `time_to_claim_ms` (view → click) |
| 8 | `signup_started` | Chose account path from claim |
| 9 | `signup_completed` | Handed off to auth (email/google) |

**Paywall / monetization** (can interleave after step 2):

- `paywall_triggered` — upgrade required (see `surface`, `reason`, `code`)
- `paywall_shown` / `paywall_viewed` — modal or strip shown
- `paywall_clicked_upgrade` / `upgrade_clicked` — user moved toward billing
- `power_paywall_*` — Power tier modal (see `feature`, `surface`)

**Claim note:** payload uses `claim_flow` (`esign_receipt` | `agreement_complete`), not the top-level `flow` dimension (`esign` | `agreement` from routing).

## Safe segmentation dimensions

Use these without expecting document substance:

- `session_id`, `flow`, `step`, `traffic_source`, `timestamp`
- `surface`, `reason`, `code`, `feature`, `variant`, `via`
- `agreementId` / `agreement_id` (opaque ids only)
- `record_id`, `claim_flow`, `method` (signup)
- Counts and booleans: `qlen`, counts, `tier`, `indexed`, `time_to_claim_ms` (milliseconds, claim card only), etc.

**Do not** expect or build reports on: agreement body, clauses, memory query text, notes, or free-text instructions — those are **not** logged in product events by design.

## identity_email

- Included on events **only** when set in session state via `bindLawdogSessionEmail()`.
- **Not** populated from counterparty signer/reviewer rows (would misidentify the creator).
- Wire explicitly when you have a trusted “this is the signed-in user’s email” moment (e.g. post-auth callback).

## paywall_triggered hygiene

Events emitted through `triggerPaywall()` log only: `code`, `surface`, `reason`, `agreementId`. UI copy (`paywallHeadline`, `paywallSub`) is **not** duplicated into analytics.

## Recommended daily metrics (launch)

Track approximate volumes per day (unique `session_id` or event counts, depending on your pipeline):

1. **Homepage visitors** — `homepage_loaded`
2. **Create started** — `agreement_started`
3. **Agreements created** — `agreement_created`
4. **Claim viewed** — `claim_record_viewed`
5. **Claim clicked** — `claim_record_clicked`
6. **Signup started** — `signup_started`
7. **Signup completed** — `signup_completed`
8. **Paywall triggered** — `paywall_triggered`
9. **Upgrade clicked** — `upgrade_clicked` (and/or `paywall_clicked_upgrade`)

Optional: `conversion_completed`, `checkout_started` / `checkout_completed` for paid paths.

## Remaining cautions

- **Direct `logProductEvent("paywall_triggered", …)`** (outside `triggerPaywall`) must stay limited to known-safe keys; prefer `triggerPaywall()` for consistency.
- **Backend** usage-economics events (`analytics_events` SQLite) are separate; review before exporting if you add new payload fields there.
- **Marketing pixels** only mount on homepage and `/app?welcome=1` (signup success hook); never inside signing/verify flows.
