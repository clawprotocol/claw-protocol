/**
 * TEST424 — journey-level workflow fixtures (Genesis Dogs production scenarios).
 */

import type { ParsedDraftShape } from "./intakeSmartDefaults";
import { TEST412_THREE_PARTY_INTAKE } from "./paidProTest412Fixtures";
import {
  TEST423_CONSULTING_INTAKE,
  TEST423_CONSULTING_PARTIES,
  TEST423_CONSULTING_SIGNERS,
  TEST423_CONSULTING_TITLES,
  TEST423_CONSULTING_EMAILS,
  TEST423_CONSULTING_ADDRESSES,
  TEST423_IRONCLAD_JV_INTAKE,
  TEST423_JV_PARTIES,
  TEST423_JV_SIGNERS,
  TEST423_JV_EMAILS,
  TEST423_REV_PARTIES,
  TEST423_REV_SIGNERS,
  TEST423_REV_EMAILS,
  TEST423_REV_INTAKE,
  TEST423_TWO_PARTIES,
  TEST423_TWO_INTAKE,
  TEST423_VENDOR_INTAKE,
  TEST423_VENDOR_PARTIES,
  TEST423_VENDOR_SIGNERS,
  TEST423_VENDOR_EMAILS,
  test423ConsultingDraft,
  test423JvDraft,
  test423RevDraft,
  test423TwoPartyDraft,
  test423VendorDraft,
  type Test423Scenario,
} from "./paidProTest423Fixtures";

export type Test424FixtureLabel =
  | "consulting"
  | "vendor"
  | "revenue_share"
  | "multi_provider"
  | "joint_venture"
  | "coordinator_only"
  | "partial_metadata";

export type Test424JourneyScenario = Test423Scenario & {
  fixtureLabel: Test424FixtureLabel;
};

export const TEST424_THREE_PARTIES = [
  "Red Mesa Logistics LLC",
  "Harbor Peak Automation LLC",
  "Blue Canyon Analytics LLC",
] as const;

export const TEST424_THREE_SIGNERS = ["Alice One", "Bob Two", "Carol Three"] as const;
export const TEST424_THREE_EMAILS = [
  "alice@client.example.com",
  "bob@provider.example.com",
  "carol@analytics.example.com",
] as const;

export const TEST424_TWO_PARTY: Test424JourneyScenario = {
  id: "two_party_consulting",
  fixtureLabel: "consulting",
  expectedN: 2,
  intakeText: TEST423_TWO_INTAKE,
  draft: test423TwoPartyDraft(),
  parties: TEST423_TWO_PARTIES,
  signerNames: ["Ian Lake", "Jenna View"],
  signerTitles: ["CEO", "President"],
  emails: ["ian@lakeside.example.com", "jenna@mountainview.example.com"],
  addresses: ["", ""],
};

export const TEST424_THREE_PARTY: Test424JourneyScenario = {
  id: "three_party_multi_provider",
  fixtureLabel: "multi_provider",
  expectedN: 3,
  intakeText: TEST412_THREE_PARTY_INTAKE,
  draft: {
    title: "Tripartite Services Agreement",
    jurisdiction: "Delaware",
    parties: TEST424_THREE_PARTIES.map((name, i) => ({
      name,
      role: `Party ${i + 1}`,
      email: TEST424_THREE_EMAILS[i],
    })) as never,
    purpose: "Shared services and analytics delivery.",
    payment_terms: "$95,000 milestone payments",
    duration: "12 months",
    due_date: null,
    effective_date: null,
    payment: { amount: 95000, cadence: "milestone", valid: true },
  },
  parties: TEST424_THREE_PARTIES,
  signerNames: TEST424_THREE_SIGNERS,
  signerTitles: ["CEO", "COO", "CFO"],
  emails: TEST424_THREE_EMAILS,
  addresses: ["1 Client Way", "", ""],
};

export const TEST424_FOUR_PARTY_VENDOR: Test424JourneyScenario = {
  id: "four_party_vendor",
  fixtureLabel: "vendor",
  expectedN: 4,
  intakeText: TEST423_VENDOR_INTAKE,
  draft: test423VendorDraft(),
  parties: TEST423_VENDOR_PARTIES,
  signerNames: TEST423_VENDOR_SIGNERS,
  signerTitles: ["President", "Managing Partner", "CEO", "Director"],
  emails: TEST423_VENDOR_EMAILS,
  addresses: ["", "", "", ""],
};

