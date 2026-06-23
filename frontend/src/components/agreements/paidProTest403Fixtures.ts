import { buildLivePaidProSignerMetadataAuthority } from "./paidProSignerMetadataAuthority";
import type { ParsedDraftShape } from "./intakeSmartDefaults";

const RED = "Red Mesa Logistics LLC";
const BLUE = "Blue Canyon Analytics LLC";

/** Production QA intake — warehouse automation quad-party mutual services (TEST403). */
export const TEST403_PRODUCTION_QUAD_PARTY_INTAKE = [
  "Red Mesa Logistics LLC and Blue Canyon Analytics LLC jointly engage Harbor Peak Automation LLC",
  "and Iron Vale Systems Inc. for warehouse automation and reporting platform.",
  "Total consideration is $185,000 with $75,000 due upon execution and the remainder payable monthly over six months.",
  "The term is twelve (12) months.",
  "The agreement includes confidentiality, intellectual property, limitation of liability, independent contractor status,",
  "and mutual indemnification provisions.",
  "Notices should be sent to the primary business addresses and emails of each party.",
  "Oklahoma law governs. Amendments require written agreement of all parties. Electronic signatures are permitted.",
].join(" ");

export function test403Draft(): ParsedDraftShape {
  return {
    title: "Mutual Services Agreement",
    jurisdiction: "Oklahoma",
    agreement_family: "consulting_agreement",
    parties: [
      { name: RED, role: "Client" } as never,
      { name: BLUE, role: "Service Provider" } as never,
    ],
    purpose: "Warehouse automation and reporting platform.",
    payment_terms: "$185,000; $75,000 initial; remainder monthly over six months",
    duration: "12 months",
    due_date: null,
    effective_date: null,
    payment: { amount: 185000, cadence: "monthly", valid: true },
  };
}

export function test403Parties() {
  return buildLivePaidProSignerMetadataAuthority(
    {
      partyCount: 4,
      recipient1Name: RED,
      recipient2Name: BLUE,
      recipient1Email: "",
      recipient2Email: "",
      extraPartyReviewEmails: ["", ""],
      partySignerNames: ["", "", "", ""],
      partySignerTitles: ["", "", "", ""],
      partyAddresses: ["", "", "", ""],
    },
    "live_ui",
    {
      intakeText: TEST403_PRODUCTION_QUAD_PARTY_INTAKE,
      draftPartyNames: [RED, BLUE],
    },
  ).parties;
}
