import { buildLivePaidProSignerMetadataAuthority } from "./paidProSignerMetadataAuthority";
import type { ParsedDraftShape } from "./intakeSmartDefaults";

const RED = "Red Mesa Logistics LLC";
const BLUE = "Blue Canyon Analytics LLC";

/** test395 / production QA mutual-services quad-party intake (~889 chars). */
export const TEST398_QUAD_PARTY_MUTUAL_SERVICES_INTAKE = [
  "Red Mesa Logistics LLC and Blue Canyon Analytics LLC, together with Harbor Peak Automation LLC and Iron Vale Systems Inc.,",
  "engage one another to design, implement, and support an integrated logistics and analytics platform.",
  "",
  "Each company will provide services to the others as described herein.",
  "Total project consideration is $185,000 with monthly payments as specified.",
  "The engagement term is twenty-four (24) months.",
  "",
  "Each party appoints one authorized signer.",
  "Oklahoma law governs.",
  "Electronic signatures via LawDog are permitted.",
].join("\n");

export function test398Draft(): ParsedDraftShape {
  return {
    title: "Mutual Services Agreement",
    jurisdiction: "Oklahoma",
    agreement_family: "consulting_agreement",
    parties: [
      { name: RED, role: "Client" } as never,
      { name: BLUE, role: "Service Provider" } as never,
    ],
    purpose: "Design, implement, and support an integrated logistics and analytics platform.",
    payment_terms: "$185,000, monthly payment",
    duration: "24 months",
    due_date: null,
    effective_date: null,
    payment: { amount: 185000, cadence: "monthly", valid: true },
  };
}

export function test398Parties() {
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
      intakeText: TEST398_QUAD_PARTY_MUTUAL_SERVICES_INTAKE,
      draftPartyNames: [RED, BLUE],
    },
  ).parties;
}
