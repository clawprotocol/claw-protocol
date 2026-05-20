# LawDog Manual QA Runbook

Step-by-step flows for GTM validation. Pair with `QA_MATRIX.md`, fixtures in `qa/fixtures/`, and scoring in `PREMIUM_AHA_RUBRIC.md`.

**Prerequisites:** staging or production URL, test Stripe mode (or prod test card), optional enrolled Genesis code.

---

## Environment setup

| Item | Action |
|------|--------|
| API health | `curl -sS $CLAW_API_BASE/health` → `"ok": true` |
| App loads | Open `/app/create` |
| Admin secret | Set at `/app/admin` if testing ops |
| Devices | iPhone Safari + one Android Chrome minimum |
| Record run | Copy `qa/QA_RESULTS_TEMPLATE.md` |

---

## Flow A — Anonymous agreement generation (free)

1. Open **incognito** window → `/app/create`
2. Confirm **no login** required to start
3. Paste fixture `short-001` or `messy-001` from `qa/fixtures/`
4. Submit / generate
5. **Verify:** draft appears; readable on mobile; parties/terms present
6. **Verify:** upgrade CTA visible but does not block reading draft
7. Score free draft (AHA rubric) — record in results template

**Pass:** User gets usable draft without account.  
**Fail:** Auth wall, blank doc, or generic placeholder-only output.

---

## Flow B — Pro upgrade

1. From Flow A draft, click **upgrade / Pro** (exact CTA per current UI)
2. Confirm tier = **Pro** (~$39/mo positioning)
3. Complete Stripe checkout (test card `4242…`)
4. **Verify:** return lands on agreement/checkout route with same `agreementId`
5. **Verify:** premium body visible — **no flash** of short starter text (watch first 2s)
6. Score Pro draft vs free (side-by-side rubric)

**Pass:** Full Pro document; hydration stable.  
**Fail:** Starter text persists, wrong agreement, or payment without unlock.

---

## Flow C — Checkout restore stress

1. Start Flow B; at Stripe **stop** before pay → back → confirm draft intact (free)
2. Repeat; complete pay; on return **refresh** once
3. Open return URL in **second tab**
4. Toggle **airplane mode** 5s on return; restore network

**Pass:** Single coherent premium state; no duplicate charges.  
**Fail:** Lost draft, duplicate subscription UI errors, corrupt state.

---

## Flow D — Agreement review (owner)

1. With Pro draft open, enter **review** workspace (owner)
2. Edit a clause in preview if UI allows; **Preview changes**
3. **Verify:** summary/diff visible before apply
4. **Apply** → saved draft updates
5. **Dismiss** a preview → draft unchanged

**Pass:** No silent overwrite.  
**Fail:** Apply without confirmation or diff missing.

---

## Flow E — Send / sign (owner → recipient)

1. From workspace, **send** for signature (or equivalent launch flow)
2. Copy **recipient link** (second device or incognito)
3. Owner: confirm status moves toward signing
4. Recipient: open link **without** LawDog account
5. Recipient: complete **review** if prompted, then **sign**
6. Owner: confirm **fully signed** (or equivalent status label)

**Pass:** End-to-end sign; proof/verification available if product exposes it.  
**Fail:** Recipient auth required unexpectedly or sign button broken on mobile.

---

## Flow F — Recipient review (suggest edits)

1. Open recipient link on mobile
2. **Copy full draft** → edit externally → **paste** suggested edits
3. **Preview changes**; confirm no claim of file upload/OCR unless shipped
4. Submit suggestion
5. Owner: see queue item; **preview compare**; **apply** one item
6. Re-open recipient view — applied text reflected

*Detail:* `docs/qa/LAWDOG_PORTABLE_REVIEW_CHECKLIST.md`

---

## Flow G — PDF / export quality

1. From signed or ready draft, **export / download PDF** (or print-to-PDF if that’s the path)
2. Open on phone Files/Share sheet
3. **Verify:** headings, parties, signature block, no HTML leakage
4. Compare length to on-screen doc (spot-check 3 sections)

**Pass:** Recipient-ready artifact.  
**Fail:** Truncation, placeholders, broken layout.

---

## Flow H — Mobile Safari (critical path)

On **iPhone Safari** incognito:

1. `/app/create` — type 6-line messy prompt without zoom bugs
2. Generate → scroll draft
3. Start Pro checkout → return
4. Open recipient link → sign or review

**Pass:** No layout break or keyboard trap.  
**Fail:** CTA off-screen, textarea unusable, checkout lose context.

---

## Flow I — Mobile Chrome

Repeat Flow H on Android Chrome (or Chrome iOS if no Android).

---

## Flow J — Genesis referral attribution

1. Enroll test affiliate (ops): `POST /v1/genesis-referral/ops/affiliates` with code e.g. `GENESISDOG`
2. Incognito: `/app/create?ref=GENESISDOG`
3. **Verify:** capture fires (network tab → `capture` 200)
4. Start Pro checkout; **verify** metadata includes `referral_code`, `visitor_id`, `plan_code`
5. (Staging) test `invoice.paid` webhook → commission row in ops CSV
6. Visit `/app/genesis-referral` as enrolled user
7. Visit `/app/ops/genesis-referral` with admin secret

*Infra:* `RELEASE_CHECKLIST.md`, `scripts/release_smoke.py`

---

## Flow K — Affiliate dashboard (legacy vs Genesis)

1. If legacy affiliate routes in scope, smoke `/app/affiliate` paths per current nav
2. Genesis partner dashboard: metrics load, referral link copy works
3. Unknown user on genesis dashboard → clear empty/error state (not 500)

---

## Flow L — Degraded API behavior

1. Block API host via devtools **offline** OR point to invalid base (staging only)
2. **Verify:** reachability banner / retry messaging on create
3. Restore network → retry succeeds without hard refresh requirement
4. Genesis capture while API down: **create still works** (soft-fail)

**Pass:** Honest degradation; recovery without data loss.  
**Fail:** White screen, infinite spinner, silent failure.

---

## Top 10 immediate tests (minimum bar)

| # | Test | Flow |
|---|------|------|
| 1 | Anonymous create + messy prompt | A |
| 2 | Pro pay + premium hydration | B |
| 3 | Checkout return refresh | C |
| 4 | Mobile Safari create → checkout | H |
| 5 | Recipient sign cold link | E |
| 6 | Recipient suggest-edit | F |
| 7 | PDF export spot-check | G |
| 8 | Contradictory prompt handling | A + rubric (`contra-001`) |
| 9 | `?ref=` capture + checkout metadata | J |
| 10 | API offline banner + recovery | L |

---

## Automated helpers (optional, non-blocking)

```bash
# API smoke (no Stripe payment)
export CLAW_API_BASE=https://<api>
export CLAW_ADMIN_SECRET=...
python3 scripts/release_smoke.py

# Focused unit tests (dev machine)
.venv/bin/pytest backend/tests/test_genesis_referral*.py -q
cd frontend && npm run test -- genesisReferral apiReachability
```

---

## Related

| Doc | Use |
|-----|-----|
| `QA_MATRIX.md` | Full pass/fail grids |
| `GTM_SCENARIOS.md` | Scenario library |
| `PREMIUM_AHA_RUBRIC.md` | Scoring |
| `QA_PHILOSOPHY.md` | Why we test this way |
| `qa/QA_RESULTS_TEMPLATE.md` | Run log |
