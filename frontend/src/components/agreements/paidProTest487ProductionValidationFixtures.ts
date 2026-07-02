import type { ParsedDraftShape } from "./intakeSmartDefaults";
import type { PaidProSignerMetadataParty } from "./paidProSignerMetadataAuthority";
import { buildNPartyPaidProServerCorpus } from "./paidProNPartyCorpusBuilder";

export const TEST487_LUMEN = "Lumen Bioinformatics Inc.";
export const TEST487_THALASSA = "Thalassa Data Systems LLC";
export const TEST487_COASTAL = "Coastal Meridian Analytics LLC";
export const TEST487_VANGUARD = "Vanguard Regulatory Sciences Ltd.";

export type Test487PartyFixture = {
  legalEntity: string;
  role: string;
  signerName: string;
  signerTitle: string;
  email: string;
  mailingAddress: string;
  noticeAddress: string;
};

export const TEST487_FOUR_PARTY: Test487PartyFixture[] = [
  {
    legalEntity: TEST487_LUMEN,
    role: "Platform Developer",
    signerName: "Dr. Elena Vasquez",
    signerTitle: "Chief Science Officer",
    email: "elena.vasquez@lumenbio.com",
    mailingAddress: "401 Kendall Square, Cambridge, MA 02142",
    noticeAddress: "402 Kendall Square, Suite 500, Cambridge, MA 02142",
  },
  {
    legalEntity: TEST487_THALASSA,
    role: "Data Infrastructure Provider",
    signerName: "Marcus Webb",
    signerTitle: "President",
    email: "marcus.webb@thalassadata.com",
    mailingAddress: "8801 Research Drive, Charlotte, NC 28262",
    noticeAddress: "8801 Research Drive, Attn Legal Dept, Charlotte, NC 28262",
  },
  {
    legalEntity: TEST487_COASTAL,
    role: "Analytics Integrator",
    signerName: "Priya Nair",
    signerTitle: "Vice President of Operations",
    email: "priya.nair@coastalmeridian.com",
    mailingAddress: "9200 Pacific Heights Blvd, San Diego, CA 92121",
    noticeAddress: "PO Box 4410, San Diego, CA 92121-4410",
  },
  {
    legalEntity: TEST487_VANGUARD,
    role: "Regulatory Compliance Advisor",
    signerName: "James O'Sullivan",
    signerTitle: "Managing Director",
    email: "james.osullivan@vanguardregulatory.co",
    mailingAddress: "225 Market Street, Harrisburg, PA 17101",
    noticeAddress: "225 Market Street, 12th Floor, Harrisburg, PA 17101",
  },
];

export const TEST487_FOUR_PARTY_LEGAL_ENTITIES = TEST487_FOUR_PARTY.map((p) => p.legalEntity);

export const TEST487_SIGNER_NAMES = TEST487_FOUR_PARTY.map((p) => p.signerName);
export const TEST487_SIGNER_TITLES = TEST487_FOUR_PARTY.map((p) => p.signerTitle);
export const TEST487_PARTY_EMAILS = TEST487_FOUR_PARTY.map((p) => p.email);
export const TEST487_MAILING_ADDRESSES = TEST487_FOUR_PARTY.map((p) => p.mailingAddress);
export const TEST487_NOTICE_ADDRESSES = TEST487_FOUR_PARTY.map((p) => p.noticeAddress);

/** Prior TEST3xx–TEST486 entity markers that must never appear as authority. */
export const TEST487_FORBIDDEN_ENTITY_MARKERS = [
  "RED MESA",
  "HARBOR PEAK",
  "EVERGREEN",
  "CATALYST",
  "FORTIS",
  "VECTOR",
  "NORTH STAR",
  "SUMMIT RIDGE",
  "DELTA INTEGRATION",
  "BLUE CANYON",
  "BRIGHTPEAK",
  "HORIZON WHOLESALE",
  "AURORA BIOTECH",
  "IRONFORGE",
  "BLUEWAVE",
  "HELIX CLINICAL",
  "PIONEER HEALTH",
] as const;

export const TEST487_ADDRESS_CONTAMINATION_MARKERS = [
  "Payment Milestones",
  "Confidentiality",
  "Intellectual Property",
  "Limitation of Liability",
  "Acceptance Criteria",
  "Insurance Requirements",
  "Independent Contractor",
  "Governing Law",
  "Each party should have",
] as const;

