# Decision memo: public pricing models for launch

**Status:** Decision support  
**Audience:** Product, GTM, finance  
**Scope:** Consumer-facing pricing *presentation* and monetization *moments* (not full SKU economics).

---

## 1. Context

CLAW sits at the intersection of **self-serve agreement workflows** (high intent, short cycles) and **CLM-adjacent** expectations (subscriptions, enterprise procurement, usage behind the contract). Launch pricing must:

- Preserve **completion and trust** on the first agreement.
- Keep **Enterprise** credible as **custom**, not undermined by public micro-transactions.
- Allow **revenue capture** when intent peaks (post-value), without training users on discount-first behavior.

**Directional baseline (industry + PLG SaaS):** typical **free → paid** conversion for self-serve B2B products often clusters roughly **2–5%** of activated users in a given cohort window (definitions vary: account created vs. “aha” vs. paywall exposure). This memo uses **2–3%** as a conservative floor and **4–5%** as an achievable ceiling when paywalls are well-timed and value is clear. Ranges are **not forecasts**; they anchor relative risk between strategies.

---

## 2. Strategies compared

### A. Subscription-only public pricing

**Definition:** Public surfaces show only subscription tiers (e.g. monthly/annual). No in-product one-time SKU on the marketing grid; monetization is subscription or sales-assisted Enterprise.

| Dimension | Assessment |
|-----------|------------|
| **Conversion rate** | **Neutral to slightly lower** vs. a well-designed hybrid *if* some users refuse any subscription but would pay once. Expect cohort paid conversion roughly in the **2–4%** band for comparable products unless the ICP is strictly subscription-native. |
| **Revenue per user (RPU)** | **Higher among subscribers** (no low-ticket dilution), but **missed revenue** from users who would pay once and never return. |
| **Trust / clarity** | **Strongest** simple story: “We sell plans.” Lowest cognitive load; aligns with how buyers expect CLM vendors to present list pricing. |
| **Competitor alignment** | **High** — DocuSign, Ironclad, and peers lead with **plans and packaging**, not per-envelope list rates on the homepage. |
| **Enterprise scalability** | **Excellent** — no public unit economics that undermine **custom pricing** or procurement narratives. |

**Risks**

- **Revenue leakage:** Users who complete one high-stakes agreement and refuse recurring plans may **bounce at paywall** instead of converting.
- **Slower learning:** Fewer discrete price points in funnel analytics (only subscription checkout), slightly harder to segment “price sensitive one-job” vs. “workspace buyer.”

---

### B. Subscription-first with contextual one-time unlock *(recommended)*

**Definition:** Public pricing remains **subscription-first** (Plus / Pro / Enterprise custom). A **one-time unlock** appears **only after value** (e.g. agreement ready / send intent), visually and narratively **subordinate** to subscription (link-style fallback, not a second hero SKU on the pricing page).

| Dimension | Assessment |
|-----------|------------|
| **Conversion rate** | **Best risk/reward for launch:** protects the **free success path**, then converts at **peak intent**. Expect **similar or slightly higher** overall monetization vs. A from recovered one-time buyers; subscription remains the default path so **blended conversion** can sit in the **~3–5%** range *if* execution is strong—otherwise still **~2–4%** with less leakage than A alone. |
| **RPU** | **Blended:** lower than pure subscription among users who choose one-time, **higher total revenue** than A if one-time recovers otherwise lost sends. **LTV** still concentrated on subscribers. |
| **Trust / clarity** | **Good if disciplined:** trust depends on **not** leading with one-time on pricing pages or onboarding. Subscription = “real product”; one-time = “exception path.” Violating that hierarchy erodes clarity. |
| **Competitor alignment** | **High** public posture (still subscription-first like CLM leaders); **contextual one-time** is closer to **consumer fintech / prosumer** patterns than to enterprise list pricing—acceptable **only** post-value. |
| **Enterprise scalability** | **Strong** — Enterprise stays **custom**; usage-based constructs stay **internal / contract** (per agreement, per key, per API) without public list rates. |

**Risks**

- **Positioning drift:** If one-time is ever promoted to **primary** or shown **early**, users anchor on **cheap transactional** pricing and **subscription + Enterprise** both suffer.
- **Operational complexity:** Two success paths (subscription checkout vs. one-time settlement) require clean analytics (`paywall_shown`, `upgrade_clicked`, `unlock_clicked`, `unlock_completed`) and support clarity (“What did I buy?”).

**Mitigations (already aligned with product direction)**

- One-time **only after** “agreement is ready” / high-intent send surfaces.
- **Visual hierarchy:** large primary subscription CTA; one-time as **fallback** link.
- **Enterprise** remains **custom pricing** on the public grid; no per-unit public listing.

---

### C. Visible hybrid pricing page

