# Phase 3B Batch 2.2 checkpoint — paid-document integrity

Authoritative repository: `lawdog-repo`  
Branch: `stabilize/phase3b-paid-entry`  
Started from: `2f812cc9` (`record phase 3B batch 2.1.3 frozen-authority fail-closed checkpoint`)  
Nothing was pushed.

This closes three paid-document integrity identities. It is **not** a launch authorization.

## Invariant

Opening and notice normalization may run **once** before the canonical server snapshot is frozen.

- Already-titled corpora with a single canonical `entered into as of the Effective Date by and between` recital are byte-idempotent. Missing role appositives do not prepend a second opening. Competing leftover titles / `This Agreement is between` residue still repair once.
- Contaminated `If to … Attn/Role/Email/By` fragments rebuild into exactly one clean operative notice stanza per legal party. Metadata labels are never party names.
- After freeze, review and signing surfaces do not rewrite the operative legal body. Signer execution overlay may change the witness / signature / date tail only. Presentation overlays do not become new canonical legal text.

No Alex, PixelForge, fixture-hash, title, or party-count special cases. Assertions, body comparators, snapshots, access policy, and timeouts were not weakened.

## Batch 2.2 identities

| Identity | File | Isolated | Official raw set |
|---|---|---|---|
| Already-titled Pro corpus is byte-idempotent | `paidProAlexPixelForgeSignerFinalizeReady.test.ts` | **8/8** | left (closed) |
| Contaminated notice labels rebuild to one stanza per party | `paidProNoticeMetadataLabelContamination.test.ts` | **4/4** | left (closed) |
| Completed / review / PDF preserve frozen clause body | `paidProTest497CompletedCorpusFrozenBody.test.ts` | **1/1** | left (closed) |

## Runtime

- `ensurePaidProServicesAgreementOpening` skips rewrite when the corpus is already titled, has one canonical entered-into recital, and has no competing opening residue.
- Contaminated `If to` stanzas are dropped from reuse / trim uniqueness; `ensureOperativeIfToNoticeDelivery` force-rebuilds when any stanza has metadata-label contamination.
- Display-only review / authoritative render use frozen SoT bytes (no title or frozen-display projection into document-surface plain).
- `applyPaidProSoTSignerExecutionOverlay` keeps the frozen clause when overlay would change it, and applies only the overlaid execution tail.

## Preservation

Isolated after this batch:

- Batch 2.1.3 fail-closed — **7/7**
- TEST505 — **6/6**
- TEST366 — **3/3**
- TEST498 completed-artifact parity — passed
- TEST499 three-party completed artifact — passed
- Canonical notice / freeze authority and 2/3/4-party gate paths exercised by Phase 2

TEST464 (`Eve Green` witness on reconstructed signed corpus) still fails isolated. Same failure at `2f812cc9`. Not introduced here.

## Verification

### Paid-journey gate additions

Added to `frontend/vitest.phase2PaidJourney.runner.config.ts`:

- `paidProAlexPixelForgeSignerFinalizeReady.test.ts`
- `paidProNoticeMetadataLabelContamination.test.ts`
- `paidProTest497CompletedCorpusFrozenBody.test.ts`

### Phase 1

`./scripts/run_phase1_access_contract_gate.sh` — **96/96**

### Phase 2 paid-journey

`./scripts/run_phase2_paid_journey_release_gate.sh` — **68 files, 396 passed**, zero failures

### Backend ownership

`test_commercial_read_scope_fail_closed`, `test_commercial_p0_auth_boundary`, `test_accepted_review_snapshot_authority`, `test_dashboard_resume_freeze_canonical_auth` — passed

### Production build

`frontend`: `tsc -b && vite build` succeeded

### Complete frontend suite (exactly once)

```bash
cd frontend && ./node_modules/.bin/vitest run --reporter=json --outputFile=/tmp/phase3b-batch22/frontend-full.json
```

| Check | Official baseline | This run |
|---|---:|---:|
| Inventory | 9,458 | 9,471 |
| Passed | 9,240 | 9,262 |
| Raw failed assertions | 218 | 209 |
| Failed suites | 366 | 353 |
| Suite-load files | 14 | 14 |

Inventory +13 is from tests collected since the Batch 2 official run (2.1.x behavior files and later). Suite-load files are unchanged.

The three Batch 2.2 identities left the official raw set and stay isolated-green.

## Order-dependent / do not subtract

Left the official raw set but **not** claimed as this-batch closures:

- TEST452, TEST486 — known json_parse suite-order flaps
- TEST505 frozen-hash row — closed in Batch 2.1; this is the first full run since then
- TEST219 / TEST512 / TEST514 hash-parity rows, LawDog/Acme first-review cluster, TEST413, `guidedFinalReviewAuthoritativeBody` — absent here; not subtracted without isolated-red proof at `2f812cc9`

New in this raw set but **not** new isolated product identities (isolated-green, or failing at `2f812cc9`):

- TEST207 quality-fixture collapse — isolated **pass**
- TEST367 degraded json_parse recovery — isolated **pass**
- TEST400 json_parse prose recovery — isolated **pass** (classic flap; TEST400 was in the Batch 2 do-not-subtract list)
- `premiumCompletionPipelineAdvisoryDecoupling` — isolated **pass**
- TEST511-6 `premiumGenerationCallReason: "entitled_rewrite"` — isolated **fail at `2f812cc9`** (source-inspection; pre-existing)

## Remaining launch blockers

- **No launch-readiness claim**
- TEST464 completed signed artifact (`Eve Green` witness) — pre-existing at `2f812cc9`
- TEST406 four-party finalize expects notice emails/addresses in post-freeze **review document-surface plain**. Isolated **pass at `2f812cc9`**, isolated **fail after this batch**. Filling those fields would mutate the frozen operative notice body. That is a lifecycle conflict with TEST497 (review/signing/PDF may change execution presentation only). Reported, not patched by rewriting frozen notices.
- TEST341 competing-opening dedupe appeared in this official raw set (isolated-red on the first short-circuit). The short-circuit was then narrowed so competing residue still repairs once; isolated TEST341 is **2/2** on the committed code. The official suite was not rerun, so TEST341 remains in the 209 raw list and is **not** subtracted.
- Official raw remainder after honest accounting still includes the persistent paid-create / after-pay / dashboard / json_parse / hash-parity / suite-load families from the 218 baseline
- Live model, Stripe, email, and staging were not run
