# CLAW Pricing & Unit Economics (Draft)

> **Purpose:** Define CLAW end-user utility tiers and pricing using the outcome-first, incentive-sound architecture (admin-death avoidance + anti-capture), with explicit cost floors and anti-spam math.

---

## 0) What Users Are Buying (Not “Proofs”)

End users primarily buy **automated legal services**:

- Agreement creation + versioning (what exactly did we agree to?)
- Notice + cure timeline tooling (what happened, in what order?)
- Determinations (opt-in) to break stalemates without admin war
- Escrow-ready packaging (records → consequences)
- Personal liability hygiene packs (reduce preventable mistakes)

CLAW receipts and Bitcoin anchoring exist to make these outcomes **credible and adversary-resistant**.

---

## 1) Cost Drivers (What Actually Costs Money)

CLAW has 5 cost categories:

### A) Bitcoin anchoring (per epoch, amortized)
Bitcoin fees fluctuate; average fees are often around sub-$1/tx at times, but can spike. :contentReference[oaicite:0]{index=0}  
**Key point:** anchoring is typically **not** the limiting marginal cost; it becomes pennies or less per receipt when batched.

### B) LLM inference (per agreement/determination)
This is the dominant variable cost for premium automation.

OpenAI API pricing (examples):
- **gpt-4.1-mini**: $0.80 / 1M input tokens; $3.20 / 1M output tokens (Standard) :contentReference[oaicite:1]{index=1}  
- **gpt-4.1-nano**: $0.20 / 1M input; $0.80 / 1M output (Standard) :contentReference[oaicite:2]{index=2}

### C) Storage/availability (IPFS pinning and/or Arweave)
- IPFS pinning costs depend on storage, bandwidth, and requests. :contentReference[oaicite:3]{index=3}  
- Arweave “pay once” perma-storage pricing is dynamic; historical guidance suggests single-digit dollars per GB, but varies. :contentReference[oaicite:4]{index=4}

### D) Coordination rails (Solana/Base)
- Solana base fee: **5000 lamports per signature**. :contentReference[oaicite:5]{index=5}  
- Base typical action costs are extremely low (ERC-20 transfer and swaps shown around ~$0.001–$0.002 in the tracker snapshot). :contentReference[oaicite:6]{index=6}

### E) Ops + abuse control
- Rate limiting, wallets, logging, abuse review
- Node operator rewards (availability) and, later, optional Lawyer DAO routing (licensed oversight)

---

## 2) Unit Economics (Simple Math, Conservative)

### 2.1 Receipt anchoring cost per receipt
Let:
- `C_epoch` = cost to anchor one Bitcoin transaction for an epoch
- `N` = receipts in that epoch

Then:
`C_anchor_per_receipt = C_epoch / N`

Example:
- if `C_epoch = $2.00` and `N = 10,000`
- then `C_anchor_per_receipt = $0.0002`

Even at `N = 1,000`, it’s $0.002/receipt. This is why **proof is cheap; automation is valuable**.

(Use the live mempool fee environment as your anchor-fee dial.) :contentReference[oaicite:7]{index=7}

### 2.2 LLM cost per “Automated Determination”
Assume a v1 determination uses:
- `Tin = 20,000` input tokens (agreement + structured facts + evidence summaries)
- `Tout = 5,000` output tokens (decision + reasoning + citations/pointers)

**Using gpt-4.1-nano**
- Input: 0.02M × $0.20 = **$0.004**
- Output: 0.005M × $0.80 = **$0.004**
- Total ≈ **$0.008 / determination** :contentReference[oaicite:8]{index=8}

**Using gpt-4.1-mini**
- Input: 0.02M × $0.80 = **$0.016**
- Output: 0.005M × $3.20 = **$0.016**
- Total ≈ **$0.032 / determination** :contentReference[oaicite:9]{index=9}

Add a conservative “ops multiplier” (logging, retries, abuse filters):
- `C_det_allin ≈ 3× model cost`
So nano ≈ **$0.024**, mini ≈ **$0.096** per determination.

That’s your true variable cost floor before margins.

---

## 3) Anti-Spam & Abuse Economics (Friction Schedule)

CLAW must enforce:
> `Cost_to_spam > Value_of_spam`

We implement this as **progressive friction**:

### Free-tier friction (soft)
- wallet login
- per-IP and per-wallet rate limits
- limited receipts/month
- no heavy LLM usage

### Paid-tier friction (hard)
- microfees or subscription
- higher quotas
- automated abuse heuristics + throttling

### Escalation lane
- if a wallet triggers abuse patterns → tighter throttles, higher microfees, or manual review.

This makes large-scale abuse economically irrational without blocking legitimate users.

---

## 4) Proposed End-User Pricing Tiers (Outcome-First)

