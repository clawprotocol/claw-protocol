# CLAW Extended Utilities

> **Status:** Extended Utilities (optional layers)  
> **Depends on:** **CLAW-PROOF-v0** (proof / receipts / verifier / on-chain anchors)  
> **Scope:** Tools and services that *use* CLAW proofs; CLAW core remains neutral proof infrastructure.

---

## 0) Purpose and Boundaries (Read First)

CLAW’s core function is **proof and timeline**:
- CLAW proves that specific digital content existed in a specific form **no later than** a specific on-chain timestamp.
- CLAW provides portable receipts that anyone can verify.

**CLAW does not:**
- decide truth
- decide liability
- provide legal advice
- create an attorney-client relationship
- issue sovereign judgments
- hold or release funds

**Extended Utilities** help users *draft, analyze, organize, and operationalize* agreements and records **without changing what CLAW proves**.

> **Boundary statement:**  
> **CLAW records facts, agreements, determinations, and timelines. Humans and institutions decide meaning and outcomes.**  
> Any binding effect arises only from **explicit party agreement** and **applicable law**.

---

## 1) Agreement Creation (LLM-Assisted Drafting)

### 1.1 What it is
An optional drafting layer that helps users create:
- agreements (NDAs, services, operating agreements, settlement terms, etc.)
- policies (HR, conduct, onboarding, disclosures)
- notices (demand letters, dispute notices, governance notices)
- structured declarations and memos

### 1.2 What it is not
- Not legal advice by default
- Not jurisdiction-specific unless explicitly configured
- Not enforceable merely because it is anchored

### 1.3 How it uses CLAW
- Draft → finalize → canonicalize → hash → anchor → receipt
- Each revision is anchored as a new version, producing a provable evolution trail.

---

## 2) Agreement-Based Automated Determination (Optional “v1-class” Utility)

> **Goal:** Allow parties who explicitly opt in to use a defined computational process (including LLMs) to produce a **determination** that has agreed contractual effect.

### 2.1 Definition (precise)
An **Agreement-Based Automated Determination** (“ABAD”) is:
> A determination produced by a defined computational process (rules engine, LLM, hybrid, or human+LLM workflow) operating on specified inputs under specified standards, where the parties explicitly agree in advance to the role and effect of that determination.

This may be:
- **advisory** (non-binding analysis)
- **conditional** (triggers contractual consequences if criteria are met)
- **binding** (expert determination / arbitration-style effect, only where legally and contractually valid)

### 2.2 What ABAD is NOT
ABAD is not:
- a court judgment
- binding on non-consenting parties
- legal advice by default
- enforcement by CLAW

CLAW never “adjudicates.” CLAW **records**:
- what the parties agreed
- what inputs were evaluated
- what output was produced
- when each step occurred

### 2.3 Mandatory opt-in elements
ABAD only applies if the parties explicitly agree to:
1) the **decision process** (engine name/version; human involvement; whether LLM is used)  
2) the **inputs** subject to evaluation  
3) the **standards/rules** applied  
4) the **effect** (advisory vs conditional vs binding)  
5) any **review/override/appeal** mechanism  
6) the **evidence packaging** and what is anchored (inputs, outputs, hashes)

Absent explicit agreement, ABAD outputs are **non-binding informational artifacts**.

### 2.4 Auditability
ABAD is designed for “hostile verifier” review:
- inputs are referenced by hashes (and optionally included)
- process version is identified
- output is anchored with a receipt
- anyone can verify that the recorded output corresponds to the recorded inputs at the recorded time

### 2.5 Role of LLMs
LLMs may:
- summarize inputs
- apply stated rules
- generate explanations
- propose structured outcomes

LLMs may not:
- claim sovereign authority
- bind parties absent opt-in
- provide legal advice absent supervision where required

---

## 3) Escrow Integration Layer (API Plugs)

> **Goal:** Support real-world transfers (funds/assets) via lawful escrow mechanisms without CLAW ever taking custody.

### 3.1 CLAW’s role in escrow (always)
CLAW can:
- anchor escrow instructions and conditions
- anchor ABAD rules (if used)
- anchor satisfaction/breach evidence packages
- anchor ABAD outputs (if used)
- provide a provable timeline of compliance and notices
- provide machine-readable “signals” to escrow systems

CLAW does **not**:
- hold money
- release assets
- act as fiduciary
- override escrow agent discretion unless a lawful contract provides otherwise

### 3.2 Statutory / licensed escrow agents (regulated)
Examples:
- real estate escrow / settlement agents
- licensed trust companies
- court-ordered escrow
- jurisdictions requiring licensed escrow for certain transactions

