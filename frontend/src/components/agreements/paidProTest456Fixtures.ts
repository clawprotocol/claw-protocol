/**
 * TEST456 — outdoor products brand licensing: keep substantive server_full when notice
 * signer-setup scaffolding would previously trigger structural recovery.
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
import { buildTest447PhantomFifthPartyNoticeStanza } from "./paidProTest447BrandLicensingServerRetryFixtures";

export const TEST456_TRANSACTION_TITLE = BRAND_LICENSING_AGREEMENT_TITLE_UPPER;
export const TEST456_MIN_SERVER_LEN = 27_000;
export const TEST456_TARGET_SERVER_LEN = 30_056;
export const TEST456_ALL_PARTIES = [TEST440_EVERGREEN, TEST440_ATLAS, TEST440_HORIZON, TEST440_BRIGHT_PEAK];

/** Exact outdoor-products live QA prompt (TEST456). */
export const TEST456_LIVE_INTAKE = [
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

export function test456BrightPeakFirstDraft(): ParsedDraftShape {
  return test446BrightPeakFirstDraft();
}

function buildTest456LiveNoticeRegionWithSignerSetupScaffolding(): string {
  const phantom = buildTest447PhantomFifthPartyNoticeStanza();
  return [
    "11. NOTICES",
    "Notices under this Agreement must be in writing and delivered to the applicable notice address below. Notice contact details may be completed during signer setup before execution.",
    "",
    "If to Evergreen Outdoor Brands LLC:",
    "Evergreen Outdoor Brands LLC",
    "Attention: Authorized Signer",
    "Email: to be completed",
    "Address: provided during signer setup",
    "",
    "If to Atlas Consumer Products Inc.:",
    "Atlas Consumer Products Inc.",
    "Attention: Authorized Signer",
    "Email: provided during signer setup",
    "Address: provided during signer setup",
    "",
    "If to Horizon Wholesale Group LLC:",
    "Horizon Wholesale Group LLC",
    "Attention: Authorized Signer",
    "Email: to be completed",
    "Address: provided during signer setup",
    "",
    "If to BrightPeak Retail Solutions LLC:",
    "BrightPeak Retail Solutions LLC",
    "Attention: Authorized Signer",
    "Email: provided during signer setup",
    "Address: to be completed",
    "",
    phantom,
    "",
    "12. GOVERNING LAW",
    "This Agreement is governed by the laws of the State of Oklahoma.",
    "",
    "13. MISCELLANEOUS AND ELECTRONIC SIGNATURES",
    "This Agreement may be executed in counterparts using electronic signatures permitted by applicable law.",
    "",
    "IN WITNESS WHEREOF, the Parties execute this Agreement.",
    "",
    "CLIENT:",
    TEST440_EVERGREEN,
    "By: ______________________________",
    "Name: ______________________________",
    "Title: ______________________________",
    "Date: ______________________________",
    "",
    "SERVICE PROVIDER:",
    TEST440_ATLAS,
    "By: ______________________________",
    "Name: ______________________________",
    "Title: ______________________________",
    "Date: ______________________________",
    "",
    "PARTY 3:",
    "Horizon Wholesale Group",
    "By: ______________________________",
    "Name: ______________________________",
    "Title: ______________________________",
    "Date: ______________________________",
    "",
    "PARTY 4:",
    "BrightPeak Retail Solutions",
    "By: ______________________________",
    "Name: ______________________________",
    "Title: ______________________________",
    "Date: ______________________________",
    "",
    "14. Supplemental Provision 1",
    "Each Party shall document royalty reporting tier 1, trademark compliance segment 1, and channel audit checkpoint 1 under the payment schedules in this Agreement.",
  ].join("\n");
}

/**
 * Live Railway-style ~30k server_full body with notice signer-setup scaffolding,
 * generic execution labels, post-witness supplemental provision, truncated names,
 * and phantom fifth notice party.
 */
export function buildTest456LiveRailwayDefectiveBody(
  intake = TEST456_LIVE_INTAKE,
  draft = test456BrightPeakFirstDraft(),
): string {
  const clean = buildTest446SubstantiveBrandLicensingServerBody(intake, draft);
  const noticesIdx = clean.search(/\n\s*11\.\s+NOTICES/i);
  const headEnd = noticesIdx >= 0 ? noticesIdx : clean.length;
  let head = clean.slice(0, headEnd);
  head = head
    .replaceAll(TEST440_HORIZON, "Horizon Wholesale Group")
    .replaceAll(TEST440_BRIGHT_PEAK, "BrightPeak Retail Solutions")
    .replace(/Atlas Consumer Products Inc\./g, "Atlas Consumer Products ..")
    .replace(/approved marketing expenses\./g, "approved marketing expenses..");
  let body = `${head.trimEnd()}\n\n${buildTest456LiveNoticeRegionWithSignerSetupScaffolding()}`;
  let padIdx = 0;
  while (body.length < TEST456_TARGET_SERVER_LEN) {
    padIdx += 1;
    body +=
      `\n\nOperational supplement ${padIdx}. Each Party shall maintain inventory reporting tier ${padIdx} under Oklahoma commercial standards.`;
  }
  if (body.length < TEST456_MIN_SERVER_LEN) {
    throw new Error(`test456_defective_body_too_short:${body.length}`);
  }
  return body.length > TEST456_TARGET_SERVER_LEN ? body.slice(0, TEST456_TARGET_SERVER_LEN) : body;
}

/** Corrupted notice tail variant used to assert placeholder gate demotion on signer-setup wording. */
export function buildTest456NoticeScaffoldingOnlyTail(): string {
  return buildTest440CorruptedNoticeTail()
    .replace(/primary business email on file with the Party/gi, "to be completed")
    .replace(/primary business address on file with the Party/gi, "provided during signer setup");
}
