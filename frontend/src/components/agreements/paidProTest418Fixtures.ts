import type { ParsedDraftShape } from "./intakeSmartDefaults";

export const TEST418_RED = "Red Mesa Logistics LLC";
export const TEST418_BLUE = "Blue Canyon Analytics LLC";
export const TEST418_HARBOR = "Harbor Peak Automation LLC";
export const TEST418_IRON = "Iron Vale Systems Inc.";

export const TEST418_PARTY_EMAILS = {
  red: "joe.redmesa@example.com",
  blue: "mary.bluecanyon@example.com",
  harbor: "hen.harborpeak@example.com",
  iron: "ira.ironvale@example.com",
} as const;

export const TEST418_PARTY_ADDRESSES = {
  red: "12 Sample St., Sample, MS 20934",
  blue: "49 Picture P., Parma, IL 40302",
  harbor: "98 Ute Way, Provo, UT 92828",
  iron: "87 Yahoo Way, Center, CT 10923",
} as const;

export const TEST418_SIGNER_NAMES = ["Joe Doe", "Mary Jay", "Hen Park", "Ira Vale"] as const;
export const TEST418_SIGNER_TITLES = ["CEO", "COO", "CFO", "CTO"] as const;

/** Live 4-party Mutual Consulting intake (example.com emails from production repro). */
export const TEST418_MUTUAL_CONSULTING_INTAKE = [
  "Create a MUTUAL CONSULTING SERVICES AGREEMENT among four parties.",
  "",
  "Party 1",
  `Legal Entity: ${TEST418_RED}`,
  `Signer Name: ${TEST418_SIGNER_NAMES[0]}`,
  `Signer Title: ${TEST418_SIGNER_TITLES[0]}`,
  `Signer Email: ${TEST418_PARTY_EMAILS.red}`,
  `Address: ${TEST418_PARTY_ADDRESSES.red}`,
  "",
  "Party 2",
  `Legal Entity: ${TEST418_BLUE}`,
  `Signer Name: ${TEST418_SIGNER_NAMES[1]}`,
  `Signer Title: ${TEST418_SIGNER_TITLES[1]}`,
  `Signer Email: ${TEST418_PARTY_EMAILS.blue}`,
  `Address: ${TEST418_PARTY_ADDRESSES.blue}`,
  "",
  "Party 3",
  `Legal Entity: ${TEST418_HARBOR}`,
  `Signer Name: ${TEST418_SIGNER_NAMES[2]}`,
  `Signer Title: ${TEST418_SIGNER_TITLES[2]}`,
  `Signer Email: ${TEST418_PARTY_EMAILS.harbor}`,
  `Address: ${TEST418_PARTY_ADDRESSES.harbor}`,
  "",
  "Party 4",
  `Legal Entity: ${TEST418_IRON}`,
  `Signer Name: ${TEST418_SIGNER_NAMES[3]}`,
  `Signer Title: ${TEST418_SIGNER_TITLES[3]}`,
  `Signer Email: ${TEST418_PARTY_EMAILS.iron}`,
  `Address: ${TEST418_PARTY_ADDRESSES.iron}`,
  "",
  "Oklahoma law governs. Term is twelve months. Provider fees among the parties.",
].join("\n");

export function test418Draft(): ParsedDraftShape {
  return {
    title: "Mutual Consulting Services Agreement",
    jurisdiction: "Oklahoma",
    agreement_family: "consulting_agreement",
    parties: [
      { name: TEST418_RED, role: "Party 1", email: TEST418_PARTY_EMAILS.red } as never,
      { name: TEST418_BLUE, role: "Party 2", email: TEST418_PARTY_EMAILS.blue } as never,
      { name: TEST418_HARBOR, role: "Party 3", email: TEST418_PARTY_EMAILS.harbor } as never,
      { name: TEST418_IRON, role: "Party 4", email: TEST418_PARTY_EMAILS.iron } as never,
    ],
    purpose: "Mutual consulting, implementation, analytics, and reporting.",
    payment_terms: "Provider fees",
    duration: "12 months",
    due_date: null,
    effective_date: null,
    payment: { amount: null, cadence: null, valid: false },
  };
}

const WITNESS = "IN WITNESS WHEREOF, the Parties execute this Agreement.";

/** Production-style hierarchy break that previously passed acceptance then failed SoT freeze. */
export function buildTest418HierarchyBreakCorpus(): string {
  return [
    "MUTUAL CONSULTING SERVICES AGREEMENT",
    "",
    "This Mutual Consulting Services Agreement is entered into by and among the Parties.",
    "",
    "1. Collaboration Framework and Services",
    "",
    "1.1 Shared Purpose.",
    "The Parties will collaborate in good faith.",
    "",
    "5. REPRESENTATIONS AND WARRANTIES",
    "",
    "5.7 Equitable Relief.",
    "Each Party acknowledges that breach may cause irreparable harm. Representations, Warranties and Service Conditions 6.1 Mutual Authority and Non-Conflict. Each party represents that it has authority to enter this Agreement.",
    "",
    "6.2 Service Warranty",
    "Each Party warrants that services will be performed in a professional manner consistent with industry standards.",
    "",
    "6.3 No Guarantee of Business Results",
    "No Party guarantees specific business outcomes.",
    "",
    "10. Notices",
    "Notices must be in writing and delivered as described below.",
    "",
    "11. Miscellaneous",
    "",
    "11.4 Counterparts and Electronic Signatures.",
    "The Parties may execute using electronic signatures.",
    "",
    WITNESS,
  ].join("\n\n");
}
