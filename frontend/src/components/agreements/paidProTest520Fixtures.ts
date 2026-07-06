import type { ParsedDraftShape } from "./intakeSmartDefaults";
import type { PremiumFullDraftResult } from "./premiumFullDraftApi";
import {
  TEST519_COLON_ROLE_DASHBOARD_CREATE_INTAKE,
  TEST519_PARTY_ROLES,
  test519Draft,
} from "./paidProTest519Fixtures";

const TEST520_GOOD_FAITH_CLAUSE =
  "The parties shall perform their obligations in good faith and in accordance with this agreement";

export const TEST520_TARGET_DOCUMENT_LEN = 10_775;

export const TEST520_INTAKE = TEST519_COLON_ROLE_DASHBOARD_CREATE_INTAKE;

export function test520Draft(): ParsedDraftShape {
  return test519Draft();
}

/**
 * Production-class degraded/json_parse wire: substantive document_text only, no server_full.
 * Includes repeated good-faith operative language that must not trigger degraded_filler rejection.
 */
export function buildTest520SubstantiveDegradedDocumentBody(targetLen = TEST520_TARGET_DOCUMENT_LEN): string {
  const parties = TEST519_PARTY_ROLES.map((p) => p.name);
  const header = [
    "PROFESSIONAL TECHNOLOGY SERVICES AND AI IMPLEMENTATION AGREEMENT",
    "",
    `This Agreement is entered into among ${parties.join(", ")}, collectively the "Parties."`,
    "",
    "1. Scope of Services. Each provider shall perform the services described in the intake and project plan.",
    "2. Payment. Client shall pay the total project fee of $450,000 in milestone installments.",
    "3. Intellectual Property. Work product and model ownership terms apply as stated herein.",
    "4. Confidentiality. Each party shall protect confidential information.",
    "5. Data Privacy. Parties shall comply with applicable privacy and security obligations.",
    "6. Insurance. Each provider shall maintain commercially reasonable insurance coverage.",
    "7. Term and Termination. The term is eighteen months with ninety days of post-launch support.",
    "8. Governing Law. This Agreement is governed by the laws of the State of Delaware.",
    "9. Electronic Signatures. The parties agree that electronic signatures are valid and binding.",
    "",
    "IN WITNESS WHEREOF, the Parties execute this Agreement.",
  ].join("\n");
  let body = header;
  let i = 10;
  while (body.length < targetLen) {
    body += `\n${i}. Supplemental Provision. ${TEST520_GOOD_FAITH_CLAUSE} in connection with section ${i}.`;
    i += 1;
  }
  return body.slice(0, targetLen);
}

export function buildTest520DegradedJsonParseDocumentTextOnlyWire(): PremiumFullDraftResult {
  const valid = buildTest520SubstantiveDegradedDocumentBody();
  return {
    title: "Professional Technology Services and AI Implementation Agreement",
    agreement_family: "services_agreement",
    document_text: valid,
    server_full_document_text: "",
    generation_outcome: "degraded",
    server_generation_failure_code: "json_parse",
    server_generation_failure_message: "Structured intelligence JSON failed to parse.",
    agreement_validation: {
      passed: true,
      failures: [],
      warnings: [],
      minimum_contract_elements: {
        identifiable_parties: true,
        agreement_purpose_or_scope: true,
        exchange_of_value_or_consideration: true,
        obligations_or_performance: true,
        execution_or_acceptance_mechanism: true,
      },
      summary: { failure_count: 0, warning_count: 0, checked_at: "2026-01-01T00:00:00Z" },
    },
    key_terms_found: [],
    missing_material_info: [],
  };
}
