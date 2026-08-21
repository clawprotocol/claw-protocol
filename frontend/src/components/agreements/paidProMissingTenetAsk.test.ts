import { describe, expect, it } from "vitest";
import {
  evaluateFiveTenetsPreflight,
  evaluatePostCheckoutMissingFactsGate,
  getRequiredClarificationTopics,
  shouldProceedToDraft,
} from "./postCheckoutMissingFactsGate";
import {
  buildLocalMissingTenetQuestions,
  intakeRequiresClarification,
  scoreFiveTenetsFromDraft,
  type FiveTenetDraftInput,
} from "./proAgreementFiveTenets";

const MIKE_DUMP = "I hired Mike to paint my office. We shook on it.";
const SARAH_DUMP = "Sarah will photograph our wedding on June 12. We agreed $1800 cash.";
const JORDAN_DUMP = "nda between me and Jordan about the app idea";

const mikeDraft: FiveTenetDraftInput = {
  title: "Painting Agreement",
  parties: [
    { name: "Client" },
    { name: "Mike" },
  ],
  purpose: "Mike will paint the office.",
  payment_terms: "",
  duration: null,
  due_date: null,
  effective_date: "Upon full execution by all parties",
  jurisdiction: "",
  payment: { amount: null, valid: true },
};

const sarahDraft: FiveTenetDraftInput = {
  title: "Wedding Photography Agreement",
  parties: [
    { name: "Client" },
    { name: "Sarah" },
  ],
  purpose: "Sarah will photograph the wedding.",
  payment_terms: "$1,800",
  duration: "Start Date: June 12",
  due_date: null,
  effective_date: "Upon full execution by all parties",
  jurisdiction: "",
  payment: { amount: 1800, valid: true },
};

const jordanDraft: FiveTenetDraftInput = {
  title: "Mutual Non-Disclosure Agreement",
  parties: [
    { name: "Client" },
    { name: "Jordan" },
  ],
  purpose: "This agreement covers confidentiality about the app idea.",
  payment_terms: "",
  duration: "As stated in the agreement body.",
  due_date: null,
  effective_date: "Upon full execution by the parties.",
  jurisdiction: "",
  payment: { amount: null, valid: false },
};

describe("paid Pro missing-tenet ask (parsed draft)", () => {
  it("Jordan NDA: asks governing_law (and payment if empty); does not skip after parties+scope", () => {
    const topics = getRequiredClarificationTopics(JORDAN_DUMP, jordanDraft);
    expect(intakeRequiresClarification(JORDAN_DUMP, jordanDraft)).toBe(true);
    expect(topics).toContain("governing_law");
    expect(topics).toContain("payment");
    expect(topics).not.toContain("parties");
    expect(topics).not.toContain("scope");
    expect(topics.length).toBeGreaterThanOrEqual(2);
    expect(topics.length).toBeLessThanOrEqual(5);

    const dumpOnly = getRequiredClarificationTopics(JORDAN_DUMP);
    expect(intakeRequiresClarification(JORDAN_DUMP)).toBe(true);
    expect(dumpOnly).toContain("governing_law");

    const qs = buildLocalMissingTenetQuestions(JORDAN_DUMP, jordanDraft);
    expect(qs.some((q) => /Jordan/i.test(q) && /law/i.test(q))).toBe(true);
    expect(qs.join(" ")).not.toMatch(/delaware/i);
    expect(qs.join(" ")).not.toMatch(/no fees/i);
  });

  it("Sarah wedding: does not re-ask payment; asks governing_law if empty", () => {
    const score = scoreFiveTenetsFromDraft(sarahDraft, SARAH_DUMP);
    expect(score.payment).toBe(true);
    expect(score.parties).toBe(true);
    expect(score.scope).toBe(true);

    const topics = getRequiredClarificationTopics(SARAH_DUMP, sarahDraft);
    expect(topics).not.toContain("payment");
    expect(topics).not.toContain("parties");
    expect(topics).not.toContain("scope");
    expect(topics).toContain("governing_law");
    expect(topics.length).toBeLessThanOrEqual(5);

    const qs = buildLocalMissingTenetQuestions(SARAH_DUMP, sarahDraft);
    expect(qs.some((q) => /Sarah/i.test(q) && /law/i.test(q))).toBe(true);
    expect(qs.some((q) => /What are the payment terms/i.test(q))).toBe(false);
  });

  it("Mike paint: asks payment+law (and term if empty), not a fake full 5", () => {
    const score = scoreFiveTenetsFromDraft(mikeDraft, MIKE_DUMP);
    expect(score.parties).toBe(true);
    expect(score.scope).toBe(true);
    expect(score.payment).toBe(false);
    expect(score.governingLaw).toBe(false);

    const topics = getRequiredClarificationTopics(MIKE_DUMP, mikeDraft);
    expect(topics).toContain("payment");
    expect(topics).toContain("governing_law");
    expect(topics).not.toContain("parties");
    expect(topics).not.toContain("scope");
    expect(topics.length).toBeGreaterThanOrEqual(2);
    expect(topics.length).toBeLessThanOrEqual(5);
    expect(topics).not.toEqual(["parties", "scope", "payment", "term", "governing_law"]);

    const qs = buildLocalMissingTenetQuestions(MIKE_DUMP, mikeDraft);
    expect(qs.some((q) => /Mike/i.test(q))).toBe(true);
    expect(qs.join(" ")).not.toMatch(/delaware/i);
    expect(qs.join(" ")).not.toMatch(/no fees/i);
  });

  it("API [] fail-open still surfaces local missing topics", () => {
    for (const [dump, draft] of [
      [JORDAN_DUMP, jordanDraft],
      [SARAH_DUMP, sarahDraft],
      [MIKE_DUMP, mikeDraft],
    ] as const) {
      const localTopics = getRequiredClarificationTopics(dump, draft);
      expect(localTopics.length).toBeGreaterThan(0);
      const decision = evaluatePostCheckoutMissingFactsGate({
        apiResult: { questions: [] },
        apiError: null,
        intakeText: dump,
        draft,
        localTopics,
      });
      expect(decision.action).toBe("await_gaps");
      expect(shouldProceedToDraft(decision)).toBe(false);
      if (decision.action === "await_gaps") {
        expect(decision.questions.length).toBeGreaterThanOrEqual(1);
        expect(decision.questions.length).toBeLessThanOrEqual(5);
        expect(decision.questions.join(" ")).not.toMatch(/delaware/i);
      }
    }
  });

  it("preflight does not proceed to generate when payment or law is empty", () => {
    for (const [dump, draft] of [
      [JORDAN_DUMP, jordanDraft],
      [SARAH_DUMP, sarahDraft],
      [MIKE_DUMP, mikeDraft],
    ] as const) {
      const preflight = evaluateFiveTenetsPreflight(dump, draft);
      expect(preflight.action).toBe("await_gaps");
      if (preflight.action === "await_gaps") {
        expect(preflight.questions.length).toBeGreaterThan(0);
        expect(preflight.questions.length).toBeLessThanOrEqual(5);
      }
    }
  });
});
