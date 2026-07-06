import type { ParsedDraftShape } from "./intakeSmartDefaults";
import type { PremiumFullDraftResult } from "./premiumFullDraftApi";
import { buildNPartyPaidProServerCorpus } from "./paidProNPartyCorpusBuilder";
import { expandOperativeCorpusWithUniqueSupplements } from "./paidProSupplementalProvisionsFillerGate";
import {
  buildTest519MalformedProfessionalServerBody,
  TEST519_COLON_ROLE_DASHBOARD_CREATE_INTAKE,
  TEST519_PARTY_ROLES,
  test519Draft,
} from "./paidProTest519Fixtures";

export const TEST523_TARGET_DOCUMENT_LEN = 10_812;

const TEST523_PARTIES = TEST519_PARTY_ROLES.map((p) => p.name);

export const TEST523_INTAKE = TEST519_COLON_ROLE_DASHBOARD_CREATE_INTAKE;

export function test523Draft(): ParsedDraftShape {
  return test519Draft();
}

function padToTest523Len(body: string): string {
  if (body.length >= TEST523_TARGET_DOCUMENT_LEN) {
    return body.slice(0, TEST523_TARGET_DOCUMENT_LEN);
  }
  return expandOperativeCorpusWithUniqueSupplements(body, TEST523_TARGET_DOCUMENT_LEN).slice(
    0,
    TEST523_TARGET_DOCUMENT_LEN,
  );
}

/** Full server draft with equivalent "Notice Provisions" heading and four operative If-to stanzas. */
export function buildTest523FullServerDocNoticeProvisionsHeading(): string {
  let body = buildNPartyPaidProServerCorpus({
    parties: TEST523_PARTIES,
    intakeText: TEST523_INTAKE,
    draft: test523Draft(),
    title: "Professional Technology Services and AI Implementation Agreement",
    minLen: 9_500,
  });
  body = body.replace(/\n\d+\.\s+NOTICES\b/gi, "\n12. Notice Provisions");
  return padToTest523Len(body);
}

/** Production-class ~10.8k malformed server draft — survives promotion, fails structural/pro freeze. */
export function buildTest523FullServerDocClauseFamilyStructuralDefect(): string {
  const malformed = buildTest519MalformedProfessionalServerBody();
  return expandOperativeCorpusWithUniqueSupplements(malformed, TEST523_TARGET_DOCUMENT_LEN).slice(
    0,
    TEST523_TARGET_DOCUMENT_LEN,
  );
}

/** @deprecated Use buildTest523FullServerDocClauseFamilyStructuralDefect — missing stanzas are repaired at freeze. */
export function buildTest523FullServerDocMissingNoticeStanzas(): string {
  return buildTest523FullServerDocClauseFamilyStructuralDefect();
}

export function buildTest523DegradedJsonParseWire(
  body = buildTest523FullServerDocClauseFamilyStructuralDefect(),
): PremiumFullDraftResult {
  return {
    title: "Professional Technology Services and AI Implementation Agreement",
    agreement_family: "services_agreement",
    document_text: body,
    server_full_document_text: body,
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
