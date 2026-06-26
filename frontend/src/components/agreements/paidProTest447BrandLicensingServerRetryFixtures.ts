/**
 * TEST447 — brand licensing Pro retry after degraded json_parse (live Railway scenario).
 */

import type { ParsedDraftShape } from "./intakeSmartDefaults";
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

export const TEST447_TRANSACTION_TITLE = BRAND_LICENSING_AGREEMENT_TITLE_UPPER;
export const TEST447_TARGET_DEGRADED_LEN = 8_120;
export const TEST447_MIN_SERVER_LEN = 30_177;
export const TEST447_ALL_PARTIES = [TEST440_EVERGREEN, TEST440_ATLAS, TEST440_HORIZON, TEST440_BRIGHT_PEAK];

/** Exact live QA prompt (TEST447). */
export const TEST447_LIVE_INTAKE = [
  "We're launching a new outdoor products brand and need an agreement between four companies that will work together to manufacture, distribute, and sell the products.",
  "",
  "Parties:",
  "",
  "* Evergreen Outdoor Brands LLC (Brand Owner)",
  "* Atlas Consumer Products Inc. (Manufacturer)",
  "* Horizon Wholesale Group LLC (Master Distributor)",
  "* BrightPeak Retail Solutions LLC (Marketing & E-commerce Manager)",
  "",
  "Atlas manufactures using Evergreen specs/materials. Horizon is exclusive wholesale distributor in North America. BrightPeak manages Amazon, Shopify, Walmart Marketplace, ads, analytics, and ecommerce.",
  "",
  "Economics: Brand Owner 8% royalty on gross sales; Manufacturer production costs + 18% margin; Master Distributor keeps 14% wholesale margin; BrightPeak gets 6% net online sales + approved marketing expenses.",
  "",
  "Include quality standards, IP ownership, trademark use, confidentiality, payment terms, inventory reporting, audit rights, returns, warranties, limitation of liability, indemnification, insurance, termination, notices, e-signatures, Oklahoma law. Draft for execution by all four companies.",
].join("\n");

export function test447BrightPeakFirstDraft(): ParsedDraftShape {
  return test446BrightPeakFirstDraft();
}

/** Phantom fifth party stanza observed in live notice repair (partyCount/stanzaCount 5). */
export function buildTest447PhantomFifthPartyNoticeStanza(): string {
  return [
    "If to Summit Outdoor Partners LLC:",
    "Summit Outdoor Partners LLC",
    "Attention: Authorized Signer",
    "Email: primary business email on file with the Party",
    "Address: primary business address on file with the Party",
  ].join("\n");
}

/** Notices region with live-style corruption plus phantom fifth party. */
export function buildTest447CorruptedNoticeRegionWithFifthParty(): string {
  const corrupted = buildTest440CorruptedNoticeTail();
  const phantom = buildTest447PhantomFifthPartyNoticeStanza();
  const witnessIdx = corrupted.search(/\nIN WITNESS WHEREOF/i);
  if (witnessIdx < 0) {
    return `${corrupted}\n\n${phantom}`;
  }
  return `${corrupted.slice(0, witnessIdx).trimEnd()}\n\n${phantom}\n\n${corrupted.slice(witnessIdx).trimStart()}`;
}

/** First degraded json_parse wire body (~8120 chars). */
export function buildTest447DegradedJsonParseDocumentText(): string {
  const header = [
    TEST447_TRANSACTION_TITLE,
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
  while (body.length < TEST447_TARGET_DEGRADED_LEN) {
    body +=
      `\n\n${i}. Supplemental Commercial Provision ${i}. Each Party shall maintain royalty reporting tier ${i} under Oklahoma commercial standards.`;
    i += 1;
  }
  return body.slice(0, TEST447_TARGET_DEGRADED_LEN);
}

/**
 * Second retry success body (~30k) with section-structure noise and notice corruption
 * that previously caused brand_licensing_section_structure_anomaly and partyCount 5.
 */
export function buildTest447ServerRetryDefectiveBody(
  intake = TEST447_LIVE_INTAKE,
  draft = test447BrightPeakFirstDraft(),
): string {
  const clean = buildTest446SubstantiveBrandLicensingServerBody(intake, draft);
  const noticesIdx = clean.search(/\n\s*11\.\s+NOTICES/i);
  const witnessIdx = clean.search(/\nIN WITNESS WHEREOF/i);
  const headEnd = noticesIdx >= 0 ? noticesIdx : witnessIdx >= 0 ? witnessIdx : clean.length;
  let head = clean.slice(0, headEnd);
  head +=
    "\n\n5. STRUCTURE ANOMALY ONE. Duplicate numbering defect observed in live server draft.\n" +
    "5. STRUCTURE ANOMALY TWO. Duplicate numbering defect observed in live server draft.\n" +
    "5. STRUCTURE ANOMALY THREE. Duplicate numbering defect observed in live server draft.\n" +
    "5. STRUCTURE ANOMALY FOUR. Duplicate numbering defect observed in live server draft.";
  const tail =
    witnessIdx >= 0
      ? `${buildTest447CorruptedNoticeRegionWithFifthParty()}\n\n${clean.slice(witnessIdx)}`
      : buildTest447CorruptedNoticeRegionWithFifthParty();
  let body = `${head}\n\n${tail}`;
  while (body.length < TEST447_MIN_SERVER_LEN) {
    body +=
      "\n\nSupplemental commercial provision. Each Party shall maintain inventory reporting under Oklahoma commercial standards.";
  }
  if (body.length < TEST447_MIN_SERVER_LEN) {
    throw new Error(`test447_defective_body_too_short:${body.length}`);
  }
  return body;
}
