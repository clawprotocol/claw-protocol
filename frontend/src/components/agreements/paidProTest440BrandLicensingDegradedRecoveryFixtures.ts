/**
 * TEST440 — realistic prose outdoor products brand licensing degraded recovery.
 */

import type { ParsedDraftShape } from "./intakeSmartDefaults";
import {
  TEST439_ALL_PARTIES,
  TEST439_ATLAS,
  TEST439_BRIGHT_PEAK,
  TEST439_EVERGREEN,
  TEST439_HORIZON,
  TEST439_MIN_RECOVERY_LEN,
  TEST439_TARGET_DEGRADED_LEN,
  TEST439_TRANSACTION_TITLE,
} from "./paidProTest439BrandLicensingDegradedRecoveryFixtures";

export const TEST440_EVERGREEN = TEST439_EVERGREEN;
export const TEST440_ATLAS = TEST439_ATLAS;
export const TEST440_HORIZON = TEST439_HORIZON;
export const TEST440_BRIGHT_PEAK = TEST439_BRIGHT_PEAK;
export const TEST440_TRANSACTION_TITLE = TEST439_TRANSACTION_TITLE;
export const TEST440_MIN_RECOVERY_LEN = TEST439_MIN_RECOVERY_LEN;

/** Realistic prose intake (no Party N blocks) — roles declared inline per company. */
export const TEST440_REALISTIC_PROSE_INTAKE = [
  "Draft a comprehensive four-party outdoor products brand licensing, manufacturing, distribution, and e-commerce agreement suitable for execution by all four companies.",
  "",
  "Evergreen Outdoor Brands LLC is the Brand Owner and controls the outdoor retail brand program.",
  "Atlas Consumer Products Inc. is the Manufacturer and will produce licensed goods under Brand Owner specifications.",
  "Horizon Wholesale Group LLC is the Master Distributor and will manage wholesale distribution and retail placement.",
  "BrightPeak Retail Solutions LLC is the Marketing & E-commerce Manager and will handle marketing, marketplace listings, analytics, and e-commerce operations.",
  "",
  "The Brand Owner receives an 8% royalty on gross product sales.",
  "The Manufacturer is paid production costs plus an 18% manufacturing margin.",
  "The Master Distributor retains a 14% wholesale distribution margin.",
  "BrightPeak receives 6% of net online sales plus reimbursement of approved marketing expenses.",
  "",
  "Annual minimum purchase commitment of $3,600,000.",
  "Territory includes the United States and Canada.",
  "Include quality standards, intellectual property ownership, trademark usage, confidentiality, payment terms, inventory reporting, audit rights, returns, warranties, limitation of liability, indemnification, insurance requirements, termination, notice provisions, electronic signatures, and Oklahoma governing law.",
].join("\n");

export const TEST440_ALL_PARTIES = TEST439_ALL_PARTIES;

export function test440BrandLicensingDraft(): ParsedDraftShape {
  return {
    title: "Brand Licensing and Distribution Agreement",
    jurisdiction: "Oklahoma",
    agreement_family: "services_agreement",
    parties: [
      { name: TEST440_EVERGREEN, role: "Brand Owner" } as never,
      { name: TEST440_ATLAS, role: "Manufacturer" } as never,
      { name: TEST440_HORIZON, role: "Master Distributor" } as never,
      { name: TEST440_BRIGHT_PEAK, role: "Marketing & E-commerce Manager" } as never,
    ],
    purpose:
      "Coordinated outdoor products brand licensing, manufacturing, wholesale distribution, marketing, and e-commerce.",
    payment_terms:
      "Annual minimum purchase commitment of $3,600,000; manufacturer margin 18%; brand royalty 8%; distributor margin 14%; marketing manager 6% of net online sales.",
    duration: "3 years",
    due_date: null,
    effective_date: null,
    payment: { amount: 1, cadence: "monthly", valid: true },
  };
}

/** Corrupted notice/governing-law tail observed in live TEST440 degraded recovery. */
export function buildTest440CorruptedNoticeTail(): string {
  return [
    "11. NOTICES",
    "Notices under this Agreement must be in writing and delivered to the applicable notice address below.",
    "",
    "If to BrightPeak Retail Solutions LLC:",
    "BrightPeak Retail Solutions LLC",
    "Attention: Authorized Signer",
    "Email: primary business email on file with the Party",
    "Address: primary business address on file with the Party",
    "",
    "If to Evergreen Outdoor Brands LLC:",
    "Evergreen Outdoor Brands LLC",
    "Attention: Authorized Signer",
    "Email: primary business email on file with the Party",
    "Address: primary business address on file with the Party",
    "",
    "If to Atlas Consumer Products Inc.:",
    "Atlas Consumer Products Inc.",
    "Attention: Authorized Signer",
    "Email: primary business email on file with the Party",
    "Address: primary business address on file with the Party",
    "",
    "If to Horizon Wholesale Group LLC:zon Wholesale Group :zon Wholesale Group :",
    "Address: primary business address on file with the the \"Parties\"). GOVERNING LAW",
    "This Agreement is governed by the laws of the State of Oklahoma, without regard to conflict-of-law principles.",
    "",
    "13. MISCELLANEOUS AND ELECTRONIC SIGNATURES",
    "This Agreement may be executed in counterparts using electronic signatures permitted by applicable law.",
    "",
    "IN WITNESS WHEREOF, the Parties execute this Agreement.",
  ].join("\n");
}

export function buildTest440DegradedJsonParseDocumentText(): string {
  const header = [
    TEST440_TRANSACTION_TITLE,
    "",
    `This Manufacturing, Distribution, Licensing and Marketing Services Agreement ("Agreement") is entered into by and among ${TEST440_EVERGREEN} ("Brand Owner"), ${TEST440_ATLAS} ("Manufacturer"), ${TEST440_HORIZON} ("Master Distributor"), and ${TEST440_BRIGHT_PEAK} ("Marketing & E-commerce Manager").`,
    "",
    "1. PURPOSE AND TRANSACTION SCOPE. The Parties coordinate brand licensing, manufacturing, distribution, and marketing for licensed outdoor products.",
    "2. LICENSE GRANT. Brand Owner grants licenses necessary for manufacturing, distribution, and marketing.",
    "3. MANUFACTURING. Manufacturer produces licensed goods under Brand Owner specifications.",
    "4. DISTRIBUTION. Master Distributor manages wholesale distribution within the Territory.",
    "5. MARKETING. Marketing & E-commerce Manager manages marketing and online sales programs.",
    "6. PAYMENT. Annual minimum purchase commitment of $3,600,000 with the margin structures stated in the intake.",
    "7. TERM. Three (3) years unless terminated as provided herein.",
    "8. CONFIDENTIALITY. Mutual confidentiality obligations apply.",
    "9. INDEMNIFICATION. Cross-indemnities among the Parties.",
    "10. LIMITATION OF LIABILITY. Direct damages are limited as stated herein.",
    "",
    buildTest440CorruptedNoticeTail(),
  ].join("\n\n");

  let body = header;
  let i = 14;
  while (body.length < TEST439_TARGET_DEGRADED_LEN) {
    body +=
      `\n\n${i}. Supplemental Commercial Provision ${i}. Each Party shall maintain royalty reporting tier ${i} under Oklahoma commercial standards.`;
    i += 1;
  }
  return body.slice(0, TEST439_TARGET_DEGRADED_LEN);
}
