# Paid Pro review visual QA

## Dev fixture

`/dev/qa/paid-pro-review-ux` (DEV-only route in `ClawProductApp.tsx`) renders frozen Test204 corpus, Review Status, and inline signer setup without full `AgreementBuilderIntake`.

## Playwright capture

From `frontend/`:

```bash
npx playwright test e2e/capture-paid-pro-review-ux.spec.ts
```

Writes PNGs and `gap-measurements.json` under `docs/qa/visual/test266-paid-pro-review-ux/`. Regenerate after layout changes; generated artifacts are not required in git.

## Spacing probes

- `statusToSignerHeadingPx`: Review Status panel bottom → “Signer details” `h2` top (target 24–48px).
- `statusToActionsPx`: -1 when `simple-pro-final-review-actions` is suppressed.