**Integration posture:**
- CLAW outputs function as **evidence and triggers**, not commands.
- Final release authority typically remains with the escrow agent and applicable law.

**Primary utility:**
- “Exactly what did the parties instruct?”  
- “Were conditions satisfied by date X?”  
- “What did the agreed determination output say at time Y?”

### 3.3 Non-statutory / contractual escrow (licensed or unlicensed depending on jurisdiction)
Examples:
- SaaS escrow providers
- token/DAO escrow contracts
- corporate escrow arrangements
- payment processors with conditional release logic

**Integration posture:**
- CLAW outputs can function as **contractual triggers** where parties agree:
  - “If ABAD outputs `PASS`, escrow releases”
  - “If ABAD outputs `FAIL`, escrow holds”

**Important:** Binding effects must be defined by the parties and comply with law.

### 3.4 Escrow event packaging (recommended)
For any escrow-related action, CLAW should anchor:
- escrow instructions (hash)
- conditions precedent (hash)
- determination rules (if ABAD) (hash)
- input package (hash)
- output package (hash)
- release/hold event record (hash)
- notices and timestamps (receipts)

---

## 4) Lawyer DAO / Licensed Actor Layer (If/When Required)

> **Goal:** Provide a compliant path for workflows that require licensed legal participation, without making CLAW a law firm.

### 4.1 What it is
A **Lawyer DAO** (or licensed registry layer) is:
- an opt-in roster of licensed attorneys
- scoped by jurisdiction
- role-gated (bar verification, declared jurisdictions)
- used only when necessary (statute, contract, risk policy)

### 4.2 What it is not
- not a court
- not a guarantee of outcomes
- not an attorney-client relationship by default
- not a centralized gatekeeper for CLAW proofs (verification remains public)

### 4.3 When it may be required
Examples:
- determinations that cross into legal judgment under local UPL rules
- arbitration/expert determination clauses that require licensure
- statutory escrow contexts demanding licensed involvement
- high-stakes matters where parties want human counsel sign-off

### 4.4 How it uses CLAW
CLAW can anchor:
- attorney identity attestations (jurisdiction, bar id, signature)
- review packets and outputs
- final determination statements attributed to the licensed actor

---

## 5) Timeline Tool (Chronology as a Product)

> **Goal:** Convert many proofs into a coherent, verifiable narrative sequence.

### 5.1 What it does
- builds a timeline from receipts (block time ordered)
- groups events into matters/cases/projects
- produces “chronology bundles” suitable for:
  - counsel review
  - court exhibits
  - audit packages
  - negotiation history

### 5.2 What it anchors
- timeline manifests (hashes of included receipts)
- “event cards” (optional) for human readability
- versioned updates as the story evolves

---

## 6) Personal Liability Mitigation Tool (Governance & Capacity Hygiene)

> **Goal:** Help users document intent, capacity, and governance actions in a way that reduces ambiguity later.

### 6.1 What it does
- prompts users to record actions in proper capacity (individual vs manager/member)
- generates governance artifacts (consents, resolutions, notices)
- anchors these artifacts to create contemporaneous evidence trails

### 6.2 What it is not
- not a guarantee against veil piercing
- not legal advice by default
- not a substitute for counsel

### 6.3 Typical artifacts
- member consents / resolutions
- role declarations
- delegation notices
- policy adoption records
- decision logs with timestamps

---

## 7) Versioning and Extensibility (How CLAW Evolves Safely)

### 7.1 Core principle
CLAW never overwrites history. Every update is a new proof.

### 7.2 What can be versioned
- agreements
- policies
- ABAD rules and engine versions
- evidence packages
- timelines
- disclosures and notices
- even protocol docs (v0 → v1 identifiers)

### 7.3 Compatibility principle
- **CLAW-PROOF-v0** remains immutable for verification.
- New functionality is introduced as new “utility layers” and/or new protocol identifiers where needed.

---

# Appendix A — Model Clause: Agreement-Based Automated Determination + Escrow + Optional Lawyer Review

> **Note:** This is a conservative, jurisdiction-agnostic model clause. Parties should consult counsel for local enforceability. This clause is designed to be *safe to anchor* and to support ABAD + escrow triggers.

## A.1 Definitions
**“Determination Process”** means the process described in Section A.2, including any defined engine versions and human review steps.  
**“Determination Output”** means the result produced by the Determination Process (including any explanatory rationale).  
**“CLAW Receipt”** means a cryptographic receipt verifiable under CLAW-PROOF-v0 referencing anchored commitments.

## A.2 Opt-In to Determination Process
The parties agree that disputes or questions of performance under this Agreement, limited to the scope in Section A.3, may be evaluated using the Determination Process.

