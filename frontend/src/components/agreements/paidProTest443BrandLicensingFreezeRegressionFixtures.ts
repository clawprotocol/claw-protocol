/**
 * TEST443 — live brand licensing server-full freeze rejection (section_heading_title_anomaly).
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

export const TEST443_TRANSACTION_TITLE = BRAND_LICENSING_AGREEMENT_TITLE_UPPER;
export const TEST443_MIN_SERVER_LEN = 25_000;
export const TEST443_ALL_PARTIES = [TEST440_EVERGREEN, TEST440_ATLAS, TEST440_HORIZON, TEST440_BRIGHT_PEAK];

/** Exact live Railway QA prompt (bullet-party variant). */
export const TEST443_LIVE_INTAKE = [
  "We're launching a new outdoor products brand and need an agreement between four companies that will work together to manufacture, distribute, and sell the products.",
  "",
  "Parties:",
  "- Evergreen Outdoor Brands LLC (Brand Owner)",
  "- Atlas Consumer Products Inc. (Manufacturer)",
  "- Horizon Wholesale Group LLC (Master Distributor)",
  "- BrightPeak Retail Solutions LLC (Marketing & E-commerce Manager)",
  "",
  "Atlas manufactures using Evergreen specifications/materials.",
  "Horizon is exclusive wholesale distributor in North America.",
  "BrightPeak manages Amazon, Shopify, Walmart Marketplace, digital advertising, customer analytics, and ecommerce operations.",
  "",
  "Economics:",
  "- Brand Owner receives 8% royalty on gross product sales.",
  "- Manufacturer receives production costs plus 18% margin.",
  "- Master Distributor retains 14% wholesale distribution margin.",
  "- BrightPeak receives 6% of net online sales plus approved marketing expenses.",
  "",
  "Include quality standards, IP ownership, trademark usage, confidentiality, payment terms, inventory reporting, audit rights, returns, warranties, limitation of liability, indemnification, insurance, termination, notices, electronic signatures, and Oklahoma governing law.",
].join("\n");

export function test443BrightPeakFirstDraft(): ParsedDraftShape {
  return test441BrightPeakFirstDraft();
}

/** Professional brand-licensing body padded to live server_full length (~27k). */
export function buildTest443SubstantiveBrandLicensingServerBody(
  intake = TEST443_LIVE_INTAKE,
  draft = test443BrightPeakFirstDraft(),
): string {
  const fallback = buildDeterministicQuadPartyBrandLicensingProFallback({
    draft,
    rawIntake: intake,
  });
  if (!fallback.ok) {
    throw new Error(`test443_fallback_failed:${fallback.reasons.join(",")}`);
  }
  let body = padOperativeCorpusBeforeWitness(fallback.body, TEST443_MIN_SERVER_LEN);
  while (body.length < TEST443_MIN_SERVER_LEN) {
    body +=
      "\n\nSupplemental commercial provision. Each Party shall maintain inventory reporting under Oklahoma commercial standards.";
  }
  return body;
}

/**
 * Live-style server draft head: multiline all-caps title triggers section_heading_title_anomaly
 * before authoritative title exemption (TEST443 regression fixture).
 */
export function buildTest443ServerFullWithHeadingTitleAnomaly(
  intake = TEST443_LIVE_INTAKE,
  draft = test443BrightPeakFirstDraft(),
): string {
  const substantive = buildTest443SubstantiveBrandLicensingServerBody(intake, draft);
  const sec1Idx = substantive.search(/\n\s*1\.\s+/);
  const operative = sec1Idx >= 0 ? substantive.slice(sec1Idx) : substantive;
  const defectiveHead = [
    "MANUFACTURING, DISTRIBUTION,",
    "LICENSING AND MARKETING SERVICES AGREEMENT",
    "",
    `This Manufacturing, Distribution, Licensing and Marketing Services Agreement (this "Agreement") is entered into by and among ${TEST440_EVERGREEN} ("Brand Owner"), ${TEST440_ATLAS} ("Manufacturer"), ${TEST440_HORIZON} ("Master Distributor"), and ${TEST440_BRIGHT_PEAK} ("Marketing & E-commerce Manager") (each a "Party" and collectively the "Parties").`,
    "",
  ].join("\n");
  return `${defectiveHead}${operative}`;
}
