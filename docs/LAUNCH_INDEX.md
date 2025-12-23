# CLAW Protocol — Launch Index

CLAW is an administrative-less legal proof protocol designed for humans, bots, DAOs, and AI agents.

This repository contains the **first working, headless, agent-native implementation** of CLAW.

---

## 🚀 Start Here (2 minutes)

If you read only three files, read these:

1. **Agent API Overview**  
   `docs/AGENT_API.md`

2. **Minimal agent-to-agent flow (no signatures)**  
   `docs/examples/agent_to_agent_minimal.md`

3. **Signed agent-to-agent flow (canonical)**  
   `docs/examples/agent_to_agent_signed.md`

---

## 📜 Protocol Specifications

- Canonical JSON + hashing rules  
  `docs/protocol/CANON_JSON.md`

- Proof construction & verification  
  `docs/protocol/PROOF_VERIFICATION.md`

- Non-human signers (agents, bots, DAOs)  
  `docs/protocol/NON_HUMAN_SIGNERS.md`

- Human override model  
  `docs/protocol/HUMAN_OVERRIDE.md`

- Dispute lineage & supersession  
  `docs/protocol/DISPUTE_LINEAGE.md`

- Protocol events  
  `docs/protocol/PROTOCOL_EVENTS.md`

- Invariants & interfaces  
  `docs/protocol/INVARIANTS_AND_INTERFACES.md`

---

## ✅ What Works Today

- Deterministic clause hashing
- Agent-native signing (no UI)
- Proof generation with lineage
- Anchoring (internal; chain-adapter ready)
- Receipt verification
- Tamper detection

All flows can execute **without humans and without UI**.

---

## 🔜 Near-Term Roadmap

- Proof supersession (signed > unsigned)
- Real wallet signature verification
- External chain anchors (Base / Solana / BTC)
- Optional execution hooks
