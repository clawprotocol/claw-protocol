import { buildLivePaidProSignerMetadataAuthority } from "./paidProSignerMetadataAuthority";
import type { ParsedDraftShape } from "./intakeSmartDefaults";
import { TEST403_PRODUCTION_QUAD_PARTY_INTAKE } from "./paidProTest403Fixtures";

const RED = "Red Mesa Logistics LLC";
const BLUE = "Blue Canyon Analytics LLC";

export const TEST404_PRODUCTION_QUAD_PARTY_INTAKE = TEST403_PRODUCTION_QUAD_PARTY_INTAKE;

export const TEST404_PARTY_EMAILS = {
  red: "legal@redmesa.example",
  blue: "contracts@bluecanyon.example",
  harbor: "notices@harborpeak.example",
  iron: "service@ironvale.example",
} as const;

export const TEST404_PARTY_ADDRESSES = {
  red: "100 Red Mesa Way\nOklahoma City, OK 73101",
  blue: "200 Blue Canyon Blvd\nTulsa, OK 74103",
  harbor: "300 Harbor Peak Dr\nNorman, OK 73069",
  iron: "400 Iron Vale Rd\nEdmond, OK 73034",
} as const;

export function test404Draft(): ParsedDraftShape {
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

export function test404Parties() {
  return buildLivePaidProSignerMetadataAuthority(
    {
      partyCount: 4,
      recipient1Name: RED,
      recipient2Name: BLUE,
      recipient1Email: TEST404_PARTY_EMAILS.red,
      recipient2Email: TEST404_PARTY_EMAILS.blue,
      extraPartyReviewEmails: [TEST404_PARTY_EMAILS.harbor, TEST404_PARTY_EMAILS.iron],
      partySignerNames: ["Jane Red", "John Blue", "Alex Harbor", "Sam Iron"],
      partySignerTitles: ["CEO", "COO", "VP", "President"],
      partyAddresses: [
        TEST404_PARTY_ADDRESSES.red,
        TEST404_PARTY_ADDRESSES.blue,
        TEST404_PARTY_ADDRESSES.harbor,
        TEST404_PARTY_ADDRESSES.iron,
      ],
    },
    "live_ui",
    {
      intakeText: TEST404_PRODUCTION_QUAD_PARTY_INTAKE,
      draftPartyNames: [RED, BLUE],
    },
  ).parties;
}
