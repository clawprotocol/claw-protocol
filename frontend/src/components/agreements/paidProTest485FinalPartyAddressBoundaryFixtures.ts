import type { ParsedDraftShape } from "./intakeSmartDefaults";

export const TEST485_HELIX = "Helix Clinical Research LLC";
export const TEST485_PIONEER = "Pioneer Health Network Inc.";
export const TEST485_NOVA = "Nova Imaging Solutions LLC";
export const TEST485_BEACON = "Beacon Regulatory Partners LLC";

export type Test485PartyFixture = {
  legalEntity: string;
  role: string;
  signerName: string;
  signerTitle: string;
  email: string;
  address: string;
};

export const TEST485_FOUR_PARTY: Test485PartyFixture[] = [
  {
    legalEntity: TEST485_HELIX,
    role: "Platform Developer",
    signerName: "Olivia Carter",
    signerTitle: "Chief Executive Officer",
    email: "olivia.carter@helixclinical.com",
    address: "1855 Discovery Drive, Raleigh, NC 27606",
  },
  {
    legalEntity: TEST485_PIONEER,
    role: "Hospital Network",
    signerName: "Dr. Jonathan Reeves",
    signerTitle: "Chief Medical Officer",
    email: "jonathan.reeves@pioneerhealth.org",
    address: "4700 Medical Center Parkway, Nashville, TN 37203",
  },
  {
    legalEntity: TEST485_NOVA,
    role: "Medical Imaging Provider",
    signerName: "Karen Mitchell",
    signerTitle: "Vice President of Clinical Operations",
    email: "karen.mitchell@novaimaging.com",
    address: "820 Innovation Way, Denver, CO 80216",
  },
  {
    legalEntity: TEST485_BEACON,
    role: "Regulatory & Compliance Advisor",
    signerName: "Samuel Price",
    signerTitle: "Managing Director",
    email: "samuel.price@beaconregulatory.com",
    address: "610 Constitution Avenue, Boston, MA 02110",
  },
];

function buildClinicalPartyBlock(party: Test485PartyFixture, index: number): string {
  const [street, ...rest] = party.address.split(",").map((s) => s.trim());
  return [
    `Party ${index + 1} (${party.role})`,
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

/** TEST485 — final party address must stop before Purpose / Initial Term / Scope sections. */
export const TEST485_FOUR_PARTY_INTAKE = [
  "Draft a four-party clinical platform agreement with separate execution blocks for each company.",
  "",
  ...TEST485_FOUR_PARTY.map((party, i) => buildClinicalPartyBlock(party, i)),
  "",
  "Purpose,",
  "The Parties will jointly develop, validate, and prepare an AI-assisted diagnostic platform for future FDA submission and commercial deployment.",
  "",
  "Initial Term,",
  "36 months.",
  "",
  "Scope of Work,",
  `${TEST485_HELIX} will: build the AI platform and validation pipeline.`,
  `${TEST485_PIONEER} will: provide clinical study sites and patient cohort access.`,
  `${TEST485_NOVA} will: supply imaging workflows and radiology integration.`,
  `${TEST485_BEACON} will: manage regulatory submissions and quality documentation.`,
  "",
  "Governance,",
  "Major decisions require unanimous approval of Platform Developer and Hospital Network.",
  "",
  "Compensation,",
  "Hospital Network will fund milestone payments as set forth in a separate statement of work.",
].join("\n");

export const TEST485_FOUR_PARTY_LEGAL_ENTITIES = TEST485_FOUR_PARTY.map((p) => p.legalEntity);

export const TEST485_ADDRESS_CONTAMINATION_MARKERS = [
  "Purpose",
  "Initial Term",
  "Scope of Work",
  "Governance",
  "Compensation",
  "The Parties will jointly develop",
  "36 months",
  "FDA submission",
] as const;

export function test485Draft(): ParsedDraftShape {
  return {
    title: "Clinical Platform Services Agreement",
    jurisdiction: "Delaware",
    agreement_family: "consulting_agreement",
    parties: TEST485_FOUR_PARTY_LEGAL_ENTITIES.map((name, i) => ({
      name,
      role: TEST485_FOUR_PARTY[i]!.role,
    })) as never[],
    purpose: "AI-assisted diagnostic platform with regulatory coordination.",
    payment_terms: "Milestone-based funding",
    duration: "36 months",
    due_date: null,
    effective_date: null,
    payment: { amount: null, cadence: "milestone", valid: true },
  };
}
