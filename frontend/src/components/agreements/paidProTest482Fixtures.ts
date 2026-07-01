import type { ParsedDraftShape } from "./intakeSmartDefaults";

export const TEST482_AURORA = "Aurora Biotech Innovations LLC";
export const TEST482_IRONFORGE = "IronForge Manufacturing Inc.";
export const TEST482_BLUEWAVE = "BlueWave Medical Supply LLC";
export const TEST482_SUMMIT = "Summit Regulatory Advisors LLC";

export type Test482PartyFixture = {
  legalEntity: string;
  signerName: string;
  signerTitle: string;
  email: string;
  address: string;
};

export const TEST482_FOUR_PARTY: Test482PartyFixture[] = [
  {
    legalEntity: TEST482_AURORA,
    signerName: "Emma Richardson",
    signerTitle: "Chief Executive Officer",
    email: "emma.richardson@aurorabiotech.com",
    address: "1850 Innovation Parkway, Madison, WI 53703",
  },
  {
    legalEntity: TEST482_IRONFORGE,
    signerName: "Daniel Brooks",
    signerTitle: "Vice President of Operations",
    email: "daniel.brooks@ironforgemfg.com",
    address: "4220 Industrial Drive, Fort Wayne, IN 46808",
  },
  {
    legalEntity: TEST482_BLUEWAVE,
    signerName: "Sophia Martinez",
    signerTitle: "President",
    email: "sophia.martinez@bluewavemedical.com",
    address: "910 Harbor Commerce Blvd, Tampa, FL 33602",
  },
  {
    legalEntity: TEST482_SUMMIT,
    signerName: "Michael Chen",
    signerTitle: "Managing Director",
    email: "michael.chen@summitregulatory.com",
    address: "1400 Capital Plaza, Alexandria, VA 22314",
  },
];

function buildStackedRepresentedByPartyBlock(party: Test482PartyFixture, index: number): string {
  const [street, ...rest] = party.address.split(",").map((s) => s.trim());
  return [
    `Party ${index + 1}:`,
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

/** TEST480/482 production QA — stacked Represented by / title / Email / multiline Address blocks. */
export const TEST482_FOUR_PARTY_INTAKE = [
  "Draft a four-party services agreement for an AI-powered healthcare analytics platform.",
  "18-month term with third-party licensing revenue share.",
  "Require a single execution block with one signature section for each company showing legal entity name,",
  "representative name, representative title, email, mailing address, signature, and date.",
  "",
  ...TEST482_FOUR_PARTY.map((party, i) => buildStackedRepresentedByPartyBlock(party, i)),
].join("\n");

export const TEST482_FOUR_PARTY_LEGAL_ENTITIES = TEST482_FOUR_PARTY.map((p) => p.legalEntity);

export function test482Draft(): ParsedDraftShape {
  return {
    title: "Services Agreement",
    jurisdiction: "Delaware",
    agreement_family: "consulting_agreement",
    parties: [
      { name: TEST482_AURORA, role: "Licensor" } as never,
      { name: TEST482_IRONFORGE, role: "Manufacturer" } as never,
    ],
    purpose: "AI-powered healthcare analytics platform.",
    payment_terms: "$2,800,000; quarterly payment",
    duration: "18 months",
    due_date: null,
    effective_date: null,
    payment: { amount: 2800000, cadence: "quarterly", valid: true },
  };
}

export const PARTY_METADATA_LABEL_VALUES = [
  "Email:",
  "Address:",
  "Represented by:",
  "Representative:",
  "Title:",
  "Signer Name:",
] as const;
