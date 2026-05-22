import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  applyGuidedAnswerTransaction,
  computeGuidedCollectionProgress,
  getCurrentVariable,
} from "./guidedCompletionEngine";
import { preserveGuidedSessionDuringCollection } from "./guidedSessionPersistence";
import { createGuidedCompletionSession } from "./variablePrioritizationLayer";
import { extractDealVariables } from "./missingVariableExtractor";
import { buildBulkApplyChecklist, resolveOptionDisplayCopy } from "./guidedQuestionConfig";
import { buildConsolidatedGuidedRegenerationPrompt, sessionReadyForBulkApply } from "./guidedBulkRegeneration";
import { guidedPhaseSuppressesSendCta } from "./guidedCompletionPhase";

const INTAKE = "About $6k/month for automation support with client owning IP.";

function minimalSession() {
  const variables = extractDealVariables({
    intakeRaw: INTAKE,
    body: "1. SERVICES\n\n2. FEES\n\n3. CONF\n\n4. IP\n\n5. SLA\n\n6. TERM",
  });
  return createGuidedCompletionSession({
    variables: variables.slice(0, 5),
    agreementFamily: "generic_business_agreement",
    bodyLen: 400,
  });
}

describe("GuidedDealCompletionPanel Genesis UX contract", () => {
  it("source uses distinct Why and LawDog will sections", () => {
    const panel = readFileSync(join(__dirname, "GuidedDealCompletionPanel.tsx"), "utf8");
    const optionCard = readFileSync(join(__dirname, "GuidedQuestionOptionCard.tsx"), "utf8");
    expect(panel).toContain("onSaveAnswer");
    expect(panel).not.toContain("Applying update");
    expect(panel).not.toContain("onApplyAnswer");
    expect(optionCard).toContain("Why:");
    expect(optionCard).toContain("LawDog will:");
    expect(optionCard).toContain("More details");
    expect(panel).toContain("guided-skip-tertiary");
    expect(panel).toContain("guided-saved-flash");
    expect(panel).toContain("holdQuestionId");
    expect(panel).toContain("guided-progress-count");
    expect(panel).toContain("GuidedBulkApplyChecklist");
    expect(panel).toContain("GuidedReviewFlowBanner");
    expect(panel).toContain("guided-clause-updates-preview");
    expect(panel).toContain("Queued update");
    expect(panel).toContain("Updating your agreement");
    expect(panel).toContain("GuidedAppliedAreasSummary");
    expect(panel).toContain("formatGuidedProgressLabel");
    expect(panel).toContain("guided-show-other-options");
    expect(panel).toContain("guided-skip-flash");
  });

  it("skip is tertiary footer not primary option styling", () => {
    const panel = readFileSync(join(__dirname, "GuidedDealCompletionPanel.tsx"), "utf8");
    expect(panel).toMatch(/data-testid="guided-skip-tertiary"/);
    expect(panel).toMatch(/text-stone-400.*Skip for now/s);
  });

  it("collection progress is linear from resolved visible count", () => {
    expect(computeGuidedCollectionProgress(0, 5)).toBe(0);
    expect(computeGuidedCollectionProgress(1, 5)).toBe(20);
    expect(computeGuidedCollectionProgress(5, 5)).toBe(100);
    expect(computeGuidedCollectionProgress(3, 5)).toBe(60);
  });

  it("preserveGuidedSessionDuringCollection keeps answers when base refreshes", () => {
    const session = minimalSession();
    if (!session) return;
    const first = session.queue[0];
    const answered = applyGuidedAnswerTransaction(session, first, "Monthly $6,000", undefined);
    const base = applyGuidedAnswerTransaction(session, session.queue[1], "", undefined);
    const preserved = preserveGuidedSessionDuringCollection(answered, base, "k1");
    expect(preserved.answered[first]).toBe("Monthly $6,000");
    expect(getCurrentVariable(preserved)?.id).not.toBe(first);
  });

  it("applyGuidedAnswerTransaction advances Q1 to Q2 without network", () => {
    const session = minimalSession();
    if (!session) return;
    const first = session.queue[0];
    const next = applyGuidedAnswerTransaction(session, first, "Monthly $6,000", 400);
    const secondId = next.queue.find((id) => !next.answered[id] && !next.skipped.has(id));
    expect(secondId).toBeTruthy();
    expect(secondId).not.toBe(first);
  });

  it("recommended option exposes short reason and implementation preview", () => {
    const copy = resolveOptionDisplayCopy({
      variableId: "payment_timing",
      pillId: "monthly",
      pillLabel: "$6,000/month",
      pillValue: "6000",
      intakeRaw: INTAKE,
    });
    expect(copy.why || copy.lawDogWill).toBeTruthy();
    expect(copy.lawDogWill.length).toBeLessThan(55);
    expect(copy.lawDogWill).not.toMatch(/Section \d/i);
  });

  it("bulk checklist module exists for applying_all", () => {
    const session = minimalSession();
    if (!session) return;
    const items = buildBulkApplyChecklist(session);
    expect(items.length).toBeGreaterThan(0);
    expect(readFileSync(join(__dirname, "GuidedBulkApplyChecklist.tsx"), "utf8")).toContain(
      "guided-bulk-apply-checklist",
    );
  });

  it("all answers ready before regeneration", () => {
    let session = minimalSession();
    if (!session) return;
    for (const id of session.queue) {
      session = applyGuidedAnswerTransaction(session, id, `answer-${id}`, 400);
    }
    expect(sessionReadyForBulkApply(session)).toBe(true);
  });

  it("send CTA suppressed until applied", () => {
    expect(guidedPhaseSuppressesSendCta("collecting_answers")).toBe(true);
    expect(guidedPhaseSuppressesSendCta("ready_to_apply")).toBe(true);
    expect(guidedPhaseSuppressesSendCta("applying_all")).toBe(true);
    expect(guidedPhaseSuppressesSendCta("applied")).toBe(false);
  });

  it("bulk prompt is only AI touchpoint during collection flow", () => {
    const prompt = buildConsolidatedGuidedRegenerationPrompt({
      intakeText: INTAKE,
      session: minimalSession()!,
    });
    expect(prompt).toMatch(/ONE clean regeneration/i);
  });
});

describe("AgreementBuilderIntake guided Genesis wiring", () => {
  it("collect phase avoids editing_pro and uses suppressGlobalGeneratingUi for bulk only", () => {
    const intake = readFileSync(join(__dirname, "../AgreementBuilderIntake.tsx"), "utf8");
    expect(intake).toContain("handleGuidedSaveAnswer");
    expect(intake).toContain("handleGuidedBulkApply");
    expect(intake).toContain("suppressGlobalGeneratingUi: true");
    expect(intake).toContain("preserveGuidedSessionDuringCollection");
    expect(intake).toContain("withGuidedDraftProgress");
    expect(intake).toContain('guidedCompletionPhase !== "collecting_answers"');
    expect(intake).not.toContain("handleGuidedApplyAnswer");
    expect(intake).toContain("guidedQuestionsRemain");
    const finalize = readFileSync(join(__dirname, "../FinalizeYourAgreementPanel.tsx"), "utf8");
    expect(finalize).toContain("Finish guided completion first");
  });
});
