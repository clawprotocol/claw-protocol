# Free vs Pro Agreement Output QA

Repeatable workflow to compare **actual Free (starter) and Pro (full-draft) agreement outputs** for correctness, perceived intelligence, and GTM readiness.

**No redesign, no pricing changes, no CI that requires paid OpenAI calls.**

Related: `PREMIUM_AHA_RUBRIC.md`, `GTM_SCENARIOS.md`, `qa/fixtures/`, `qa/FREE_VS_PRO_RESULTS_TEMPLATE.md`.

---

## Generation paths (where output comes from)

### Free / starter path

| Layer | Location | What it produces |
|-------|----------|------------------|
| Parse (optional LLM) | `POST /api/agreements/parse` with `ai_model_class: "basic"` | Structured `ParsedDraftShape` JSON (`backend/routers/agreements_v2_api.py` → `parse_agreement_intake`, `_heuristic_parse_intake` fallback) |
| Client orchestration | `AgreementBuilderIntake.tsx` → `parseDraft`, `commitFreeDraftForReview` | Draft state for review |
| Deterministic structure | `parseIntakeToStructuredAgreement`, `runIntakeDefaultsAndRoles`, `applyDeterministicCommercialIntakeFallback` | Parties, family, scope without Pro LLM |
| **Visible starter text** | `buildAgreementPreviewText(draft, { starterPreview: true })` in `agreementPreviewFromDraft.ts` | Plain-text **starter preview** (includes `simplified starter preview` disclaimer) |
| Review UI | `StarterDraftDocumentSurface.tsx`, `freeStreamlineDraftReview.ts` | Free-tier review chrome |

**Free does not call** `POST /api/agreements/premium-full-draft`.

### Pro / premium path

| Layer | Location | What it produces |
|-------|----------|------------------|
| Pre-model brief (no LLM) | `build_premium_generation_intelligence_brief` → injected in `build_premium_full_draft_user_payload_for_airlock` | `generation_intelligence_brief` on full-draft request |
| Full document (LLM) | `POST /api/agreements/premium-full-draft` → `premium_full_draft` in `agreements_v2_api.py` | `document_text`, `key_terms_found`, `missing_material_info` |
| Client pipeline | `premiumCompletionPipeline.ts` → `runPremiumCompletion` / `postPremiumFullDraftWithRetry` | Merged draft + authoritative `document_text` |
| Pro framing (no LLM) | `premiumSituationIntelligence.ts`, `premiumDocumentRenderHints.ts` | Executive line, contradiction note |
| Readonly / PDF HTML | `premiumAgreementDocumentHtml.ts` → `buildPremiumAgreementReadonlyHtml` | Pro paper (strips starter disclaimer) |
| Post-checkout | `ensurePremiumCompletion`, `commitAuthoritativePremiumDocument` | Hydrated Pro body after pay |

### Where OpenAI is called

All via `backend/llm_router.py` → `call_legal_llm`. Agreement-relevant routes in `agreements_v2_api.py`: `/parse` (basic + premium), `/premium-full-draft` (+ repair), `/premium-missing-facts`, `/premium-review`, `/premium-refine`, etc.

**Tests and scripts in this harness default to no LLM.** Use degraded/mocked paths or deterministic layers only.

### Test / stub modes (no API spend)

| Mode | Use |
|------|-----|
| **Vitest** | `parseIntakeToStructuredAgreement` + `buildAgreementPreviewText` for Free; mock `premiumFullDraftApi` for pipeline tests |
| **pytest** | `build_premium_generation_intelligence_brief` + fixture regression; `monkeypatch` `call_legal_llm` for API tests |
| **Playwright** | Route mocks for `/parse`, `/premium-full-draft` (`frontend/e2e/`) |
| **Server degraded** | Missing `OPENAI_API_KEY` → `premium_full_draft` returns structured fallback (`generation_outcome: "degraded"`) — not a substitute for real Pro QA |

---

## Automated checks (no LLM)

```bash
# Backend: intelligence brief + Free vs Pro payload separation
uv run pytest backend/tests/test_free_vs_pro_output_qa.py backend/tests/test_premium_generation_intelligence_fixtures.py -q

# Frontend: starter vs Pro framing, disclaimer strip, fixture-driven checks
npm --prefix frontend exec vitest run src/components/agreements/freeVsProOutputQa.test.ts -q

# Dry-run manual checklist from fixtures
python3 scripts/compare_free_pro_fixtures.py
```

---

## Manual side-by-side procedure

### Setup

1. Two browsers or profiles: **Free** (logged out or free tier) and **Pro** (paid or dev tier override per `docs/LOCAL_DEV.md`).
2. Copy `qa/FREE_VS_PRO_RESULTS_TEMPLATE.md` → `qa/results/free-vs-pro-YYYY-MM-DD.md` (gitignored).
3. Use the **same fixture prompt** verbatim for both runs.

### Steps (per scenario)

1. **Free:** `/app/create` → paste prompt → generate starter → capture:
   - Title, party count, payment line, preview length
   - Screenshot (mobile + desktop if possible)
   - Note: Pro-only headers absent from preview body? (tier copy may appear in UI chrome separately)
2. **Pro:** Same prompt → complete intake → pay/checkout (or dev Pro) → wait for full Pro body → capture:
   - Executive framing / contradiction callout (if any)
   - Full document scroll (first screen + signature block)
   - `missing_material_info` / gap UX if shown
