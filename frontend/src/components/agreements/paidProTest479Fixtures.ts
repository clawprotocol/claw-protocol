import type { ParsedDraftShape } from "./intakeSmartDefaults";

export const AURORA = "Aurora Biotech Innovations LLC";
export const IRONFORGE = "IronForge Manufacturing Inc.";
export const BLUEWAVE = "BlueWave Medical Supply LLC";
export const SUMMIT = "Summit Regulatory Advisors LLC";

export type Test479PartyFixture = {
  legalEntity: string;
  signerName: string;
  signerTitle: string;
  email: string;
  address: string;
};

export const TEST479_FOUR_PARTY: Test479PartyFixture[] = [
  {
    legalEntity: AURORA,
    signerName: "Emma Richardson",
    signerTitle: "Chief Executive Officer",
    email: "emma.richardson@aurorabiotech.com",
    address: "1200 Innovation Drive, Suite 400, Wilmington, DE 19801",
  },
  {
    legalEntity: IRONFORGE,
    signerName: "Daniel Brooks",
    signerTitle: "VP Operations",
    email: "daniel.brooks@ironforgemfg.com",
    address: "450 Industrial Parkway, Building C, Detroit, MI 48201",
  },
  {
    legalEntity: BLUEWAVE,
    signerName: "Sophia Martinez",
    signerTitle: "President",
    email: "sophia.martinez@bluewavemedical.com",
    address: "88 Harbor Commerce Blvd, Tampa, FL 33602",
  },
  {
    legalEntity: SUMMIT,
    signerName: "Michael Chen",
    signerTitle: "Managing Director",
    email: "michael.chen@summitregulatory.com",
    address: "500 Regulatory Center, 14th Floor, Boston, MA 02108",
  },
];

function buildRepresentedByPartyBlock(party: Test479PartyFixture, index: number): string {
  return [
    `Party ${index + 1}`,
    `Legal entity: ${party.legalEntity}`,
    `Represented by: ${party.signerName}`,
    `Title: ${party.signerTitle}`,
    `Email: ${party.email}`,
    `Address: ${party.address.split(",")[0]?.trim() ?? party.address}`,
    ...party.address.split(",").slice(1).map((line) => line.trim()).filter(Boolean),
  ].join("\n");
}

/** Production QA — 4-party services agreement with Represented by / multiline address (TEST479). */
export const TEST479_FOUR_PARTY_INTAKE = [
  "Draft a four-party services agreement for an AI-powered healthcare analytics platform.",
  "18-month term with third-party licensing revenue share.",
  "Require a single execution block with one signature section for each company showing legal entity name,",
  "representative name, representative title, email, mailing address, signature, and date.",
  "Maintain identical party metadata throughout every stage without placeholders.",
  "",
  ...TEST479_FOUR_PARTY.map((party, i) => buildRepresentedByPartyBlock(party, i)),
].join("\n");

/** Inline em-dash contact clauses (alternate TEST479 intake shape). */
export const TEST479_FOUR_PARTY_INLINE_INTAKE = [
  "Draft a four-party services agreement for an AI-powered healthcare analytics platform.",
  "",
  `${AURORA} — Emma Richardson, Chief Executive Officer, emma.richardson@aurorabiotech.com, 1200 Innovation Drive, Suite 400, Wilmington, DE 19801`,
  `${IRONFORGE} — Daniel Brooks, VP Operations, daniel.brooks@ironforgemfg.com, 450 Industrial Parkway, Building C, Detroit, MI 48201`,
  `${BLUEWAVE} — Sophia Martinez, President, sophia.martinez@bluewavemedical.com, 88 Harbor Commerce Blvd, Tampa, FL 33602`,
  `${SUMMIT} — Michael Chen, Managing Director, michael.chen@summitregulatory.com, 500 Regulatory Center, 14th Floor, Boston, MA 02108`,
].join("\n");

export const TEST479_FOUR_PARTY_LEGAL_ENTITIES = TEST479_FOUR_PARTY.map((p) => p.legalEntity);

export function test479Draft(): ParsedDraftShape {
  return {
    title: "Services Agreement",
    jurisdiction: "Delaware",
    agreement_family: "consulting_agreement",
    parties: [
      { name: AURORA, role: "Licensor" } as never,
      { name: IRONFORGE, role: "Manufacturer" } as never,
    ],
    purpose: "AI-powered healthcare analytics platform.",
    payment_terms: "$2,800,000; quarterly payment",
    duration: "18 months",
    due_date: null,
    effective_date: null,
    payment: { amount: 2800000, cadence: "quarterly", valid: true },
  };
}
