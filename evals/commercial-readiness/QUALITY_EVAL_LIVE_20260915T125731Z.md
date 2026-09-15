# Live four-sample quality-eval — 20260915T125731Z-69053

Authorized $2.50 four-sample increment executed 2026-09-15 on
`stabilize/phase3b-paid-entry` HEAD `bb66046c9366b65eaceba0aa55ee6322bb0d987d`
(parent checkpoint `c912212c` preserved).  
This is **not** a live-quality pass and **not** launch authorization.

Stopped after the first material Harbor failure. SaaS, three-party, and four-party
samples were **not generated**. No additional provider call was made after stop.

## Execution identity

| Field | Value |
|---|---|
| Result dir | `evals/commercial-readiness/results/quality-eval-live/20260915T125731Z-69053` |
| Matching preflight | `quality-eval-preflight/20260915T125219Z-68447` (`PASS`, 12 checks) |
| Matching offline | `quality-eval-offline-journey/20260915T125322Z-68664` (`OFFLINE_JOURNEY_PASS`; Harbor+SaaS only; not fresh-model) |
| Policy | uncommitted `results/quality-eval-increment-20260915-release-scope.authorized.json` |
| Policy sha256 | `bd7d342b2c6cf76aa2cd0db15dbc07ef532da9d7fe679a631bed852671540938` |
| Default sidecar | still `quality-eval-increment-20260914.inactive.json` / `active: false` |
| Increment flags | `increment_authorized=true`, `increment_active=true`, `authorized_increment_copy` |
| Frontend | production-build; `tracked_diff_sha256` empty |
| Models | premium `gpt-5.4`; bootstrap `gpt-4o-mini` |

`identity.json` was written **before** execution and must not be copied as outcomes:
it labels SaaS `live-model` and three-/four-party `acceptance-stub`. Actual paths
are in the sample table below.

## Classification

| Kind | Result |
|---|---|
| Budget interrupt | No. Ceiling $8, not halted. Additional reserved **$0.358904** of the $2.50 increment. |
| Infrastructure | No. Railway credentials and `gpt-5.4` contact succeeded. Excluded one-pager attempts were blocked (`QualityEvalBlocked`) and did not reserve. |
| Product / validation | **Yes.** Premium handler returned **503** `agreement_validation_failed` after primary + one conditional repair. Visible paper was emptied. |
| Content quality | **Incomplete.** No accepted draft, Apply, GET, reopen, recipient, or signing path was reached. `DRAFT_BROWSER_PASS` was **not** written. |

Browser assertion: `Premium handler must finish successfully` (`generatedResponse.ok()` false).

## Usage (official ledger, not reset)

Baseline 15 attempts / 1,941,421 units ($0.9707105 reserved).

After this run: **19** attempts / **2,659,230** units; reserved **$1.329615**;
known usage **$0.4888105**; halted **no**.

New complete attempts (2026-09-15 Harbor only):

| Bucket | Model | Purpose | Reserved units |
|---|---|---|---|
| bootstrap_parse | gpt-4o-mini | structured_extraction | 2,829 |
| parse | gpt-5.4 | structured_extraction | 63,010 |
| primary | gpt-5.4 | agreement_drafting | 370,850 |
| repair | gpt-5.4 | conditional_repair | 281,120 |

Remaining additional inventory if later re-approved against the same policy:
+3 primary, +3 parse, +3 bootstrap_parse, ≤4 clarification, +3 repair;
global **19/35**; additional reserved room about **$2.14**. Remaining dollars
do not authorize another run.

## Sample outcomes

| Sample | Exercised path | Outcome |
|---|---|---|
| Two-party Harbor consulting | live-model generate (desktop only) | **FAIL** — premium 503; no accepted paper |
| Two-party Orion/Northwind SaaS | not exercised | not generated |
| Three-party IP/royalty | not exercised | not generated |
| Four-party precision-medicine | not exercised | not generated |

Recipient/signing, viewport reopen, and saved-agreement reuse were not reached.
Outgoing email stayed suppressed. No hosted mutation.

## Harbor complete-paper review (stopped before a usable draft)

