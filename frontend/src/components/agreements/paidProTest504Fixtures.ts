import type { ParsedDraftShape } from "./intakeSmartDefaults";
import { paidProPipelineAcceptedCorpusHash } from "./paidProPipelineAcceptedCorpus";

export const TEST504_RED_MESA = "Red Mesa Logistics LLC";
export const TEST504_HARBOR_PEAK = "Harbor Peak Automation LLC";

/** Live QA prompt — Red Mesa / Harbor Peak PSA (TEST504). */
export const TEST504_INTAKE = [
  `Draft a Professional Services Agreement between ${TEST504_RED_MESA} (Client) and ${TEST504_HARBOR_PEAK} (Service Provider).`,
  "",
  "Harbor Peak will evaluate Red Mesa's warehouse operations, optimize inventory workflows, automate reporting, and implement dashboard integrations.",
  "",
  "Total fee: $96,000, payable as:",
  "* $24,000 on execution",
  "* $24,000 after assessment",
  "* $24,000 after implementation",
  "* $24,000 after final acceptance",
  "",
  "Term: 12 months.",
  "",
  "Include confidentiality, intellectual property, limitation of liability, termination for cause or convenience, governing law (Delaware), notice provisions, and standard signature blocks.",
  "",
  "Authorized signers:",
  `* Sarah Mitchell, CEO, ${TEST504_RED_MESA}`,
  `* Michael Torres, President, ${TEST504_HARBOR_PEAK}`,
].join("\n");

export const TEST504_STARTER_PREVIEW =
  "Starter five-section preview for Red Mesa and Harbor Peak. ".repeat(10);

/** Concise accepted Pro corpus — substantive professional clause coverage for Red Mesa intake. */
const TEST504_ACCEPTED_PREFIX =
  `PROFESSIONAL SERVICES AGREEMENT between ${TEST504_RED_MESA} (Client) and ${TEST504_HARBOR_PEAK} (Service Provider). ` +
  "Harbor Peak will evaluate warehouse operations, optimize workflows, automate reporting, and implement dashboard integrations. " +
  "Total fee: $96,000 payable in four installments. Term: 12 months. ";

const TEST504_ACCEPTED_OPERATIVE_SECTIONS = [
  "1. CONFIDENTIALITY. Each party shall hold the other party's Confidential Information in strict confidence and use it only for performing under this Agreement.",
  "2. INTELLECTUAL PROPERTY. Service Provider assigns to Client all right, title, and interest in work product, deliverables, and inventions arising from the services.",
  "3. LIMITATION OF LIABILITY. Neither party shall be liable for indirect, incidental, special, or consequential damages. Aggregate liability is capped at fees paid under this Agreement.",
  "4. TERMINATION. Either party may terminate for cause upon uncured material breach or for convenience upon thirty (30) days' written notice.",
  "5. GOVERNING LAW. This Agreement is governed by the laws of the State of Delaware without regard to conflict of laws principles.",
  "6. NOTICES. All notices must be in writing and delivered to the notice addresses designated below with confirmation of receipt.",
  "IN WITNESS WHEREOF, the parties execute this Agreement by their authorized signers.",
  `CLIENT:\n${TEST504_RED_MESA}\nBy: ____________________\nName:\nTitle:\nDate:\n\nSERVICE PROVIDER:\n${TEST504_HARBOR_PEAK}\nBy: ____________________\nName:\nTitle:\nDate:`,
].join("\n\n");

const TEST504_ACCEPTED_PAD =
  "Substantive operative clause with Delaware governing law, confidentiality, IP assignment, limitation of liability, termination for cause or convenience, and notice delivery requirements.";

function buildTest504AcceptedBody(targetLen = 2600): string {
  let body = `${TEST504_ACCEPTED_PREFIX.trim()}\n\n${TEST504_ACCEPTED_OPERATIVE_SECTIONS}`;
  while (body.length < targetLen) body += `\n\n${TEST504_ACCEPTED_PAD}`;
  return body.trim();
}

export const TEST504_ACCEPTED_PAID_BODY = buildTest504AcceptedBody(2600);

/** Thin starter-style body (~1798 chars) missing substantive professional clauses — must not pass Pro gate. */
export const TEST504_THIN_STARTER_STYLE_BODY = (() => {
  const thinPrefix =
    `SERVICES AGREEMENT between * Sarah Mitchell, CEO, ${TEST504_RED_MESA} ('Client') and * Michael Torres, President, ${TEST504_HARBOR_PEAK} ('Service Provider'). ` +
    "Fees, reporting, term, notices, governing law Delaware. ";
  let body = thinPrefix + TEST504_ACCEPTED_PAD.repeat(2);
  while (body.length < 1798) body += "x";
  return body.slice(0, 1798);
})();

/** Fingerprint recorded when pipeline accepts TEST504 corpus. */
export const TEST504_PREPARED_FREEZE_CANDIDATE_HASH =
  paidProPipelineAcceptedCorpusHash(TEST504_ACCEPTED_PAID_BODY) ?? "";

/** Live production freeze hash reference from TEST504 QA session. */
export const TEST504_LIVE_FREEZE_HASH_REFERENCE = "1797:1dfac942";

export function test504Draft(starterBody: string, paidBody: string): ParsedDraftShape {
  return {
    parties: [
      { name: TEST504_RED_MESA, role: "Client" },
      { name: TEST504_HARBOR_PEAK, role: "Service Provider" },
    ],
    purpose: starterBody,
    premium_server_full_document_text: paidBody,
    premium_full_document_text: paidBody,
    server_full_document_text: starterBody,
  } as unknown as ParsedDraftShape;
}

export const TEST504_RECIPIENT_CANDIDATES = [
  { name: TEST504_RED_MESA, email: "contracts@redmesa.example.com", role: "Client" },
  { name: TEST504_HARBOR_PEAK, email: "legal@harborpeak.example.com", role: "Service Provider" },
];
