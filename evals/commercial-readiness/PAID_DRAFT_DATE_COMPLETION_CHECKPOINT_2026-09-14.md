# Paid-draft date meaning and consulting completion — 2026-09-14

Authoritative repository: `lawdog-repo`  
Branch: `stabilize/phase3b-paid-entry`  
Started from exact HEAD: `96cd7248d803a8bdf2d8072ab409d242e6a255f5` — “Record returning-customer editor continuity checkpoint.” Continuity C3/C4 on `68775a946b09a48708fb4ef6eff55e327acea7ed+src-185caa72f8f6a3c6c444dd22163afa65d032219b+run-20260914T143749Z-71780` remains the scoped close for editor reopen. Nothing was reset or overwritten. Nothing was pushed.

## Committed source mapping

Official C5 close ran against the uncommitted working tree at HEAD `96cd7248d803a8bdf2d8072ab409d242e6a255f5` with source fingerprint `ba7dbe25691bf522da2a95a9b68db31fbacc694b`:

`96cd7248d803a8bdf2d8072ab409d242e6a255f5+src-ba7dbe25691bf522da2a95a9b68db31fbacc694b+run-20260914T155024Z-82989`

Fingerprint was `ba7dbe25691bf522da2a95a9b68db31fbacc694b` before and after that official run. The implementation/tests commit `95ebe9525041e9e62436bd6e49e7bcb4440ef487` hashes the same product/test files (`src-ba7dbe25691bf522da2a95a9b68db31fbacc694b`). Historical `evals/commercial-readiness/results/**` directories remain uncommitted, including failed official runs `src-fcb29ab9bd2b`, `src-00f043e8f692`, and `src-c0f5e6f9b4df`.

This is **not** a launch authorization and is **not** a live-model quality pass. No provider calls, deployment, billing changes, ledger writes, Stripe/email, or sitemap work.

`canProceedWithoutAnswer: true` is unchanged. Official I2 stays party-name `agreement-intake-clarification`. Harbor filled intake is unchanged: fixed $48,000, term twelve months starting October 1, 2026, no invoicing/due terms.

## Defects established before the fix

Preserved originals were not edited:

- Live consulting: `evals/commercial-readiness/results/quality-eval-live/20260913T231438Z-12993/`
- Portable replay: `evals/commercial-readiness/fixtures/consulting-unconfirmed-payment-replay.json`
- SaaS control: `PHASE4C1_COMPLETE_SAAS` (Orion Harbor / Northwind hosted platform)

| Finding | Class | Customer consequence |
|---|---|---|
| Opening “as of the Effective Date” or copying October 1 term start into the opening | **Confirmed defect** | Customer sees a defined Effective Date that was never supplied |
| Invoice/signature dates treated as the agreement effective date | **Confirmed defect** | Payment wording could silently “confirm” a different legal fact |
| Harbor names AI workflow implementation and Client-owned deliverables after payment, but not what marks completion | **Confirmed defect** | Scope looks finished without a completion mark |
| `undefined_acceptance_criteria` keyword warning | **Low-severity warning** | Adding “approval” or hiding the warning does not add adequate detail |
| Invented net-30 / installment schedule | Already closed | Kept as payment regression; not reopened |
| Notice 13-before-11/12 | Already closed | Kept as notice-order regression; not reopened |
| C3/C4 editor continuity | Already closed | Kept as regressions on this fingerprint |

Product decision unchanged: review/share/sign remain available without answering (`canProceedWithoutAnswer: true`). A new mandatory signing restriction was not added.

## Customer-visible change

Date meanings are distinct: agreement effective date, service/term start, invoice date, signature date. The product asks when only a term start is supplied, when the two dates are explicitly the same or different, and when a later answer is TBD or contradictory. It does not invent a date or rewrite accepted/signed paper.

Consulting completion asks what should mark completion of the named work and appends the customer’s sentence to scope. It does not invent milestones, deemed acceptance, SLAs, or extra obligations. Hosted SaaS with no professional services does not receive consulting deliverables or a project-acceptance process.

