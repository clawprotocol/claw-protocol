# E-sign UX & evidence requirements (draft — **counsel review required**)

Baseline assumption: **E-SIGN** and **UETA** inform many US transactions; **exceptions and state/transaction-specific rules exist**. This document tracks product expectations, not legal conclusions.

## Implemented or partially implemented (verify per release)

| Requirement | Status | Implementation notes |
|-------------|--------|----------------------|
| Versioned written disclosures for e-sign / records | **Partial** | `esign_records_1` in `disclosure_versions.json`; copy **pending counsel** |
| Log disclosure acknowledgement | **Implemented** | Compliance API + SQLite store |
| Signer intent (explicit sign action) | **Partial** | Confirm in active e-sign UI flows |
| Attribute sign action to identity/session | **Partial** | Confirm server-sideSigning model |
| Completion event logging | **Partial** | Confirm agreement/esign event pipeline |
| Finalized artifact identity (hash) | **Partial** | Receipt / proof pipeline exists; validate per document type |
| Retrieval of executed version | **Partial** | Product routes; verify retention settings |
| Tamper-evident language | **Partial** | Use wording aligned to actual cryptography and retention — avoid overstating |

## Must not claim (unless true)

- Notarization without a notary workflow.
- Determination of enforceability.
- Suitability for all transaction types (e.g. some consumer, wills, real estate, without review).

## Consumer / regulated flows

- **Pending counsel:** categories requiring enhanced consent, copy delivery, or paper fallbacks.
- Product should support **consent capture**, **disclosure versioning**, and **evidence logging**, not signature image alone.

## Operational

- Retention and export: configurable per deployment (**ops + counsel**).
- Audit bundles should **exclude** secrets and unnecessary PII (**privacy review**).

## Related files

- `backend/compliance/disclosure_versions.json`
- `frontend/src/components/claw/ClawTrustFooter.tsx`
- `frontend/src/compliance/BillingTermsNotice.tsx`
