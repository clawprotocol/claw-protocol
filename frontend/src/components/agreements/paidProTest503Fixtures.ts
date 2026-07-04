import type { ParsedDraftShape } from "./intakeSmartDefaults";

export const TEST503_RED_MESA = "Red Mesa Logistics LLC";
export const TEST503_HARBOR_PEAK = "Harbor Peak Automation LLC";

/** Exact TEST503 QA prompt — Red Mesa / Harbor Peak PSA with installment fee + signers. */
export const TEST503_INTAKE = [
  `Draft a Professional Services Agreement between ${TEST503_RED_MESA} (Client) and ${TEST503_HARBOR_PEAK} (Service Provider).`,
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
  `* Sarah Mitchell, CEO, ${TEST503_RED_MESA}`,
  `* Michael Torres, President, ${TEST503_HARBOR_PEAK}`,
].join("\n");

export const TEST503_STARTER_PREVIEW =
  "Starter five-section preview for Red Mesa and Harbor Peak. ".repeat(10);

export const TEST503_ACCEPTED_PAID_BODY = `PROFESSIONAL SERVICES AGREEMENT between ${TEST503_RED_MESA} and ${TEST503_HARBOR_PEAK}. ${"Delaware governing law, confidentiality, IP, limitation of liability, termination, notice, and signature blocks with substantive operative detail. ".repeat(88)}`;

export function test503Draft(starterBody: string, paidBody: string): ParsedDraftShape {
  return {
    parties: [
      { name: TEST503_RED_MESA, role: "Client" },
      { name: TEST503_HARBOR_PEAK, role: "Service Provider" },
    ],
    purpose: starterBody,
    premium_server_full_document_text: paidBody,
    premium_full_document_text: paidBody,
    server_full_document_text: starterBody,
  } as unknown as ParsedDraftShape;
}

export const TEST503_RECIPIENT_CANDIDATES = [
  { name: TEST503_RED_MESA, email: "contracts@redmesa.example.com", role: "Client" },
  { name: TEST503_HARBOR_PEAK, email: "legal@harborpeak.example.com", role: "Service Provider" },
];
