import { describe, expect, it } from "vitest";
import { resolveFinalizeReadiness } from "../finalizeReadinessModel";
import { scanDocumentPlaceholderLines } from "../documentPlaceholderScan";
import { buildMaterialMissingItems } from "../proAgreementCompleteness/revisionQuestionEngine";
import {
  semanticallyIncompleteProBodyFixture,
  lighthouseApexMigrationBodyFixture,
  LIGHTHOUSE_APEX_LOOSE_QA_INTAKE,
  LIGHTHOUSE_APEX_MIGRATION_QA_INTAKE,
} from "../qaManualTenPrompts";
import { computeCanRenderGuidedQuestions } from "./canRenderGuidedQuestions";
import { detectIntakePhaseTableGaps } from "./semanticContractCompleteness";
import {
  buildGuidedSessionFromAgreement,
  detectSemanticContractGaps,
  enforceNeedsDetailsGuidedInvariant,
  extractDealVariables,
  hasSemanticMaterialGaps,
  shouldRenderGuidedCompletionPanel,
} from "./index";

describe("semanticContractCompleteness", () => {
  const semanticBody = semanticallyIncompleteProBodyFixture();

  it("detects semantic gaps without literal TBD or INSERT tokens", () => {
    expect(/\bTBD\b/i.test(semanticBody)).toBe(false);
    expect(/\[insert/i.test(semanticBody)).toBe(false);
    const gaps = detectSemanticContractGaps({ body: semanticBody });
    expect(gaps.length).toBeGreaterThan(0);
    expect(gaps.some((g) => g.id === "total_fee_confirmation" || g.id === "supplemental_schedule_confirmation")).toBe(
      true,
    );
    expect(gaps.some((g) => g.kind === "empty_clause" || g.id.startsWith("empty_heading_"))).toBe(true);
    expect(gaps.some((g) => g.kind === "duplicate_contamination")).toBe(true);
  });

  it("buildMaterialMissingItems is non-empty for semantically incomplete body", () => {
    const items = buildMaterialMissingItems({ body: semanticBody, intakeRaw: "Services agreement. Fee maybe $50k." });
    expect(items.length).toBeGreaterThan(0);
  });

  it("extractDealVariables synthesizes guided queue when snapshot materialItems is empty", () => {
    const vars = extractDealVariables({ body: semanticBody, materialItems: [] });
    expect(vars.length).toBeGreaterThan(0);
    const session = buildGuidedSessionFromAgreement({ body: semanticBody, intakeRaw: "Services $50k" });
    expect(session).not.toBeNull();
    expect(session!.queue.length).toBeGreaterThanOrEqual(1);
  });

  it("scanDocumentPlaceholderLines includes semantic flags", () => {
    const lines = scanDocumentPlaceholderLines(semanticBody, 8);
    expect(lines.length).toBeGreaterThan(0);
  });

  it("NEEDS_DETAILS invariant: requires renderable guided queue or downgrades", () => {
    const session = buildGuidedSessionFromAgreement({ body: semanticBody, intakeRaw: "Services agreement" })!;
    const renderable = shouldRenderGuidedCompletionPanel({ bodyUsable: true, session, body: semanticBody });
    expect(renderable).toBe(true);
    expect(session.queue.length).toBeGreaterThanOrEqual(1);

    const raw = resolveFinalizeReadiness({
      sendMode: "review",
      sendModeTouched: false,
      notOkCount: 4,
      priorityScore: 70,
      lastRefine: { suggested_next_step: "edit", readiness_score: 40 },
      audit: null,
      documentText: semanticBody,
    });
    const enforced = enforceNeedsDetailsGuidedInvariant({
      readiness: raw,
      session,
      bodyUsable: true,
    });
    if (raw === "needs_details") {
      expect(enforced.panelRenderable).toBe(true);
      expect(enforced.displayReadiness).toBe("needs_details");
      expect(enforced.showNeedsDetailsMessaging).toBe(true);
    }
  });

  it("NEEDS_DETAILS without session downgrades to ready_for_review", () => {
    const enforced = enforceNeedsDetailsGuidedInvariant({
      readiness: "needs_details",
      session: null,
      bodyUsable: true,
    });
    expect(enforced.displayReadiness).toBe("ready_for_review");
    expect(enforced.showNeedsDetailsMessaging).toBe(false);
  });

  it("detectIntakePhaseTableGaps flags loose pasted table with TBD/???", () => {
    const gaps = detectIntakePhaseTableGaps(LIGHTHOUSE_APEX_LOOSE_QA_INTAKE);
    expect(gaps.some((g) => g.id === "project_fee_phase_confirmation")).toBe(true);
  });

  it("lighthouse body has semantic gaps and renderable guided session", () => {
    const body = lighthouseApexMigrationBodyFixture();
    expect(hasSemanticMaterialGaps(body, LIGHTHOUSE_APEX_MIGRATION_QA_INTAKE)).toBe(true);
    const session = buildGuidedSessionFromAgreement({
      intakeRaw: LIGHTHOUSE_APEX_MIGRATION_QA_INTAKE,
      body,
    });
    expect(session).not.toBeNull();
    expect(
      shouldRenderGuidedCompletionPanel({
        bodyUsable: true,
        session,
        body,
        intakeRaw: LIGHTHOUSE_APEX_MIGRATION_QA_INTAKE,
      }),
    ).toBe(true);
    expect(computeCanRenderGuidedQuestions({ bodyUsable: true, session })).toBe(true);
  });
});
