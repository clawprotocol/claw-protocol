/**
 * TEST439 — live Brand Licensing / Manufacturing / Distribution degraded json_parse recovery.
 */

import type { ParsedDraftShape } from "./intakeSmartDefaults";

export const TEST439_EVERGREEN = "Evergreen Outdoor Brands LLC";
export const TEST439_ATLAS = "Atlas Consumer Products Inc.";
export const TEST439_HORIZON = "Horizon Wholesale Group LLC";
export const TEST439_BRIGHT_PEAK = "BrightPeak Retail Solutions LLC";

export const TEST439_TRANSACTION_TITLE =
  "MANUFACTURING, DISTRIBUTION, LICENSING AND MARKETING SERVICES AGREEMENT";

export const TEST439_MIN_RECOVERY_LEN = 7_000;
export const TEST439_TARGET_DEGRADED_LEN = 9_450;

export const TEST439_BRAND_LICENSING_INTAKE = [
  "Create a four-party manufacturing, licensing, distribution, and marketing services agreement.",
  "",
  "Party 1 (Brand Owner):",
  TEST439_EVERGREEN,
  "",
  "Party 2 (Manufacturer):",
  TEST439_ATLAS,
  "",
  "Party 3 (Master Distributor):",
  TEST439_HORIZON,
  "",
  "Party 4 (Marketing & E-commerce Manager):",
  TEST439_BRIGHT_PEAK,
  "",
  "Background:",
  "Brand Owner controls the outdoor retail brand program.",
  "Manufacturer produces licensed goods under Brand Owner specifications.",
  "Master Distributor handles wholesale distribution and retail placement.",
  "Marketing & E-commerce Manager handles marketing, marketplace listings, and online sales.",
  "",
  "Key terms:",
  "Annual minimum purchase commitment of $3,600,000.",
  "Manufacturer receives production costs plus an 18% manufacturing margin.",
  "Brand Owner receives an 8% royalty on gross product sales.",
  "Master Distributor receives a 14% wholesale distribution margin.",
  "Marketing & E-commerce Manager receives 6% of net online sales.",
  "Territory: United States and Canada.",
  "Quality control, trademark usage, audit rights, and indemnification among all parties.",
  "Oklahoma law governs. Electronic signatures permitted.",
  "",
  "Generate a complete execution block with one signature section for each party.",
  "Produce a polished, production-quality commercial agreement suitable for executive review.",
].join("\n");

export function test439BrandLicensingDraft(): ParsedDraftShape {
  return {
    title: "Brand Licensing and Distribution Agreement",
    jurisdiction: "Oklahoma",
    agreement_family: "services_agreement",
    parties: [
      { name: TEST439_EVERGREEN, role: "Brand Owner" } as never,
      { name: TEST439_ATLAS, role: "Manufacturer" } as never,
      { name: TEST439_HORIZON, role: "Master Distributor" } as never,
      { name: TEST439_BRIGHT_PEAK, role: "Marketing & E-commerce Manager" } as never,
    ],
    purpose:
      "Coordinated manufacturing, licensing, wholesale distribution, marketing, and e-commerce for licensed products.",
    payment_terms:
      "Annual minimum purchase commitment of $3,600,000; manufacturer margin 18%; brand royalty 8%; distributor margin 14%; marketing manager 6% of net online sales.",
    duration: "3 years",
    due_date: null,
    effective_date: null,
    payment: { amount: 1, cadence: "monthly", valid: true },
  };
}

export const TEST439_ALL_PARTIES = [
  TEST439_EVERGREEN,
  TEST439_ATLAS,
  TEST439_HORIZON,
  TEST439_BRIGHT_PEAK,
] as const;

/** Substantive degraded wire document_text — no server_full_document_text on wire. */
export function buildTest439DegradedJsonParseDocumentText(): string {
  const header = [
    TEST439_TRANSACTION_TITLE,
    "",
    `This Manufacturing, Distribution, Licensing and Marketing Services Agreement ("Agreement") is entered into by and among ${TEST439_EVERGREEN} ("Brand Owner"), ${TEST439_ATLAS} ("Manufacturer"), ${TEST439_HORIZON} ("Master Distributor"), and ${TEST439_BRIGHT_PEAK} ("Marketing & E-commerce Manager").`,
    "",
    "1. LICENSE GRANT. Brand Owner grants the licenses necessary for manufacturing, distribution, and marketing of licensed products.",
    "2. MANUFACTURING. Manufacturer produces licensed goods under Brand Owner specifications with audit and quality control rights.",
    "3. DISTRIBUTION. Master Distributor manages wholesale distribution, retailer placement, and logistics within the Territory.",
    "4. MARKETING. Marketing & E-commerce Manager manages marketing campaigns, marketplace listings, and online sales programs.",
    "5. PAYMENT. Annual minimum purchase commitment of $3,600,000; manufacturer margin 18%; brand royalty 8%; distributor margin 14%; marketing manager 6% of net online sales.",
    "6. TERM. Three (3) years with renewal options.",
    "7. CONFIDENTIALITY. Mutual confidentiality obligations apply among all Parties.",
    "8. INDEMNIFICATION. Cross-indemnities among the Parties for product, marketing, and distribution claims.",
    "9. GOVERNING LAW. Oklahoma law governs this Agreement.",
    "",
    "IN WITNESS WHEREOF, the Parties execute this Agreement.",
    "",
    `BRAND OWNER: ${TEST439_EVERGREEN}`,
    "By: ______________________________",
    "",
    `MANUFACTURER: ${TEST439_ATLAS}`,
    "By: ______________________________",
    "",
    `MASTER DISTRIBUTOR: ${TEST439_HORIZON}`,
    "By: ______________________________",
    "",
    `MARKETING MANAGER: ${TEST439_BRIGHT_PEAK}`,
    "By: ______________________________",
    "",
  ].join("\n");

  let body = header;
  let i = 10;
  while (body.length < TEST439_TARGET_DEGRADED_LEN) {
    body +=
      `\n${i}. Supplemental Commercial Provision ${i}. Each Party shall maintain royalty reporting tier ${i}, ` +
      `channel compliance workstream ${i}, and trademark usage controls segment ${i} under Oklahoma commercial standards.`;
    i += 1;
  }
  return body.slice(0, TEST439_TARGET_DEGRADED_LEN);
}
