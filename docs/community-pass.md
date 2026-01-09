# CLAW Community Pass System

## Purpose

Community Passes allow NFT and on-chain communities to receive
native benefits inside the CLAW protocol without modifying core logic.

They are **adapters**, not forks.

Doginal Dogs is the first supported community.

---

## Design Principles

- Opt-in only
- Non-custodial
- Revocable
- Chain-agnostic
- Freemium-safe
- Socially expressive

Community Passes **accelerate usage**.  
They do **not** gate truth.

---

## What a Community Pass Is

A Community Pass is a verifiable claim that:

> “This wallet belongs to a recognized community participant.”

CLAW uses this claim to apply **perks**, not permissions.

Truth remains universal; perks are contextual.

---

## CommunityPass Schema (v0.1)

This is a lightweight adapter configuration object.  
It defines how CLAW verifies community membership and which benefits apply.

```yaml
community_id: doginal_dogs            # unique identifier for the community
chain: bitcoin|base|ethereum|solana   # where membership is verified

verification_method: nft_hold|allowlist|signed_claim

collection_address: "..."             # collection / contract identifier

token_rule:
  mode: any|specific_ids|min_balance
  specific_ids: []                    # optional token ID allowlist
  min_balance: 1                      # optional minimum holdings

linked_identity:
  x_profile:
    enabled: true
    method: oauth|signed_message      # signed_message preferred for cost control

perks:
  daily_signature_boost: 25           # additional free signatures per day
  badge_id: "starter-dog"
  share_card_theme: "doginal"
  batch_priority: 1                   # priority within batch (still shared)

issued_at: "2025-12-30T00:00:00Z"
expires_at: null
