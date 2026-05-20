# LawDog GTM Scenario Library

**40+ high-value scenarios** for premium agreement QA before Genesis launch.

| Column | Meaning |
|--------|---------|
| **ID** | Traceable in `qa/QA_RESULTS_TEMPLATE` |
| **Intent** | What the user actually wants |
| **Messy prompt** | Synthetic example (see also `qa/fixtures/`) |
| **Premium expected** | What Pro should deliver |
| **Failure risks** | What to watch for |

**Score Pro** with `PREMIUM_AHA_RUBRIC.md`. **Execute** via `MANUAL_QA_RUNBOOK.md`.

---

## SaaS (5)

### saas-001 — B2B subscription terms
- **Intent:** Launch self-serve SaaS with monthly billing and limitation of liability.
- **Messy prompt:** `subscription app for HR teams $49/user, stripe, no refunds, delaware corp`
- **Premium expected:** Autorenewal, acceptable use, LoL cap, privacy hook, termination.
- **Failure risks:** Consumer refund laws ignored; missing data processing mention.

### saas-002 — API + enterprise tier
- **Intent:** Split standard vs enterprise API access and SLA.
- **Messy prompt:** `API only on enterprise, 99.9% SLA credits, standard terms otherwise`
- **Premium expected:** Tiered SLA section; order form reference; cap on credits.
- **Failure risks:** SLA guaranteed as legal outcome; contradictory uptime numbers.

### saas-003 — Free trial conversion
- **Intent:** 14-day trial → paid without card vs with card.
- **Messy prompt:** `14 day trial then auto charge unless cancel, card required day 1`
- **Premium expected:** Clear trial conversion language; cancellation method.
- **Failure risks:** Dark pattern wording; conflicting trial terms.

### saas-004 — Subprocessor / AI feature
- **Intent:** Disclose OpenAI optional feature and subprocessors.
- **Messy prompt:** `we use openai for summaries, aws hosting, need terms asap`
- **Premium expected:** Subprocessor list; customer data license; AI disclaimer.
- **Failure risks:** Overbroad AI indemnity; missing security incident hook.

### saas-005 — Marketplace two-sided
- **Intent:** Platform terms for buyers and sellers.
- **Messy prompt:** `marketplace for vintage furniture, we take 12% fee, sellers ship themselves`
- **Premium expected:** Role split; payment facilitator disclaimer; prohibited goods.
- **Failure risks:** Platform liable for all seller conduct without cap.

---

## Consulting (4)

### consult-001 — Fixed-fee SOW
- **Intent:** Single project, fixed price, deliverables in 30 days.
- **Messy prompt:** `fixed $15k brand strategy deck + workshops, net 30 payment`
- **Premium expected:** Deliverables, acceptance, change order, IP assignment.
- **Failure risks:** Vague deliverables → disputes.

### consult-002 — Retainer rollover
- **Intent:** Monthly hours with rollover cap.
- **Messy prompt:** `40 hrs/mo retainer rollover max 20, extra hours $300 preapproved`
- **Premium expected:** Rollover math; expiration; approval mechanism.
- **Failure risks:** Unlimited rollover implied.

### consult-003 — Subcontractor allowed
- **Intent:** Prime consultant may use subs with notice.
- **Messy prompt:** `i might bring a designer sub, client wants approval first`
- **Premium expected:** Consent flow; subcontractor confidentiality flow-down.
- **Failure risks:** Client approval bottleneck undefined.

### consult-004 — On-site + travel
- **Intent:** Quarterly on-site + expense reimbursement.
- **Messy prompt:** `2 days onsite per quarter NYC, flights hotels reimbursed w receipts`
- **Premium expected:** Travel policy; caps; cancellation of onsite.
- **Failure risks:** Open-ended expense liability.

---

## Creators / influencers (5)

### creator-001 — Paid social package
- **Intent:** Defined posts, approval, payment on delivery.
- **Messy prompt:** `2 tiktoks 1 yt short $2k, approve script before post, pay within 14 days`
- **Premium expected:** Deliverables; approval window; FTC disclosure line.
- **Failure risks:** Perpetual usage grant by default.

