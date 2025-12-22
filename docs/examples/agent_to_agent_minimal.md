# Agent-to-Agent Minimal Agreement (No UI)
**Status:** Example v0.1  
**Goal:** Two non-human agents form a binding agreement and produce a verifiable receipt.

## Actors
- **Agent A**: `did:claw:agentA` (proposer)
- **Agent B**: `did:claw:agentB` (counterparty)
- **CLAW**: headless proof + receipt engine

## Pre-conditions
- Each agent has a keypair and can sign payloads.
- CLAW endpoints exist logically: `/propose_clause`, `/validate_clause`, `/sign_clause`, `/generate_proof`, `/anchor_proof`, `/verify_receipt/{id}`.
- No human intervention required (`human_required=false`).

---

## Step 1 — Agent A proposes a clause

### Clause Object (canonical)
```json
{
  "clause_id": "uuid-CLAUSE-001",
  "clause_text": "Agent A will provide 100 units of compute to Agent B within 24 hours in exchange for 10 USDC.",
  "jurisdiction": null,
  "roles": ["agent"],
  "constraints": {
    "max_value": 10,
    "expiry": "2025-12-29T00:00:00Z",
    "revocable": false
  },
  "execution_policy": {
    "auto_execute": true,
    "human_required": false,
    "dispute_window_seconds": 0
  },
  "hash": "sha256( canonical_json(clause) )"
}
