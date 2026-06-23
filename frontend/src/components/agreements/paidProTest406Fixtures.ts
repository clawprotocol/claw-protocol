import { buildLivePaidProSignerMetadataAuthority } from "./paidProSignerMetadataAuthority";
import type { ParsedDraftShape } from "./intakeSmartDefaults";
import { TEST405_PRODUCTION_QUAD_PARTY_INTAKE } from "./paidProTest405Fixtures";

const RED = "Red Mesa Logistics LLC";
const BLUE = "Blue Canyon Analytics LLC";

export const TEST406_PRODUCTION_QUAD_PARTY_INTAKE = TEST405_PRODUCTION_QUAD_PARTY_INTAKE;

export const TEST406_PARTY_EMAILS = {
  red: "cryptocurated21+1@gmail.com",
  blue: "cryptocurated21+2@gmail.com",
  harbor: "cryptocurated21+3@gmail.com",
  iron: "cryptocurated21+4@gmail.com",
} as const;

export const TEST406_PARTY_ADDRESSES = {
  red: "12 Sample St., Sample, MS 20934",
  blue: "49 Picture P., Parma, IL 40302",
  harbor: "98 Ute Way, Provo, UT 92828",
  iron: "87 Yahoo Way, Center, CT 10923",
} as const;

export const TEST406_SIGNER_NAMES = ["Joe Doe", "Mary Jay", "Hen Park", "Ira Vale"] as const;
export const TEST406_SIGNER_TITLES = ["CEO", "COO", "CFO", "CTO"] as const;

export function test406Draft(): ParsedDraftShape {
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

/** Simulates finalize UI state: parties 3–4 may have blank legal entity inputs (header abbreviations only). */
export function test406LiveUiWithBlankExtraLegalNames() {
  return {
    partyCount: 4,
    recipient1Name: RED,
    recipient2Name: BLUE,
    recipient1Email: TEST406_PARTY_EMAILS.red,
    recipient2Email: TEST406_PARTY_EMAILS.blue,
    extraPartyReviewEmails: [TEST406_PARTY_EMAILS.harbor, TEST406_PARTY_EMAILS.iron],
    extraPartyLegalNames: ["", ""],
    partySignerNames: [...TEST406_SIGNER_NAMES],
    partySignerTitles: [...TEST406_SIGNER_TITLES],
    partyAddresses: [
      TEST406_PARTY_ADDRESSES.red,
      TEST406_PARTY_ADDRESSES.blue,
      TEST406_PARTY_ADDRESSES.harbor,
      TEST406_PARTY_ADDRESSES.iron,
    ],
  };
}

export function test406PartiesFromFinalizeUi() {
  return buildLivePaidProSignerMetadataAuthority(test406LiveUiWithBlankExtraLegalNames(), "live_ui", {
    intakeText: TEST406_PRODUCTION_QUAD_PARTY_INTAKE,
    draftPartyNames: [RED, BLUE],
  }).parties;
}
