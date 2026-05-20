# LawDog Premium AHA Evaluation Rubric

Use when comparing **Free** vs **Pro** on the **same fixture prompt** (`qa/fixtures/`) or GTM scenario (`GTM_SCENARIOS.md`).

**AHA moment:** the user thinks *“I would pay to send this, not rewrite it for three hours.”*

---

## Scoring scale (1–5)

| Score | Label | Meaning |
|-------|-------|---------|
| **1** | Broken | Wrong doc type, missing parties, unsafe gaps, or clearly generic boilerplate |
| **2** | Weak | Usable skeleton; major ambiguity; feels like template mail-merge |
| **3** | Adequate | Professionally passable for low-stakes use; premium not obviously smarter than free |
| **4** | Strong | Clearly personalized; resolves key ambiguities; trustworthy tone; minor edits only |
| **5** | Delight | Feels expert, screenshot-worthy, ready to sign/send with pride |

**Pass threshold for Genesis GTM slice:** average **≥ 3.5** on top 10 scenarios; no scenario **≤ 2** on trust or safety dimensions.

---

## Dimensions (score each 1–5)

### 1. Materially smarter (`smart_delta`)

Does Pro add **substantive** legal structure free does not?

- Defined terms, recitals, signature blocks
- Industry-appropriate clauses (SaaS, creator, consulting)
- Risk allocation (liability, IP, termination)

*Fail signal:* Pro is only longer, not clearer.

### 2. Personalized (`personalized`)

Does the draft reflect **this** prompt’s parties, deal shape, and constraints?

- Names/roles from user text
- Numbers, timelines, deliverables echoed
- Jurisdiction/deal type inferred correctly or asked

*Fail signal:* Could apply to any company on earth.

### 3. Reduces ambiguity (`ambiguity`)

Does Pro **resolve or surface** conflicts instead of hiding them?

- Contradictions flagged with choices
- Missing critical terms called out inline or in summary
- Reasonable defaults explained

*Fail signal:* Silent pick of one contradictory instruction.

### 4. Screenshot-worthy (`shareable`)

Would a founder post a redacted snippet or tell a friend?

- Clean headings, readable on mobile
- “Wow” clause or summary — not gimmicky
- Professional typography in preview/export

*Fail signal:* Wall of unbroken text; embarrassing to share.

### 5. Trustworthy (`trust`)

Does the product feel **responsible**, not reckless?

- No guaranteed litigation outcomes
- Classification/regulatory risks not ignored
- Tone calm under emotional prompts
- Clear what is / isn’t legal advice

*Fail signal:* Overconfident promises; fear-based drafting.

### 6. Worth paying for (`worth_it`)

Holistic willingness to pay **$39/mo** for this workflow.

Consider: time saved, anxiety reduced, recipient-ready quality.

*Fail signal:* User would paste into ChatGPT instead.

---

## Side-by-side worksheet

| Dimension | Free (1–5) | Pro (1–5) | Δ (Pro−Free) | Notes |
|-----------|------------|-----------|--------------|-------|
| smart_delta | | | | |
| personalized | | | | |
| ambiguity | | | | |
| shareable | | | | |
| trust | | | | |
| worth_it | | | | |
| **Average** | | | | |

**Target Δ:** average **≥ +1.0** on top scenarios; **trust** never lower on Pro than Free.

---

## Quick knockout checks (any “no” = cap dimension at 2)

- [ ] Correct agreement **type** for prompt
- [ ] **Parties** identifiable
- [ ] **Governing law / venue** not nonsense (or flagged)
- [ ] **Signature block** present for send/sign path
- [ ] No **placeholder soup** (`[PARTY A]`) left in export PDF
- [ ] Premium hydration: no visible **starter flash** after checkout return

---

## Recording results

Log scores in `qa/QA_RESULTS_TEMPLATE.md` per scenario. Attach screenshots to your run folder (outside git if sensitive).

**Related:** `QA_PHILOSOPHY.md`, `QA_MATRIX.md`, `MANUAL_QA_RUNBOOK.md`