Supplied deal (filled intake): Harbor Peak Analytics LLC (Consultant) / Ironvale
Manufacturing Inc. (Client); AI workflow implementation; $48,000 fixed fee;
twelve months starting October 1, 2026; Delaware; Consultant owns pre-existing
tools; Client owns deliverables after payment; signers Maya Chen /
Jordan Hale with test emails.

### Outgoing requests (actual)

1. `POST /api/agreements/parse` `ai_model_class=basic` → 200. Two legal parties,
   roles Consultant/Client. Signers and emails not attached. Ironvale name
   dropped the trailing period.
2. `POST /api/agreements/parse` `ai_model_class=premium` `gpt-5.4` → 200.
   **First model-layer party-count error:** six `parties` rows — the two
   entities plus Maya Chen, Jordan Hale, and both emails as separate parties
   (`Consultant signer`, `Client signer`, `… email`).
3. `POST /api/agreements/premium-full-draft` `network_call_reason=entitled_rewrite`
   → **503**. Request `context.parties` had only the two legal entities with
   Consultant/Client. Purpose kept AI workflow implementation and did not
   reintroduce Biotech/CRM. `effective_date` was the generic execution formula,
   not October 1, 2026. `additional_terms` added unsourced commercial
   safeguards (termination-on-notice, SOW/IP follow-the-SOW). No
   `termination for convenience` in the request.

### Raw / visible paper

Server withheld both `document_text` and `server_repair_document_text`.
`draft_quality_trace` is null. The customer screen showed
“LawDog couldn't create the agreement” / “Your information is unchanged.”
Keyword list on the 503 body is not a substitute for the withheld corpus.

Validation that emptied the paper:

- `fallback_applicable_party` — draft contained the unresolved phrase
  `applicable Party`
- `simple_consulting_section_bloat:sections=15>14`

`key_terms_found` on the rejected body still listed customer facts
($48,000, Delaware, October 1 2026 start, pre-existing tools, deliverables
after payment) **and** unsourced extras including termination for convenience,
acceptance process, and a license for embedded consultant tools.

`missing_material_info` asked invoice timing, whether the effective date is
the October 1, 2026 start, and completion criteria. Those questions never
reached the customer because generation was rejected.

### Persisted local draft (created 12:58:18Z, before the 503)

`data/agreements/9b896ced-1e12-4fc4-b8c1-a7f18cf6500e.json`:

- Harbor Peak Analytics LLC stored as **Client**, signer Maya Chen
- Ironvale Manufacturing Inc. stored as **Service Provider**, signer Jordan Hale
- Purpose appended a local semantic-block expansion:
  “dashboard setup, automation support, onboarding assistance, and light
  ongoing maintenance”

That persist is an application-layer customer-meaning error on the create
record. It is **not** what was sent in `premium-full-draft` `context.parties`.
It is also **not** the HTTP failure that stopped the campaign.

### First divergent boundary

1. **Premium parse** is the first observed model boundary that changes legal
   party count (signers/emails promoted to parties).
2. **Create-record persist** independently inverts Consultant/Client into
   Client/Service Provider and invents scope in `purpose`.
3. **Primary + one authorized repair** then produced a draft the production
   validator refused (`applicable Party` + 15 sections). The first gate that
   blocked a customer-visible paper is that post-generation validation.

Do not attribute the emptied paper to the evaluator. The handler withheld
rejected text by design.

## Convenience

Not recorded. No `*-continuation.json`. Scripted action reached filled Harbor
intake only. Clarification/repair UI was not shown. Timing: live run
~130 seconds wall; Harbor failed inside the 300s sample timeout.

## Remaining blockers

- Harbor live-model paper is not accepted; three later samples untested.
- Complete-agreement assessment of Harbor is blocked until an accepted
  `document_text` exists.
- Two-to-four-party U.S.-law release scope remains **not** established by
  fresh-model evidence.
- Local stub/offline rematches on `bb66046c` still stand; they are not this
  increment’s quality result.

## Stop

Do not rerun `--live` without a new explicit authorization. Do not regenerate
to repair observation. Do not push, deploy, send live email, change Stripe,
or claim launch readiness.
