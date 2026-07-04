/** TEST507 — 4-party Evergreen / Summit / Delta / Blue Canyon production QA prompt. */

export const TEST507_EVERGREEN = "Evergreen Outdoor Brands LLC";
export const TEST507_SUMMIT = "Summit Ridge Advisory Group LLC";
export const TEST507_DELTA = "Delta Integration Services LLC";
export const TEST507_BLUE_CANYON = "Blue Canyon Analytics LLC";

export const TEST507_FOUR_PARTY_INTAKE = [
  "Draft an Implementation Agreement among the following four parties:",
  "",
  `1. ${TEST507_EVERGREEN} (Brand Owner)`,
  `2. ${TEST507_SUMMIT} (Program Manager)`,
  `3. ${TEST507_DELTA} (Systems Integrator)`,
  `4. ${TEST507_BLUE_CANYON} (Analytics Partner)`,
  "",
  "Summit will coordinate implementation milestones. Delta will deploy integrations. Blue Canyon will deliver analytics dashboards.",
  "",
  "Term: 18 months.",
  "",
  "Include confidentiality, intellectual property, limitation of liability, termination for cause or convenience, governing law (Delaware), notice provisions, counterparts, electronic signatures, and standard signature blocks for all four parties.",
  "",
  "Authorized signers:",
  "* Jennifer Collins, CEO, Evergreen Outdoor Brands LLC",
  "* Robert Hayes, Managing Partner, Summit Ridge Advisory Group LLC",
  "* Lisa Chen, President, Delta Integration Services LLC",
  "* Marcus Bennett, Chief Analytics Officer, Blue Canyon Analytics LLC",
  "",
  "Generate a complete, professional-quality agreement suitable for execution by sophisticated commercial parties. Include complete notice sections and signature blocks for all four parties.",
].join("\n");

export const TEST507_FOUR_PARTY_LEGAL = [
  TEST507_EVERGREEN,
  TEST507_SUMMIT,
  TEST507_DELTA,
  TEST507_BLUE_CANYON,
] as const;
