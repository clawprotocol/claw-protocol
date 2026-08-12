# GTM external operator checklist ($49/10)

Do not invent credentials. Mark each item **VERIFIED**, **CODE-READY/BLOCKED ON OPERATOR**, or **NOT READY**.

| # | Item | Status | Notes |
|---|---|---|---|
| 1 | Staging API URL + `CLAW_ENVIRONMENT=staging` | CODE-READY/BLOCKED ON OPERATOR | Set `CLAW_API_BASE` to staging; never production |
| 2 | Staging admin secret (`CLAW_ADMIN_SECRET`) in secret manager | CODE-READY/BLOCKED ON OPERATOR | Required for `/admin/deploy-readiness` |
| 3 | Staging Postgres + backups/PITR enabled | CODE-READY/BLOCKED ON OPERATOR | See `docs/architecture/POSTGRES_DAY_ONE.md` |
| 4 | Stripe **test mode** secret key `sk_test_…` | CODE-READY/BLOCKED ON OPERATOR | Never `sk_live_` |
| 5 | Stripe test Price for Pro **$49/month** mapped to `STRIPE_PRICE_PRO_MONTHLY` | CODE-READY/BLOCKED ON OPERATOR | Create/confirm Price id in Stripe Dashboard (test) |
| 6 | Stripe test webhook endpoint + `STRIPE_WEBHOOK_SECRET` (`whsec_…`) | CODE-READY/BLOCKED ON OPERATOR | Events: `checkout.session.completed`, `invoice.paid`, `invoice.payment_failed`, `customer.subscription.updated/deleted`, `charge.refunded` |
| 7 | Disposable checkout → Pro activate → quota 10 | CODE-READY/BLOCKED ON OPERATOR | Use Stripe test cards; confirm `agreement_allowance=10` |
| 8 | Finalize 10 times → 11th create denied | CODE-READY/BLOCKED ON OPERATOR | Previews/retries must not consume |
| 9 | Renewal restores remaining to 10 once | CODE-READY/BLOCKED ON OPERATOR | Advance test clock / renew |
| 10 | Cancel retains access through period; no reset | CODE-READY/BLOCKED ON OPERATOR | |
| 11 | Genesis first invoice: 30% of eligible net (ex-tax); e.g. $14.70 on $49 | CODE-READY/BLOCKED ON OPERATOR | Confirm ledger row; duplicate webhook no second commission |
| 12 | Refund voids pending commission | CODE-READY/BLOCKED ON OPERATOR | |
| 13 | Deploy smoke: `/health` → `/v1/readyz` → `/admin/deploy-readiness` | CODE-READY/BLOCKED ON OPERATOR | `python3 scripts/deploy_smoke.py` |
| 14 | Rollback procedure documented + owner named | CODE-READY/BLOCKED ON OPERATOR | Redeploy prior SHA; migration policy decided |
| 15 | Backup/restore drill evidence | NOT READY | Needs operator drill with RPO/RTO |
| 16 | Health / error / webhook / billing / quota / notification monitors | CODE-READY/BLOCKED ON OPERATOR | Wire alerts to on-call |
| 17 | Privacy/retention decision owner | NOT READY | Name owner; DSAR/deletion path |
| 18 | Counsel-review checkpoint | NOT READY | Terms/privacy/AI disclaimers counsel-approved |
| 19 | Customer-support owner + incident path | CODE-READY/BLOCKED ON OPERATOR | `support@` + escalation |

## Exact command skeleton (staging + Stripe test only)

```bash
export CLAW_ENVIRONMENT=staging
export CLAW_API_BASE=https://<staging-api>
export STRIPE_SECRET_KEY=sk_test_<from-secret-manager>
export STRIPE_WEBHOOK_SECRET=whsec_<from-secret-manager>
export STRIPE_PRICE_PRO_MONTHLY=price_<test-49-monthly>
python3 scripts/deploy_smoke.py
# Then disposable UI/API billing lifecycle with Stripe test cards only.
```

**This environment (agent shell):** no Stripe/staging secrets present → items 4–13 remain **CODE-READY/BLOCKED ON OPERATOR**; 15/17/18 **NOT READY**.
