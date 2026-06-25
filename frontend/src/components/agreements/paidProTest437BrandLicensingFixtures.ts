/**
 * TEST437 — four-party Brand Licensing Pro intake + degraded json_parse wire body (~10.6k).
 */

import type { ParsedDraftShape } from "./intakeSmartDefaults";

export const BRIGHT_PEAK = "BrightPeak Retail Solutions LLC";
export const EVERGREEN = "Evergreen Outdoor Brands LLC";
export const ATLAS = "Atlas Consumer Products Inc.";
export const HORIZON = "Horizon Wholesale Group LLC";

export const TEST437_BRAND_LICENSING_INTAKE = [
  "Create a four-party brand licensing and distribution agreement.",
  "",
  "Party 1 (Licensor):",
  BRIGHT_PEAK,
  "",
  "Party 2 (Brand Owner):",
  EVERGREEN,
  "",
  "Party 3 (Manufacturer):",
  ATLAS,
  "",
  "Party 4 (Distributor):",
  HORIZON,
  "",
  "Background:",
  "Licensor grants Brand Owner exclusive retail brand rights.",
  "Manufacturer produces licensed goods under Brand Owner specifications.",
  "Distributor handles wholesale distribution and retail placement.",
  "",
  "Key terms:",
  "Revenue share: thirty (30) days after month-end on third-party licensing revenue.",
  "Term: three (3) years with renewal options.",
  "Territory: United States and Canada.",
  "Quality control, audit rights, trademark usage, and indemnification among all parties.",
  "Oklahoma law governs. Electronic signatures permitted.",
  "",
  "Generate a complete execution block with one signature section for each party.",
  "Produce a polished, production-quality commercial agreement suitable for executive review.",
].join("\n");

export const TEST437_TARGET_DEGRADED_LEN = 10_602;

export function test437BrandLicensingDraft(): ParsedDraftShape {
  return {
    title: "Brand Licensing and Distribution Agreement",
    jurisdiction: "Oklahoma",
    agreement_family: "services_agreement",
    parties: [
      { name: BRIGHT_PEAK, role: "Licensor" } as never,
      { name: EVERGREEN, role: "Brand Owner" } as never,
      { name: ATLAS, role: "Manufacturer" } as never,
      { name: HORIZON, role: "Distributor" } as never,
    ],
    purpose: "Brand licensing, manufacturing, and wholesale distribution.",
    payment_terms: "Revenue share thirty (30) days after month-end.",
    duration: "3 years",
    due_date: null,
    effective_date: null,
    payment: { amount: 1, cadence: "monthly", valid: true },
  };
}

/** Degraded server document_text only — no wire server_full; structurally imperfect licensing body. */
export function buildTest437DegradedJsonParseDocumentText(): string {
  const header = [
    "BRAND LICENSING AND DISTRIBUTION AGREEMENT",
    "",
    `This Brand Licensing and Distribution Agreement ("Agreement") is entered into by and among ${BRIGHT_PEAK} ("Licensor"), ${EVERGREEN} ("Brand Owner"), ${ATLAS} ("Manufacturer"), and ${HORIZON} ("Distributor").`,
    "",
    "1. GRANT OF LICENSE. Licensor grants Brand Owner exclusive retail brand rights subject to quality standards.",
    "2. MANUFACTURING. Manufacturer produces licensed goods under Brand Owner specifications.",
    "3. DISTRIBUTION. Distributor handles wholesale distribution and retail placement.",
    "4. REVENUE SHARE. Revenue share is payable thirty (30) days after month-end on third-party licensing revenue.",
    "5. TERM. Three (3) years with renewal options.",
    "6. CONFIDENTIALITY. Mutual confidentiality obligations apply.",
    "7. INDEMNIFICATION. Cross-indemnities among the parties.",
    "8. GOVERNING LAW. Oklahoma.",
    "9. COMMUNICATIONS. Notices may be delivered by email (degraded stub — not operative NOTICES family).",
    "",
    "IN WITNESS WHEREOF, the parties execute this Agreement.",
    "",
    "LICENSOR: " + BRIGHT_PEAK,
    "By: ______________________________",
    "",
    "BRAND OWNER: " + EVERGREEN,
    "By: ______________________________",
    "",
    "MANUFACTURER: " + ATLAS,
    "By: ______________________________",
    "",
    "DISTRIBUTOR: " + HORIZON,
    "By: ______________________________",
    "",
  ].join("\n");

  let body = header;
  let i = 10;
  while (body.length < TEST437_TARGET_DEGRADED_LEN) {
    body +=
      `\n${i}. Supplemental Licensing Provision ${i}. Each party shall maintain trademark compliance tier ${i}, ` +
      `coordinate audit workstream ${i}, and document royalty reporting segment ${i} under Oklahoma commercial standards.`;
    i += 1;
  }
  return body.slice(0, TEST437_TARGET_DEGRADED_LEN);
}

export function test437AllParties(): readonly string[] {
  return [BRIGHT_PEAK, EVERGREEN, ATLAS, HORIZON];
}
