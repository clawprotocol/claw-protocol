import { describe, expect, it } from "vitest";
import { resolveProClarificationRouting } from "./proClarificationRouting";
import { createGuidedCompletionSession } from "./guidedDealCompletion/variablePrioritizationLayer";
import { resolveGuidedCompletionRenderState } from "./guidedDealCompletion/resolveGuidedCompletionRenderState";
import type { AgreementIntelligence, AgreementValidationResult } from "./premiumFullDraftApi";
import { MINIMAL_SERVICES_INTAKE } from "./paidProMinimalServicesAcceptance.test";

function validation(passed: boolean): AgreementValidationResult {
  return {
    passed,
    failures: passed
      ? []
      : [
          {
            code: "empty_required_section",
            message: "Section 3 empty",
            severity: "high",
          },
        ],
    warnings: [],
    minimum_contract_elements: {
      identifiable_parties: true,
      agreement_purpose_or_scope: true,
      exchange_of_value_or_consideration: true,
      obligations_or_performance: true,
      execution_or_acceptance_mechanism: true,
    },
    summary: {
      failure_count: passed ? 0 : 1,
      warning_count: 0,
      checked_at: "2026-05-27T00:00:00.000Z",
    },
  };
}

function intelligence(): AgreementIntelligence {
  return {
    extracted_terms: {
      parties: [
        { name: "Red Mesa Logistics LLC", role: "Client" },
        { name: "Harbor Peak Automation LLC", role: "Service Provider" },
      ],
      party_roles: [
        { party_name: "Red Mesa Logistics LLC", role: "Client" },
        { party_name: "Harbor Peak Automation LLC", role: "Service Provider" },
      ],
      governing_law: "Texas",
      payment_terms: { total_amount: "$5,000" },
    },
    recommended_questions: [],
    ambiguities: [],
    conflicts: [],
    missing_material_terms: [],
    quality_flags: [],
  };
}

describe("Pro validation repair guided UX", () => {
  it("accepted Pro draft with validation_repair_needed does not build a guided session", () => {
    const routing = resolveProClarificationRouting({
      agreementIntelligence: intelligence(),
      agreementValidation: validation(false),
      intakeText: MINIMAL_SERVICES_INTAKE,
    });
    expect(routing.mode).toBe("validation_repair_needed");
    expect(routing.questions).toHaveLength(0);
    const session =
      routing.mode === "material_questions" && routing.questions.length
        ? createGuidedCompletionSession({
            variables: routing.questions,
            agreementFamily: "generic_business_agreement",
            bodyLen: 3200,
          })
        : null;
    expect(session).toBeNull();
    const render = resolveGuidedCompletionRenderState({
      bodyUsable: true,
      bodyText: "x".repeat(3200),
      intakeText: MINIMAL_SERVICES_INTAKE,
      guidedSession:
        session ??
        ({
          variables: [],
          queue: [],
          answered: {},
          skipped: new Set<string>(),
          currentIndex: 0,
          completenessPercent: 0,
          agreementFamily: "generic_business_agreement",
        } as const),
      panelMountedSurface: "document_editor",
      paidProAuthoritativeCorpusReady: true,
    });
    expect(render.sessionHasRenderableQueue).toBe(false);
    expect(render.canRenderGuidedQuestions).toBe(false);
  });
});
