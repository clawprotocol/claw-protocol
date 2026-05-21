import { describe, expect, it } from "vitest";
import { formatFinalizeReadiness, resolveFinalizeReadiness } from "../finalizeReadinessModel";
import {
  LIGHTHOUSE_APEX_CASUAL_QA_INTAKE,
  LIGHTHOUSE_APEX_LOOSE_QA_INTAKE,
  lighthouseApexMigrationBodyFixture,
  semanticallyIncompleteProBodyFixture,
} from "../qaManualTenPrompts";
import { buildGuidedSessionFromAgreement, getCurrentVariable } from "./guidedCompletionEngine";
import {
  resolveGuidedCompletionRenderState,
  countUnresolvedRenderableVariables,
} from "./resolveGuidedCompletionRenderState";
import { variableHasSelectableAnswerPath } from "./shouldRenderGuidedCompletionPanel";
import { applyProBodyHardIntegrityGate } from "./proBodyHardIntegrityGate";
import { finalizeTaglineForGuidedState, mayShowCompleteAgreementBelowCopy } from "./canRenderGuidedQuestions";

describe("resolveGuidedCompletionRenderState", () => {
  const migrationBody = lighthouseApexMigrationBodyFixture();

  it("canRenderGuidedQuestions is false when panel is not mounted even with renderable session", () => {
    const session = buildGuidedSessionFromAgreement({
      intakeRaw: LIGHTHOUSE_APEX_LOOSE_QA_INTAKE,
      body: migrationBody,
    })!;
    const state = resolveGuidedCompletionRenderState({
      bodyText: migrationBody,
      intakeText: LIGHTHOUSE_APEX_LOOSE_QA_INTAKE,
      guidedSession: session,
      panelMountedSurface: null,
      bodyUsable: true,
      rawReadiness: "needs_details",
    });
    expect(state.sessionHasRenderableQueue).toBe(true);
    expect(state.canRenderGuidedQuestions).toBe(false);
    expect(state.shouldShowNeedsDetails).toBe(false);
    expect(state.shouldShowCompleteAgreementHeading).toBe(false);
    expect(state.shouldShowUseCompleteBelowCopy).toBe(false);
    expect(state.readinessLabel).toBe("ready_to_review");
    expect(state.reason).toBe("guided_panel_not_mounted_on_surface");
  });

  it("canRenderGuidedQuestions is true when panel mounted on document_editor with renderable Q1", () => {
    const session = buildGuidedSessionFromAgreement({
      intakeRaw: LIGHTHOUSE_APEX_CASUAL_QA_INTAKE,
      body: migrationBody,
    })!;
    const state = resolveGuidedCompletionRenderState({
      bodyText: migrationBody,
      intakeText: LIGHTHOUSE_APEX_CASUAL_QA_INTAKE,
      guidedSession: session,
      panelMountedSurface: "document_editor",
      bodyUsable: true,
      rawReadiness: "needs_details",
    });
    expect(state.canRenderGuidedQuestions).toBe(true);
    expect(state.unresolvedRenderableCount).toBeGreaterThan(0);
    expect(state.shouldShowNeedsDetails).toBe(true);
    expect(state.shouldShowCompleteAgreementHeading).toBe(true);
    const current = getCurrentVariable(session)!;
    expect(variableHasSelectableAnswerPath(current)).toBe(true);
  });

  it("casual Lighthouse/Apex intake synthesizes at least one guided question", () => {
    const session = buildGuidedSessionFromAgreement({
      intakeRaw: LIGHTHOUSE_APEX_CASUAL_QA_INTAKE,
      body: migrationBody,
    });
    expect(session).not.toBeNull();
    expect(countUnresolvedRenderableVariables(session)).toBeGreaterThan(0);
  });

  it("finalize copy never claims below when panel not mounted", () => {
    const state = resolveGuidedCompletionRenderState({
      bodyText: migrationBody,
      intakeText: LIGHTHOUSE_APEX_LOOSE_QA_INTAKE,
      panelMountedSurface: null,
      bodyUsable: true,
      rawReadiness: "needs_details",
    });
    expect(mayShowCompleteAgreementBelowCopy(state)).toBe(false);
    const tagline = finalizeTaglineForGuidedState(3, "needs_details", state);
    expect(tagline).not.toMatch(/Tighten the items below/i);
    expect(tagline).toMatch(/Draft ready to review/i);
  });

  it("Needs details pill suppressed when canRenderGuidedQuestions is false", () => {
    const raw = resolveFinalizeReadiness({
      sendMode: "review",
      sendModeTouched: false,
      notOkCount: 4,
      priorityScore: 70,
      lastRefine: { suggested_next_step: "edit", readiness_score: 40 },
      audit: null,
      documentText: migrationBody,
    });
    expect(raw).toBe("needs_details");
    const state = resolveGuidedCompletionRenderState({
      bodyText: migrationBody,
      panelMountedSurface: null,
      bodyUsable: true,
      rawReadiness: raw,
    });
    expect(formatFinalizeReadiness(
      state.canRenderGuidedQuestions ? raw : "ready_for_review",
    )).not.toBe("Needs details");
  });

  it("semantic incomplete body without literal TBD still has renderable queue", () => {
    const body = semanticallyIncompleteProBodyFixture();
    const state = resolveGuidedCompletionRenderState({
      bodyText: body,
      intakeText: "Services maybe $50k",
      panelMountedSurface: "document_editor",
      bodyUsable: true,
    });
    expect(state.sessionHasRenderableQueue).toBe(true);
  });

  it("hard gate fills empty numbered headings on services migration body", () => {
    const bodyWithShells = [
      migrationBody,
      "",
      "2.3 Included Deliverables.",
      "",
      "5.2 Exclusions.",
      "",
      "5.3 Required Disclosure.",
    ].join("\n");
    const out = applyProBodyHardIntegrityGate(bodyWithShells, {
      intakeRaw: LIGHTHOUSE_APEX_CASUAL_QA_INTAKE,
      agreementFamily: "services_agreement",
      surface: "pro",
    });
    expect(out.repairs.some((r) => r.startsWith("empty_heading_filled"))).toBe(true);
    expect(out.text).not.toMatch(/\n2\.3 Included Deliverables\.\s*\n\s*5\./);
  });
});