function buildPartyBlock(party: Test487PartyFixture, index: number): string {
  const [street, ...rest] = party.mailingAddress.split(",").map((s) => s.trim());
  return [
    `Party ${index + 1} (${party.role})`,
    party.legalEntity,
    `Represented by: ${party.signerName}`,
    `Title: ${party.signerTitle}`,
    `Email: ${party.email}`,
    "Address:",
    street,
    ...rest,
  ].join("\n");
}

function buildNoticeStanza(party: Test487PartyFixture): string {
  return [
    `If to ${party.legalEntity}:`,
    party.legalEntity,
    `Attn: ${party.signerName}, ${party.signerTitle}`,
    `Email: ${party.email}`,
    `Address: ${party.noticeAddress}`,
  ].join("\n");
}

/** TEST487 — fresh four-party production acceptance intake (never used in prior TEST runs). */
export const TEST487_PRODUCTION_INTAKE = [
  "Draft a four-party precision medicine data platform agreement with separate execution blocks for each company.",
  "Maintain identical party metadata throughout every stage without placeholders or truncation.",
  "",
  ...TEST487_FOUR_PARTY.map((party, i) => buildPartyBlock(party, i)),
  "",
  "Purpose,",
  "The Parties will jointly develop, validate, and operate a regulated precision medicine analytics platform.",
  "",
  "Initial Term,",
  "24 months with two optional 12-month renewals.",
  "",
  "Payment Milestones,",
  `${TEST487_LUMEN} receives $250,000 upon execution, $400,000 upon platform alpha delivery, and $350,000 upon validation report acceptance.`,
  `${TEST487_THALASSA} receives $180,000 upon data pipeline readiness and $220,000 upon production cutover.`,
  `${TEST487_COASTAL} receives $150,000 upon analytics module delivery and $175,000 upon user acceptance testing completion.`,
  `${TEST487_VANGUARD} receives $95,000 upon regulatory gap assessment and $105,000 upon audit readiness certification.`,
  "",
  "Confidentiality,",
  "Each Party will protect the other Parties' Confidential Information for five years using at least reasonable care.",
  "",
  "Intellectual Property,",
  "Foreground IP developed solely by a Party remains that Party's property; jointly developed foreground IP is owned equally unless otherwise agreed in writing.",
  "",
  "Limitation of Liability,",
  "Except for confidentiality breaches, indemnification obligations, or willful misconduct, no Party's aggregate liability exceeds fees paid in the twelve months preceding the claim.",
  "",
  "Acceptance Criteria,",
  "Deliverables must satisfy written acceptance criteria in the applicable statement of work within fifteen business days of delivery.",
  "",
  "Insurance Requirements,",
  "Each Party will maintain commercial general liability insurance of at least $2,000,000 per occurrence and professional liability coverage appropriate to its role.",
  "",
  "Independent Contractor,",
  "Each Party performs as an independent contractor; nothing creates a partnership, joint venture, or employment relationship.",
  "",
  "Governing Law,",
  "Massachusetts law governs without regard to conflict-of-law rules.",
  "",
  "Notices,",
  "Formal notices must be delivered to the following notice addresses (distinct from mailing addresses):",
  ...TEST487_FOUR_PARTY.map(
    (p) => `${p.legalEntity} notice address: ${p.noticeAddress}`,
  ),
  "Each party should have its own signature block with: legal name, By:, Name:, Title:, and Date: lines.",
].join("\n");

export function test487Draft(): ParsedDraftShape {
  return {
    title: "Precision Medicine Data Platform Agreement",
    jurisdiction: "Massachusetts",
    agreement_family: "consulting_agreement",
    parties: [
      { name: TEST487_LUMEN, role: "Platform Developer" } as never,
      { name: TEST487_THALASSA, role: "Data Infrastructure Provider" } as never,
    ],
    purpose: "Regulated precision medicine analytics platform.",
    payment_terms:
      "Total project value $1,925,000. Milestone payments include $250,000 upon execution, $400,000 upon alpha delivery, $350,000 upon validation report, $180,000 upon pipeline readiness, $220,000 upon production cutover, $150,000 upon analytics delivery, $175,000 upon UAT completion, $95,000 upon regulatory assessment, and $105,000 upon audit readiness.",
    duration: "24 months",
    due_date: null,
    effective_date: null,
    payment: { amount: 1925000, cadence: "milestone", valid: true },
  };
}

