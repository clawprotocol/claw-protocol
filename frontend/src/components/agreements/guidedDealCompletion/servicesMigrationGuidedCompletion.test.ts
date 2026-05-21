import { describe, expect, it } from "vitest";
import { resolveFinalizeReadiness } from "../finalizeReadinessModel";
import { buildMaterialMissingItems } from "../proAgreementCompleteness/revisionQuestionEngine";
import {
  LIGHTHOUSE_APEX_LOOSE_QA_INTAKE,
  LIGHTHOUSE_APEX_MIGRATION_QA_INTAKE,
  lighthouseApexMigrationBodyFixture,
} from "../qaManualTenPrompts";
import { computeCanRenderGuidedQuestions } from "./canRenderGuidedQuestions";
import { applyProBodyHardIntegrityGate } from "./proBodyHardIntegrityGate";
import {
  bodyHasLoosePhaseScheduleBeforeSignatures,
  buildGuidedSessionFromAgreement,
  enforceNeedsDetailsGuidedInvariant,
  extractDealVariables,
  getCurrentVariable,
  resolveDisplayReadinessWithGuidedInvariant,
  scanBodyMaterialPlaceholders,
  shouldRenderGuidedCompletionPanel,
  shouldShowGuidedNeedsDetailsMessaging,
  variableHasSelectableAnswerPath,
} from "./index";

