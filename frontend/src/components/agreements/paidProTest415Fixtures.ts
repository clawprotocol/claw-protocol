import type { ParsedDraftShape } from "./intakeSmartDefaults";

const RED = "Red Mesa Logistics LLC";
const BLUE = "Blue Canyon Analytics LLC";
const HARBOR = "Harbor Peak Automation LLC";
const IRON = "Iron Vale Systems Inc.";

/** Canonical production reproduction fixture (TEST415). */
export const TEST415_PRODUCTION_INTAKE = [
  "Red Mesa Logistics LLC and Blue Canyon Analytics LLC are jointly engaging Harbor Peak Automation LLC and Iron Vale Systems Inc. to provide mutual consulting, implementation, automation, analytics, reporting, workflow design, employee training, cybersecurity support, and ongoing operational support for a shared warehouse automation and reporting platform.",
  "The project value is $185,000. Red Mesa and Blue Canyon will pay an initial $75,000 upon execution, with the remaining $110,000 paid in six equal monthly installments.",
  "The parties will cooperate on implementation, data access, software integrations, dashboards, reporting workflows, training materials, confidentiality, intellectual property ownership, third-party software dependencies, cybersecurity safeguards, support obligations, change orders, termination rights, dispute resolution, Oklahoma governing law, notices, and electronic signatures.",
  "Red Mesa Logistics LLC signer: Joe Doe, CEO, joe.redmesa@example.com, 12 Sample St., Sample, MS 20934.",
  "Blue Canyon Analytics LLC signer: Mary Jay, COO, mary.bluecanyon@example.com, 49 Picture P., Parma, IL 40302.",
  "Harbor Peak Automation LLC signer: Hen Park, CFO, hen.harborpeak@example.com, 98 Ute Way, Provo, UT 92828.",
  "Iron Vale Systems Inc. signer: Ira Vale, CTO, ira.ironvale@example.com, 87 Yahoo Way, Center, CT 10923.",
  "Oklahoma law governs. Term is twelve months.",
].join("\n");

export const TEST415_LEGAL_ENTITIES = [RED, BLUE, HARBOR, IRON] as const;

export const TEST415_SIGNER_NAMES = ["Joe Doe", "Mary Jay", "Hen Park", "Ira Vale"] as const;
export const TEST415_SIGNER_TITLES = ["CEO", "COO", "CFO", "CTO"] as const;

export const TEST415_PARTY_EMAILS = {
  red: "joe.redmesa@example.com",
  blue: "mary.bluecanyon@example.com",
  harbor: "hen.harborpeak@example.com",
  iron: "ira.ironvale@example.com",
} as const;

export const TEST415_PARTY_ADDRESSES = {
  red: "12 Sample St., Sample, MS 20934",
  blue: "49 Picture P., Parma, IL 40302",
  harbor: "98 Ute Way, Provo, UT 92828",
  iron: "87 Yahoo Way, Center, CT 10923",
} as const;

/** Forbidden as legal-entity authority anywhere in lifecycle. */
export const TEST415_FORBIDDEN_ENTITY_MARKERS = [
  "SHARED WAREHOUSE AUTOMATION",
  "MARY JAY HEN PARK IRA",
  "JOE DOE",
  "MARY JAY",
  "HEN PARK",
  "IRA VALE",
] as const;

export function test415Draft(): ParsedDraftShape {
  return {
    title: "Mutual Consulting Services Agreement",
    jurisdiction: "Oklahoma",
    agreement_family: "consulting_agreement",
    parties: [
      { name: RED, role: "Client" } as never,
      { name: BLUE, role: "Service Provider" } as never,
    ],
    purpose: "Shared warehouse automation and reporting platform.",
    payment_terms: "$185,000; $75,000 initial; remainder monthly over six months",
    duration: "12 months",
    due_date: null,
    effective_date: null,
    payment: { amount: 185000, cadence: "monthly", valid: true },
  };
}

export function test415DraftWithPhantomFifthParty(): ParsedDraftShape {
  return {
    ...test415Draft(),
    parties: [
      { name: RED, role: "Client" } as never,
      { name: BLUE, role: "Service Provider" } as never,
      { name: HARBOR, role: "Party 3" } as never,
      { name: IRON, role: "Party 4" } as never,
      { name: "Coordinator Contact", role: "Coordinator" } as never,
    ],
  };
}

/** Signer-setup UI state: parties 3–4 legal entity inputs blank (production finalize pattern). */
export function test415LiveUiBlankExtraLegalNames() {
  return {
    partyCount: 4,
    recipient1Name: RED,
    recipient2Name: BLUE,
    recipient1Email: TEST415_PARTY_EMAILS.red,
    recipient2Email: TEST415_PARTY_EMAILS.blue,
    extraPartyReviewEmails: [TEST415_PARTY_EMAILS.harbor, TEST415_PARTY_EMAILS.iron],
    extraPartyLegalNames: ["", ""],
    partySignerNames: [...TEST415_SIGNER_NAMES],
    partySignerTitles: [...TEST415_SIGNER_TITLES],
    partyAddresses: [
      TEST415_PARTY_ADDRESSES.red,
      TEST415_PARTY_ADDRESSES.blue,
      TEST415_PARTY_ADDRESSES.harbor,
      TEST415_PARTY_ADDRESSES.iron,
    ],
  };
}