> These are intentionally simple and “judge/auditor safe”: you sell **workflow automation**, not “truth” or “enforcement.”

### Tier 0 — **Verify (Free)**
For: hostile verifiers, journalists, courts, counterparties.  
Includes:
- receipt verification (local + CI-compatible)
- public docs + example receipts
Limits:
- no creation or very limited “trial” creations
Goal:
- maximum credibility + distribution

### Tier 1 — **Solo**
Target: individuals, small creators, contractors.  
Includes:
- Agreement creation + versioning (light)
- Notice/cure timeline tool (basic)
- Receipt creation + anchoring (reasonable monthly quota)
- IPFS storage pointers (basic)
Suggested price band: **$19–$39/mo**

### Tier 2 — **Pro**
Target: power users, small businesses.  
Includes:
- Higher agreement + receipt quotas
- “Timeline pack” export (court/counsel-ready bundle)
- Automated Determination (nano) quota
- Optional Base payments (USDC/USDT) for add-ons
Suggested price band: **$99–$199/mo**

### Tier 3 — **Business**
Target: teams, orgs, compliance-heavy workflows.  
Includes:
- Team workspace
- Large quotas
- Automated Determination (mini) quota
- Priority support + audit logs
- Optional Arweave “perma” publishing for selected artifacts
Suggested price band: **$499–$1,499/mo**

### Tier 4 — **Enterprise / Institution**
Target: enterprises, government-adjacent, high-stakes legal ops.  
Includes:
- SSO / advanced access control
- Custom retention and private gateways
- On-prem or dedicated infra option
- SLA + security reviews
- Optional Node Operator DAO redundancy commitments
Price: **custom**

---

## 5) Add-Ons (Pay-per-use)

### A) Automated Determination credits
- Nano determinations: price per unit should be comfortably above all-in cost (e.g., $1–$5 each)
- Mini determinations: (e.g., $3–$15 each)
Rationale: even at $1, your margin is strong vs an all-in cost on the order of cents. :contentReference[oaicite:10]{index=10}

### B) “Perma Publish” (Arweave) add-on
- Charged per file/MB/GB depending on size
- Only for finalized or high-value artifacts
(Arweave costs are dynamic; treat as pass-through + margin.) :contentReference[oaicite:11]{index=11}

### C) Escrow integration package
- “Escrow-ready” export and integration hooks
- This is operational + legal coordination value, not blockchain cost

### D) Personal liability hygiene packs
- Templates + guided workflow (LLM-assisted)
- Board consents, role/capacity declarations, documentation packs
- Anchored timeline of governance actions

---

## 6) ZK / Selective Privacy Pricing (Important)

Privacy is not a luxury; it is a **capture-resistance feature**.

### ZK privacy options (v1 pricing posture)
- **Standard (public receipts + private content links):** included in paid tiers
- **Private determination mode (ZK-attested / identity-shielded reviewer option):** premium add-on or Business+ feature

Reason:
- ZK and private routing introduce additional infra, complexity, and audit surfaces, which must be funded.

(Implementation-agnostic in this doc; the pricing lens is “higher security, lower retaliation risk.”)

---

## 7) Lawyer DAO & Node Operator DAO Economics (High-Level)

### Node Operator DAO (availability)
Operators are paid for:
- uptime (pinning, gateways, indexers)
- correctness (audited service)
- responsiveness

Funding sources:
- portion of subscription revenue
- per-request gateway microfees (optional)
- treasury subsidies for public-good periods

### Lawyer DAO (licensed lane)
Lawyers are paid for:
- scoped review, attestations, or determinations
- jurisdiction-specific needs
- conflict-checked, opt-in engagements

CLAW pricing should treat Lawyer DAO as:
- **a marketplace service**, not bundled “free legal advice”
- billed per review/determination with clear disclaimers

---

## 8) Reality Check: Is This Valid UX?

### What is cheap (and should be nearly invisible to users)
- Receipts
- Anchoring (batched)
- Chain pointer writes (Solana/Base)

### What users will actually “feel”
- LLM workflow quality and reliability
- speed of producing usable documents and timelines
- clarity of determinations
- ease of escalation to human lanes when needed
- privacy guarantees (especially for lawyers)

So, if anything breaks UX validity, it will be:
- clunky workflow design
- ambiguity in scope/disclaimers
- lack of a clean “export to counsel/court” experience
- insufficient anti-spam protection at scale

---

## 9) Next: Finalize Prices After Two Concrete Inputs

To lock final sticker prices, CLAW should choose two explicit parameters:
1) **Monthly quotas** per tier (agreements / receipts / determinations)
2) **Default model class** per tier (nano vs mini) and the “overflow credit” cost

OpenAI pricing and chain fees can move; that’s why the tiers are framed around quotas + credits, not fragile assumptions. :contentReference[oaicite:12]{index=12}

---

## End of Document
