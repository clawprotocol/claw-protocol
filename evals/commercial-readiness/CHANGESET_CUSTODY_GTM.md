# Change-set custody — GTM $49/10 closure (from `7fa000a3`)

**Rule:** Do not commit unclear-provenance, diagnostic, generated, or eval-only work.

## Dirty / untracked at start (relative to `7fa000a3`)

| Path | Classification | Action |
|---|---|---|
| `backend/llm_router.py` | Unrelated / unclear for GTM — usage_sink enrichment for draft-quality tracing only | **HOLD** — committed router already used by production imports; uncommitted diff not required for $49/10 |
| `data/recipient_tokens/validate_usage.jsonl` | Temporary / runtime diagnostic | **EXCLUDE** |
| `.rc-validation/**` | Temporary diagnostic | **EXCLUDE** |
| `backend/tests/test_draft_quality_*.py`, `test_live_offline_eval_parity_gate.py`, `test_packet_completeness_validator.py` | Evaluation-only | **EXCLUDE** |
| `evals/draft-quality/**` | Evaluation-only / H0 | **EXCLUDE** |
| `evals/commercial-readiness/baselines/**` | Generated artifact | **EXCLUDE** |
| `examples/epoch-0003/**`, `tests/fixtures/**` | Unclear provenance | **EXCLUDE** |
| `frontend/src/components/agreements/semanticTermFamilyParity.test.ts` | Evaluation-only | **EXCLUDE** |

## Product release work (this pass)

Backend pricing, quota constants/policy, Genesis commission math, Stripe/checkout surfaces, FE pricing/billing/paywall/affiliate copy, commercial docs, lifecycle/release-gate tests.

## llm_router hold proof

- Production paths import `call_legal_llm` from committed module (`agreements_v2_api`, `premium_agreement_finalization`, etc.).
- Uncommitted diff only expands `usage_sink` metadata (`finish_reason`, `response_id`, …) for eval tracing.
- **Do not commit** unless a clean-tip import/runtime failure proves dependency (none observed).
