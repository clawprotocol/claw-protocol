/**
 * TEST448 — brand licensing Pro orchestration / SoT adoption race (live Railway scenario).
 */

import type { ParsedDraftShape } from "./intakeSmartDefaults";
import { buildStarterAgreementPreviewForReview } from "./agreementPreviewFromDraft";
import { BRAND_LICENSING_AGREEMENT_TITLE_UPPER } from "./paidProAgreementTitleScope";
import {
  TEST440_ATLAS,
  TEST440_BRIGHT_PEAK,
  TEST440_EVERGREEN,
  TEST440_HORIZON,
  buildTest440CorruptedNoticeTail,
} from "./paidProTest440BrandLicensingDegradedRecoveryFixtures";
import {
  buildTest446SubstantiveBrandLicensingServerBody,
  test446BrightPeakFirstDraft,
} from "./paidProTest446BrandLicensingIntentRegressionFixtures";
import { buildTest447CorruptedNoticeRegionWithFifthParty } from "./paidProTest447BrandLicensingServerRetryFixtures";

export const TEST448_TRANSACTION_TITLE = BRAND_LICENSING_AGREEMENT_TITLE_UPPER;
export const TEST448_TARGET_DEGRADED_LEN = 8_552;
export const TEST448_TARGET_SERVER_LEN = 28_871;
export const TEST448_STARTER_LEN = 1_319;
export const TEST448_STARTER_ALT_LEN = 2_228;
export const TEST448_ALL_PARTIES = [TEST440_EVERGREEN, TEST440_ATLAS, TEST440_HORIZON, TEST440_BRIGHT_PEAK];

/** Exact live QA prompt (TEST448). */
export const TEST448_LIVE_INTAKE = [
  "We're launching a new outdoor products brand and need an agreement between four companies that will work together to manufacture, distribute, and sell the products.",
  "",
  "The parties are:",
  "* Evergreen Outdoor Brands LLC (Brand Owner)",
  "* Atlas Consumer Products Inc. (Manufacturer)",
  "* Horizon Wholesale Group LLC (Master Distributor)",
  "* BrightPeak Retail Solutions LLC (Marketing & E-commerce Manager)",
  "",
  "Atlas will manufacture the products using Evergreen's specifications and approved materials.",
  "",
  "Horizon will act as the exclusive wholesale distributor throughout North America.",
  "",
  "BrightPeak will manage Amazon, Shopify, Walmart Marketplace, digital advertising, customer analytics, and ecommerce operations.",
  "",
  "The Brand Owner receives an 8% royalty on gross product sales. The Manufacturer is paid production costs plus an 18% manufacturing margin. The Master Distributor retains a 14% wholesale distribution margin. BrightPeak receives 6% of net online sales plus reimbursement of approved marketing expenses.",
  "",
  "The agreement should include quality standards, intellectual property ownership, trademark usage, confidentiality, payment terms, inventory reporting, audit rights, returns, warranties, limitation of liability, indemnification, insurance requirements, termination, notice provisions, electronic signatures, and Oklahoma governing law.",
  "",
  "Please draft a comprehensive agreement suitable for execution by all four companies.",
].join("\n");

export function test448BrightPeakFirstDraft(): ParsedDraftShape {
  return test446BrightPeakFirstDraft();
}

/** Stale starter/free corpus observed masquerading as server_full_document_text (~1319 chars). */
export function buildTest448StarterFreeCorpus1319(
  draft = test448BrightPeakFirstDraft(),
): string {
  let text = buildStarterAgreementPreviewForReview(draft, {
    intakeText: TEST448_LIVE_INTAKE,
  }).trim();
  if (text.length > TEST448_STARTER_LEN) {
    text = text.slice(0, TEST448_STARTER_LEN);
  }
  while (text.length < TEST448_STARTER_LEN) {
    text += " ";
  }
  return text.slice(0, TEST448_STARTER_LEN);
}

/** Alternate stale starter corpus length observed in live cache (~2228 chars). */
export function buildTest448StarterFreeCorpus2228(
  draft = test448BrightPeakFirstDraft(),
): string {
  let text = buildStarterAgreementPreviewForReview(draft, {
    intakeText: TEST448_LIVE_INTAKE,
  }).trim();
  if (text.length > TEST448_STARTER_ALT_LEN) {
    text = text.slice(0, TEST448_STARTER_ALT_LEN);
  }
  while (text.length < TEST448_STARTER_ALT_LEN) {
    text += "\nSupplemental starter preview line for cache poisoning regression.";
  }
  return text.slice(0, TEST448_STARTER_ALT_LEN);
}

