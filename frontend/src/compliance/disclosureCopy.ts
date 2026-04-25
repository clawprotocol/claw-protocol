/**
 * Central legal/compliance disclosure copy for the LawDog frontend.
 * Keep aligned with backend/compliance/disclosure_versions.json where applicable.
 */

import type { PricingCadence } from "../launch/pricingCadenceStorage";

export const PRODUCT_NOT_LAW_FIRM = "LawDog is software, not a law firm.";
export const NOT_LEGAL_ADVICE = "Not legal advice.";
export const NO_ATTORNEY_CLIENT = "Using LawDog does not create an attorney-client relationship.";
export const NO_GUARANTEE_ENFORCEABILITY =
  "LawDog does not guarantee enforceability, admissibility, or legal sufficiency.";
/** Retention reminder near exports and post-signing. */
export const RECORDS_DOWNLOAD_KEEP_COPY_SHORT = "Download and keep a copy for your records.";
/** Near Sign agreement — primary intent/adoption (agreement HTML ceremony). */
export const ESIGN_INTENT_SIGN_AGREEMENT_ACTION =
  "By selecting Sign, you adopt this as your electronic signature and agree to the agreement above.";
/** Near Sign document — sender PDF self-sign. */
export const ESIGN_INTENT_SIGN_DOCUMENT_ACTION =
  "By selecting Sign document, you adopt this as your electronic signature and agree to the document above.";
/** Near Finish signing — recipient PDF field completion. */
export const ESIGN_INTENT_FINISH_SIGNING_ACTION =
  "By selecting Finish signing, you adopt this as your electronic signature and agree to the document above.";
/** Short electronic-completion cue where a full intent line is not repeated. */
export const ELECTRONIC_RECORDS_SIGN_CUE = "You are completing this electronically.";
/** Monthly self-serve: auto-renew each period until canceled. */
export const PAID_MONTHLY_SUBSCRIPTION_MATERIAL_SHORT =
  "Billed monthly. Your subscription renews each billing period until you cancel from Billing.";
/** Annual self-serve: upfront term; do not imply same auto-renew cadence as monthly. */
export const PAID_ANNUAL_SUBSCRIPTION_MATERIAL_SHORT =
  "Billed annually as one upfront charge for the term shown at checkout. Continuation or renewal after that term follows the Terms of Service.";
/** Checkout / plan summary — use cadence so renewal language matches the offer. */
export function paidSubscriptionRenewalMaterialLine(cadence: PricingCadence): string {
  return cadence === "monthly" ? PAID_MONTHLY_SUBSCRIPTION_MATERIAL_SHORT : PAID_ANNUAL_SUBSCRIPTION_MATERIAL_SHORT;
}
/** In-app: Billing / checkout — cancellation and payment updates. */
export const MANAGE_BILLING_FROM_BILLING_SHORT =
  "Cancel, change your plan, or update payment from Billing when it is available for your workspace.";
/** Before payment — refunds bounded by governing terms, not implied flexibility. */
export const CHECKOUT_REFUNDS_AND_CREDITS_TERMS_SHORT =
  "Refunds and credits only as described in the Terms of Service and on your order at purchase.";
export const DOWNGRADE_ACCESS_SHORT =
  "If you downgrade or cancel, your existing records stay available to view and export. Paid-only features may limit new or premium work.";
/** Jurisdiction-neutral checkout / pricing footnote. */
export const TAX_VAT_LOCATION_NEUTRAL = "Taxes or VAT may apply based on location.";
/** Signup / product lane — mirrors Terms “Who may use LawDog”. */
export const WHO_MAY_USE_PRODUCT_LANE_SHORT =
  "You must be at least 18 and have legal capacity to contract. If you use LawDog for an organization, you represent you have authority to bind it. Do not use the Service where prohibited by law.";
/** Signup / product lane — high-stakes reliance boundary; aligns with Terms. */
export const NOT_SUBSTITUTE_COUNSEL_PRODUCT_LANE_SHORT =
  "LawDog is not a substitute for licensed legal counsel in active disputes, court filings, regulated filings, or jurisdiction-specific legal compliance determinations.";
/** Signup and legal-adjacent surfaces — aligns with Terms; not a localization or multi-jurisdiction qualification claim. */
export const LOCAL_LAW_USE_SIGNUP_SHORT =
  "You are responsible for ensuring your use of LawDog complies with the laws applicable to you, your organization, and your jurisdiction. We do not represent that the Service is localized or legally qualified for every jurisdiction.";
export const AI_ASSISTIVE_SHORT = "Smart suggestions are editable and not legal advice.";
/** Same as `AI_ASSISTIVE_SHORT` plus an explicit review cue (panels, modals). */
export const AI_ASSISTIVE_REVIEW_SHORT = `${AI_ASSISTIVE_SHORT} Review before you apply or send.`;
/** Workspace organize flow — metadata only; no proof mutation; not legal sorting. */
export const AI_ORGANIZE_WORKSPACE_METADATA_SHORT =
  "Updates workspace folders and tags only — not proof integrity, verification, or signed records. Not a legal classification.";
/** Drafting / generation — smart structuring, not representation or counsel. */
export const STRUCTURED_DRAFT_ASSIST_SHORT =
  "LawDog turns your input into a structured draft. Not legal advice.";
export const AFFILIATE_DISCLOSURE_SHORT =
  "Affiliates must clearly and conspicuously disclose any material connection to LawDog when recommending it.";
export const PRICING_NO_GUARANTEE =
  "Features, limits, and pricing details are governed by the terms presented at checkout and in the Terms of Service.";

const NOT_LAW_FIRM_STRIP = `${PRODUCT_NOT_LAW_FIRM} ${NOT_LEGAL_ADVICE} ${NO_ATTORNEY_CLIENT}`;
const ELECTRONIC_SIGN_WITH_PRODUCT = `${ESIGN_INTENT_SIGN_AGREEMENT_ACTION} ${RECORDS_DOWNLOAD_KEEP_COPY_SHORT} ${PRODUCT_NOT_LAW_FIRM} ${NOT_LEGAL_ADVICE}`;

/** Bundled snippets for components that expect a single object. */
export const DISCLOSURE_COPY = {
  notLawFirmShort: NOT_LAW_FIRM_STRIP,
  notLegalAdviceWorkproduct:
    `${AI_ASSISTIVE_SHORT} For your workflow and records only — not a determination of legal rights or outcomes. Consult counsel when facts or jurisdiction are uncertain.`,
  esignBaseline:
    "E-sign rules vary by transaction and state. LawDog helps capture intent and maintain records; it does not decide enforceability or replace required disclosures.",
  pricingNoGuarantee: PRICING_NO_GUARANTEE,
  /** Signing / completion surfaces — electronic cue plus product identification. */
  electronicRecordsSignCue: ELECTRONIC_SIGN_WITH_PRODUCT,
} as const;