First-draft display no longer prepends an undefined Effective Date. After an explicit same-date answer, the opening is labeled `as of October 1, 2026 (the "Effective Date")`, the term start remains October 1, 2026, and the completion sentence is in scope. Fresh reopen does not re-ask resolved questions.

Manual-edit recovery is **not** claimed. C5 proves question → Apply → GET/visible/reopen.

## Official results (do not collapse)

Playwright **18/18**, required matrix **17×2 = 34/34**, `viewport_incomplete=0`, `gate_green=true`. Production `tsc -b && vite build` passed on the same frozen fingerprint.

### C5 — date meaning and consulting completion

| Viewport | Result | Binding |
|---|---|---|
| Desktop | **pass** | agreement `09db763d-28bc-4e78-9a4f-a3f1920e480d`, snapshot `crs_33f3831b45c6416c89952cf740abf72e`, digest `ab5f44aa…`, 2903 chars |
| Mobile | **pass** | agreement `538874f3-868b-4655-a608-bb8f3e07fe53`, snapshot `crs_4d9f0af4e0e44a5e9b55bff6769a6972`, same digest, 2903 chars |

After Apply, both articles show labeled Effective Date, preserved AI workflow implementation, and “Completion is Client's written confirmation that the implemented AI workflow is in operational use.” Term start remains October 1, 2026 (line-broken presentation is tracked separately; not a new date).

### Regressions kept closed

C3 and C4 desktop+mobile passed on this fingerprint (desktop C3 `a57c389d-…` / `crs_e8d34d2a…`). Payment wording, notice order, revision/org isolation, delayed-save, and accepted/signed immutability were not reopened.

Failed official evidence retained (do not delete): `src-fcb29ab9bd2b` (C3/C5; opening rewrite), `src-00f043e8f692` (payment-reload line-break + C5 panel missing), `src-c0f5e6f9b4df` (C5 panel present; first-draft still invented Effective Date).

## Evidence classes (do not collapse)

| Class | Status |
|---|---|
| Workflow demonstrated with stubs | **Closed on this fingerprint** (18/18, 34/34) |
| Saved real-response behavior verified offline | **Closed** for the preserved consulting replay + Harbor filled intake through production guards/display |
| Fresh live-model quality | **Unverified.** Ledger inspected read-only; no calls |
| Hosted billing / authentication / delivery / ops | **Not verified** here. Require their own evidence |

“Not implemented” is reserved for functionality confirmed absent. Date/completion clarification now exists. Live-model quality, Stripe/entitlement, live email, and support-console ops remain unimplemented as *current proof*, not as missing code in this batch.

## Next live-quality evaluation (not authorized)

Ledger `evals/commercial-readiness/results/quality-eval-approved-20260913.sqlite3` inspected only (2026-09-14T15:55Z). Ceiling **$8.00** / `16000000` units, model **gpt-5.4** (5/30 half-microdollars = $2.50/$15.00 per million), not halted, attempts **11/16**, known-usage **$0.249751**, reserved **$0.611731**.

| Bucket | Used / limit |
|---|---|
| primary | **2/2 exhausted** |
| bootstrap_parse | **2/2 exhausted** |
| parse | 3/4 |
| clarification | 0/4 |
| repair | 1/2 |
| revision | 0/2 |
| negotiation | 0/1 |
| bootstrap_one_pager | 3/4 |

Do not reuse the 2026-09-13 proposal’s gpt-4o $2.50/$10 or 16-fresh-call assumptions.

**One concrete next acceptance requirement:** a separately authorized live `gpt-5.4` evaluation that runs Harbor consulting and Orion Harbor/Northwind SaaS through the actual production draft → clarification → visible paper → reopen path, and accepts only if the opening does not invent an undefined Effective Date, consulting completion is asked or already supplied without invented milestones/SLAs, the SaaS control stays hosted-access-only, and `canProceedWithoutAnswer` remains true. Current `primary` and `bootstrap_parse` buckets cannot run that evaluation. Remaining dollars in other buckets do not authorize those calls. This batch did not reset counters, raise the cap, change the model, or place any call.