3. **Score Pro** with `PREMIUM_AHA_RUBRIC.md` (dimensions 1–5 + holistic `worth_it`).
4. **Compare:** Is Pro materially smarter, or only longer? Record in results template.

### What counts as a failure

| Severity | Examples |
|----------|----------|
| **Blocker** | Wrong agreement family; parties dropped; Pro shows starter shell only; starter disclaimer on Pro PDF; contradictory terms encoded silently both ways |
| **Major** | Pro AHA ≤ 2 on `trust` or `smart_delta`; Free and Pro identical substance; hallucinated parties/amounts; aggressive tone on emotional fixture |
| **Minor** | Thin payment placeholder; jurisdiction TBD; polish/copy nits |
| **Pass** | Pro ≥ 4 on top scenarios; Free acceptable as teaser; contradictions surfaced; calm emotional tone |

### Logging results

- **Path:** `qa/results/` (local only, see `qa/results/.gitignore`)
- **Template:** `qa/FREE_VS_PRO_RESULTS_TEMPLATE.md`
- Optional: also copy dimension scores into `qa/QA_RESULTS_TEMPLATE.json` under a `free_vs_pro` key for tracking.

---

## Top-priority manual scenarios (run first)

| # | ID / source | Prompt source | Free focus | Pro focus |
|---|-------------|---------------|------------|-----------|
| 1 | `creator-001` | `qa/fixtures/creator-economy-prompts.json` | Short scope, usage window hinted | UGC/whitelisting, deliverables, FTC if ads |
| 2 | `messy-004` | `qa/fixtures/messy-prompts.json` | Parses parties/deal despite typos | Usage limits, payment trigger, not “forever” default |
| 3 | `short-002` / `saas-001` | `short-prompts.json` / `GTM_SCENARIOS.md` | Subscription one-liner | Autorenewal, LoL, termination, data hook |
| 4 | `contra-001` | `qa/fixtures/contradictory-prompts.json` | Intake amber contradiction warning | Single coherent grant + forks in gaps |
| 5 | `emo-001` | `qa/fixtures/emotional-prompts.json` | Calm starter, no fear copy | Neutral remedies, no overbroad restrictions |
| 6 | `crypto-001` | `qa/fixtures/crypto-prompts.json` | Generic commercial OK on Free | Cautious license/royalty; no securities advice |
| 7 | `short-001` | `qa/fixtures/short-prompts.json` | NDA family/title | Mutual vs one-way clear, term, CA law |
| 8 | `emo-003` / `short-005` | emotional / short fixtures | Release framing if visible | Settlement/release structure, no admission |
| 9 | `short-003` | `qa/fixtures/short-prompts.json` | Consulting skeleton | Deliverables, payment, IP, termination |
| 10 | Recipient sign | `MANUAL_QA_RUNBOOK.md` Flow E | N/A (owner sends) | Recipient trust copy, readonly, sign apply |

---

## Scoring with PREMIUM_AHA_RUBRIC

Score **Pro only** per dimension (`smart_delta`, `personalized`, `ambiguity`, `shareable`, `trust`, `worth_it`). Note **Free baseline** in one sentence (“outline-only, disclaimer present”) for comparison.

**Pass bar (Genesis slice):** average ≥ **3.5** on top 10; no dimension ≤ **2** on trust/safety.

**Psychological bar:** User should feel Pro *understood the deal* — not that Pro is merely longer.

---

## Fixture replay safety

| Replay type | Safe without LLM? | Command / method |
|-------------|-------------------|------------------|
| Intelligence brief | Yes | `pytest backend/tests/test_premium_generation_intelligence_fixtures.py` |
| Free starter preview | Yes | `vitest freeVsProOutputQa.test.ts` |
| Full Pro `document_text` | No (unless mocked/degraded) | Manual with Pro account or E2E mock |
| Side-by-side output | Manual | This runbook + results template |

---

## Optional live comparison

```bash
# Dry-run checklist only (default)
python3 scripts/compare_free_pro_fixtures.py

# Hit local API (requires running backend + OPENAI_API_KEY for real Pro text)
CLAW_COMPARE_LIVE=1 CLAW_API_BASE=http://127.0.0.1:8000 python3 scripts/compare_free_pro_fixtures.py --live
```

### Live Pro scoring (full document + rubric)

```bash
export OPENAI_API_KEY=sk-...
export CLAW_EVAL_LIVE_PRO=1

uv run python scripts/eval_pro_output_correctness.py --live
# Copy qa/FREE_VS_PRO_RESULTS_TEMPLATE.md → qa/results/free-vs-pro-$(date +%Y-%m-%d).md
# Score each scenario in the app; update qa/results/pro_output_correctness_<date>.md with live AHA scores
```

Live mode is **opt-in**; never required for CI.

---

## Correctness risks to watch (from code inspection)

1. **Pro hydration flash** — starter text visible before authoritative Pro body commits (`AgreementBuilderIntake` checkout return).
2. **Degraded full draft** — without API key, Pro path may look like structured fallback; do not score as real Pro LLM output.
3. **Emotional overreach** — `emo-001` may trigger broad restrictive clauses if model ignores `tone_directive`.
4. **Contradiction drift** — intake hints (`intakeContradictionHints`) vs model output may diverge if brief ignored.
5. **Free/Pro identity** — starter must not show `This LawDog Pro agreement` header (see `starterDraftEndToEnd.test.ts`).

Report new blockers in `qa/results/` and file engineering issues separately.
