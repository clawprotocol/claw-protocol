# CLAW Architecture Diagram (Outcome-First, Capture-Resistant)

> **Purpose:**  
> Visual synthesis of the CLAW protocol stack showing how **automated legal services** flow from user intent to enforceable outcomes, while avoiding administrative death, lawyer peer-capture, and authority contamination — and safely incorporating **Doginal Dogs / Dogecoin** as a cultural distribution layer.

---

## 1) Full System Flow (End-to-End)

```mermaid
flowchart LR
  %% Users & Culture
  DOGE[Doginal Dogs / Dogecoin<br/>Cultural & Distribution Layer]
  DOGE -->|Access • Discounts • Referrals| APP

  U[End User / Organization] -->|Draft • Submit • Notice| APP[CLAW App / API]

  %% Core Proof Path (Truth)
  APP -->|Canonicalize| CAN[Canonicalization]
  CAN -->|Hash| HASH[SHA-256]
  HASH -->|Epoch Batch| MERK[Merkle Tree]
  MERK -->|Commitment| BTC[Bitcoin Anchor]

  %% Receipts
  MERK --> REC[CLAW Receipt]
  BTC --> REC

  %% Verification
  REC -->|Verify| VER[Deterministic Verifier]
  VER -->|OK / FAIL| AUD[Judge • Auditor • Counterparty]

  %% Availability
  APP -->|Artifacts| IPFS[IPFS]
  APP -->|Perma Store (Optional)| ARW[Arweave]
  IPFS -.-> REC
  ARW -.-> REC

  %% Coordination Rails
  REC -->|Pointer Registry| SOL[Solana Registry]
  REC -->|Payments • Triggers| BASE[Base / EVM]

  %% Automated Determination
  APP -->|Opt-In| AD[Automated Determination Engine]
  AD -->|Rules & Inputs| ZK[ZK / Selective Privacy]
  ZK -->|Commitments| MERK
  AD -->|Output| ADOUT[Determination Output]
  ADOUT -->|Receipt| REC

  %% Escrow & Enforcement
  ADOUT -->|If Contractually Agreed| ESC[Escrow / Enforcement]
  ESC -->|Release • Hold| OUT[Real-World Outcome]

  %% Human Lanes
  ADOUT -->|Appeal / Review| LAW[Lawyer DAO<br/>Licensed Review]
  LAW -->|Affirm / Modify| ADOUT

  %% Ops & Sustainability
  SOL --> OPS[Node Operator DAO]
  BASE --> OPS
  OPS --> IPFS

  BASE --> ORA[Chainlink Oracles]
  BASE --> TRE[Treasury]
  TRE -->|Non-Custodial Rebalance| THOR[THORChain]
2) Trust Boundary Diagram (What Can Affect Truth vs What Cannot)
mermaid
Copy code
flowchart TB
  subgraph TRUTH["Public Truth & Finality"]
    BTC
    REC
    VER
  end

  subgraph PRIV["Selective Privacy (ZK / Confidential)"]
    ZK
    AD
    LAW
  end

  subgraph COORD["Coordination & UX"]
    SOL
    BASE
  end

  subgraph AVAIL["Availability"]
    IPFS
    ARW
  end

  subgraph CULT["Cultural Distribution"]
    DOGE
  end

  CULT --> COORD
  COORD --> TRUTH
  AVAIL --> TRUTH
  PRIV --> TRUTH
Key rule (non-negotiable):
Nothing in CULT, COORD, AVAIL, or PRIV can make a false receipt verify.

3) Authority Separation Diagram (Critical for Safety)
mermaid
Copy code
flowchart LR
  DOGE -->|Never| AUTH[Truth / Determination Authority]
  SOL -->|Never| AUTH
  BASE -->|Never| AUTH
  TRE -->|Never| AUTH

  AUTH --> BTC
  AUTH --> REC
Meaning (plain English):

Memes never decide facts

Payments never decide outcomes

DAOs never rewrite history

Treasury never controls determinations

Authority flows only from:

Math + Prior Consent + Applicable Law

4) Failure-Mode Safety (Why CLAW Doesn’t Break)
mermaid
Copy code
flowchart LR
  F1[IPFS Down] -->|Proof Still Valid| OK1[Receipt Verifies]
  F2[Solana Congested] -->|Proof Still Valid| OK1
  F3[Base Gas Spike] -->|Proof Still Valid| OK1
  F4[LLM Error] -->|Appeal Lane| LAW
  F5[Lawyer Conflict] -->|ZK Shielding| PRIV
  F6[Escrow Dispute] -->|Receipts as Evidence| AUD
  F7[Meme Capture Attempt] -->|No Authority| AUTH
CLAW fails gracefully, never catastrophically.

5) Layer Intent Summary (One-Line Each)
Bitcoin: Public clock and credibility

Receipts: Portable, verifiable evidence

ZK: Protects humans from retaliation and signaling

Automation: Eliminates admin attrition

Escrow: Converts records into consequences

Lawyer DAO: Adds legitimacy only when law requires

Solana/Base: Cheap coordination and payments

Node Operators: Availability without authority

Treasury: Sustainability, not control

Doginal Dogs / DOGE: Distribution without power

6) One-Sentence System Definition (Final)
CLAW converts legal ambiguity into verifiable records, optional automated determinations, and enforceable outcomes — using Bitcoin for truth, ZK for safety, automation to kill admin death, and cultural layers for adoption — without surrendering authority to memes, lawyers, or institutions.

End of Document