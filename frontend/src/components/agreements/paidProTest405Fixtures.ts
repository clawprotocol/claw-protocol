import { buildLivePaidProSignerMetadataAuthority } from "./paidProSignerMetadataAuthority";
import type { ParsedDraftShape } from "./intakeSmartDefaults";
import { TEST404_PRODUCTION_QUAD_PARTY_INTAKE } from "./paidProTest404Fixtures";

const RED = "Red Mesa Logistics LLC";
const BLUE = "Blue Canyon Analytics LLC";

export const TEST405_PRODUCTION_QUAD_PARTY_INTAKE = TEST404_PRODUCTION_QUAD_PARTY_INTAKE;

export const TEST405_PARTY_EMAILS = {
  red: "anthemhayek@me.com",
  blue: "cryptocurated21@gmail.com",
  harbor: "cryptocurated22@gmail.com",
  iron: "cryptocurated23@gmail.com",
} as const;

export const TEST405_PARTY_ADDRESSES = {
  red: "456 Sample St., Sample, TX 71234",
  blue: "834 Testing Rd., Test, LA 70129",
  harbor: "639 Rest Rd., Restful, WY 49583",
  iron: "643 Doing Pkwy, Doing, DE 19283",
} as const;

export const TEST405_SIGNER_NAMES = ["Tan Nam", "Ben Ken", "Hen Poe", "Ira Voe"] as const;
export const TEST405_SIGNER_TITLES = ["CEO", "COO", "CTO", "CXO"] as const;

export function test405Draft(): ParsedDraftShape {
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

export function test405Parties() {
  return buildLivePaidProSignerMetadataAuthority(
    {
      partyCount: 4,
      recipient1Name: RED,
      recipient2Name: BLUE,
      recipient1Email: TEST405_PARTY_EMAILS.red,
      recipient2Email: TEST405_PARTY_EMAILS.blue,
      extraPartyReviewEmails: [TEST405_PARTY_EMAILS.harbor, TEST405_PARTY_EMAILS.iron],
      partySignerNames: [...TEST405_SIGNER_NAMES],
      partySignerTitles: [...TEST405_SIGNER_TITLES],
      partyAddresses: [
        TEST405_PARTY_ADDRESSES.red,
        TEST405_PARTY_ADDRESSES.blue,
        TEST405_PARTY_ADDRESSES.harbor,
        TEST405_PARTY_ADDRESSES.iron,
      ],
    },
    "live_ui",
    {
      intakeText: TEST405_PRODUCTION_QUAD_PARTY_INTAKE,
      draftPartyNames: [RED, BLUE],
    },
  ).parties;
}
