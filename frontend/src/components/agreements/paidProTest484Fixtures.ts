import type { ParsedDraftShape } from "./intakeSmartDefaults";
import {
  TEST482_AURORA,
  TEST482_BLUEWAVE,
  TEST482_FOUR_PARTY,
  TEST482_FOUR_PARTY_LEGAL_ENTITIES,
  TEST482_IRONFORGE,
  TEST482_SUMMIT,
  type Test482PartyFixture,
} from "./paidProTest482Fixtures";

export {
  TEST482_AURORA as TEST484_AURORA,
  TEST482_BLUEWAVE as TEST484_BLUEWAVE,
  TEST482_IRONFORGE as TEST484_IRONFORGE,
  TEST482_SUMMIT as TEST484_SUMMIT,
  TEST482_FOUR_PARTY as TEST484_FOUR_PARTY,
  TEST482_FOUR_PARTY_LEGAL_ENTITIES as TEST484_FOUR_PARTY_LEGAL_ENTITIES,
};

export const TEST484_ADDRESS_CONTAMINATION_MARKERS = [
  "Party 3",
  "Party 4",
  "Draft a detailed agreement",
  "Exclusive Distributor",
  "Regulatory & Quality Consultant",
  "Include provisions",
  "Commercial terms",
] as const;

const PARTY_ROLES = [
  "Licensor",
  "Manufacturer",
  "Exclusive Distributor",
  "Regulatory & Quality Consultant",
] as const;

function buildRoleHeaderPartyBlock(party: Test482PartyFixture, index: number): string {
  const [street, ...rest] = party.address.split(",").map((s) => s.trim());
  return [
    `Party ${index + 1} (${PARTY_ROLES[index] ?? `Party ${index + 1}`})`,
    party.legalEntity,
    "Represented by:",
    party.signerName,
    party.signerTitle,
    `Email: ${party.email}`,
    "Address:",
    street,
    ...rest,
  ].join("\n");
}

/** TEST484 — role-header party blocks with em-dash separators and trailing agreement prose. */
export const TEST484_FOUR_PARTY_INTAKE = [
  "Draft a detailed agreement under which each party provides specialized services.",
  "Include provisions for commercial terms, regulatory coordination, and quality oversight.",
  "Require a single execution block with representative name, title, email, and mailing address for each company.",
  "",
  ...TEST482_FOUR_PARTY.flatMap((party, i) => {
    const block = buildRoleHeaderPartyBlock(party, i);
    return i < TEST482_FOUR_PARTY.length - 1 ? [block, "—"] : [block];
  }),
  "",
  "Commercial terms: quarterly consideration with milestone-based reporting.",
].join("\n");

export function test484Draft(): ParsedDraftShape {
  return {
    title: "Services Agreement",
    jurisdiction: "Delaware",
    agreement_family: "consulting_agreement",
    parties: [
      { name: TEST482_AURORA, role: "Licensor" } as never,
      { name: TEST482_IRONFORGE, role: "Manufacturer" } as never,
    ],
    purpose: "Healthcare analytics platform with regulatory coordination.",
    payment_terms: "$2,800,000; quarterly payment",
    duration: "18 months",
    due_date: null,
    effective_date: null,
    payment: { amount: 2800000, cadence: "quarterly", valid: true },
  };
}
