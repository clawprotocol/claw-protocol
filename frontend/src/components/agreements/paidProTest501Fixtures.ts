import type { ParsedDraftShape } from "./intakeSmartDefaults";

export const TEST501_RED_MESA = "Red Mesa Logistics LLC";
export const TEST501_HARBOR_PEAK = "Harbor Peak Automation LLC";

export const TEST501_INTAKE = [
  `Draft a Professional Services Agreement between ${TEST501_RED_MESA} (Client) and ${TEST501_HARBOR_PEAK} (Service Provider).`,
  "Total fee: $96,000. Term: 12 months. Governing law: Delaware.",
  "Authorized signers:",
  `* Sarah Mitchell, CEO, ${TEST501_RED_MESA}`,
  `* Michael Torres, President, ${TEST501_HARBOR_PEAK}`,
].join("\n");

export const TEST501_STARTER_PREVIEW =
  "Starter preview between Red Mesa and Harbor Peak. ".repeat(12);

import { buildTwoPartyProfessionalServicesCorpus } from "./paidProSharedFixtureSystem";

export const TEST501_ACCEPTED_PAID_BODY = buildTwoPartyProfessionalServicesCorpus();

export function test501Draft(starterBody: string, paidBody: string): ParsedDraftShape {
  return {
    parties: [
      { name: TEST501_RED_MESA, role: "Client" },
      { name: TEST501_HARBOR_PEAK, role: "Service Provider" },
    ],
    purpose: starterBody,
    premium_server_full_document_text: paidBody,
    premium_full_document_text: paidBody,
    server_full_document_text: starterBody,
  } as unknown as ParsedDraftShape;
}

export const TEST501_RECIPIENT_CANDIDATES = [
  { name: TEST501_RED_MESA, email: "contracts@redmesa.example.com", role: "Client" },
  { name: TEST501_HARBOR_PEAK, email: "legal@harborpeak.example.com", role: "Service Provider" },
];
