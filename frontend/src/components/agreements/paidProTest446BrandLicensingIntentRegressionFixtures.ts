/**
 * TEST446 — brand licensing quad-party intent false positive (design_creative).
 */

import type { ParsedDraftShape } from "./intakeSmartDefaults";
import { buildDeterministicQuadPartyBrandLicensingProFallback } from "./deterministicQuadPartyProFallback";
import { BRAND_LICENSING_AGREEMENT_TITLE_UPPER } from "./paidProAgreementTitleScope";
import { padOperativeCorpusBeforeWitness } from "./paidProTestAcceptedQuadPartyCorpus";
import {
  TEST440_ATLAS,
  TEST440_BRIGHT_PEAK,
  TEST440_EVERGREEN,
  TEST440_HORIZON,
} from "./paidProTest440BrandLicensingDegradedRecoveryFixtures";
import { test441BrightPeakFirstDraft } from "./paidProTest441BrandLicensingFrozenDisplayFixtures";

export const TEST446_TRANSACTION_TITLE = BRAND_LICENSING_AGREEMENT_TITLE_UPPER;
export const TEST446_MIN_SERVER_LEN = 30_000;
export const TEST446_ALL_PARTIES = [TEST440_EVERGREEN, TEST440_ATLAS, TEST440_HORIZON, TEST440_BRIGHT_PEAK];

/** Exact live QA prompt (TEST446). */
export const TEST446_LIVE_INTAKE = [
  "We're launching a new outdoor products brand and need an agreement between four companies that will work together to manufacture, distribute, and sell the products.",
  "",
  "Parties:",
  "",
  "* Evergreen Outdoor Brands LLC (Brand Owner)",
  "* Atlas Consumer Products Inc. (Manufacturer)",
  "* Horizon Wholesale Group LLC (Master Distributor)",
  "* BrightPeak Retail Solutions LLC (Marketing & E-commerce Manager)",
  "",
  "Atlas manufactures products using Evergreen specs and approved materials.",
  "Horizon is exclusive wholesale distributor throughout North America.",
  "BrightPeak manages Amazon, Shopify, Walmart Marketplace, digital advertising, customer analytics, and ecommerce operations.",
  "",
  "Economics:",
  "",
  "* Brand Owner receives 8% royalty on gross product sales.",
  "* Manufacturer receives production costs plus 18% manufacturing margin.",
  "* Master Distributor retains 14% wholesale distribution margin.",
  "* BrightPeak receives 6% of net online sales plus reimbursement of approved marketing expenses.",
  "",
  "Include quality standards, IP ownership, trademark usage, confidentiality, payment terms, inventory reporting, audit rights, returns, warranties, limitation of liability, indemnification, insurance, termination, notices, electronic signatures, and Oklahoma governing law.",
].join("\n");

export function test446BrightPeakFirstDraft(): ParsedDraftShape {
  return test441BrightPeakFirstDraft();
}

/** Live-style substantive server body (~32k). */
export function buildTest446SubstantiveBrandLicensingServerBody(
  intake = TEST446_LIVE_INTAKE,
  draft = test446BrightPeakFirstDraft(),
): string {
  const fallback = buildDeterministicQuadPartyBrandLicensingProFallback({
    draft,
    rawIntake: intake,
  });
  if (!fallback.ok) {
    throw new Error(`test446_fallback_failed:${fallback.reasons.join(",")}`);
  }
  let body = padOperativeCorpusBeforeWitness(fallback.body, TEST446_MIN_SERVER_LEN);
  let padIdx = 0;
  while (body.length < TEST446_MIN_SERVER_LEN) {
    padIdx += 1;
    body +=
      `\n\nSupplemental commercial provision ${padIdx}. Each Party shall maintain inventory reporting tier ${padIdx} under Oklahoma commercial standards.`;
  }
  return body;
}