### creator-002 — Whitelisting ads
- **Intent:** 90-day paid usage on Meta/TikTok ads.
- **Messy prompt:** `brand can run spark ads on my content 90 days only`
- **Premium expected:** Platform list; start/stop; fee for extension.
- **Failure risks:** “Forever” whitelisting buried.

### creator-003 — Exclusivity category
- **Intent:** No competing skincare brands for 60 days.
- **Messy prompt:** `exclusive in skincare 60 days but not haircare`
- **Premium expected:** Narrow exclusivity definition; carve-outs.
- **Failure risks:** Category so broad creator can’t work.

### creator-004 — UGC buyout
- **Intent:** Buy raw footage for ads.
- **Messy prompt:** `buyout UGC forever for all media lol is that normal`
- **Premium expected:** Flags aggressiveness; suggests term/territory limits.
- **Failure risks:** Silent perpetual worldwide grant.

### creator-005 — Podcast host read
- **Intent:** Host-read ads, make-goods.
- **Messy prompt:** `host read 60 sec midroll 3 eps, if cancelled reschedule within 30 days`
- **Premium expected:** Make-good; measurement disclaimer.
- **Failure risks:** Guaranteed download numbers.

---

## Crypto / Web3 (4)

### crypto-001 — NFT display license
- **Intent:** Personal non-commercial vs commercial upgrade.
- **Messy prompt:** `nft buyer personal use only commercial needs 5% royalty to artist`
- **Premium expected:** Clear license tiers; no securities advice.
- **Failure risks:** Investment language.

### crypto-002 — DAO contributor USDC
- **Intent:** Monthly USDC, IP to treasury.
- **Messy prompt:** `paid USDC monthly IP to dao wallet contributors US based`
- **Premium expected:** Payment volatility note; IP assignment; tax responsibility.
- **Failure risks:** Ignores contractor classification.

### crypto-003 — Token warrant / SAFT
- **Intent:** Accredited investors, vesting cliff.
- **Messy prompt:** `SAFT accredited only 2yr vest 6mo cliff no liquidity promise`
- **Premium expected:** Risk factors; accredited rep; not offering template advice.
- **Failure risks:** Sounds like guaranteed returns.

### crypto-004 — Exchange API partner
- **Intent:** Revenue share, KYC split.
- **Messy prompt:** `we route orders they do kyc 30% rev share`
- **Premium expected:** Role matrix; compliance allocation; security.
- **Failure risks:** Implies unlicensed exchange operations OK.

---

## Affiliate / referral (3)

### aff-001 — Newsletter rev share
- **Intent:** 20% on referred Pro signups.
- **Messy prompt:** `20% rev share newsletter referrals FTC disclose every email`
- **Premium expected:** Commission definition; disclosure duties; attribution window.
- **Failure risks:** Conflicts with Genesis program terms.

### aff-002 — Genesis `?ref=` path
- **Intent:** Capture → checkout → commission.
- **Messy prompt:** *(navigate)* `/app/create?ref=GENESISDOG`
- **Premium expected:** Metadata on checkout; soft-fail if invalid code.
- **Failure risks:** 404 breaks create; self-referral pays.

### aff-003 — Influencer promo code stack
- **Intent:** Stack influencer code with annual plan.
- **Messy prompt:** `annual plan 20% off with code INFLUENCER20 plus referral`
- **Premium expected:** Clear precedence or single attribution.
- **Failure risks:** Double commission / wrong ledger.

---

## Marketing agencies (3)

### agency-001 — Retainer + kill fee
- **Intent:** Protect agency if client ghosts.
- **Messy prompt:** `12k/3mo meta ads client delays feedback need kill fee`
- **Premium expected:** Client cooperation; pause/kill; IP on creatives.
- **Failure risks:** One-sided unlimited revisions.

### agency-002 — White-label deliverables
- **Intent:** Client resells agency work under their brand.
- **Messy prompt:** `white label websites client sells to their customers`
- **Premium expected:** License chain; client indemnity for downstream.
- **Failure risks:** Agency warrants client’s customers.

### agency-003 — Performance bonus
- **Intent:** Bonus on ROAS threshold.
- **Messy prompt:** `bonus $5k if ROAS 3x in 90 days tracked in meta`
- **Premium expected:** Measurement method; dispute window; not guaranteed outcome.
- **Failure risks:** Promissory ROAS legally binding.

