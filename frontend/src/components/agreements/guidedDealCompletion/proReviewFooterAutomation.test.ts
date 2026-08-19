import { describe, expect, it } from "vitest";
import { AI_AUTOMATION_SERVICES_QA_INTAKE } from "../qaManualTenPrompts";
import { applyProBodyHardIntegrityGate } from "./proBodyHardIntegrityGate";
import { buildGuidedSessionFromAgreement, getCurrentVariable } from "./guidedCompletionEngine";
import { extractDealVariables } from "./missingVariableExtractor";
import { buildMaterialMissingItems } from "../proAgreementCompleteness/revisionQuestionEngine";
import { resolveProReviewFooterState } from "./resolveProReviewFooterState";
import { resolveRecommendForMe } from "./intakeRecommendationEngine";
import { isAutomationServicesIntake } from "./servicesMigrationGuidedIntake";
import { GUIDED_NEUTRAL_REVIEW_COPY } from "./canRenderGuidedQuestions";
import { formatFinalizeReadiness, resolveFinalizeReadiness } from "../finalizeReadinessModel";

const AUTOMATION_BODY = [
  "SERVICES AGREEMENT",
  "",
  "This Agreement is between Client and Service Provider.",
  "",
  "1. SERVICES",
  "Provider will build workflows, dashboards, and automation support.",
  "",
  "2. COMPENSATION",
  "Fees and payment timing will be confirmed in Schedule A.",
  "",
  "3. CONFIDENTIALITY",
  "Each Party may disclose Confidential Information to the other.",
  "",
  "3.2 Invoicing.",
  "",
  "4. INTELLECTUAL PROPERTY",
  "Ownership of deliverables to be confirmed.",
  "",
  "4.1 Assignment.",
  "",
  "5.2 Exclusions.",
  "",
  "The Parties shall perform their obligations in good faith.",
  "",
  "Referral protection terms apply for twelve months.",
].join("\n");

describe("Pro review footer — AI automation services QA", () => {
  const gateCtx = {
    intakeRaw: AI_AUTOMATION_SERVICES_QA_INTAKE,
    agreementFamily: "services_agreement" as const,
    surface: "pro",
  };

  it("detects automation services intake", () => {
    expect(isAutomationServicesIntake(AI_AUTOMATION_SERVICES_QA_INTAKE, AUTOMATION_BODY)).toBe(true);
  });

  it("extracts guided variables for monthly fee, IP, support, and termination", () => {
    const vars = extractDealVariables({
      intakeRaw: AI_AUTOMATION_SERVICES_QA_INTAKE,
      body: AUTOMATION_BODY,
      materialItems: buildMaterialMissingItems({ intakeRaw: AI_AUTOMATION_SERVICES_QA_INTAKE, body: AUTOMATION_BODY }),
    });
    const ids = vars.map((v) => v.id);
    expect(ids).toContain("payment_timing");
    expect(
      ids.some((id) =>
        ["ip_ownership", "ip_allocation", "saas_sla", "support_obligations", "renewal_notice"].includes(id),
      ),
    ).toBe(true);
    const session = buildGuidedSessionFromAgreement({
      intakeRaw: AI_AUTOMATION_SERVICES_QA_INTAKE,
      body: AUTOMATION_BODY,
      materialItems: buildMaterialMissingItems({ intakeRaw: AI_AUTOMATION_SERVICES_QA_INTAKE, body: AUTOMATION_BODY }),
    })!;
    expect(session.queue.length).toBeLessThanOrEqual(3);
    expect(session.queue[0]).toBeTruthy();
  });

  it("footer state is guided_completion with renderable first question", () => {
    const session = buildGuidedSessionFromAgreement({
      intakeRaw: AI_AUTOMATION_SERVICES_QA_INTAKE,
      body: AUTOMATION_BODY,
    })!;
    const footer = resolveProReviewFooterState({
      bodyText: AUTOMATION_BODY,
      intakeText: AI_AUTOMATION_SERVICES_QA_INTAKE,
      guidedSession: session,
      proReviewSurfaceActive: true,
      canProceedWithPaidProDocument: true,
      bodyUsable: true,
    });
    expect(footer.mode).toBe("guided_completion");
    expect(footer.mountGuidedPanel).toBe(true);
    expect(footer.canRenderQuestion).toBe(true);
    expect(footer.currentQuestionId).toBeTruthy();
    expect(footer.showFreeformEdit).toBe(false);
    expect(footer.hideFinalizeGapBullets).toBe(true);
    expect(footer.hideRecommendedNextStep).toBe(true);
    const q1 = getCurrentVariable(session)!;
    expect(q1.question.length).toBeGreaterThan(12);
    expect(q1.suggestedDefaults.some((p) => p.id === "recommend" || p.label.match(/Recommend/i))).toBe(true);
  });

  it("freeform footer does not show needs details without mounted question", () => {
    const footer = resolveProReviewFooterState({
      bodyText: AUTOMATION_BODY,
      intakeText: AI_AUTOMATION_SERVICES_QA_INTAKE,
      guidedSession: null,
      proReviewSurfaceActive: true,
      canProceedWithPaidProDocument: true,
      bodyUsable: false,
    });
    expect(footer.mode).toBe("freeform_edit");
    expect(footer.guidedRenderState.shouldShowNeedsDetails).toBe(false);
    expect(footer.guidedRenderState.canRenderGuidedQuestions).toBe(false);
    const raw = resolveFinalizeReadiness({
      sendMode: "review",
      sendModeTouched: false,
      notOkCount: 4,
      priorityScore: 70,
      lastRefine: { suggested_next_step: "edit", readiness_score: 40 },
      audit: null,
      documentText: AUTOMATION_BODY,
    });
    expect(raw).toBe("needs_details");
    expect(formatFinalizeReadiness(raw)).toBe("Decisions needed before signature");
    expect(footer.hideFinalizeGapBullets).toBe(true);
  });

  it("recommend for me resolves for first automation question", () => {
    const session = buildGuidedSessionFromAgreement({
      intakeRaw: AI_AUTOMATION_SERVICES_QA_INTAKE,
      body: AUTOMATION_BODY,
    })!;
    const q1 = getCurrentVariable(session)!;
    const rec = resolveRecommendForMe(q1, AI_AUTOMATION_SERVICES_QA_INTAKE);
    expect(rec.primary.value.trim().length).toBeGreaterThan(10);
  });

  it("hard gate removes referral language, orphan boilerplate, and fills empty headings", () => {
    const out = applyProBodyHardIntegrityGate(AUTOMATION_BODY, gateCtx);
    expect(out.text).not.toMatch(/referral\s+protection/i);
    expect(out.text).not.toMatch(/parties\s+shall\s+perform\s+their\s+obligations/i);
    expect(out.repairs.some((r) => r.includes("empty_heading_filled") || r.includes("referral"))).toBe(true);
    const confCount = (out.text.match(/Each Party may disclose Confidential Information/gi) || []).length;
    expect(confCount).toBeLessThanOrEqual(1);
    expect(out.text).not.toMatch(/\n5\.2 Exclusions\.\s*\n\s*\n/);
  });

  it("neutral copy used only in freeform mode constant", () => {
    expect(GUIDED_NEUTRAL_REVIEW_COPY).toMatch(/Draft ready to review/i);
    expect(GUIDED_NEUTRAL_REVIEW_COPY).not.toMatch(/Complete your agreement/i);
  });
});
