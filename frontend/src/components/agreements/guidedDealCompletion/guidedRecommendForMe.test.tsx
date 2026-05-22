/** @vitest-environment jsdom */
import { describe, expect, it, vi, afterEach } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import {
  AI_AUTOMATION_SERVICES_QA_INTAKE,
  lighthouseApexMigrationBodyFixture,
} from "../qaManualTenPrompts";
import {
  applyGuidedAnswerTransaction,
  buildGuidedSessionFromAgreement,
  getCurrentVariable,
} from "./guidedCompletionEngine";
import { lockGuidedSession, mergeGuidedSessionOnBaseRefresh } from "./guidedSessionPersistence";
import { enrichDealVariableFromIntake, parseMonthlyPaymentUsdHint, resolveRecommendForMe } from "./intakeRecommendationEngine";
import { extractDealVariables } from "./missingVariableExtractor";
import { buildMaterialMissingItems } from "../proAgreementCompleteness/revisionQuestionEngine";
import { GuidedDealCompletionPanel } from "./GuidedDealCompletionPanel";
import { resolveGuidedCompletionRenderState } from "./resolveGuidedCompletionRenderState";
import { guidedCompletionHeading, mayShowCompleteAgreementBelowCopy } from "./canRenderGuidedQuestions";
import { isRecommendPillId } from "./guidedRecommendPillIds";
import { resolveGuidedAnswerForPill } from "./guidedAnswerResolution";

describe("guided Recommend for me", () => {
  const body = lighthouseApexMigrationBodyFixture();

  it("normalizes recommend pill ids", () => {
    expect(isRecommendPillId("recommend")).toBe(true);
    expect(isRecommendPillId("recommend_for_me")).toBe(true);
    expect(isRecommendPillId("lawdog_recommended")).toBe(true);
    expect(
      resolveGuidedAnswerForPill(
        {
          id: "x",
          label: "x",
          question: "q?",
          suggestedDefaults: [],
          category: "compensation",
          severity: "important",
          agreementImpact: "",
          requiredForExecution: false,
          applicableAgreementFamilies: ["services_agreement"],
          uiControlType: "pills",
          currentValue: null,
          confidence: 0.5,
          affectsSections: [],
        },
        "recommend_for_me",
        "Recommend for me",
        "",
      ).action,
    ).toBe("recommend");
  });

  it("parses monthly ~6k from automation services intake", () => {
    expect(parseMonthlyPaymentUsdHint(AI_AUTOMATION_SERVICES_QA_INTAKE)).toBe(6000);
  });

  it("resolves concrete recommendation for project_fee_phase_confirmation on automation intake", () => {
    const material = buildMaterialMissingItems({ intakeRaw: AI_AUTOMATION_SERVICES_QA_INTAKE, body });
    const vars = extractDealVariables({ intakeRaw: AI_AUTOMATION_SERVICES_QA_INTAKE, body, materialItems: material });
    const feeVar =
      vars.find((v) => v.id === "project_fee_phase_confirmation") ??
      vars.find((v) => v.id === "phase_payment_allocation")!;
    const enriched = enrichDealVariableFromIntake(feeVar, AI_AUTOMATION_SERVICES_QA_INTAKE);
    const rec = resolveRecommendForMe(enriched, AI_AUTOMATION_SERVICES_QA_INTAKE);
    expect(rec).not.toBeNull();
    expect(rec!.primary.value.trim().length).toBeGreaterThan(20);
    expect(rec!.why.length).toBeGreaterThan(10);
  });

  it("recommendation apply advances from question 1 to question 2", () => {
    const session = buildGuidedSessionFromAgreement({
      intakeRaw: AI_AUTOMATION_SERVICES_QA_INTAKE,
      body,
      materialItems: buildMaterialMissingItems({ intakeRaw: AI_AUTOMATION_SERVICES_QA_INTAKE, body }),
    })!;
    const q1 = getCurrentVariable(session)!.id;
    const rec = resolveRecommendForMe(getCurrentVariable(session)!, AI_AUTOMATION_SERVICES_QA_INTAKE)!;
    const after = applyGuidedAnswerTransaction(session, q1, rec.primary.label);
    const q2 = getCurrentVariable(after);
    expect(q2).not.toBeNull();
    expect(q2!.id).not.toBe(q1);
  });

  it("persists session index after simulated rerender merge", () => {
    const session = buildGuidedSessionFromAgreement({
      intakeRaw: AI_AUTOMATION_SERVICES_QA_INTAKE,
      body,
    })!;
    const q1 = getCurrentVariable(session)!.id;
    const answered = applyGuidedAnswerTransaction(session, q1, "Test answer");
    const key = "test-guided-key";
    const locked = lockGuidedSession(answered, key);
    const merged = mergeGuidedSessionOnBaseRefresh(locked, locked, null, key);
    expect(getCurrentVariable(merged!)!.id).not.toBe(q1);
    expect(merged!.answered[q1]).toBe("Test answer");
  });

  it("fallback recommendation always returns helper card payload (never null)", () => {
    const vars = extractDealVariables({ intakeRaw: "generic business deal", body: "" });
    const obscure = vars.find((v) => v.id === "governing_venue") ?? vars[0];
    const rec = resolveRecommendForMe(obscure, "generic business deal");
    expect(rec).not.toBeNull();
    expect(rec!.primary.label.length).toBeGreaterThan(0);
    expect(rec!.explanation.length).toBeGreaterThan(0);
  });

  it("no duplicate Complete your agreement heading when panel mounted on document_editor", () => {
    const session = buildGuidedSessionFromAgreement({
      intakeRaw: AI_AUTOMATION_SERVICES_QA_INTAKE,
      body,
    })!;
    const state = resolveGuidedCompletionRenderState({
      bodyText: body,
      intakeText: AI_AUTOMATION_SERVICES_QA_INTAKE,
      guidedSession: session,
      panelMountedSurface: "document_editor",
      bodyUsable: true,
      rawReadiness: "needs_details",
    });
    expect(state.canRenderGuidedQuestions).toBe(true);
    expect(guidedCompletionHeading(state)).not.toBe("Complete your agreement");
    expect(mayShowCompleteAgreementBelowCopy(state)).toBe(false);
  });
});

