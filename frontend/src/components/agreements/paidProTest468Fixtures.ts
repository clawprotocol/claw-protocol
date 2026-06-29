import { buildLivePaidProSignerMetadataAuthority } from "./paidProSignerMetadataAuthority";
import type { ParsedDraftShape } from "./intakeSmartDefaults";

export const CEDAR_RIDGE = "Cedar Ridge Health Cooperative LLC";
export const NORTHSTAR = "Northstar AI Research Inc";
export const BLUE_HARBOR = "Blue Harbor Cloud Services LLC";
export const MERIDIAN = "Meridian Outcomes Analytics LLC";

export const TEST468_PRODUCTION_QUAD_PARTY_INTAKE = [
  "Draft a comprehensive agreement for an AI-powered healthcare analytics platform.",
  `Party A — ${CEDAR_RIDGE} — contributing de-identified patient outcome data.`,
  `Party B — ${NORTHSTAR} — developing and training the AI models.`,
  `Party C — ${BLUE_HARBOR} — hosting cloud infrastructure and security.`,
  `Party D — ${MERIDIAN} — selling the analytics platform and managing enterprise customers.`,
].join("\n");

export const TEST468_PARTY_EMAILS = {
  cedar: "cryptocurated21+c@gmail.com",
  northstar: "cryptocurated21+n@gmail.com",
  harbor: "cryptocurated21+bh@gmail.com",
  meridian: "cryptocurated21+m@gmail.com",
} as const;

export const TEST468_PARTY_ADDRESSES = {
  cedar: "418 Willow Creek Rd., Edmond, OK 73013",
  northstar: "215 Innovation Way, Austin, TX 78701",
  harbor: "782 Harbor Point Dr., Bellevue, WA 98004",
  meridian: "1660 Commerce Blvd., Franklin, TN 37067",
} as const;

export const TEST468_SIGNER_NAMES = [
  "Laura Benton",
  "Marcus Vale",
  "Priya Raman",
  "Daniel Price",
] as const;

export const TEST468_SIGNER_TITLES = [
  "Executive Director",
  "Chief Executive Officer",
  "Chief Technology Officer",
  "Managing Director",
] as const;

export function test468Draft(): ParsedDraftShape {
  return {
    title: "Services Agreement",
    jurisdiction: "Oklahoma",
    agreement_family: "consulting_agreement",
    parties: [
      { name: CEDAR_RIDGE, role: "Client" } as never,
      { name: NORTHSTAR, role: "Service Provider" } as never,
    ],
    purpose: "AI-powered healthcare analytics platform.",
    payment_terms: "$500,000 annual platform fees",
    duration: "24 months",
    due_date: null,
    effective_date: null,
    payment: { amount: 500000, cadence: "annual", valid: true },
  };
}

export function test468Parties() {
  return buildLivePaidProSignerMetadataAuthority(
    {
      partyCount: 4,
      recipient1Name: CEDAR_RIDGE,
      recipient2Name: NORTHSTAR,
      recipient1Email: TEST468_PARTY_EMAILS.cedar,
      recipient2Email: TEST468_PARTY_EMAILS.northstar,
      extraPartyReviewEmails: [TEST468_PARTY_EMAILS.harbor, TEST468_PARTY_EMAILS.meridian],
      partySignerNames: [...TEST468_SIGNER_NAMES],
      partySignerTitles: [...TEST468_SIGNER_TITLES],
      partyAddresses: [
        TEST468_PARTY_ADDRESSES.cedar,
        TEST468_PARTY_ADDRESSES.northstar,
        TEST468_PARTY_ADDRESSES.harbor,
        TEST468_PARTY_ADDRESSES.meridian,
      ],
    },
    "live_ui",
    {
      intakeText: TEST468_PRODUCTION_QUAD_PARTY_INTAKE,
      draftPartyNames: [CEDAR_RIDGE, NORTHSTAR],
    },
  ).parties;
}

