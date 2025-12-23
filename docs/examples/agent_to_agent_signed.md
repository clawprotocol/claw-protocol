# Agent-to-Agent Signed Agreement (Headless / No UI)

This example demonstrates CLAW’s end-to-end *agent-native* agreement flow:

propose_clause → sign_clause → generate_proof → anchor_proof → verify_receipt

No UI is required. Both parties are non-human agents.

---

## Parties

- Agent A: `did:claw:agentA` (proposer)
- Agent B: `did:claw:agentB` (counterparty)

---

## Step 1 — Agent A proposes a clause

```bash
curl -s -X POST http://127.0.0.1:8000/propose_clause \
  -H "Content-Type: application/json" \
  -d '{
    "agent_id":"did:claw:agentA",
    "signature":"sigA_stub",
    "clause":{
      "clause_id":"uuid-CLAUSE-001",
      "clause_text":"Agent A will provide 100 units of compute to Agent B within 24 hours in exchange for 10 USDC.",
      "jurisdiction":null,
      "roles":["agent"],
      "constraints":{"max_value":10,"expiry":"2025-12-29T00:00:00Z","revocable":false},
      "execution_policy":{"auto_execute":true,"human_required":false,"dispute_window_seconds":0}
    }
  }'
