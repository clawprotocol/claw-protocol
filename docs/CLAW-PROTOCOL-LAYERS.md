# CLAW Protocol Layers (Outcome-First, Incentive-Sound Architecture)

**One-sentence definition:**  
CLAW is a public protocol stack for **automated legal services** that avoids administrative attrition and peer-captured legal dynamics by combining Bitcoin-anchored proofs, selective privacy, automated determinations, and optional licensed enforcement layers.

---

## 0) Architectural North Star (Read First)

CLAW is not designed to “win cases.”  
CLAW is designed to **change the payoff matrix** so that:

- ambiguity is expensive,
- delay is ineffective,
- peer-mediated suppression is minimized,
- and enforceable outcomes occur *before* litigation becomes a zero-sum war.

This requires **three simultaneous properties**:

1. **Public verifiability** (for credibility and enforceability)  
2. **Selective privacy** (to protect lawyers and parties from retaliation, signaling, or capture)  
3. **Automation with opt-in authority** (to reduce admin and human bottlenecks)

Every layer below exists to support one or more of these properties.

---

## 1) Layer 0 — Cryptographic & Network Assumptions

**Role:** Immutable math and public time.

Includes:
- SHA-256 hashing
- Merkle trees
- Bitcoin consensus
- ZK proof systems (general category; implementation-agnostic)

This layer is **non-governed** and **non-upgradable** by CLAW.

---

## 2) Layer 1 — Bitcoin Anchoring (Public Finality Layer)

**Role:**  
Provide a globally neutral, adversary-resistant timestamp and commitment anchor.

**What is anchored:**
- Hashes or Merkle roots of:
  - agreements
  - evidence packages
  - determination rules
  - determination outputs
  - timeline manifests
  - ZK commitments (not raw private data)

**What this layer proves (precisely):**
> “A cryptographic commitment to specific data existed no later than block T.”

**What it does NOT prove:**
- truth of the data
- authorship
- legality
- disclosure of contents

Bitcoin is the **court-grade clock**, nothing more, nothing less.

---

## 3) Layer 2 — Canonicalization & Hashing (Truth Definition)

**Role:**  
Define *exactly* what bytes are being committed so disputes cannot hide in formatting or interpretation.

Includes:
- canonical JSON rules
- UTF-8 encoding
- deterministic sorting
- strict hashing procedures

Without this layer, “proof” collapses into vibes.

---

## 4) Layer 3 — Epochs & Merkle Batching (Scale Without Trust)

**Role:**  
Batch thousands of legal artifacts into a single anchor event.

- Individual items → leaf hashes  
- Epoch → Merkle root  
- Root → Bitcoin anchor  

This gives:
- extremely low per-item cost
- independent verifiability
- no editorial discretion

Epochs are **mechanical**, not political.

---

## 5) Layer 4 — Receipts (Portable Legal Proof Objects)

**Role:**  
Turn abstract protocol state into something a human or court can verify.

A receipt contains:
- protocol version
- network
- epoch ID
- Bitcoin txid
- expected commitment
- Merkle path
- (optionally) ZK proof references

Receipts are:
- portable
- immutable
- verifier-agnostic

They are **evidence**, not arguments.

---

## 6) Layer 5 — Deterministic Verifier (Hostile-Verifier Safe)

**Role:**  
Ensure no one — including CLAW — can lie about what was anchored.

Verifier properties:
- recomputes everything
- fetches public chain data
- fails loudly
- CI-enforced

This layer is the **anti-capture backstop**.

---

## 7) Layer 6 — Storage & Availability (IPFS / Arweave)

**Role:**  
Make underlying documents retrievable when needed.

- **IPFS:** fast, cheap, redundant distribution
- **Arweave:** durable, high-assurance storage for critical artifacts

Important separation:
- **Bitcoin proves existence**
- **IPFS/Arweave provide access**
- Either can fail without invalidating the proof

---

## 8) Layer 7 — ZK / Selective Privacy Layer (Critical)

> **This layer is essential to avoid lawyer capture, retaliation, and signaling effects.**

### 8.1 Purpose
Enable parties and licensed professionals to:
- participate in determinations
- issue opinions or rulings
- review evidence

**without publicly exposing:**
- sensitive facts
- legal strategy
- lawyer identities (where appropriate)
- preliminary analysis

### 8.2 What is public vs private

**Public (anchored):**
- cryptographic commitments
- proof that a valid determination occurred
- proof that agreed rules were followed
- timestamps and sequence

