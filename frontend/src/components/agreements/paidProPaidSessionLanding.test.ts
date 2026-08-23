import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  rebuildBodyFromIntakeForProFailure,
  isNonHollowBody,
} from "./freeStarterReviewBodyResolver";
import {
  isVisibleMissingTenetAskLanding,
  readPremiumCompletionReturnFromHref,
  resolvePaidSessionVisibleDealBody,
  shouldKeepPaidSessionSignerEmailsInteractive,
  shouldShowPaidSessionGeneratingOverlay,
  shouldSuppressFreeMissingTenetAskAfterPay,
} from "./paidProPaidSessionLanding";
import { resolveShowPaidProReviewDocumentCard } from "./paidProDocumentBodyRouter";
import {
  evaluateFiveTenetsPreflight,
  evaluatePostCheckoutMissingFactsGate,
  shouldShowGapQuestions,
} from "./postCheckoutMissingFactsGate";
import { evaluatePostGenerateTenetRecall } from "./postGenerateTenetRecall";
import {
  buildLocalMissingTenetQuestions,
  filterAskedTenetQuestionsAgainstOriginalIntake,
  scoreFiveTenets,
  scoreFiveTenetsFromDraft,
  shouldSkipAskAndRenderImmediately,
  type FiveTenetDraftInput,
} from "./proAgreementFiveTenets";

/** Fat dump: all five tenets including Texas. Live fail #84. */
const FAT_DUMP = `
Priya Shah of Northline Studio is hiring Diego Alvarez from Harbor Marks LLC to design a logo and brand kit for $2,400 due on signing. Work runs 30 days starting August 22, 2026. Governing law is Texas.
`;

/** Same commercial deal, missing only governing law. */
const MISSING_LAW_DUMP = `
Maya Chen of Northline Studio is hiring Diego Alvarez from Harbor Marks LLC to design a logo and brand kit for $2,400 due on signing. Work runs 30 days starting August 22, 2026.
`;

const HOLLOW_STARTER_DRAFT: FiveTenetDraftInput = {
  title: "Services Agreement",
  parties: [{ name: "Party A" }, { name: "Party B" }],
  purpose: "Services as described.",
  payment_terms: "To be agreed",
  duration: "To be determined",
  due_date: null,
  effective_date: "Upon full execution by all parties",
  jurisdiction: "To be agreed by the parties unless otherwise agreed",
  payment: { amount: null, valid: true },
};

const EMPTY_LAW_DRAFT: FiveTenetDraftInput = {
  ...HOLLOW_STARTER_DRAFT,
  jurisdiction: "",
};