export function buildTest468MalformedNoticesRegion(): string {
  const parties = test468Parties();
  const noticeStanzas = parties
    .map((party) => {
      const legal = party.partyLegalName.trim();
      return [
        `If to ${legal}:`,
        legal,
        `Attn: ${party.signerName}, ${party.signerTitle}`,
        `Email: ${party.signerEmail}`,
        `Address: ${party.partyAddress}`,
      ].join("\n");
    })
    .join("\n\n");

  const operative = [
    "SERVICES AGREEMENT",
    "",
    `This Agreement is between ${CEDAR_RIDGE}, ${NORTHSTAR}, ${BLUE_HARBOR}, and ${MERIDIAN}.`,
    "",
    ...Array.from({ length: 10 }, (_, i) => `Section ${i + 1}. Operative clause ${i + 1}.`),
    "",
    "11. Dispute Resolution, Governing Law and Venue",
    "Oklahoma law governs. Each party consents to the exclusive jurisdiction and venue of those courts12. Notices and Miscellaneous",
    "",
    "Notices",
    "",
    "Any notice under this Agreement must be in writing and will be deemed given when delivered personally.",
    "",
    "12. NOTICES",
    "",
    "Notices under this Agreement must be in writing and delivered as set forth below.",
    "",
    noticeStanzas,
    "",
    "IN WITNESS WHEREOF, the Parties execute this Agreement.",
    "",
    "PARTY 1:",
    CEDAR_RIDGE,
    "By: ______________________________",
    "Name: ______________________________",
    "Title: ______________________________",
    "Date: ______________________________",
    "",
    "PARTY 2:",
    NORTHSTAR,
    "By: ______________________________",
    "Name: ______________________________",
    "Title: ______________________________",
    "Date: ______________________________",
    "",
    "PARTY 3:",
    BLUE_HARBOR,
    "By: ______________________________",
    "Name: ______________________________",
    "Title: ______________________________",
    "Date: ______________________________",
    "",
    "PARTY 4:",
    MERIDIAN,
    "By: ______________________________",
    "Name: ______________________________",
    "Title: ______________________________",
    "Date: ______________________________",
  ].join("\n");

  return operative;
}

export function buildTest468UserCorrectedNoticesRegion(): string {
  const parties = test468Parties();
  const noticeStanzas = parties
    .map((party) => {
      const legal = party.partyLegalName.trim();
      return [
        `If to ${legal}:`,
        legal,
        `Attn: ${party.signerName}, ${party.signerTitle}`,
        `Email: ${party.signerEmail}`,
        `Address: ${party.partyAddress}`,
      ].join("\n");
    })
    .join("\n\n");

  return [
    "SERVICES AGREEMENT",
    "",
    `This Agreement is between ${CEDAR_RIDGE}, ${NORTHSTAR}, ${BLUE_HARBOR}, and ${MERIDIAN}.`,
    "",
    ...Array.from({ length: 10 }, (_, i) => `Section ${i + 1}. Operative clause ${i + 1}.`),
    "",
    "11. Dispute Resolution, Governing Law and Venue",
    "Oklahoma law governs. Each party consents to the exclusive jurisdiction and venue of those courts.",
    "",
    "12. Notices and Miscellaneous",
    "",
    "Notices under this Agreement must be in writing and delivered as set forth below.",
    "",
    noticeStanzas,
    "",
    "IN WITNESS WHEREOF, the Parties execute this Agreement.",
    "",
    "PARTY 1:",
    CEDAR_RIDGE,
    "By: ______________________________",
    "Name: Laura Benton",
    "Title: Executive Director",
    "Date: ______________________________",
    "",
    "PARTY 2:",
    NORTHSTAR,
    "By: ______________________________",
    "Name: Marcus Vale",
    "Title: Chief Executive Officer",
    "Date: ______________________________",
    "",
    "PARTY 3:",
    BLUE_HARBOR,
    "By: ______________________________",
    "Name: Priya Raman",
    "Title: Chief Technology Officer",
    "Date: ______________________________",
    "",
    "PARTY 4:",
    MERIDIAN,
    "By: ______________________________",
    "Name: Daniel Price",
    "Title: Managing Director",
    "Date: ______________________________",
  ].join("\n");
}

export function buildTest468DuplicateExecutionTail(): string {
  return [
    "SERVICES AGREEMENT",
    "",
    `This Agreement is between ${CEDAR_RIDGE} and ${NORTHSTAR}.`,
    "",
    ...Array.from({ length: 12 }, (_, i) => `Section ${i + 1}. Operative clause ${i + 1}.`),
    "",
    "IN WITNESS WHEREOF, the Parties execute this Agreement.",
    "",
    "PARTY 1:",
    CEDAR_RIDGE,
    CEDAR_RIDGE,
    "By: ______________________________",
    "Name: Laura Benton",
    "Title: Executive Director",
    "Date: ______________________________",
    "",
    "PARTY 2:",
    NORTHSTAR,
    NORTHSTAR,
    "By: ______________________________",
    "Name: Marcus Vale",
    "Title: Chief Executive Officer",
    "Date: ______________________________",
    "",
    "PARTY 3:",
    BLUE_HARBOR,
    BLUE_HARBOR,
    "By: ______________________________",
    "Name: Priya Raman",
    "Title: Chief Technology Officer",
    "Date: ______________________________",
    "",
    "PARTY 4:",
    MERIDIAN,
    MERIDIAN,
    "By: ______________________________",
    "Name: Daniel Price",
    "Title: Managing Director",
    "Date: ______________________________",
  ].join("\n");
}