**Private (protected):**
- underlying evidence
- internal reasoning
- sensitive submissions
- reviewer identity (if ZK-shielded)

### 8.3 How ZK is used (conceptually)
ZK proofs may be used to prove statements such as:
- “This determination was produced by a licensed lawyer in jurisdiction X”
- “The output satisfies rule set Y”
- “The inputs matched the agreed schema”
- “No prohibited data was considered”

…without revealing the data itself.

### 8.4 Why this matters (game theory)
Without privacy:
- lawyers are chilled by future career risk
- controversial determinations are avoided
- peer pressure re-enters the system

With ZK:
- lawyers can participate without social signaling
- determinations are judged on validity, not politics
- enforcement relies on proofs, not reputations

This **breaks the lawyer prisoner’s dilemma** structurally.

---

## 9) Layer 8 — Solana (High-Throughput Registry & UX Rail)

**Role:**  
Cheap, fast coordination layer for:
- receipt pointer registries
- user identities / handles
- activity feeds
- community passes
- social/legal UX

Solana stores **references**, not truth.

---

## 10) Layer 9 — Base (EVM Coordination & Payments)

**Role:**  
Programmable execution layer for:
- payments (USDC/USDT)
- tier gating
- escrow triggers
- Chainlink oracle consumption
- DAO primitives (if used)

Base is where **economic logic** lives, not proof logic.

---

## 11) Layer 10 — Automated Determination (ABAD)

**Role:**  
Enable **agreement-based automated legal determinations**.

- parties opt in
- scope is defined
- rules are fixed
- inputs are structured
- outputs are anchored

Binding effect arises **only from prior agreement**, never by default.

ZK may shield:
- inputs
- reasoning
- reviewer identity

while still proving:
- compliance
- validity
- sequence

---

## 12) Layer 11 — Escrow Integration (Non-Custodial Enforcement)

**Role:**  
Convert determinations into real-world consequences.

CLAW:
- never holds funds
- never releases assets

Escrow agents (statutory or contractual):
- may rely on CLAW receipts + proofs
- retain legal discretion unless contractually constrained

This is how **records become leverage**.

---

## 13) Layer 12 — Lawyer DAO (Licensed Human Override)

**Role:**  
Route workflows through licensed professionals **only when required**.

Key properties:
- jurisdiction-scoped
- opt-in
- auditable
- ZK-compatible (identity may be shielded)

Lawyers are used:
- surgically
- at high-value decision points
- without becoming permanent gatekeepers

---

## 14) Layer 13 — Node Operator DAO (Availability & Neutrality)

**Role:**  
Decentralize:
- storage pinning
- indexers
- verifiers
- receipt resolution APIs

Operators are paid for:
- uptime
- correctness
- responsiveness

They **cannot** alter truth.

---

## 15) Layer 14 — Treasury, Clearing, and Oracles

**Role:**  
Keep the protocol alive without rent-seeking.

Includes:
- BTC reserves (credibility + longevity)
- USDC/USDT (operations)
- capped risk sleeve (e.g. BBot)
- THORChain for non-custodial rebalancing
- Chainlink for price references

Treasury governs **sustainability**, not outcomes.

---

## 16) Layer 15 — Cultural Distribution & Meme Coordination (Doginal Dogs / Dogecoin)

**Role:**  
Provide non-authoritative cultural distribution, community signaling, and incentive alignment for CLAW adoption without contaminating proof, determination, or enforcement layers.

**Doginal Dogs function as:**
- community passes
- discount and priority access keys
- referral and distribution primitives
- cultural UX layer for non-legal-native users

**Dogecoin may be supported as:**
- optional payment rail
- micro-payment and promotional currency
- meme-native access mechanism

**Explicit limitations:**
- This layer has no authority over truth, determinations, escrow, or enforcement.
- Ownership or participation confers no legal power.
- All legal authority remains opt-in, contractual, and verifiable via CLAW receipts.

**Design rationale:**
Doginal-based distribution allows CLAW to escape the “death by admin” adoption trap by introducing legal automation tools through culturally legible, low-friction channels—without recreating governance capture or signaling risk.

---

## 17) Summary (Why This Works)

CLAW succeeds because:

- **Bitcoin** prevents historical lies  
- **ZK** prevents social and professional retaliation  
- **Automation** eliminates admin attrition  
- **Escrow** creates consequences  
- **Optional lawyers** add legitimacy without capture  

The result is a system where:
> clarity beats delay,  
> proofs beat narratives,  
> and outcomes do not depend on who controls the room.

---

## End of Document
