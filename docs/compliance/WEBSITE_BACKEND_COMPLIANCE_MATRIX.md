# Website & backend compliance matrix

**Status legend:** implemented (now) · partial · feature-flagged · pending counsel · enterprise-only / jurisdiction-specific · out of MVP scope

| Area | Item | Status | Notes |
|------|------|--------|--------|
| Marketing | CLAW not a law firm; not legal advice | **Implemented (now)** | Footers (`DisclosureFooter`), homepage strip, pricing FAQ, negotiation panel banner |
| Marketing | No attorney–client relationship | **Implemented (now)** | `disclosureCopy.ts`, `disclosure_versions.json` |
| Marketing | No “fully compliant” / “court-proof” / universal enforceability claims | **Implemented (now)** | Copy guard list in `pricingContent.ts`; vitest scans pricing blob |
| Marketing | Competitor comparison (DocuSign) without unfair/deceptive claims | **Partial** | High-level positioning only; avoid implying feature parity |
| Pricing / billing | Capacity-first public pricing; no token/key meter in primary UI | **Implemented (now)** | `BillingPage.tsx` + `pricingTiersData.ts`; internal economics still key-based |
| Pricing / billing | Overage / renewal language in secondary “Billing & allowances” block | **Implemented (now)** | `BillingTermsNotice.tsx` |
| Disclosures | Versioned disclosure payloads | **Implemented (now)** | `backend/compliance/disclosure_versions.json` (draft — **pending counsel**) |
| Disclosures | Server-side canonical hash | **Implemented (now)** | `disclosure_registry.py` |
| Consent logging | POST acknowledgement with hash/version validation | **Implemented (now)** | `POST /v1/compliance/acknowledgements` |
| Consent logging | Persisted events (timestamp, org, UA, optional IP handling) | **Implemented (now)** | `acknowledgement_store.py`; env toggles per store |
| Frontend | Checkbox + acknowledgement for product terms on pricing | **Implemented (now)** | `ConsentAcknowledgement.tsx` (requires API reachable) |
| Legal-adjacent AI | Informational-only banner | **Implemented (now)** | `DisclosureBanner` on `NegotiationAssistantPanel` |
| Legal-adjacent AI | Require acknowledgement before first use (session/device) | **Partial** | Banner always visible; optional follow-up with counsel |
| Legal-adjacent AI | Backend response guardrails (block definitive legal advice) | **Pending counsel / partial** | Policy doc only unless enforced in model prompts/routes |
| E-sign UX | Signer intent + completion events | **Partial** | Depends on existing e-sign implementation; see evidence doc |
| E-sign UX | Tamper-evident / audit language aligned to implementation | **Partial** | Use “audit-friendly” / verifiable where protocol supports; see `ClawTrustFooter` |
| Evidence | Finalized artifact hash, receipt retrieval | **Partial** | Product-specific; verify per route |
| Privacy | No secrets in client bundles | **Partial** | Routine review; not exhaustively audited here |
| Privacy | Logs exclude full document bodies by default | **Pending counsel / ops** | Confirm logging config per deployment |
| Affiliates | Endorsement / referral disclosures | **Feature-flagged / sparse** | Affiliate UI off by default; add disclosures if enabled |
| Email | CAN-SPAM-style unsubscribe for marketing | **Out of MVP scope** | No marketing-email stack reviewed in this pass |
| API docs | Public OpenAPI disclaimers | **Out of MVP scope** | Add when docs are published |

## Feature flags

- `VITE_CLAW_FEATURE_SERVER_BILLING` — subscription lookup on billing page.
- Affiliate admin — `VITE_CLAW_FEATURE_AFFILIATE_ADMIN` (see matrix above).

## Pending counsel (non-exhaustive)

- Final disclosure text, Terms of Service, Privacy Policy, and e-sign disclosures.
- Consumer-consent and industry-specific transaction exceptions.
- Whether optional acknowledgement flows should gate access vs. log-only.