describe("GuidedDealCompletionPanel recommend click", () => {
  const body = lighthouseApexMigrationBodyFixture();

  afterEach(() => {
    cleanup();
  });

  it("fires onSaveAnswer when Recommend for me is clicked (direct or card)", async () => {
    const session = buildGuidedSessionFromAgreement({
      intakeRaw: AI_AUTOMATION_SERVICES_QA_INTAKE,
      body,
      materialItems: buildMaterialMissingItems({ intakeRaw: AI_AUTOMATION_SERVICES_QA_INTAKE, body }),
    })!;
    const onSaveAnswer = vi.fn();

    render(
      <GuidedDealCompletionPanel
        session={session}
        intakeRaw={AI_AUTOMATION_SERVICES_QA_INTAKE}
        phase="collecting_answers"
        onSessionChange={() => {}}
        onSaveAnswer={onSaveAnswer}
      />,
    );

    const recommendBtn = screen.getByRole("button", { name: /Recommend for me/i });
    fireEvent.click(recommendBtn);

    await waitFor(
      () => {
        const applied = onSaveAnswer.mock.calls.length > 0;
        const recommendCard = screen.queryByTestId("guided-option-recommended");
        expect(applied || recommendCard).toBeTruthy();
      },
      { timeout: 2000 },
    );

    if (onSaveAnswer.mock.calls.length === 0) {
      const recommendCard = screen.getByTestId("guided-option-recommended");
      fireEvent.click(recommendCard);
      await waitFor(() => expect(onSaveAnswer).toHaveBeenCalled(), { timeout: 2000 });
    }

    expect(onSaveAnswer.mock.calls[0][1].length).toBeGreaterThan(0);
  });
});
