# LawDog QA Run — Results Template

Copy this file per run: `qa/results/YYYY-MM-DD-run-name.md` (gitignore `qa/results/` if desired).

## Run metadata

| Field | Value |
|-------|-------|
| **Date** | |
| **Tester** | |
| **Environment** | staging / production |
| **Build / commit** | |
| **API base** | |
| **App URL** | |
| **Device matrix** | e.g. iPhone Safari, Pixel Chrome, Mac Safari |

## Summary

| Metric | Count |
|--------|-------|
| Pass | |
| Fail | |
| Blocked | |
| Skip | |

## Matrix rollup (link to `docs/QA_MATRIX.md` rows)

| Matrix area | Pass | Fail | Notes |
|-------------|------|------|-------|
| Premium vs Free | | | |
| Checkout restore | | | |
| Signing flow | | | |
| Recipient experience | | | |
| Export/PDF | | | |
| Mobile | | | |
| Genesis referral | | | |
| Failure recovery | | | |

## Scenario results (`docs/GTM_SCENARIOS.md`)

| Scenario ID | Title | Status | AHA score (1–5) | Notes |
|-------------|-------|--------|-----------------|-------|
| | | pass / fail / blocked | | |

## Premium AHA highlights

- **Best moment:**
- **Worst moment:**
- **Screenshot-worthy?** yes / no — why:

## Defects filed

| ID | Severity | Summary | Repro steps |
|----|----------|---------|-------------|
| | P0–P3 | | |

## Sign-off

- [ ] Top 10 manual tests (`MANUAL_QA_RUNBOOK.md`) executed
- [ ] No P0 open for launch slice
- [ ] Release smoke (`scripts/release_smoke.py`) if deploy-related
