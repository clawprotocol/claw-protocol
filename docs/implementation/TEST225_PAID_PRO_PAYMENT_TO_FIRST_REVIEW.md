# Test225 — Paid Pro payment → first review latency

## Summary

After checkout, a degraded `json_parse` premium-full-draft body (~6.2k chars) can satisfy Blue Canyon display recovery while failing client structural gates. The pipeline previously issued a blocking `degraded_structural_retry` (~17k second response). Test225 skips that retry when display requirements are met and uses `premium_degraded_server_local_recovery` without establishing SoT.

**Core gate:** `shouldSkipPremiumStructuralRetryForDegradedDisplay()` in `frontend/src/components/agreements/paidProPostCheckoutRenderGate.ts`  
**Wiring:** `frontend/src/components/agreements/premiumCompletionPipeline.ts`  
**Tests:** `frontend/src/components/agreements/qa/paidProHardening/paidProTest225PaymentToFirstReviewLatency.test.ts`, `paidProPostCheckoutRenderGate.test.ts`, `paidProPostProcessingBudget.test.ts`

**Known limitation:** First model-call latency is unchanged; Test225 removes the optional second structural HTTP call only when skip predicates match.

---

## Automated QA

- **Status:** Complete and passing.
- Vitest covers skip path (one premium HTTP call, local recovery render source, no SoT), network budget ledger, waterfall span keys, `shouldSkipPremiumStructuralRetryForDegradedDisplay` false-branch matrix, and post-processing budget.

---

## Live QA

- **Status:** **Not complete** — do not mark Test225 live QA complete.

### Attempt (local)

- Run with `VITE_PAID_PRO_PERF_TRACE=1`.
- Blue Canyon payment-return simulation: `/app/create?premiumCompletion=1` with Test220 intake fixture and checkout session markers.
- Backend: `http://127.0.0.1:8000` (live `POST /api/agreements/premium-full-draft`).

### Observed

- Single premium-full-draft HTTP call; no `degraded_structural_retry`.
- Server response was **`server_full_draft`** path (`generation_outcome`: `needs_details` in browser run, or `ok` on direct API probe) — **not** the targeted **degraded `json_parse`** display-eligible body (≥6k, Blue Canyon display floor).
- `[paid-pro-waterfall]` did **not** include `degraded_display_eligible` / `skip_structural_retry`.
- **No client regression observed** for the path that ran (normal accept when skip predicates are false).

### Conclusion

The **Test225 skip path was not exercised live** because the environment did not reproduce degraded `json_parse` at ≥6k with Blue Canyon display requirements.

**Live validation remains pending** until either:

1. Rerun in an environment known to reproduce the degraded `json_parse` response on checkout completion, or  
2. Add a controlled backend/dev flag to force the degraded `json_parse` Blue Canyon response for live browser QA (if product/engineering accepts that approach).

### Live checklist (when preconditions are met)

- [ ] Exactly one `checkout_completion` premium-full-draft HTTP call  
- [ ] No `degraded_structural_retry`  
- [ ] Render source = `premium_degraded_server_local_recovery`  
- [ ] No SoT established from local recovery  
- [ ] First review without second ~17k full-draft wait  
- [ ] `[paid-pro-waterfall]` shows `degraded_display_eligible` skip path  

---

## Rollback

Revert Test224/225 latency commits or restore pre-skip behavior in `paidProPostCheckoutRenderGate.ts` and `premiumCompletionPipeline.ts` (structural retry on ACC reject when body is not long-commercially-usable).
