/**
 * TEST457 — outdoor products brand licensing: server_full SoT success with final polish defects.
 */

import type { ParsedDraftShape } from "./intakeSmartDefaults";
import { BRAND_LICENSING_AGREEMENT_TITLE_UPPER } from "./paidProAgreementTitleScope";
import {
  TEST440_ATLAS,
  TEST440_BRIGHT_PEAK,
  TEST440_EVERGREEN,
  TEST440_HORIZON,
} from "./paidProTest440BrandLicensingDegradedRecoveryFixtures";
import {
  buildTest446SubstantiveBrandLicensingServerBody,
  test446BrightPeakFirstDraft,
} from "./paidProTest446BrandLicensingIntentRegressionFixtures";

export const TEST457_TRANSACTION_TITLE = BRAND_LICENSING_AGREEMENT_TITLE_UPPER;
export const TEST457_MIN_SERVER_LEN = 20_000;
export const TEST457_TARGET_SERVER_LEN = 28_692;
export const TEST457_ALL_PARTIES = [TEST440_EVERGREEN, TEST440_ATLAS, TEST440_HORIZON, TEST440_BRIGHT_PEAK];

/** Exact outdoor-products live QA prompt (TEST457). */
export const TEST457_LIVE_INTAKE = [
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

export function test457BrightPeakFirstDraft(): ParsedDraftShape {
  return test446BrightPeakFirstDraft();
}

/** Thin notice stanzas observed after successful server_full freeze (live TEST457). */
export function buildTest457ThinNoticeRegion(): string {
  const thin = (entity: string) =>
    `If to ${entity}: ${entity} provided during signer setup.`;
  return [
    "12. Disputes, Governing Law and Notices",
    "This Agreement is governed by the laws of the State of Oklahoma.",
    "",
    thin(TEST440_EVERGREEN),
    "",
    thin(TEST440_ATLAS),
    "",
    thin(TEST440_HORIZON),
    "",
    thin(TEST440_BRIGHT_PEAK),
    "",
    "13. MISCELLANEOUS AND ELECTRONIC SIGNATURES",
    "This Agreement may be executed in counterparts using electronic signatures permitted by applicable law.",
    "",
    "IN WITNESS WHEREOF, the Parties execute this Agreement.",
    "",
    `${TEST440_EVERGREEN}:`,
    "By: ______________________________",
    "Name: ______________________________",
    "Title: ______________________________",
    "Date: ______________________________",
    "",
    `${TEST440_ATLAS}:`,
    "By: ______________________________",
    "Name: ______________________________",
    "Title: ______________________________",
    "Date: ______________________________",
    "",
    `${TEST440_HORIZON}:`,
    "By: ______________________________",
    "Name: ______________________________",
    "Title: ______________________________",
    "Date: ______________________________",
    "",
    `${TEST440_BRIGHT_PEAK}:`,
    "By: ______________________________",
    "Name: ______________________________",
    "Title: ______________________________",
    "Date: ______________________________",
  ].join("\n");
}

/**
 * ~28.6k substantive server_full body with polish-only defects:
 * joined section heading, thin notice stanzas, role-faithful execution labels.
 */
export function buildTest457LiveSuccessPolishDefectsBody(
  intake = TEST457_LIVE_INTAKE,
  draft = test457BrightPeakFirstDraft(),
): string {
  const clean = buildTest446SubstantiveBrandLicensingServerBody(intake, draft);
  const noticesIdx = clean.search(/\n\s*1[12]\.\s+(?:NOTICES|Disputes)/i);
  const witnessIdx = clean.search(/\nIN WITNESS WHEREOF/i);
  const headEnd = noticesIdx >= 0 ? noticesIdx : witnessIdx >= 0 ? witnessIdx : clean.length;
  let head = clean.slice(0, headEnd);
  head = head.replace(
    /(shall survive expiration or termination)\.\s*(?=12\.\s+Disputes)/i,
    "$1.12. Disputes",
  );
  if (!/termination\.12\.\s+Disputes/i.test(head)) {
    head = head.replace(
      /(survive expiration or termination)\.\s*\n+\s*12\.\s+Disputes/i,
      "$1.12. Disputes",
    );
  }
  if (!/termination\.12\.\s+Disputes/i.test(head)) {
    head += "\n\n11.6 Survival. Certain provisions shall survive expiration or termination.12. Disputes, Governing Law and Notices";
  }
  let body = `${head.trimEnd()}\n\n${buildTest457ThinNoticeRegion()}`;
  let padIdx = 0;
  while (body.length < TEST457_TARGET_SERVER_LEN) {
    padIdx += 1;
    body +=
      `\n\nOperational supplement ${padIdx}. Each Party shall maintain inventory reporting tier ${padIdx} under Oklahoma commercial standards.`;
  }
  if (body.length < TEST457_MIN_SERVER_LEN) {
    throw new Error(`test457_body_too_short:${body.length}`);
  }
  return body.length > TEST457_TARGET_SERVER_LEN + 500
    ? body.slice(0, TEST457_TARGET_SERVER_LEN)
    : body;
}