describe("servicesMigrationGuidedCompletion", () => {
  const body = lighthouseApexMigrationBodyFixture();
  const intake = LIGHTHOUSE_APEX_MIGRATION_QA_INTAKE;
  const gateCtx = { intakeRaw: intake, agreementFamily: "services_agreement" as const, surface: "pro" };

  it("detects supplemental schedule and empty headings as material placeholders", () => {
    const hits = scanBodyMaterialPlaceholders(body);
    const ids = hits.map((h) => h.id);
    expect(ids).toContain("supplemental_schedule_confirmation");
    expect(ids).toContain("amount_to_be_confirmed");
    expect(ids).toContain("payment_timing_to_be_confirmed");
    expect(hits.some((h) => h.id.startsWith("empty_heading_"))).toBe(true);
  });

  it("buildMaterialMissingItems includes phase, fee, support, security, IP, renewal, governing law", () => {
    const items = buildMaterialMissingItems({ intakeRaw: intake, body });
    const ids = items.map((i) => i.id);
    expect(ids).toContain("total_fee_confirmation");
    expect(ids).toContain("phase_payment_allocation");
    expect(ids.some((id) => id === "saas_sla" || id === "support_obligations")).toBe(true);
    expect(ids.some((id) => id === "security_obligations" || id === "ip_ownership" || id === "ip_allocation")).toBe(
      true,
    );
    expect(ids.some((id) => id === "renewal_notice" || id === "governing_venue" || id === "governing_law_notice")).toBe(
      true,
    );
  });

  it("builds renderable guided session with actionable first question", () => {
    const session = buildGuidedSessionFromAgreement({ intakeRaw: intake, body });
    expect(session).not.toBeNull();
    expect(session!.queue.length).toBeGreaterThan(0);
    const current = getCurrentVariable(session!)!;
    expect(variableHasSelectableAnswerPath(current)).toBe(true);
    expect(
      shouldRenderGuidedCompletionPanel({
        bodyUsable: true,
        session,
        intakeRaw: intake,
        body,
      }),
    ).toBe(true);
  });

  it("guided needs-details invariant: showNeedsDetails implies renderable panel", () => {
    const session = buildGuidedSessionFromAgreement({ intakeRaw: intake, body })!;
    const renderable = shouldRenderGuidedCompletionPanel({ bodyUsable: true, session, body, intakeRaw: intake });
    const rawReadiness = resolveFinalizeReadiness({
      sendMode: "review",
      sendModeTouched: false,
      notOkCount: 4,
      priorityScore: 70,
      lastRefine: { suggested_next_step: "edit", readiness_score: 40 },
      audit: {
        deal_specific_missing_terms: [],
        placeholder_terms_found: ["Unresolved: supplemental schedule confirmation still appears"],
        resolved_strengths: [],
        best_next_step: "edit",
        confidence: "low",
      },
      documentText: body,
    });
    expect(rawReadiness).toBe("needs_details");
    const display = resolveDisplayReadinessWithGuidedInvariant(rawReadiness, renderable);
    if (shouldShowGuidedNeedsDetailsMessaging(renderable)) {
      expect(renderable).toBe(true);
      expect(getCurrentVariable(session)).not.toBeNull();
    } else {
      expect(display).not.toBe("needs_details");
    }
  });

  it("does not show needs-details messaging when panel is not renderable", () => {
    const emptySession = buildGuidedSessionFromAgreement({ intakeRaw: intake, body, materialItems: [] });
    const renderable =
      emptySession &&
      shouldRenderGuidedCompletionPanel({ bodyUsable: true, session: emptySession, body: "x".repeat(600), intakeRaw: intake });
    if (!renderable) {
      expect(shouldShowGuidedNeedsDetailsMessaging(false)).toBe(false);
      expect(resolveDisplayReadinessWithGuidedInvariant("needs_details", false)).toBe("ready_for_review");
    expect(enforceNeedsDetailsGuidedInvariant({ readiness: "needs_details", session: null }).showNeedsDetailsMessaging).toBe(
      false,
    );
    }
  });

  it("hard gate wraps loose phase block under Schedule A heading before signatures", () => {
    expect(bodyHasLoosePhaseScheduleBeforeSignatures(body)).toBe(true);
    const out = applyProBodyHardIntegrityGate(body, gateCtx);
    expect(out.text).toMatch(/SCHEDULE A\s*[-—]\s*Phase, Payment, and Support Terms/i);
    expect(out.text).not.toMatch(/\nPhase 1\s*[-–—]\s*Build:[^\n]+\n\s*IN WITNESS/i);
    expect(out.repairs.some((r) => /schedule_a/i.test(r))).toBe(true);
  });

  it("hard gate fills empty numbered headings for services migration", () => {
    const out = applyProBodyHardIntegrityGate(body, gateCtx);
    expect(out.text).toMatch(/3\.3 Invoices[\s\S]{0,200}Net thirty/i);
    expect(out.repairs.some((r) => r.startsWith("empty_heading_filled"))).toBe(true);
  });

  it("extractDealVariables prioritizes fee and phase questions for migration intake", () => {
    const vars = extractDealVariables({ intakeRaw: intake, body });
    const ids = vars.map((v) => v.id);
    expect(ids).toContain("total_fee_confirmation");
    expect(ids).toContain("phase_payment_allocation");
    const session = buildGuidedSessionFromAgreement({ intakeRaw: intake, body })!;
    expect(["supplemental_schedule_confirmation", "total_fee_confirmation", "phase_payment_allocation"]).toContain(
      session.queue[0],
    );
  });

  it("main body replaces naked supplemental schedule placeholder after gate", () => {
    const out = applyProBodyHardIntegrityGate(body, gateCtx);
    expect(out.text.toLowerCase()).not.toMatch(/to be confirmed in a supplemental schedule/);
    expect(out.repairs).toContain("supplemental_schedule→schedule_a_ref");
  });

  it("loose lighthouse intake with TBD/??? table: canRenderGuidedQuestions and fee/phase Q1", () => {
    const looseSession = buildGuidedSessionFromAgreement({
      intakeRaw: LIGHTHOUSE_APEX_LOOSE_QA_INTAKE,
      body,
    })!;
    expect(
      computeCanRenderGuidedQuestions({ bodyUsable: true, session: looseSession, guidedPanelMounted: true }),
    ).toBe(true);
    const q1 = getCurrentVariable(looseSession)!;
    expect(variableHasSelectableAnswerPath(q1)).toBe(true);
    expect(
      ["project_fee_phase_confirmation", "total_fee_confirmation", "phase_payment_allocation", "supplemental_schedule_confirmation"],
    ).toContain(q1.id);
  });
});
