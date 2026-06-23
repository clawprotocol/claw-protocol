import { buildTest401MalformedServerDraft } from "./paidProTest401MalformedQuadPartyExecutionBlockRecovery.test";
import type { ParsedDraftShape } from "./intakeSmartDefaults";

const RED = "Red Mesa Logistics LLC";
const BLUE = "Blue Canyon Analytics LLC";
const HARBOR = "Harbor Peak Automation LLC";
const IRON = "Iron Vale Systems Inc.";

/** Production QA — mutual consulting quad-party intake from TEST413 production run. */
export const TEST413_PRODUCTION_QUAD_PARTY_INTAKE = [
  "We need a mutual consulting and implementation agreement among Red Mesa Logistics LLC,",
  "Blue Canyon Analytics LLC, Harbor Peak Automation LLC, and Iron Vale Systems Inc.",
  "The agreement should cover professional services, implementation support, data access,",
  "software integration, dashboards, reporting workflows, training materials, confidentiality,",
  "intellectual property ownership, cybersecurity obligations, support commitments, termination,",
  "dispute resolution, and electronic signatures.",
  "",
  "Red Mesa Logistics LLC signer: Joe Doe, CEO, joe.redmesa@example.com, 12 Sample St., Sample, MS 20934.",
  "Blue Canyon Analytics LLC signer: Mary Jay, COO, mary.bluecanyon@example.com, 49 Picture P., Parma, IL 40302.",
  "Harbor Peak Automation LLC signer: Hen Park, CFO, hen.harborpeak@example.com, 98 Ute Way, Provo, UT 92828.",
  "Iron Vale Systems Inc. signer: Ira Vale, CTO, ira.ironvale@example.com, 87 Yahoo Way, Center, CT 10923.",
  "",
  "Oklahoma law governs. Term is twelve months.",
].join("\n");

export const TEST413_LEGAL_ENTITIES = [RED, BLUE, HARBOR, IRON] as const;

/** Server draft may inflate party rows — authority must stay at 4. */
export function test413DraftWithPhantomFifthParty(): ParsedDraftShape {
  return {
    title: "Mutual Consulting Services Agreement",
    jurisdiction: "Oklahoma",
    agreement_family: "consulting_agreement",
    parties: [
      { name: RED, role: "Client" } as never,
      { name: BLUE, role: "Service Provider" } as never,
      { name: HARBOR, role: "Party 3" } as never,
      { name: IRON, role: "Party 4" } as never,
      { name: "Coordinator Contact", role: "Coordinator" } as never,
    ],
    purpose: "Mutual consulting and implementation services.",
    payment_terms: "$185,000",
    duration: "12 months",
    due_date: null,
    effective_date: null,
    payment: { amount: 185000, cadence: "monthly", valid: true },
  };
}

export function test413Draft(): ParsedDraftShape {
  return {
    title: "Mutual Consulting Services Agreement",
    jurisdiction: "Oklahoma",
    agreement_family: "consulting_agreement",
    parties: [
      { name: RED, role: "Client" } as never,
      { name: BLUE, role: "Service Provider" } as never,
    ],
    purpose: "Mutual consulting and implementation services.",
    payment_terms: "$185,000",
    duration: "12 months",
    due_date: null,
    effective_date: null,
    payment: { amount: 185000, cadence: "monthly", valid: true },
  };
}

export function buildTest413ServerFullDraft(minLen = 20_000): string {
  let body = buildTest401MalformedServerDraft();
  for (const name of TEST413_LEGAL_ENTITIES) {
    const esc = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    body = body.replace(new RegExp(`If to ${esc}: ${esc}`, "g"), `If to ${name}:\n${name}`);
  }
  body = body.replace(
    "MUTUAL SERVICES AGREEMENT",
    "MUTUAL CONSULTING SERVICES AGREEMENT",
  );
  if (body.length >= minLen) return body;
  const witnessIdx = body.search(/\bIN WITNESS WHEREOF\b/i);
  const insertAt = witnessIdx >= 0 ? witnessIdx : body.length;
  let pad = "";
  let i = 0;
  while (body.length + pad.length < minLen) {
    pad += `13.${i + 1} Supplemental clause ${i + 1}. Each party will continue cooperating in good faith.\n\n`;
    i += 1;
  }
  return `${body.slice(0, insertAt)}${pad}${body.slice(insertAt)}`;
}