---

## Contractors / freelancers (4)

### contractor-001 — IC agreement basic
- **Intent:** Project-based IC, not employee.
- **Messy prompt:** `1099 designer 6 week project owns nothing until paid`
- **Premium expected:** IP on payment; independent contractor reps; termination.
- **Failure risks:** Employee-like control language.

### contractor-002 — Non-solicit light
- **Intent:** Can’t steal clients after project.
- **Messy prompt:** `cant solicit my clients 1 year after project ends reasonable?`
- **Premium expected:** Narrow non-solicit; jurisdiction caution.
- **Failure risks:** Non-compete disguised as non-solicit.

### contractor-003 — Late payment history
- **Intent:** New deal after prior nonpayment.
- **Messy prompt:** `client stiffed me before, want 50% upfront this time`
- **Premium expected:** Payment schedule; suspension for nonpayment.
- **Failure risks:** Reads as demand letter not contract.

### contractor-004 — Equipment loan
- **Intent:** Loan laptop until project end.
- **Messy prompt:** `loan macbook return within 5 days of end or fee`
- **Premium expected:** Return duties; damage fee; title retention.
- **Failure risks:** Confuses lease vs loan.

---

## NDAs (3)

### nda-001 — Mutual quick NDA
- **Intent:** Explore partnership safely.
- **Messy prompt:** `mutual NDA 2 years california both can share with advisors`
- **Premium expected:** Mutual obligations; advisors carve-out; term.
- **Failure risks:** One-way by mistake.

### nda-002 — One-way investor pitch
- **Intent:** Founder shares; investor doesn’t.
- **Messy prompt:** `one way NDA investors cant share our deck 3 years`
- **Premium expected:** Clear one-way; residuals; return/destruct.
- **Failure risks:** Mutual when user wanted one-way.

### nda-003 — Employee contractor hybrid
- **Intent:** Contractor sees product secrets.
- **Messy prompt:** `NDA for contractor seeing roadmap, survives 3 years`
- **Premium expected:** Survival; return of materials; injunctive relief balanced.
- **Failure risks:** Non-compete smuggled in.

---

## Licensing / IP (4)

### ip-001 — Logo license limited
- **Intent:** Non-exclusive logo for packaging only.
- **Messy prompt:** `license logo non exclusive packaging only north america 2 years`
- **Premium expected:** Field of use; territory; term; quality control.
- **Failure risks:** Broad “all media forever.”

### ip-002 — Music sync indie
- **Intent:** Sync license for YouTube ad.
- **Messy prompt:** `indie song in youtube ad 6 months online only`
- **Premium expected:** Media; term; territory; fee.
- **Failure risks:** Implies master + publishing cleared.

### ip-003 — Software OEM
- **Intent:** OEM embed SDK in product.
- **Messy prompt:** `oem our sdk in their hardware 100k units cap`
- **Premium expected:** Unit cap; support; update policy; audit.
- **Failure risks:** Unlimited deployment rights.

### ip-004 — Trade secret + know-how
- **Intent:** License know-how with confidentiality.
- **Messy prompt:** `license our manufacturing know how confidential 5 yrs`
- **Premium expected:** Confidentiality; permitted use; return.
- **Failure risks:** Accidental publication rights.

---

## Disputes / settlements (4)

### settle-001 — Mutual release
- **Intent:** Clean break after partnership dispute.
- **Messy prompt:** `mutual release both owe money stop suing each other texas`
- **Premium expected:** Mutual release; no admission; payment schedule placeholder.
- **Failure risks:** One-sided release; specific performance impossible.

### settle-002 — Termination severance
- **Intent:** Employee departure package.
- **Messy prompt:** `severance 2 months pay if sign release 21 day review`
- **Premium expected:** ADEA-style timing mention if applicable; revocation period hook.
- **Failure risks:** DIY employment law without counsel flag.

### settle-003 — Vendor dispute credit
- **Intent:** Partial refund + continue relationship.
- **Messy prompt:** `vendor gives $10k credit we sign release and renew 1 yr`
- **Premium expected:** Credit + release linkage; future term.
- **Failure risks:** Releases unknown claims without carve-outs.