**Definition:** Marketing or in-app pricing prominently lists **both** subscription tiers **and** transactional SKUs (e.g. per agreement, per send, per key, or “à la carte” column alongside plans).

| Dimension | Assessment |
|-----------|------------|
| **Conversion rate** | **Volatile:** can **lift** short-term conversion for **single-job** buyers who hate subscriptions; can **depress** subscription starts if users **compare line items** and pick the cheapest visible option. Net effect often **neutral or negative** for **subscription revenue** unless SKUs are carefully fenced. |
| **RPU** | **Lower average** among users who choose visible low-ticket SKUs; **higher** only if volume compensates (usually requires metering maturity). |
| **Trust / clarity** | **Weakest for CLM positioning:** hybrid grids invite **“which cell am I?”** confusion and **price shopping** before value. Harder to explain **governance, memory, and org** value next to a **$3 cell**. |
| **Competitor alignment** | **Lower vs. category leaders** at the **pricing page** layer; some competitors expose **usage** in **logged-in** billing or **sales** quotes, not as **hero hybrid** on public pricing. |
| **Enterprise scalability** | **Weakest:** public per-unit anchors **cap** enterprise negotiations (“Your doc said $X per agreement”) and **collides** with **custom / volume** deals. |

**Risks**

- **Anchoring and commoditization:** Public hybrid trains the market on **unit economics** you may not want to defend.
- **Procurement friction:** Enterprise buyers may ask why **list** hybrid does not match **MSA**—extra explanation cost.
- **Product complexity:** You ship **rules + UX + support** for every visible SKU.

---

## 3. Side-by-side summary

| Criterion | A. Subscription-only | B. Subscription-first + contextual one-time | C. Visible hybrid page |
|-----------|----------------------|-----------------------------------------------|-------------------------|
| Conversion (directional) | ~2–4%; risk of one-job leakage | ~3–5% potential; recovers leakage without crowding subscription | Uncertain; may trade subscription for micro-purchases |
| RPU | High among payers; misses one-job wallet | Blended; optimizes **total** capture at launch | Often lower ARPU unless volume is huge |
| Trust / clarity | Highest simplicity | High if hierarchy is strict | Lower; comparison overload |
| Competitor alignment (CLM) | Strong | Strong public + acceptable exception path | Weak on public grid |
| Enterprise scalability | Best | Best (if one-time stays contextual / non-list) | Weakest |

---

## 4. Risk summary

| Risk | A | B | C |
|------|---|---|---|
| Under-monetize one-job high-intent users | High | Low | Low |
| Confuse pricing / hurt trust | Low | Medium (manageable) | High |
| Hurt subscription / LTV | Low | Low (if UX discipline) | High |
| Constrain Enterprise deals | Low | Low | High |
| Engineering + ops burden | Lowest | Medium | Highest |

---

## 5. Recommendation

**Adopt strategy B — subscription-first public pricing with a contextual, subordinate one-time unlock — as the optimal model for launch.**

### Reasoning

1. **Conversion:** It preserves the **completion-first** experience (critical for agreement flows), then monetizes at **maximum intent**, which is where **2–5% baseline** economics are most efficiently improved **without** sacrificing the top-of-funnel story.

2. **Revenue:** It captures **wallet share** from users who will **never** subscribe but will pay once—revenue that **A** leaves on the table—while keeping **subscription and Enterprise** as the **dominant** revenue and narrative.

3. **Trust / clarity:** Public truth remains **“We sell plans + Enterprise custom”** (aligned with **CLM norms**). The one-time path is an **exception**, not a second headline product—avoiding the **clarity and anchoring** problems of **C**.

4. **Enterprise:** **B** and **A** both protect **custom pricing** and **internal** usage-based constructs (per agreement, per key, per API) for **quotes and MSAs**. **C** undermines that by **publishing** unit logic competitors typically **hide** until deal stage.

5. **Launch pragmatism:** **B** adds **one bounded surface** (post-value modal + checkout intent) instead of re-architecting the entire pricing story (**C**) or accepting avoidable leakage (**A**).

**Explicit non-choice for launch:** **C (visible hybrid pricing page)** — wrong default for a product that must scale to **Enterprise** and stay legible next to **category-leading CLM** pricing.

---

## 6. Conclusion

For launch, **one model is optimal: subscription-first public pricing with a contextual, visually secondary one-time unlock**, with **Enterprise remaining custom** and **usage-based pricing reserved for internal / contract constructs only**. This combination **maximizes trust and Enterprise headroom** while **improving realistic conversion and revenue capture** versus subscription-only, **without** the structural risks of a public hybrid grid.

---

*This memo is directional. Instrument funnels (`paywall_shown`, `upgrade_clicked`, `unlock_clicked`, `unlock_completed`, subscription checkout) and revisit after statistically meaningful cohort volume.*
