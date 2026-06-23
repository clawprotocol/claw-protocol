import type { ParsedDraftShape } from "./intakeSmartDefaults";

const RED = "Red Mesa Logistics LLC";
const BLUE = "Blue Canyon Analytics LLC";
const HARBOR = "Harbor Peak Automation LLC";
const IRON = "Iron Vale Systems Inc.";

/** Exact production reproduction fixture (TEST416). */
export const TEST416_PRODUCTION_INTAKE = [
  "Red Mesa Logistics LLC and Blue Canyon Analytics LLC are jointly engaging Harbor Peak Automation LLC and Iron Vale Systems Inc. to provide mutual consulting, implementation, automation, analytics, reporting, workflow design, employee training, cybersecurity support, and ongoing operational support for a shared warehouse automation and reporting platform.",
  "The project value is $185,000. Red Mesa and Blue Canyon will pay an initial $75,000 upon execution, with the remaining $110,000 paid in six equal monthly installments.",
  "The parties will cooperate on implementation, data access, software integrations, dashboards, reporting workflows, training materials, confidentiality, intellectual property ownership, third-party software dependencies, cybersecurity safeguards, support obligations, change orders, termination rights, dispute resolution, Oklahoma governing law, notices, and electronic signatures.",
  "Red Mesa Logistics LLC signer: Joe Doe, CEO, joe.redmesa@example.com, 12 Sample St., Sample, MS 20934.",
  "Blue Canyon Analytics LLC signer: Mary Jay, COO, mary.bluecanyon@example.com, 49 Picture P., Parma, IL 40302.",
  "Harbor Peak Automation LLC signer: Hen Park, CFO, hen.harborpeak@example.com, 98 Ute Way, Provo, UT 92828.",
  "Iron Vale Systems Inc. signer: Ira Vale, CTO, ira.ironvale@example.com, 87 Yahoo Way, Center, CT 10923.",
  "Oklahoma law governs. Term is twelve months.",
].join("\n");

export const TEST416_LEGAL_ENTITIES = [RED, BLUE, HARBOR, IRON] as const;

export const TEST416_SIGNER_NAMES = ["Joe Doe", "Mary Jay", "Hen Park", "Ira Vale"] as const;
export const TEST416_SIGNER_TITLES = ["CEO", "COO", "CFO", "CTO"] as const;

export const TEST416_PARTY_EMAILS = {
  red: "joe.redmesa@example.com",
  blue: "mary.bluecanyon@example.com",
  harbor: "hen.harborpeak@example.com",
  iron: "ira.ironvale@example.com",
} as const;

export const TEST416_PARTY_ADDRESSES = {
  red: "12 Sample St., Sample, MS 20934",
  blue: "49 Picture P., Parma, IL 40302",
  harbor: "98 Ute Way, Provo, UT 92828",
  iron: "87 Yahoo Way, Center, CT 10923",
} as const;

export const TEST416_FORBIDDEN_SYNTHETIC_HEADING_PATTERNS = [
  /^\s*\d+\.\s+SECTION\s*$/im,
  /^\s*\d+\s+\d+\.\d+/m,
  /^\s*\d+\.\d+\s+Section\s*$/im,
  /^\s*\d+\.\d+\s+Provisions\s+\d+\.\d+/im,
  /^\s*\d+\.\d+\s+General Provisions\s*$/im,
] as const;

export function test416Draft(): ParsedDraftShape {
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

/** Simulates finalize UI: parties 3–4 legal entity inputs may be blank. */
export function test416LiveUiWithBlankExtraLegalNames() {
  return {
    partyCount: 4,
    recipient1Name: RED,
    recipient2Name: BLUE,
    recipient1Email: TEST416_PARTY_EMAILS.red,
    recipient2Email: TEST416_PARTY_EMAILS.blue,
    extraPartyReviewEmails: [TEST416_PARTY_EMAILS.harbor, TEST416_PARTY_EMAILS.iron],
    extraPartyLegalNames: ["", ""],
    partySignerNames: [...TEST416_SIGNER_NAMES],
    partySignerTitles: [...TEST416_SIGNER_TITLES],
    partyAddresses: [
      TEST416_PARTY_ADDRESSES.red,
      TEST416_PARTY_ADDRESSES.blue,
      TEST416_PARTY_ADDRESSES.harbor,
      TEST416_PARTY_ADDRESSES.iron,
    ],
  };
}

/** Corpus with production-style synthetic section repair artifacts. */
export function buildTest416SyntheticMalformedSectionCorpus(): string {
  return [
    "MUTUAL CONSULTING SERVICES AGREEMENT",
    "",
    "This Mutual Consulting Services Agreement is entered into by and among the Parties.",
    "",
    "3. PAYMENT",
    "",
    "3.1 Initial Payment.",
    "Initial payment due upon execution.",
    "",
    "3.2 General Provisions",
    "",
    "5. SECTION",
    "",
    "5 5.1 Client Ownership. Client owns deliverables.",
    "",
    "5.1 Section",
    "",
    "5.1 Provisions 5.2 Provider Background Materials.",
    "Provider retains background IP.",
    "",
    "5.2 General Provisions",
    "",
    "7. SECTION",
    "",
    "7.1 Section",
    "",
    "7.1 Provisions 7.2 Third-Party Dependencies.",
    "Dependencies may affect delivery.",
    "",
    "10. Termination and Effect of",
    "",
    "10.1 Section",
    "",
    "10.1 Provisions 10.2 Termination for Cause.",
    "Material breach permits termination.",
    "",
    "10.2 General Provisions",
    "",
    "15. Miscellaneous and Notices",
    "",
    "If to Red Mesa Logistics LLC:",
    "Red Mesa Logistics LLC",
    "Attn: Joe Doe, CEO",
    "Email: joe.redmesa@example.com",
    "",
    "IN WITNESS WHEREOF, the Parties execute this Agreement.",
  ].join("\n");
}