export function test487DraftWithFourParsedParties(): ParsedDraftShape {
  return {
    ...test487Draft(),
    parties: TEST487_FOUR_PARTY.map((p) => ({ name: p.legalEntity, role: p.role })) as never[],
  };
}

/** Signer-setup UI: parties 3–4 legal entity inputs blank (production finalize pattern). */
export function test487LiveUiWithBlankExtraLegalNames() {
  return {
    partyCount: 4,
    recipient1Name: TEST487_LUMEN,
    recipient2Name: TEST487_THALASSA,
    recipient1Email: TEST487_PARTY_EMAILS[0]!,
    recipient2Email: TEST487_PARTY_EMAILS[1]!,
    extraPartyReviewEmails: [TEST487_PARTY_EMAILS[2]!, TEST487_PARTY_EMAILS[3]!],
    extraPartyLegalNames: ["", ""],
    partySignerNames: [...TEST487_SIGNER_NAMES],
    partySignerTitles: [...TEST487_SIGNER_TITLES],
    partyAddresses: [...TEST487_MAILING_ADDRESSES],
  };
}

export function test487PartiesFromFinalizeUi(): PaidProSignerMetadataParty[] {
  const ui = test487LiveUiWithBlankExtraLegalNames();
  return [
    {
      partyIndex: 0,
      partyLegalName: ui.recipient1Name,
      signerEmail: ui.recipient1Email,
      signerName: ui.partySignerNames[0]!,
      signerTitle: ui.partySignerTitles[0]!,
      partyAddress: ui.partyAddresses[0]!,
    },
    {
      partyIndex: 1,
      partyLegalName: ui.recipient2Name,
      signerEmail: ui.recipient2Email,
      signerName: ui.partySignerNames[1]!,
      signerTitle: ui.partySignerTitles[1]!,
      partyAddress: ui.partyAddresses[1]!,
    },
    {
      partyIndex: 2,
      partyLegalName: TEST487_COASTAL,
      signerEmail: ui.extraPartyReviewEmails[0]!,
      signerName: ui.partySignerNames[2]!,
      signerTitle: ui.partySignerTitles[2]!,
      partyAddress: ui.partyAddresses[2]!,
    },
    {
      partyIndex: 3,
      partyLegalName: TEST487_VANGUARD,
      signerEmail: ui.extraPartyReviewEmails[1]!,
      signerName: ui.partySignerNames[3]!,
      signerTitle: ui.partySignerTitles[3]!,
      partyAddress: ui.partyAddresses[3]!,
    },
  ];
}

export function buildTest487AcceptedCorpus(intake: string): string {
  return buildNPartyPaidProServerCorpus({
    parties: TEST487_FOUR_PARTY_LEGAL_ENTITIES,
    intakeText: intake,
    draft: test487Draft(),
    title: test487Draft().title,
    minLen: 5200,
  });
}

/** Operative notice section with distinct notice addresses (may include final-stanza pollution for boundary repair). */
export function buildTest487OperativeNoticeCorpus(includeFinalStanzaPollution = false): string {
  const stanzas = TEST487_FOUR_PARTY.map((party, i) => {
    if (includeFinalStanzaPollution && i === 3) {
      return [
        `If to ${party.legalEntity}:`,
        party.legalEntity,
        `Attn: ${party.signerName}, ${party.signerTitle}`,
        `Email: ${party.email}`,
        `Address: ${party.noticeAddress}, Each party should have its own signature block with: legal name, By:, Name:, Title:, and Date: lines.`,
      ].join("\n");
    }
    return buildNoticeStanza(party);
  });
  return [
    "PRECISION MEDICINE DATA PLATFORM AGREEMENT",
    "",
    `This Agreement is among ${TEST487_FOUR_PARTY.map((p) => p.legalEntity).join(", ")}.`,
    "",
    "10. NOTICES",
    "",
    ...stanzas,
    "",
    "11. GOVERNING LAW",
    "Massachusetts law governs.",
    "",
    "IN WITNESS WHEREOF, the Parties execute this Agreement.",
    "",
    ...TEST487_FOUR_PARTY.flatMap((p) => [
      p.legalEntity,
      "By: ______________________________",
      "Name: ______________________________",
      "Title: ______________________________",
      "Date: ______________________________",
      "",
    ]),
  ].join("\n");
}
