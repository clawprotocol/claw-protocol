import type { ParsedDraftShape } from "./intakeSmartDefaults";
import type { PremiumFullDraftResult } from "./premiumFullDraftApi";
import { expandOperativeCorpusWithUniqueSupplements } from "./paidProSupplementalProvisionsFillerGate";
import {
  TEST519_COLON_ROLE_DASHBOARD_CREATE_INTAKE,
  TEST519_PARTY_ROLES,
  test519Draft,
} from "./paidProTest519Fixtures";
import { buildTest521SubstantiveDegradedDocumentBody } from "./paidProTest521Fixtures";

export const TEST531_TARGET_DOCUMENT_LEN = 10_580;

export const TEST531_INTAKE = TEST519_COLON_ROLE_DASHBOARD_CREATE_INTAKE;

const TEST531_PARTIES = TEST519_PARTY_ROLES.map((p) => p.name);

export function test531Draft(): ParsedDraftShape {
  return test519Draft();
}

/** Substantive ~10.5k server draft missing IN WITNESS WHEREOF — fails freeze with missing_execution_block. */
export function buildTest531SubstantiveMissingExecutionBlockBody(
  targetLen = TEST531_TARGET_DOCUMENT_LEN,
): string {
  let body = buildTest521SubstantiveDegradedDocumentBody(targetLen + 300);
  body = body.replace(/\nIN WITNESS WHEREOF[^\n]*/gi, "");
  body = body.replace(/\n\d+\.\s+Electronic Signatures[^\n]*/gi, "");
  if (body.length < targetLen) {
    body = expandOperativeCorpusWithUniqueSupplements(body, targetLen).slice(0, targetLen);
  } else {
    body = body.slice(0, targetLen);
  }
  return body;
}

/** Thin local recovery candidates observed in production after substantive rejection. */
export function buildTest531ThinLocalRecoveryCandidates(): readonly string[] {
  const base = [
    "CONSULTING SERVICES AGREEMENT",
    "",
    `This Agreement is among ${TEST531_PARTIES.join(", ")}.`,
    "1. Scope. Each party performs assigned services.",
    "2. Payment. Milestone installments apply.",
    "3. Confidentiality. Parties protect confidential information.",
    "4. Governing Law. Delaware law governs.",
  ].join("\n");
  const thin1313 = expandOperativeCorpusWithUniqueSupplements(base, 1_313).slice(0, 1_313);
  const thin2046 = expandOperativeCorpusWithUniqueSupplements(base, 2_046).slice(0, 2_046);
  const thin2382 = expandOperativeCorpusWithUniqueSupplements(base, 2_382).slice(0, 2_382);
  return [thin1313, thin2046, thin2382] as const;
}

/** Production-shaped degraded/json_parse wire with document_text only (no server_full aliases). */
export function buildTest531DegradedJsonParseDocumentTextOnlyWire(
  body = buildTest531SubstantiveMissingExecutionBlockBody(),
): PremiumFullDraftResult {
  return {
    title: "CONSULTING SERVICES AGREEMENT",
    agreement_family: "services_agreement",
    document_text: body,
    server_full_document_text: "",
    generation_outcome: "degraded",
    server_generation_failure_code: "json_parse",
    server_generation_failure_message: "Structured intelligence JSON failed to parse.",
    agreement_validation: {
      passed: false,
      failures: [{ code: "json_parse", message: "Intelligence envelope parse failed.", severity: "low" }],
      warnings: [],
      minimum_contract_elements: {
        identifiable_parties: true,
        agreement_purpose_or_scope: true,
        exchange_of_value_or_consideration: true,
        obligations_or_performance: true,
        execution_or_acceptance_mechanism: true,
      },
      summary: { failure_count: 1, warning_count: 0, checked_at: "2026-01-01T00:00:00Z" },
    },
    key_terms_found: [],
    missing_material_info: [],
  };
}