/** First degraded json_parse wire body (~8552 chars). */
export function buildTest448DegradedJsonParseDocumentText(): string {
  const header = [
    TEST448_TRANSACTION_TITLE,
    "",
    `This Manufacturing, Distribution, Licensing and Marketing Services Agreement ("Agreement") is entered into by and among ${TEST440_EVERGREEN} ("Brand Owner"), ${TEST440_ATLAS} ("Manufacturer"), ${TEST440_HORIZON} ("Master Distributor"), and ${TEST440_BRIGHT_PEAK} ("Marketing & E-commerce Manager").`,
    "",
    "1. PURPOSE AND TRANSACTION SCOPE. The Parties coordinate brand licensing, manufacturing, distribution, and marketing for licensed outdoor products.",
    "2. LICENSE GRANT. Brand Owner grants licenses necessary for manufacturing, distribution, and marketing.",
    "3. MANUFACTURING. Manufacturer produces licensed goods under Brand Owner specifications.",
    "4. DISTRIBUTION. Master Distributor manages wholesale distribution within the Territory.",
    "5. MARKETING. Marketing & E-commerce Manager manages marketing and online sales programs.",
    "6. PAYMENT. Economics follow the margin structures stated in the intake.",
    "7. TERM. Three (3) years unless terminated as provided herein.",
    "8. CONFIDENTIALITY. Mutual confidentiality obligations apply.",
    "9. INDEMNIFICATION. Cross-indemnities among the Parties.",
    "10. LIMITATION OF LIABILITY. Direct damages are limited as stated herein.",
    "",
    buildTest447CorruptedNoticeRegionWithFifthParty(),
  ].join("\n\n");

  let body = header;
  let i = 14;
  while (body.length < TEST448_TARGET_DEGRADED_LEN) {
    body +=
      `\n\n${i}. Supplemental Commercial Provision ${i}. Each Party shall maintain royalty reporting tier ${i} under Oklahoma commercial standards.`;
    i += 1;
  }
  return body.slice(0, TEST448_TARGET_DEGRADED_LEN);
}

/** Second attempt successful server_full_document_text (~28871 chars). */
export function buildTest448SuccessfulServerBody(
  intake = TEST448_LIVE_INTAKE,
  draft = test448BrightPeakFirstDraft(),
): string {
  let body = buildTest446SubstantiveBrandLicensingServerBody(intake, draft);
  if (body.length > TEST448_TARGET_SERVER_LEN) {
    body = body.slice(0, TEST448_TARGET_SERVER_LEN);
  }
  while (body.length < TEST448_TARGET_SERVER_LEN) {
    body += "\n";
  }
  return body.slice(0, TEST448_TARGET_SERVER_LEN);
}

/**
 * Wire body with wrong title at head — freeze candidate repairs to brand-licensing stack title.
 * Previously caused intent:brand_licensing_title_requires_manufacturing_distribution_stack when
 * intent validated raw wire instead of freeze candidate.
 */
export function buildTest448WireHeadTitleMismatchBody(): string {
  const substantive = buildTest448SuccessfulServerBody();
  const firstNewline = substantive.indexOf("\n");
  const tail = firstNewline >= 0 ? substantive.slice(firstNewline + 1) : substantive;
  let body = `BRAND LICENSING AGREEMENT\n${tail}`;
  while (body.length < TEST448_TARGET_SERVER_LEN) {
    body += "\n";
  }
  return body.slice(0, TEST448_TARGET_SERVER_LEN);
}

/** Server body with live-style notice corruption (partyCount 5 risk) for recovery authority tests. */
export function buildTest448ServerBodyWithCorruptedNotices(): string {
  const clean = buildTest448SuccessfulServerBody();
  const noticesIdx = clean.search(/\n\s*11\.\s+NOTICES/i);
  const witnessIdx = clean.search(/\nIN WITNESS WHEREOF/i);
  const headEnd = noticesIdx >= 0 ? noticesIdx : witnessIdx >= 0 ? witnessIdx : clean.length;
  const head = clean.slice(0, headEnd);
  const corruptedNotices = buildTest440CorruptedNoticeTail();
  const tail = witnessIdx >= 0 ? clean.slice(witnessIdx) : "";
  let body = `${head}\n\n${corruptedNotices}\n\n${tail}`.trim();
  while (body.length < TEST448_TARGET_SERVER_LEN) {
    body += "\n";
  }
  return body.slice(0, TEST448_TARGET_SERVER_LEN);
}
