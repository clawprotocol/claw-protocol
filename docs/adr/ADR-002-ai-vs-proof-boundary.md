# ADR-002: AI vs proof boundary

**Status:** Accepted  
**Scope:** CLAW v1—where LLMs (or other non-deterministic tools) may operate vs where they are forbidden

---

## Context

Drafting and review may use AI; **receipt integrity must not depend on model behavior**. Cross-cutting rule in [`SERVICE_BOUNDARIES.md`](../architecture/SERVICE_BOUNDARIES.md).

---

## Proof boundary (strict)

**Inside the boundary (no AI, no non-deterministic deps):**

- Module **`proof/`** (canonical JSON, digests, receipt construction math).
- **`receipt_service`** deterministic path: building `receipt_body`, calling `proof/` only.
- Parsers/validators that **only** enforce `RECEIPT_SCHEMAS.md` shapes before hashing.

**Rule:** No import of LLM providers, remote model clients, or “helpful” nondeterministic string normalization **in the above**, except where an ADR explicitly allows a pure deterministic function (none in v1 default).

---

## AI may influence

| Area | Allowed influence |
|------|-------------------|
| **Drafting UX** | Suggested clauses, structure, rewrites for human review **before** freeze as document bytes. |
| **Review / classification** | Separate endpoints/products with their **own** audit linkage (not `receipt.v1` hashes). |
| **Ingest (indirect only)** | Choosing *whether* to run ingest or draft assist **after** OCR is optional UX—**not** rewriting OCR bytes used for `ocr_text_sha256` unless a **new** artifact + schema says so. |

Human or system still **commits** document bytes and sign actions; AI does not “complete” a sign_packet.

---

## AI must never influence

| Target | Rule |
|--------|------|
| **`sign_packet.v1`** | No LLM-authored `signer_ref`, `intent`, `field_manifest`, timestamps, or `document_content_sha256`. |
| **`receipt_body` / `receipt_hash_sha256`** | No model output as field values or implicit normalization. |
| **`ingest_packet.v1` `ocr_text_sha256`** | OCR pipeline only; LLM-polished text is **not** v1 OCR hash input. |
| **`verification_bundle.v1` manifest** | Paths, roles, and `content_sha256` list assembled only by system code from known artifacts. |
| **Proof flags** | No “model says verified” replacing cryptographic verify. |

---

## Orchestration requirement

- Routes that call LLMs **must not** pass model output directly into `receipt_service.build` or `proof/` hash APIs.
- Any future need to hash AI-derived content requires: **explicit schema fields**, **ADR**, and **`receipt.vN` / `sign_packet.vN` bump**—never silent injection.

---

## Consequences

- CI or lint may enforce “no LLM imports under `proof/` or receipt builder.”
- Product copy must not imply AI participation in cryptographic proof.

---

## References

- [`SERVICE_BOUNDARIES.md`](../architecture/SERVICE_BOUNDARIES.md)  
- [`RECEIPT_SCHEMAS.md`](../architecture/RECEIPT_SCHEMAS.md) (global LLM rules per schema)  
- [`CLAW_GTM_MASTER_PLAN.md`](../architecture/CLAW_GTM_MASTER_PLAN.md)
