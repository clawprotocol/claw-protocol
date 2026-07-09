# Frontend E2E (Playwright)

## Execution model

Playwright specs are **acceptance / manual-CI supplements**, not part of default repository CI.

| Layer | CI (`scripts/test.sh` / `.github/workflows/tests.yml`) | Local acceptance |
|-------|--------------------------------------------------------|------------------|
| Backend | `pytest` | `make test` |
| Frontend unit/integration | `npm --prefix frontend test` (Vitest) | `cd frontend && npm test` |
| Playwright E2E | **Not run in CI** | See below |

Repository policy intentionally runs Vitest on every CI push/PR. Playwright requires browser binaries and a dev server; slice acceptance specs are run locally or in dedicated QA environments.

## Prerequisites

```bash
cd frontend
npm install
npx playwright install chromium
```

## Run slice acceptance spec (Dashboard Paid-Create entitled entry)

```bash
cd frontend
npm run test:e2e -- e2e/dashboard-paid-create-entitled.spec.ts
```

Vitest acceptance for the same slice includes `paidProTest579*` and `reviewDeliveryHandoffDashboard.integration.test.tsx`.