describe("paid session landing — overlay vs deal (two faces)", () => {
  it("hides Building overlay when a ≥200 non-hollow rebuild is on the card", () => {
    const rebuilt = rebuildBodyFromIntakeForProFailure(FAT_DUMP, HOLLOW_STARTER_DRAFT);
    expect(rebuilt.length).toBeGreaterThanOrEqual(200);
    expect(isNonHollowBody(rebuilt, FAT_DUMP)).toBe(true);
    expect(rebuilt).toContain("Priya Shah");
    expect(rebuilt).toContain("Diego Alvarez");
    expect(rebuilt).toMatch(/2,400|2400/);
    expect(rebuilt).toMatch(/Texas/i);

    const hasVisibleDealBody = resolvePaidSessionVisibleDealBody({
      paidSessionActive: true,
      acceptedCanonicalPlain: rebuilt,
      intakeText: FAT_DUMP,
    });
    expect(hasVisibleDealBody).toBe(true);

    expect(
      shouldShowPaidSessionGeneratingOverlay({
        phase: "processing",
        hasVisibleDealBody,
      }),
    ).toBe(false);
    expect(
      shouldShowPaidSessionGeneratingOverlay({
        phase: "generation_retry",
        hasVisibleDealBody,
      }),
    ).toBe(false);
    expect(
      shouldShowPaidSessionGeneratingOverlay({
        phase: "terminal_failure",
        hasVisibleDealBody,
      }),
    ).toBe(false);
    expect(
      resolveShowPaidProReviewDocumentCard({
        canDisplayPaidProAgreementDocument: false,
        paidSessionVisibleDealBody: hasVisibleDealBody,
      }),
    ).toBe(true);
  });

  it("hides Building overlay when a real missing-tenet ask is the landing", () => {
    expect(
      shouldShowPaidSessionGeneratingOverlay({
        phase: "awaiting_gaps",
        hasVisibleDealBody: true,
      }),
    ).toBe(false);
    expect(
      shouldShowPaidSessionGeneratingOverlay({
        phase: "processing",
        hasVisibleDealBody: false,
        hasVisibleAskLanding: true,
      }),
    ).toBe(false);
  });

  it("recognizes free and paid 2–5 question asks as visible landings", () => {
    expect(
      isVisibleMissingTenetAskLanding({
        phase: null,
        freeStarterAskQuestionCount: 3,
      }),
    ).toBe(true);
    expect(
      isVisibleMissingTenetAskLanding({
        phase: "awaiting_gaps",
        paidGapQuestionCount: 3,
      }),
    ).toBe(true);
    expect(
      isVisibleMissingTenetAskLanding({
        phase: "processing",
        freeStarterAskQuestionCount: 0,
        paidGapQuestionCount: 0,
      }),
    ).toBe(false);
  });

  it("after pay, leftover free missing-tenet ask is not a landing", () => {
    expect(
      shouldSuppressFreeMissingTenetAskAfterPay({
        paidSessionActive: true,
        premiumCompletionReturn: false,
      }),
    ).toBe(true);
    expect(
      shouldSuppressFreeMissingTenetAskAfterPay({
        paidSessionActive: false,
        premiumCompletionReturn: true,
      }),
    ).toBe(true);
    expect(
      shouldSuppressFreeMissingTenetAskAfterPay({
        paidSessionActive: false,
        premiumCompletionReturn: false,
      }),
    ).toBe(false);
    expect(
      readPremiumCompletionReturnFromHref(
        "https://lawdog.me/app/create?restore=starterReview&premiumCompletion=1",
      ),
    ).toBe(true);
    expect(
      readPremiumCompletionReturnFromHref("https://lawdog.me/app/create?restore=starterReview"),
    ).toBe(false);
    expect(
      isVisibleMissingTenetAskLanding({
        phase: null,
        freeStarterAskQuestionCount: 3,
        paidSessionActive: true,
      }),
    ).toBe(false);
    expect(
      isVisibleMissingTenetAskLanding({
        phase: null,
        freeStarterAskQuestionCount: 3,
        premiumCompletionReturn: true,
      }),
    ).toBe(false);
    expect(
      isVisibleMissingTenetAskLanding({
        phase: null,
        freeStarterAskQuestionCount: 3,
      }),
    ).toBe(true);
  });

  it("still shows Building overlay when paid session has no deal body yet", () => {
    expect(
      resolvePaidSessionVisibleDealBody({
        paidSessionActive: true,
        acceptedCanonicalPlain: "",
        lastKnownGoodPlain: "",
        intakeText: FAT_DUMP,
      }),
    ).toBe(false);
    expect(
      shouldShowPaidSessionGeneratingOverlay({
        phase: "processing",
        hasVisibleDealBody: false,
      }),
    ).toBe(true);
    expect(
      shouldShowPaidSessionGeneratingOverlay({
        phase: "processing",
        hasVisibleDealBody: false,
        signerEmailsMustStayInteractive: true,
      }),
    ).toBe(false);
    expect(
      shouldKeepPaidSessionSignerEmailsInteractive({
        paidSessionActive: true,
        premiumCompletionReturn: true,
      }),
    ).toBe(true);
  });

  it("AgreementBuilderIntake wires overlay hide + wait card to the same landing predicate", () => {
    const intake = readFileSync(join(__dirname, "AgreementBuilderIntake.tsx"), "utf8");
    expect(intake).toContain("shouldShowPaidSessionGeneratingOverlay");
    expect(intake).toContain("isVisibleMissingTenetAskLanding");
    expect(intake).toContain("hasVisibleAskLanding");
    expect(intake).toContain("missingTenetAskLandingVisible");
    expect(intake).toContain("resolvePaidSessionVisibleDealBody");
    expect(intake).toContain("paidSessionVisibleDealBody");
    expect(intake).toContain("PremiumProWaitContinuityCard");
    expect(intake).toMatch(/premiumReturnWaitActive = Boolean\(\s*!paidSessionVisibleDealBody/);
    expect(intake).toContain("shouldSuppressFreeMissingTenetAskAfterPay");
    expect(intake).toContain("freeMissingTenetAskVisible");
    expect(intake).toContain("suppressFreeMissingTenetAskAfterPay");
  });
});

describe("paid session landing — dump 1 fat (Texas + price + names)", () => {
  it("does not re-ask governing law when Texas is in the original dump", () => {
    expect(scoreFiveTenets(FAT_DUMP).governingLaw).toBe(true);
    expect(scoreFiveTenets(FAT_DUMP).isComplete).toBe(true);
    expect(shouldSkipAskAndRenderImmediately(FAT_DUMP)).toBe(true);

    const hollowScore = scoreFiveTenetsFromDraft(HOLLOW_STARTER_DRAFT, FAT_DUMP);
    expect(hollowScore.governingLaw).toBe(true);
    expect(hollowScore.payment).toBe(true);
    expect(hollowScore.isComplete).toBe(true);

    const emptyLawScore = scoreFiveTenetsFromDraft(EMPTY_LAW_DRAFT, FAT_DUMP);
    expect(emptyLawScore.governingLaw).toBe(true);

    const preflight = evaluateFiveTenetsPreflight(FAT_DUMP, HOLLOW_STARTER_DRAFT);
    expect(preflight.action).toBe("proceed_to_draft_five_tenets_complete");

    const qs = buildLocalMissingTenetQuestions(FAT_DUMP, HOLLOW_STARTER_DRAFT);
    expect(qs.some((q) => /state'?s?\s+law|governing\s+law/i.test(q))).toBe(false);

    const apiDecision = evaluatePostCheckoutMissingFactsGate({
      apiResult: { questions: ["Which state's law should govern this agreement?"] },
      apiError: null,
      intakeText: FAT_DUMP,
      draft: HOLLOW_STARTER_DRAFT,
    });
    expect(apiDecision.action).toBe("proceed_to_draft");
    expect(shouldShowGapQuestions(apiDecision)).toBe(false);
  });

  it("post-generate recall does not re-ask Texas when original dump stated it", () => {
    const hollowPainted = `${"SERVICES AGREEMENT\n\nThis Agreement is entered into by Party A and Party B. ".repeat(40)}
Governing law: To be agreed by the parties unless otherwise agreed.
Payment: To be agreed.`;
    expect(hollowPainted.length).toBeGreaterThanOrEqual(1600);

    const decision = evaluatePostGenerateTenetRecall({
      paintedBody: hollowPainted,
      alreadyAsked: false,
      originalIntake: FAT_DUMP,
    });
    expect(decision.action).toBe("proceed");
    expect(decision.missingTenets).not.toContain("governing_law");
    expect(decision.questions.join(" ")).not.toMatch(/Which state's law/i);
  });

  it("filters an API law question that ignores the original dump", () => {
    const kept = filterAskedTenetQuestionsAgainstOriginalIntake(
      [
        "Which state's law should govern this agreement?",
        "One quick question — What color is the logo?",
      ],
      FAT_DUMP,
      HOLLOW_STARTER_DRAFT,
    );
    expect(kept.some((q) => /state'?s?\s+law/i.test(q))).toBe(false);
  });
});

describe("paid session landing — dump 2 missing only governing law", () => {
  it("asks exactly one law question and does not sit on empty+Retry", () => {
    const dumpScore = scoreFiveTenets(MISSING_LAW_DUMP);
    expect(dumpScore.parties).toBe(true);
    expect(dumpScore.scope).toBe(true);
    expect(dumpScore.payment).toBe(true);
    expect(dumpScore.term).toBe(true);
    expect(dumpScore.governingLaw).toBe(false);

    const preflight = evaluateFiveTenetsPreflight(MISSING_LAW_DUMP, EMPTY_LAW_DRAFT);
    expect(preflight.action).toBe("await_gaps");
    if (preflight.action === "await_gaps") {
      expect(preflight.questions.length).toBeGreaterThanOrEqual(1);
      expect(preflight.questions.length).toBeLessThanOrEqual(5);
      expect(preflight.questions.some((q) => /state'?s?\s+law|governing\s+law/i.test(q))).toBe(true);
      expect(preflight.questions.some((q) => /how much is paid/i.test(q))).toBe(false);
    }

    const rebuilt = rebuildBodyFromIntakeForProFailure(MISSING_LAW_DUMP, EMPTY_LAW_DRAFT);
    expect(rebuilt.length).toBeGreaterThanOrEqual(200);
    expect(isNonHollowBody(rebuilt, MISSING_LAW_DUMP)).toBe(true);
    expect(rebuilt).toContain("Maya Chen");
    expect(rebuilt).toContain("Diego Alvarez");
    expect(rebuilt).toMatch(/2,400|2400/);

    const hasVisibleDealBody = resolvePaidSessionVisibleDealBody({
      paidSessionActive: true,
      acceptedCanonicalPlain: rebuilt,
      intakeText: MISSING_LAW_DUMP,
    });
    expect(hasVisibleDealBody).toBe(true);
    expect(
      shouldShowPaidSessionGeneratingOverlay({
        phase: "processing",
        hasVisibleDealBody,
      }),
    ).toBe(false);
    expect(
      shouldShowPaidSessionGeneratingOverlay({
        phase: "awaiting_gaps",
        hasVisibleDealBody,
      }),
    ).toBe(false);
  });

  it("after the law answer, a complete dump skips further asks and paints", () => {
    const answered = `${MISSING_LAW_DUMP.trim()} Texas law.`;
    expect(scoreFiveTenets(answered).governingLaw).toBe(true);
    expect(shouldSkipAskAndRenderImmediately(answered)).toBe(true);
    const preflight = evaluateFiveTenetsPreflight(answered, HOLLOW_STARTER_DRAFT);
    expect(preflight.action).toBe("proceed_to_draft_five_tenets_complete");
  });
});
