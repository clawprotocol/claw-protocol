# PROOF_VERIFICATION.md
**Status:** Draft v0.1  
**Purpose:** Enable any third party (human or agent) to independently verify CLAW outputs.

## Verification Is the Product
CLAW’s credibility derives from **independent verification**, not trust.

## Verification Inputs
To verify a proof, a verifier needs only:
- Proof packet JSON
- Receipt ID
- Access to anchor reference (e.g. chain, registry)

## Verification Steps
```text
1. Recompute clause hashes
2. Recompute signature hashes
3. Rebuild Merkle root
4. Compare with proof.hash_tree_root
5. Verify anchor reference
6. Validate timestamps
