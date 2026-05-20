# Free vs Pro Output Comparison — Run Log

**Run date:** YYYY-MM-DD  
**Tester:**  
**Build / branch:**  
**Environment:** local | staging | prod  
**Pro generation:** live LLM | degraded fallback | mock  

Copy this file to `qa/results/free-vs-pro-YYYY-MM-DD.md` per session.

---

## Session summary

| Metric | Value |
|--------|-------|
| Scenarios run | /10 |
| Pro average AHA (1–5) | |
| Blockers | |
| Ship recommendation | pass / hold |

---

## Per-scenario rows

### Scenario 1

| Field | Value |
|-------|-------|
| **Fixture ID** | e.g. `creator-001` |
| **GTM scenario** | e.g. `creator-001` or `saas-001` |
| **Prompt source** | `qa/fixtures/creator-economy-prompts.json` |
| **Prompt (paste or link)** | |

**Free output summary**

- Title:
- Parties:
- Length / sections:
- Disclaimer / tier markers:
- Notable gaps:

**Pro output summary**

- Title:
- Executive framing / callout:
- Length / sections vs Free:
- `missing_material_info` / gap UX:
- Contradiction handling:

**Issues**

| Type | Notes |
|------|-------|
| Correctness | |
| Hallucination / overclaim | |
| Contradiction handling | |
| Emotional tone | |
| Screenshot-worthy (Pro) | yes / no / partial |

**Rubric (Pro only, 1–5)**

| Dimension | Score |
|-----------|-------|
| smart_delta | |
| personalized | |
| ambiguity | |
| shareable | |
| trust | |
| worth_it | |

| Question | Answer |
|----------|--------|
| **Pro AHA overall (1–5)** | |
| **Would pay $39/mo?** | yes / no / maybe |
| **Fixes needed** | |

---

### Scenario 2

(Duplicate section above for each scenario.)

---

## Top-10 checklist

- [ ] `creator-001`
- [ ] `messy-004`
- [ ] `short-002` or `saas-001`
- [ ] `contra-001`
- [ ] `emo-001`
- [ ] `crypto-001`
- [ ] `short-001` (NDA)
- [ ] `emo-003` or `short-005` (settlement/release)
- [ ] `short-003` (consulting/payment)
- [ ] Recipient sign (Flow E — `MANUAL_QA_RUNBOOK.md`)

---

## Automated pre-checks (same day)

```bash
uv run pytest backend/tests/test_free_vs_pro_output_qa.py backend/tests/test_premium_generation_intelligence_fixtures.py -q
npm --prefix frontend exec vitest run src/components/agreements/freeVsProOutputQa.test.ts -q
python3 scripts/compare_free_pro_fixtures.py
```

| Command | Pass? |
|---------|-------|
| Backend pytest | |
| Frontend vitest | |
| Fixture script (dry-run) | |