export const TEST424_FOUR_PARTY_CONSULTING: Test424JourneyScenario = {
  id: "four_party_consulting",
  fixtureLabel: "consulting",
  expectedN: 4,
  intakeText: TEST423_CONSULTING_INTAKE,
  draft: test423ConsultingDraft(),
  parties: TEST423_CONSULTING_PARTIES,
  signerNames: TEST423_CONSULTING_SIGNERS,
  signerTitles: TEST423_CONSULTING_TITLES,
  emails: TEST423_CONSULTING_EMAILS,
  addresses: TEST423_CONSULTING_ADDRESSES,
};

export const TEST424_FIVE_PARTY_REV: Test424JourneyScenario = {
  id: "five_party_revenue_share",
  fixtureLabel: "revenue_share",
  expectedN: 5,
  intakeText: TEST423_REV_INTAKE,
  draft: test423RevDraft(),
  parties: TEST423_REV_PARTIES,
  signerNames: TEST423_REV_SIGNERS,
  signerTitles: [
    "Authorized Signatory",
    "Authorized Signatory",
    "Authorized Signatory",
    "Authorized Signatory",
    "Authorized Signatory",
  ],
  emails: TEST423_REV_EMAILS,
  addresses: ["", "", "", "", ""],
};

export const TEST424_FIVE_PARTY_JV: Test424JourneyScenario = {
  id: "five_party_joint_venture",
  fixtureLabel: "joint_venture",
  expectedN: 5,
  intakeText: TEST423_IRONCLAD_JV_INTAKE,
  draft: test423JvDraft(),
  parties: TEST423_JV_PARTIES,
  signerNames: TEST423_JV_SIGNERS,
  signerTitles: ["CEO", "CTO", "Managing Partner", "Ops Director", "President"],
  emails: TEST423_JV_EMAILS,
  addresses: ["", "", "", "", ""],
};

export const TEST424_COORDINATOR_FOUR: Test424JourneyScenario = {
  id: "coordinator_four_party",
  fixtureLabel: "coordinator_only",
  expectedN: 4,
  coordinatorOnly: true,
  intakeText: [
    "I'm coordinating this agreement and am not signing as a party.",
    "Coordinator Jane Smith, jane.coordinator@example.com.",
    TEST423_CONSULTING_INTAKE,
  ].join("\n"),
  draft: test423ConsultingDraft(),
  parties: TEST423_CONSULTING_PARTIES,
  signerNames: TEST423_CONSULTING_SIGNERS,
  signerTitles: TEST423_CONSULTING_TITLES,
  emails: TEST423_CONSULTING_EMAILS,
  addresses: TEST423_CONSULTING_ADDRESSES,
};

export const TEST424_COORDINATOR_FIVE: Test424JourneyScenario = {
  id: "coordinator_five_party",
  fixtureLabel: "coordinator_only",
  expectedN: 5,
  coordinatorOnly: true,
  intakeText: [
    "I'm coordinating this agreement and am not signing as a party.",
    "Coordinator Adrian Vale, adrian.coordinator@example.com.",
    TEST423_IRONCLAD_JV_INTAKE,
  ].join("\n"),
  draft: test423JvDraft(),
  parties: TEST423_JV_PARTIES,
  signerNames: TEST423_JV_SIGNERS,
  signerTitles: ["CEO", "CTO", "Managing Partner", "Ops Director", "President"],
  emails: TEST423_JV_EMAILS,
  addresses: ["", "", "", "", ""],
};

