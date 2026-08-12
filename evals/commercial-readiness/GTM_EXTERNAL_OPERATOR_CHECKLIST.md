# GTM external operator checklist ($49 / $490 / 10-per-UTC-month)

Do not invent credentials. Mark each item **VERIFIED**, **CODE-READY/BLOCKED ON OPERATOR**, or **NOT READY**.  
Documentation alone is not verification. No live Stripe smoke may be claimed without a real test-mode run.

| # | Item | Status | Notes |
|---|---|---|---|
| 1 | Staging API URL + `CLAW_ENVIRONMENT=staging` | CODE-READY/BLOCKED ON OPERATOR | Set `CLAW_API_BASE` to staging; never production |
| 2 | Staging admin secret (`CLAW_ADMIN_SECRET`) in secret manager | CODE-READY/BLOCKED ON OPERATOR | Required for `/admin/deploy-readiness` |
| 3 | Staging Postgres + backups/PITR enabled | CODE-READY/BLOCKED ON OPERATOR | See `docs/architecture/POSTGRES_DAY_ONE.md` |
| 4 | Stripe **test mode** secret key `sk_test_…` | CODE-READY/BLOCKED ON OPERATOR | Never `sk_live_` |
| 5 | Stripe test Price for Pro **$49 recurring monthly** → `STRIPE_PRICE_PRO_MONTHLY` | CODE-READY/BLOCKED ON OPERATOR | Confirm amount $49.00 / month in Dashboard (test) |
| 6 | Stripe test Price for Pro **$490 recurring annually** → `STRIPE_PRICE_PRO_ANNUAL` | CODE-READY/BLOCKED ON OPERATOR | Confirm amount $490.00 / year, paid upfront interval |
| 7 | Stripe test webhook endpoint + `STRIPE_WEBHOOK_SECRET` (`whsec_…`) | CODE-READY/BLOCKED ON OPERATOR | Events: `checkout.session.completed`, `invoice.paid`, `invoice.payment_failed`, `customer.subscription.updated/deleted`, `charge.refunded` |
| 8 | Disposable **monthly** checkout → Pro activate → quota 10 this UTC month | CODE-READY/BLOCKED ON OPERATOR | Confirm `pro_allowance.window=utc_calendar_month` |
| 9 | Disposable **annual** checkout ($490) → same 10/UTC-month quota | CODE-READY/BLOCKED ON OPERATOR | Must not grant 10/year or pooled 120 |
| 10 | Finalize 10 times → 11th create denied in same UTC month | CODE-READY/BLOCKED ON OPERATOR | Previews/retries must not consume |
| 11 | UTC month rollover restores remaining to 10 | CODE-READY/BLOCKED ON OPERATOR | Advance test clock across month boundary — **not** Stripe period renewal alone |
| 12 | Cancel retains access through paid period; quota stays monthly | CODE-READY/BLOCKED ON OPERATOR | |
| 13 | Genesis first payment: 30% eligible net ex-tax — $14.70 on $49 / $147 on $490 | CODE-READY/BLOCKED ON OPERATOR | Duplicate webhook / renewal → no second commission |
| 14 | Refund voids pending commission | CODE-READY/BLOCKED ON OPERATOR | |
| 15 | $9 unlock cannot activate Pro subscription | CODE-READY/BLOCKED ON OPERATOR | Session-only; refuse subscription mode |
| 16 | Deploy smoke: `/health` → `/v1/readyz` → `/admin/deploy-readiness` | CODE-READY/BLOCKED ON OPERATOR | `python3 scripts/deploy_smoke.py` |
| 17 | Rollback procedure documented + owner named | CODE-READY/BLOCKED ON OPERATOR | Redeploy prior SHA; migration policy decided |
| 18 | Backup/restore drill evidence | NOT READY | Needs operator drill with RPO/RTO |
| 19 | Health / error / webhook / billing / quota / notification monitors | CODE-READY/BLOCKED ON OPERATOR | Wire alerts to on-call |
| 20 | Privacy/retention decision owner | NOT READY | Name owner; DSAR/deletion path |
| 21 | Counsel-review checkpoint | NOT READY | Terms/privacy/AI disclaimers counsel-approved |
| 22 | Customer-support owner + incident path | CODE-READY/BLOCKED ON OPERATOR | `support@` + escalation |
| 23 | Real-user WTP / paid cohort execution | BLOCKED ON OPERATOR | See `docs/product/WTP_SCORE_SHEET.md` |

## Exact command skeleton (staging + Stripe test only)

```bash
export CLAW_ENVIRONMENT=staging
export CLAW_API_BASE=https://<staging-api>
export STRIPE_SECRET_KEY=sk_test_<from-secret-manager>
export STRIPE_WEBHOOK_SECRET=whsec_<from-secret-manager>
export STRIPE_PRICE_PRO_MONTHLY=price_<test-49-monthly>
export STRIPE_PRICE_PRO_ANNUAL=price_<test-490-annual>
python3 scripts/deploy_smoke.py
# Then disposable UI/API billing lifecycle with Stripe test cards only.
```

**This environment (agent shell):** no Stripe/staging secrets present → Stripe/staging items remain **CODE-READY/BLOCKED ON OPERATOR**; backup/privacy/counsel/WTP **NOT READY** / **BLOCKED ON OPERATOR**.
