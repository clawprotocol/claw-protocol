import type { ParsedDraftShape } from "./intakeSmartDefaults";
import type { PaidProSignerMetadataParty } from "./paidProSignerMetadataAuthority";

export const TEST486_EVERGREEN = "Evergreen Health Networks LLC";
export const TEST486_CATALYST = "Catalyst Digital Advisors LLC";
export const TEST486_FORTIS = "Fortis Security Group LLC";
export const TEST486_VECTOR = "Vector Cloud Systems Inc";

export type Test486PartyFixture = {
  legalEntity: string;
  signerName: string;
  signerTitle: string;
  email: string;
  address: string;
};

export const TEST486_FOUR_PARTY: Test486PartyFixture[] = [
  {
    legalEntity: TEST486_EVERGREEN,
    signerName: "Melissa Grant",
    signerTitle: "Chief Executive Officer",
    email: "melissa.grant@evergreenhealth.com",
    address: "1000 Wellness Parkway, Denver, CO 80202",
  },
  {
    legalEntity: TEST486_CATALYST,
    signerName: "Daniel Brooks",
    signerTitle: "Managing Partner",
    email: "daniel.brooks@catalystdigital.com",
    address: "850 Innovation Boulevard, Austin, TX 78701",
  },
  {
    legalEntity: TEST486_FORTIS,
    signerName: "Anthony Rivera",
    signerTitle: "Managing Director",
    email: "anthony.rivera@fortissecurity.com",
    address: "1775 Defense Plaza, Arlington, VA 22202",
  },
  {
    legalEntity: TEST486_VECTOR,
    signerName: "Rachel Kim",
    signerTitle: "Vice President of Delivery",
    email: "rachel.kim@vectorcloud.com",
    address: "2200 Enterprise Drive, Raleigh, NC 27609",
  },
];

export const TEST486_FOUR_PARTY_LEGAL_ENTITIES = TEST486_FOUR_PARTY.map((p) => p.legalEntity);

export const TEST486_SIGNATURE_INSTRUCTION =
  "Each party should have its own signature block with: legal name, By:, Name:, Title:, and Date: lines.";

export const TEST486_ADDRESS_CONTAMINATION_MARKERS = [
  "Each party should have",
  "signature block with",
  "legal name, By:",
] as const;

function buildNoticeStanza(
  party: Test486PartyFixture,
  addressOverride?: string,
): string {
  const address = addressOverride ?? party.address;
  return [
    `If to ${party.legalEntity}:`,
    party.legalEntity,
    `Attn: ${party.signerName}, ${party.signerTitle}`,
    `Email: ${party.email}`,
    `Address: ${address}`,
  ].join("\n");
}

/** Final notice stanza with instructional prose fused after the postal address (TEST486). */
export function buildTest486CorruptedFinalNoticeCorpus(): string {
  const parties = TEST486_FOUR_PARTY;
  const corruptedFinalAddress = `${parties[3]!.address}, ${TEST486_SIGNATURE_INSTRUCTION}`;
  return [
    "MULTI-PARTY SERVICES AGREEMENT",
    "",
    `This Agreement is among ${parties.map((p) => p.legalEntity).join(", ")}.`,
    "",
    "10. MISCELLANEOUS",
    "10.1 Entire Agreement.",
    "",
    "11. NOTICES",
    "Notices under this Agreement must be in writing and delivered as set forth below.",
    "",
    buildNoticeStanza(parties[0]!),
    "",
    buildNoticeStanza(parties[1]!),
    "",
    buildNoticeStanza(parties[2]!),
    "",
    buildNoticeStanza(parties[3]!, corruptedFinalAddress),
    "",
    TEST486_SIGNATURE_INSTRUCTION,
    "",
    "IN WITNESS WHEREOF, the Parties execute this Agreement as of the Effective Date.",
    "",
    ...parties.map((p) => p.legalEntity),
  ].join("\n");
}

/** Inline comma contamination on party 3 (production screenshot shape). */
export function buildTest486CorruptedInlineNoticeCorpus(): string {
  const parties = TEST486_FOUR_PARTY;
  const corruptedMidAddress = `${parties[2]!.address}, ${TEST486_SIGNATURE_INSTRUCTION}`;
  return [
    "11. NOTICES",
    "Notices under this Agreement must be in writing.",
    "",
    buildNoticeStanza(parties[0]!),
    "",
    buildNoticeStanza(parties[1]!),
    "",
    buildNoticeStanza(parties[2]!, corruptedMidAddress),
    "",
    buildNoticeStanza(parties[3]!),
    "",
    "IN WITNESS WHEREOF",
  ].join("\n");
}

export function test486Parties(): PaidProSignerMetadataParty[] {
  return TEST486_FOUR_PARTY.map((party, partyIndex) => ({
    partyIndex,
    partyLegalName: party.legalEntity,
    signerEmail: party.email,
    signerName: party.signerName,
    signerTitle: party.signerTitle,
    partyAddress: party.address,
  }));
}

export function test486Draft(): ParsedDraftShape {
  return {
    title: "Multi-Party Services Agreement",
    jurisdiction: "Delaware",
    agreement_family: "consulting_agreement",
    parties: TEST486_FOUR_PARTY_LEGAL_ENTITIES.map((name, i) => ({
      name,
      role: i === 0 ? "Client" : i === 1 ? "Service Provider" : "party",
    })) as never[],
    purpose: "Multi-party platform services.",
    payment_terms: "As set forth in a statement of work.",
    duration: "24 months",
    due_date: null,
    effective_date: null,
    payment: { amount: null, cadence: "milestone", valid: true },
  };
}
