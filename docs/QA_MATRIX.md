# LawDog GTM QA Matrix

Master checklist for systematic pre–Genesis launch QA. **Status:** `pass` | `fail` | `blocked` | `skip` | `n/a`

**Philosophy:** `QA_PHILOSOPHY.md`  
**Scenarios:** `GTM_SCENARIOS.md`  
**Rubric:** `PREMIUM_AHA_RUBRIC.md`  
**Steps:** `MANUAL_QA_RUNBOOK.md`  
**Fixtures:** `qa/fixtures/`

---

## How to use

1. Pick environment (staging recommended first).
2. Run **Top 10** flows in `MANUAL_QA_RUNBOOK.md`.
3. Execute scenarios from `GTM_SCENARIOS.md`; score Pro with `PREMIUM_AHA_RUBRIC.md`.
4. Fill matrix rows; copy `qa/QA_RESULTS_TEMPLATE.md` for the run record.

---

## 1. Agreement type coverage

| Agreement type | Free draft | Pro draft | Send/sign | Export PDF | Status | Notes |
|----------------|------------|-----------|-----------|------------|--------|-------|
| NDA (mutual) | | | | | | |
| NDA (one-way) | | | | | | |
| SaaS / subscription terms | | | | | | |
| Consulting / SOW | | | | | | |
| Independent contractor | | | | | | |
| Creator / influencer | | | | | | |
| Marketing agency MSA | | | | | | |
| IP / content license | | | | | | |
| Settlement / release | | | | | | |
| Referral / affiliate (commercial) | | | | | | |
| LOI / simple services | | | | | | |

---

## 2. Input quality

| Input quality | Fixture file | Free | Pro | Status | Notes |
|---------------|--------------|------|-----|--------|-------|
| Short (1–2 sentences) | `short-prompts.json` | | | | |
| Messy (typos, slang) | `messy-prompts.json` | | | | |
| Giant (long paste) | `giant-prompts.json` | | | | |
| Contradictory | `contradictory-prompts.json` | | | | |
| Emotional / high stakes | `emotional-prompts.json` | | | | |
| Empty → minimal prompt | manual | | | | |
| Copy-paste from external AI | manual | | | | |

---

## 3. Prompt complexity

| Complexity | Description | Pro AHA ≥4? | Status | Notes |
|------------|-------------|-------------|--------|-------|
| L1 Minimal | Parties + type + term | | | |
| L2 Moderate | + commercial terms | | | |
| L3 Multi-topic | SaaS + privacy + SLA hints | | | |
| L4 Conflicting | See contradictory fixtures | | | |
| L5 Mega-scope | `giant-001`, `giant-002` | | | |

---

## 4. Premium vs free differentiation

| Check | Free | Pro | Status | Notes |
|-------|------|-----|--------|-------|
| Same prompt, visible quality delta | | | | |
| Pro-only depth (sections/clauses) | | | | |
| Upgrade CTA not blocking free value | | | | |
| Post-pay: full Pro body visible (no starter flash) | n/a | | | |
| Checkout metadata includes plan | n/a | | | |
| Pricing page matches $49/mo Pro positioning | | | | |

---

## 5. Mobile vs desktop

| Flow | Mobile Safari | Mobile Chrome | Desktop Chrome | Status | Notes |
|------|---------------|---------------|----------------|--------|-------|
| `/app/create` intake resize | | | | | |
| Long prompt scroll + submit | | | | | |
| Agreement preview readability | | | | | |
| Checkout redirect + return | | | | | |
| Recipient link open | | | | | |
| Sign / review actions | | | | | |
| PDF/export open | | | | | |

---

## 6. Checkout restore

| Case | Expected | Status | Notes |
|------|----------|--------|-------|
| Pro upgrade from create → Stripe → return | Draft + premium visible | | |
| Return URL has agreement id | Same agreement | | |
| Browser back from Stripe | Recoverable state | | |
| Double-open return tab | Idempotent UI | | |
| API slow on return | Loading/retry UX | | |
| Cancel checkout | Draft preserved, free tier | | |
| Network drop mid-checkout | No corrupt draft | | |

---

## 7. Signing flow

| Step | Owner | Recipient | Status | Notes |
|------|-------|-----------|--------|-------|
| Prepare signing / lock | | n/a | | |
| Send for signature | | | | |
| Recipient opens link (cold) | | | | |
| Review before sign | | | | |
| Apply signature | | | | |
| Status → fully signed | | | | |
| Proof / verification link | | | | |

---

## 8. Recipient experience

| Check | Status | Notes |
|-------|--------|-------|
| Clear who sent agreement | | |
| Plain-language next step | | |
| Suggest edits (paste) without upload claim | | |
| Compare / preview before owner apply | | |
| No silent draft overwrite | | |
| Mobile-friendly review UI | | |
| Trust copy (not litigation tone) | | |

*Portable review detail:* `docs/qa/LAWDOG_PORTABLE_REVIEW_CHECKLIST.md`

---

## 9. Export / PDF quality

| Check | Status | Notes |
|-------|--------|-------|
| Export matches on-screen draft | | |
| Headings / sections preserved | | |
| Signature block included | | |
| No raw HTML artifacts | | |
| Long doc pagination readable | | |
| Mobile share/save works | | |
| Placeholders resolved or clearly marked | | |

---

## 10. Failure recovery

| Failure | Expected UX | Status | Notes |
|---------|-------------|--------|-------|
| API 503 / unreachable | Banner + retry | | |
| OpenAI timeout on Pro draft | Graceful message | | |
| Stripe webhook delay | User can refresh; no double charge | | |
| Stale tab after checkout | Refresh restores premium | | |
| Genesis capture API down | Soft-fail; create still works | | |
| Invalid referral code | 200 soft-fail, no user error storm | | |

---

## 11. Anonymous vs authenticated

| Path | Anonymous | Authenticated | Status | Notes |
|------|-------------|---------------|--------|-------|
| Create agreement | | | | |
| Upgrade to Pro | | | | |
| Return after checkout | | | | |
| Send/sign | | | | |
| Genesis affiliate dashboard | n/a | | | |
| Ops genesis dashboard | n/a | admin secret | | |

---

## 12. Genesis referral attribution

| Check | Status | Notes |
|-------|--------|-------|
| `?ref=CODE` on `/app/create` | | |
| Capture POST soft-fail unknown code | | |
| Checkout metadata includes referral fields | | |
| Self-referral blocked at commission | | |
| Affiliate `/app/genesis-referral` | | |
| Ops `/app/ops/genesis-referral` + CSV | | |
| Commission on test `invoice.paid` | | |

*Deploy smoke:* `RELEASE_CHECKLIST.md`, `scripts/release_smoke.py`

---

## Matrix sign-off

| Role | Name | Date | Ready for Genesis GTM? |
|------|------|------|------------------------|
| QA | | | yes / no |
| Product | | | yes / no |