The Determination Process shall be:
- Engine / workflow: **[Name and version, e.g., “CLAW Determination Engine v1.0”]**
- Inputs: **[Define documents/data permitted]**
- Standards / rules: **[Define rubric, contract section references, pass/fail criteria, etc.]**
- Output format: **[structured JSON / written rationale / pass-fail + score]**
- Audit trail: The inputs and Determination Output may be hashed and anchored with CLAW receipts.

## A.3 Scope Limitation
The Determination Process applies only to the following issues:
- **[e.g., objective compliance checks, delivery confirmation, milestone satisfaction, valuation formula inputs, etc.]**

The Determination Process does not decide:
- criminal matters,
- non-consensual third-party rights,
- issues outside the defined scope.

## A.4 Effect of Determination Output (choose one)
**(Choose A, B, or C; delete others)**

**A) Advisory Only (Non-Binding).**  
Determination Output is non-binding and provided for informational purposes.

**B) Conditional Trigger (Contractual Consequences).**  
If Determination Output is **PASS**, then **[specified consequence]** occurs. If **FAIL**, then **[specified consequence]** occurs. The parties agree these consequences are enforceable as contractual terms, subject to applicable law.

**C) Binding Expert Determination (By Agreement).**  
The parties agree that within the scope of Section A.3, the Determination Output shall be binding as an expert determination, except in cases of fraud, manifest error, or as otherwise required by applicable law.

## A.5 Escrow Coordination (Optional)
If this Agreement uses escrow, the parties authorize the escrow agent/provider to rely on Determination Output **solely** as specified herein:
- Release condition: **[e.g., “Release funds upon PASS”]**
- Hold condition: **[e.g., “Hold upon FAIL pending cure”]**
- Cure window: **[time period]**
CLAW receipts may be provided to escrow as evidence of the Determination Process, inputs, and outputs.

## A.6 Optional Lawyer Review / Licensed Actor Requirement
If the parties specify that licensed review is required:
- The Determination Output shall be reviewed and signed by a licensed attorney in **[jurisdiction]** prior to being treated as binding or used as an escrow trigger.
- LLM tools may assist, but final responsibility rests with the licensed reviewer.
- CLAW receipts may anchor the reviewer’s signed determination.

## A.7 No Court Substitution / No Sovereign Judgment
The parties acknowledge the Determination Process is a private contractual mechanism and does not constitute a court judgment. Nothing prevents either party from seeking judicial relief where permitted; however, the parties agree the Determination Output shall have the effect set forth in Section A.4 to the maximum extent permitted by law.

## A.8 Records and Verification
The parties may create and retain CLAW receipts for:
- the Agreement,
- any inputs submitted,
- the Determination Output,
- and related notices.
Such receipts provide proof of existence and sequence, not truth or legal advice.

---

# Appendix B — Pricing Tiers for Extended Utilities (Service + Premium Layers)

> **Principle:** Verification remains free. CLAW monetizes convenience, scale, integrations, and premium workflows—not “truth.”

## B.1 Tier 0 — Public Verifier (Free)
- Verify any receipt
- Open tooling
- No account required

## B.2 Tier 1 — Basic Proof (Freemium)
- Limited proofs/month
- Standard batched anchoring
- Basic receipt export
- Anti-abuse protections (rate limits; optional wallet gating)

## B.3 Tier 2 — Pro Proof + Timeline (Paid)
- Higher proof limits / priority batching windows
- Timeline builder (matter folders, chronology bundles)
- Export packs (PDF/ZIP bundles containing receipts + manifests)
- API access (basic)

## B.4 Tier 3 — Determination-Ready (Premium)
- Agreement drafting + clause library tooling (non-legal-advice posture)
- ABAD (Agreement-Based Automated Determination) engine access
- Determination packaging (inputs/outputs manifests, reproducible bundles)
- Escrow API integrations (non-custodial; “signals,” not custody)
- Enhanced audit logs (hashes + receipts + structured reports)

## B.5 Tier 4 — Institutional / Licensed Workflow (Enterprise)
- Custom SLAs, dedicated batching cadence
- On-prem / private endpoints where needed
- Lawyer DAO / licensed registry integrations (jurisdiction scoped)
- Attorney-reviewed determinations (where required by policy or law)
- Compliance and audit support packages

## B.6 Sponsorship / Public-Good Programs (Optional)
- Sponsored anchoring for journalists/NGOs
- Foundation/DAO underwriting (verification still public)

---

## Implementation Notes (Non-Normative)
- These utilities are optional. Removing them does not affect CLAW-PROOF-v0 verification.
- ABAD should always identify engine version/workflow version for auditability.
- Escrow integrations must remain non-custodial.
- Licensed actor pathways should be jurisdiction-scoped and opt-in.

