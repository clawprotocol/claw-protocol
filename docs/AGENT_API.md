# AGENT_API.md
**Status:** Draft v0.1  
**Purpose:** Define the minimal, deterministic interface for non-human actors.

## Overview
The CLAW Agent API enables **autonomous agents** (bots, DAOs, AI systems) to form, execute, and verify agreements **without UI**.

Agents interact with CLAW exclusively via **pure functions + signed payloads**.

## Required Agent Capabilities
An agent **must** be able to:
- Hold a cryptographic identity (keypair / DID)
- Sign payloads deterministically
- Respect declared constraints
- Verify receipts independently

## Core Endpoints (Logical)
```text
POST /propose_clause
POST /validate_clause
POST /sign_clause
POST /generate_proof
POST /anchor_proof
GET  /verify_receipt/{id}
curl -s -X POST http://127.0.0.1:8000/sign_clause \
  -H "Content-Type: application/json" \
  -d '{
    "proposal_id": "PROPOSAL_ID_HERE",
    "idempotency_key": "agentB_sig_once",
    "signature_object": {
      "signer_id": "did:claw:agentB",
      "signer_type": "agent",
      "role": "counterparty",
      "signature": "sigB_stub",
      "timestamp": "2025-12-22T19:30:00Z",
      "scope": "limited",
      "authority_proof": {
        "delegated_by": "did:claw:agentB",
        "scope": "limited",
        "expires_at": null
      }
    }
  }'
