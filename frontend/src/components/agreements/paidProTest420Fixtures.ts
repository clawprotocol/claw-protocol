import type { ParsedDraftShape } from "./intakeSmartDefaults";
import { buildDeterministicQuadPartyMutualServicesProFallback } from "./deterministicQuadPartyProFallback";
import { buildTest418HierarchyBreakCorpus } from "./paidProTest418Fixtures";

export const TEST420_RED = "Red Mesa Logistics LLC";
export const TEST420_BLUE = "Blue Canyon Analytics LLC";
export const TEST420_HARBOR = "Harbor Peak Automation LLC";
export const TEST420_IRON = "Iron Vale Systems Inc.";

export const TEST420_PARTY_EMAILS = {
  red: "joe.redmesa@example.com",
  blue: "mary.bluecanyon@example.com",
  harbor: "hen.harborpeak@example.com",
  iron: "ira.ironvale@example.com",
} as const;

/** Production prose intake from TEST420 repro (4-party Mutual Consulting, $185k, Oklahoma). */
export const TEST420_PRODUCTION_INTAKE = [
  `${TEST420_RED} and ${TEST420_BLUE} are jointly engaging ${TEST420_HARBOR} and ${TEST420_IRON} to provide mutual consulting, implementation, automation, analytics, reporting, workflow design, employee training, cybersecurity support, and ongoing operational support for a shared warehouse automation and reporting platform.`,
  "",
  "The project value is $185,000. Red Mesa and Blue Canyon will pay an initial $75,000 upon execution, with the remaining $110,000 paid in six equal monthly installments.",
  "",
  "The parties will cooperate on implementation, data access, software integrations, dashboards, reporting workflows, training materials, confidentiality, intellectual property ownership, third-party software dependencies, cybersecurity safeguards, support obligations, change orders, termination rights, dispute resolution, Oklahoma governing law, notices, and electronic signatures.",
  "",
  `${TEST420_RED} signer: Joe Doe, CEO, ${TEST420_PARTY_EMAILS.red}, 12 Sample St., Sample, MS 20934.`,
  `${TEST420_BLUE} signer: Mary Jay, COO, ${TEST420_PARTY_EMAILS.blue}, 49 Picture Pl., Parma, IL 40302.`,
  `${TEST420_HARBOR} signer: Hen Park, CFO, ${TEST420_PARTY_EMAILS.harbor}, 98 Ute Way, Provo, UT 92828.`,
  `${TEST420_IRON} signer: Ira Vale, CTO, ${TEST420_PARTY_EMAILS.iron}, 87 Yahoo Way, Center, CT 10923.`,
  "",
  "Oklahoma law governs. Term is twelve months.",
].join("\n");

export function test420Draft(): ParsedDraftShape {
  return {
    title: "Mutual Consulting Services Agreement",
    jurisdiction: "Oklahoma",
    agreement_family: "consulting_agreement",
    parties: [
      { name: TEST420_RED, role: "Party 1", email: TEST420_PARTY_EMAILS.red } as never,
      { name: TEST420_BLUE, role: "Party 2", email: TEST420_PARTY_EMAILS.blue } as never,
      { name: TEST420_HARBOR, role: "Party 3", email: TEST420_PARTY_EMAILS.harbor } as never,
      { name: TEST420_IRON, role: "Party 4", email: TEST420_PARTY_EMAILS.iron } as never,
    ],
    purpose: "Mutual consulting, automation, analytics, and reporting platform support.",
    payment_terms: "$185,000 with $75,000 initial payment",
    duration: "12 months",
    due_date: null,
    effective_date: null,
    payment: { amount: 185000, cadence: "monthly", valid: true },
  };
}

/** Large server draft that passes lightweight checks but fails unified freeze candidate gates. */
export function buildTest420MalformedServerDraft(): string {
  const fallback = buildDeterministicQuadPartyMutualServicesProFallback({
    rawIntake: TEST420_PRODUCTION_INTAKE,
    draft: test420Draft(),
  });
  if (!fallback.ok) return "";
  let body = fallback.body;
  body = body.replace(/^\d+\.\s+NOTICES\s*$/gim, "10. COMMUNICATIONS");
  body = body.replace(/^\d+\.\s+Notices\s*$/gim, "10. Communications");
  return body;
}

/** Non-fixture variant: short hierarchy-break corpus (no recovery substitution). */
export function buildTest420HierarchyBreakVariant(): string {
  return buildTest418HierarchyBreakCorpus();
}
