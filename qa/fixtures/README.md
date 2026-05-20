# LawDog QA Fixtures

Synthetic, non-sensitive prompts for manual and exploratory QA. **Do not** commit real client data, PII, or live agreement text.

## Usage

1. Copy a `prompt` value into `/app/create` intake (or paste into your test harness).
2. Record results in `qa/QA_RESULTS_TEMPLATE.md` (or JSON variant).
3. Cross-reference scenario IDs in `docs/GTM_SCENARIOS.md`.

### Premium generation intelligence (no LLM)

```bash
uv run pytest backend/tests/test_premium_generation_intelligence_fixtures.py -q
```

Asserts `build_premium_generation_intelligence_brief` signals for curated fixture IDs before any model call.

### Free vs Pro side-by-side output QA

See `docs/FREE_VS_PRO_OUTPUT_QA.md` and `qa/FREE_VS_PRO_RESULTS_TEMPLATE.md`.

```bash
uv run pytest backend/tests/test_free_vs_pro_output_qa.py -q
npm --prefix frontend exec vitest run src/components/agreements/freeVsProOutputQa.test.ts -q
python3 scripts/compare_free_pro_fixtures.py
```

## Files

| File | Intent |
|------|--------|
| `short-prompts.json` | Minimal viable inputs |
| `messy-prompts.json` | Typos, slang, incomplete sentences |
| `giant-prompts.json` | Long paste / scope creep stress |
| `contradictory-prompts.json` | Conflicting terms in one message |
| `emotional-prompts.json` | High-stakes human context |
| `creator-economy-prompts.json` | Sponsorships, UGC, affiliates |
| `crypto-prompts.json` | Web3 / token / DAO patterns |

## Fixture shape

```json
{
  "id": "messy-001",
  "title": "Short label",
  "prompt": "User text...",
  "tags": ["saas", "messy"],
  "premium_expectations": ["Defines parties despite typos", "Flags missing governing law"],
  "risk_notes": ["May over-assume Delaware"]
}
```
