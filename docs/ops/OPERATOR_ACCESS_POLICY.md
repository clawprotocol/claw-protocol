# LawDog operator access policy (internal)

## 1. Purpose

This document sets **internal** expectations for how LawDog is operated at launch: **minimize routine access to user substance**, keep support **metadata-first**, and preserve **verifier-first, deterministic proof** behavior. It is **not** legal advice, a compliance certification, or a substitute for customer contracts or regulatory programs.

---

## 2. Core principle

- **Users control their content** — drafts and workflow state exist to serve the user’s process.
- **The system verifies and orchestrates** — receipts, hashes, timelines, and verify flows should stand without the operator re-reading private text.
- **The operator does not routinely access substance** — no default habit of opening agreements, uploads, or memory index text to “see what’s going on.”

---

## 3. Definitions

### Infrastructure access

Access to **hosts, volumes, networks, secrets managers, deployment pipelines, and backup systems** — whatever is needed to run and secure the service. This access **can** reach raw stores (e.g. data directories, databases) even when the product UI does not expose them.

### Metadata access

**Identifiers, timestamps, statuses, counts, error codes, receipt IDs, agreement IDs, org IDs, anchor/batch IDs, feature flags, and health/deploy summaries** — enough to run the platform and help users **without** opening full agreement text, uploads, or search/memory blobs.

### Content / substance access

**Agreement fields (purpose, terms, parties, versions, rendered HTML), uploaded documents, OCR/layout extractions, Agreement Memory search blobs and summaries, LLM prompts/responses, and similar user- or document-derived text.** Treat as **high sensitivity** for support and ops.

---

## 4. Default operator rules

1. **Prefer metadata** for monitoring, alerting, and support triage.
2. **Do not browse** production databases or on-disk draft files for curiosity or convenience.
3. **Use production configuration** that locks admin/debug and avoids dev-only routes (see §8).
4. **Assume** infrastructure access *could* read substance — **discipline** is what keeps the posture operator-minimized.

---

## 5. Support model (metadata-first)

When helping a user, start and usually stay with:

- **Agreement ID**, **receipt / verification references**, **error code and HTTP status**
- **Timestamps** (client + server where available), **request ID** if surfaced
- **Workflow status** (draft, sent, locked, signed), **proof / verify outcome**

Escalate to substance **only** when necessary, **narrowly**, and under **break-glass** (§6). Train support to ask users for **what they see** (screens, IDs) before asking for full document text.

---

## 6. Break-glass principle

Exceptional access to substance must be:

- **Exceptional** — not the default path.
- **Narrow** — least data, shortest time, specific agreement or artifact.
- **Logged** — who, when, what scope (even if only in your ticketing/runbook system at first).
- **Reason-coded** — e.g. production incident, suspected abuse, explicit user authorization for support.

There is **no** “the founder can read everything anytime” policy — only **infrastructure capability** without discipline. This policy expects **discipline**.

---

## 7. What must never be logged or sent to analytics

Do **not** persist or ship to analytics/logging providers:

- Full **agreement body** or long **intake / clause** text  
- **Memory search queries** (length or counts are fine if query text is absent)  
- **Upload / document** full text or large extracts  
- **LLM prompts and completions** (use metadata-only trace patterns; see `backend/security/safe_logging.py`)  
- **Secrets** — API keys, tokens, webhook signing material, private keys, raw payment or session secrets  

Product analytics should stick to **event names, surfaces, and opaque IDs** unless explicitly reviewed for privacy.

---

## 8. Production expectations

| Area | Expectation |
|------|-------------|
| **Admin** | `CLAW_ADMIN_SECRET` **set**; production-like env **denies** admin when secret is unset. |
| **Debug** | `CLAW_DEBUG` **off** by default in production-like environments; enable only briefly for diagnosed issues. |
| **DB / disk** | No **casual** browsing of prod SQLite/files; use **queries/scripts** that return **metadata** when possible. |
| **Backups** | **Restricted** to roles that need restore/DR; same substance sensitivity as primary stores. |
| **Internal/dev routes** | Dev storage smoke and similar routes **not** mounted in production-like env unless explicitly opted in. |

---

## 9. Current caveat (honest)

Architecture is **moving toward** operator-minimized operation and **verifier-first** proof, but:

- **Infrastructure access** to data stores can still **read** user substance — encryption-at-rest and strict IAM are **operational** layers, not fully described here.
- Some **API read paths** still rely on **knowledge of identifiers** and **workspace discipline** rather than a fully tightened ACL model everywhere; **roadmap** should narrow this where product requirements allow.

This does **not** mean the product is “fully private from the operator” — it means **routine** operator behavior should **not** treat user documents as casually visible.

---

## 10. Near-term roadmap items

1. Tighten **read scopes** (owner vs recipient vs public verify) where product design allows — reduce ID-only confidentiality assumptions where unacceptable for target customers.  
2. **Document** backup/restore access and break-glass in the operator runbook with **reason codes**.  
3. **Review** webhook and integration **payload builders** so summaries stay **metadata-only**.  
4. **Expand** use of **safe logging** patterns for new routes and workers.  
5. **Customer-facing** privacy and data-handling docs aligned with this policy — **without** claiming SOC 2, HIPAA, or privilege unless actually established.

---

*Last updated: internal engineering policy for launch posture. Revise as architecture and ops mature.*