### settle-004 — Mediation clause dispute
- **Intent:** Agree to mediate before litigation.
- **Messy prompt:** `mediation in austin before anyone sues, loser pays fees? idk`
- **Premium expected:** Mediation process; fee allocation options explained.
- **Failure risks:** Unenforceable loser-pays in some jurisdictions.

---

## Emotionally messy (3)

### messy-emo-001 — Cofounder betrayal
- **Intent:** Stop code/customer theft fear.
- **Messy prompt:** *(fixture `emo-001`)*
- **Premium expected:** Calm restrictions; realistic remedies.
- **Failure risks:** Overbroad non-compete; threatening tone.

### messy-emo-002 — Family loan
- **Intent:** Written loan without ruining relationship.
- **Messy prompt:** *(fixture `emo-002`)*
- **Premium expected:** Plain language repayment.
- **Failure risks:** Secured interest without user asking.

### messy-emo-003 — Workplace exit
- **Intent:** Neutral mutual release.
- **Messy prompt:** *(fixture `emo-003`)*
- **Premium expected:** Neutral HR tone; confidentiality.
- **Failure risks:** Sounds like legal advice for discrimination claims.

---

## Incomplete prompts (3)

### incomplete-001 — Type only
- **Intent:** User only says “NDA.”
- **Messy prompt:** `nda`
- **Premium expected:** Sensible defaults + visible placeholders or clarifying structure.
- **Failure risks:** Random jurisdiction; wrong mutual/one-way.

### incomplete-002 — Party missing
- **Intent:** “Consulting agreement” no names.
- **Messy prompt:** `consulting agreement fixed price`
- **Premium expected:** Party placeholders clearly marked; prompts for names in UI if available.
- **Failure risks:** Fake names invented without marking.

### incomplete-003 — Number missing
- **Intent:** Payment terms TBD.
- **Messy prompt:** `freelance contract pay them later when we fundraise`
- **Premium expected:** Payment trigger defined as milestone; risk note on vagueness.
- **Failure risks:** Unenforceable “when we feel like it.”

---

## Contradictory prompts (3)

### contra-001 — Exclusive + non-exclusive
- **Intent:** User contradicts license scope.
- **Messy prompt:** *(fixture `contra-001`)*
- **Premium expected:** Conflict flagged; resolution options.
- **Failure risks:** Silent merge to worst case for creator.

### contra-002 — Refund policy
- **Intent:** No refunds + anytime refund.
- **Messy prompt:** *(fixture `contra-002`)*
- **Premium expected:** Tier split or ask which applies.
- **Failure risks:** Illegal consumer terms in some regions.

### contra-003 — Termination notice
- **Intent:** 0-day vs 90-day notice.
- **Messy prompt:** *(fixture `contra-005`)*
- **Premium expected:** Harmonized termination section.
- **Failure risks:** Both clauses appear in final doc.

---

## Scenario index (quick lookup)

| ID | Category |
|----|----------|
| saas-001 … saas-005 | SaaS |
| consult-001 … consult-004 | Consulting |
| creator-001 … creator-005 | Creators |
| crypto-001 … crypto-004 | Crypto |
| aff-001 … aff-003 | Affiliate |
| agency-001 … agency-003 | Agency |
| contractor-001 … contractor-004 | Contractors |
| nda-001 … nda-003 | NDA |
| ip-001 … ip-004 | IP |
| settle-001 … settle-004 | Settlement |
| messy-emo-001 … messy-emo-003 | Emotional |
| incomplete-001 … incomplete-003 | Incomplete |
| contra-001 … contra-003 | Contradictory |

**Total: 48 scenarios**

---

## Coverage map → `QA_MATRIX.md`

| Matrix section | Scenarios |
|----------------|-----------|
| Agreement type | All categories |
| Input quality | incomplete-*, messy-emo-*, fixtures |
| Prompt complexity | giant fixtures, contra-*, saas-005 |
| Premium vs free | All — run A/B |
| Mobile | Run on H scenarios |
| Checkout | aff-002, saas-003 |
| Signing | consult-001, creator-001 |
| Recipient | agency-001, settle-001 |
| Export | giant-001, ip-001 |
| Genesis | aff-002 |
