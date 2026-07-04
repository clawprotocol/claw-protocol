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

/** Concise accepted Pro corpus (~1797 chars) — same length class as live freeze hash 1797:1dfac942. */
const TEST504_ACCEPTED_PREFIX =
  `PROFESSIONAL SERVICES AGREEMENT between ${TEST504_RED_MESA} (Client) and ${TEST504_HARBOR_PEAK} (Service Provider). ` +
  "Harbor Peak will evaluate warehouse operations, optimize workflows, automate reporting, and implement dashboard integrations. " +
  "Total fee: $96,000 payable in four installments. Term: 12 months. Governing law: Delaware. " +
  "Include confidentiality, intellectual property, limitation of liability, termination, notice provisions, and signature blocks. ";

const TEST504_ACCEPTED_PAD =
  "Substantive operative clause with Delaware governing law, confidentiality, IP assignment, limitation of liability, termination for cause or convenience, and notice delivery requirements. ";

function buildTest504AcceptedBody(targetLen = 1797): string {
  let body = TEST504_ACCEPTED_PREFIX + TEST504_ACCEPTED_PAD.repeat(2);
  while (body.length < targetLen) body += "x";
  return body.slice(0, targetLen);
}

export const TEST504_ACCEPTED_PAID_BODY = buildTest504AcceptedBody(1797);

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