export const TEST424_PARTIAL_THREE: Test424JourneyScenario = {
  id: "partial_metadata_three_party",
  fixtureLabel: "partial_metadata",
  expectedN: 3,
  requireNoticeStanzas: false,
  intakeText: [
    `Agreement among ${TEST424_THREE_PARTIES.join(", ")}.`,
    `${TEST424_THREE_PARTIES[0]} signer: ${TEST424_THREE_SIGNERS[0]}, CEO.`,
    `${TEST424_THREE_PARTIES[1]} signer: ${TEST424_THREE_SIGNERS[1]}, COO, ${TEST424_THREE_EMAILS[1]}.`,
    `${TEST424_THREE_PARTIES[2]} signer: ${TEST424_THREE_SIGNERS[2]}, CFO.`,
    "Delaware law. Term twelve months.",
  ].join("\n"),
  draft: TEST424_THREE_PARTY.draft,
  parties: TEST424_THREE_PARTIES,
  signerNames: TEST424_THREE_SIGNERS,
  signerTitles: ["CEO", "COO", "CFO"],
  emails: ["", TEST424_THREE_EMAILS[1], ""],
  addresses: ["", "", ""],
};

export const TEST424_PARTIAL_FIVE: Test424JourneyScenario = {
  id: "partial_metadata_five_party",
  fixtureLabel: "partial_metadata",
  expectedN: 5,
  requireNoticeStanzas: false,
  intakeText: [
    `Agreement among ${TEST423_REV_PARTIES.join(", ")}.`,
    ...TEST423_REV_PARTIES.map((party, i) =>
      i === 1
        ? `${party} signer: ${TEST423_REV_SIGNERS[i]}, Authorized Signatory, ${TEST423_REV_EMAILS[i]}.`
        : `${party} signer: ${TEST423_REV_SIGNERS[i]}, Authorized Signatory.`,
    ),
    "Delaware law. Term twenty-four months.",
  ].join("\n"),
  draft: test423RevDraft(),
  parties: TEST423_REV_PARTIES,
  signerNames: TEST423_REV_SIGNERS,
  signerTitles: [
    "Authorized Signatory",
    "Authorized Signatory",
    "Authorized Signatory",
    "Authorized Signatory",
    "Authorized Signatory",
  ],
  emails: ["", TEST423_REV_EMAILS[1], "", "", ""],
  addresses: ["", "", "", "", ""],
};

/** Journey A — happy path lifecycle per party count. */
export const JOURNEY_A_SCENARIOS: Test424JourneyScenario[] = [
  TEST424_TWO_PARTY,
  TEST424_THREE_PARTY,
  TEST424_FOUR_PARTY_VENDOR,
  TEST424_FIVE_PARTY_REV,
];

/** Journey B — review revision flow. */
export const JOURNEY_B_SCENARIOS: Test424JourneyScenario[] = [
  TEST424_TWO_PARTY,
  TEST424_FOUR_PARTY_CONSULTING,
  TEST424_FIVE_PARTY_JV,
];

/** Journey C — coordinator only. */
export const JOURNEY_C_SCENARIOS: Test424JourneyScenario[] = [
  TEST424_COORDINATOR_FOUR,
  TEST424_COORDINATOR_FIVE,
];

/** Journey D — partial metadata completion. */
export const JOURNEY_D_SCENARIOS: Test424JourneyScenario[] = [
  TEST424_PARTIAL_THREE,
  TEST424_PARTIAL_FIVE,
];

/** Journey E — structural / freeze recovery. */
export const JOURNEY_E_SCENARIOS: Test424JourneyScenario[] = [
  TEST424_TWO_PARTY,
  TEST424_FOUR_PARTY_CONSULTING,
  TEST424_FIVE_PARTY_JV,
];

export function buildMalformedAcceptedCorpus(corpus: string): string {
  let body = corpus;
  body = body.replace(/^\d+\.\s+NOTICES\s*$/gim, "10. COMMUNICATIONS");
  body = body.replace(/^\d+\.\s+Notices\s*$/gim, "10. Communications");
  return body;
}

export function scenarioAuthorityParties(scenario: Test423Scenario) {
  return scenario.parties.map((partyLegalName, partyIndex) => ({
    partyIndex,
    partyLegalName,
    signerEmail: scenario.emails[partyIndex] ?? "",
    signerName: scenario.signerNames[partyIndex] ?? "",
    signerTitle: scenario.signerTitles[partyIndex] ?? "",
    partyAddress: scenario.addresses[partyIndex] ?? "",
  }));
}

export function scenarioToParsedDraft(scenario: Test423Scenario): ParsedDraftShape {
  return scenario.draft;
}
