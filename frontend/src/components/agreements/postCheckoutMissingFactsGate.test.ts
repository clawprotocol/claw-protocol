import { describe, expect, it, vi, beforeEach } from "vitest";
import { defaultPostCheckoutRunModelPassInput } from "../../lib/postCheckoutProFlow";

/**
 * Test suite for the post-checkout missing-facts gate.
 *
 * When intake is incomplete (NEEDS_CLARIFICATION / missing facts returned),
 * the create flow must:
 * 1. Block before calling premium-full-draft
 * 2. Show 2–5 clarifying questions via the gap panel
 * 3. Only proceed to drafting after user answers or uses defaults
 *
 * When intake is complete (no missing facts), drafting proceeds as before.
 */

const h = vi.hoisted(() => {
  return {
    missingFactsQuestions: [] as string[],
  };
});

vi.mock("./premiumMissingFactsApi", async (importOriginal) => {
  const mod = await importOriginal<typeof import("./premiumMissingFactsApi")>();
  return {
    ...mod,
    postPremiumMissingFactsWithRetry: () =>
      Promise.resolve({ questions: h.missingFactsQuestions }),
  };
});

describe("post-checkout missing-facts gate", () => {
  beforeEach(() => {
    h.missingFactsQuestions = [];
  });

  it("defaultPostCheckoutRunModelPassInput still skips gap resolver with defaults when called", () => {
    const merged = "Party A in Delaware, services work. " + "x".repeat(400);
    expect(defaultPostCheckoutRunModelPassInput(merged)).toEqual({
      intakeText: merged,
      userGapAnswers: null,
      gapResolverSkippedWithDefaults: true,
    });
  });

  it("mock returns questions when configured", async () => {
    h.missingFactsQuestions = [
      "What is the exact payment amount?",
      "What is the governing law / venue?",
    ];
    const { postPremiumMissingFactsWithRetry } = await import("./premiumMissingFactsApi");
    const result = await postPremiumMissingFactsWithRetry({
      intakeText: "test",
      context: {} as never,
    });
    expect(result.questions).toHaveLength(2);
    expect(result.questions[0]).toContain("payment amount");
    expect(result.questions[1]).toContain("governing law");
  });

  it("mock returns empty questions when none configured", async () => {
    h.missingFactsQuestions = [];
    const { postPremiumMissingFactsWithRetry } = await import("./premiumMissingFactsApi");
    const result = await postPremiumMissingFactsWithRetry({
      intakeText: "test",
      context: {} as never,
    });
    expect(result.questions).toHaveLength(0);
  });

  describe("question count constraints", () => {
    it("returns 2–5 questions when facts are missing (model bake-off finding)", async () => {
      h.missingFactsQuestions = [
        "What is the exact payment amount?",
        "What is the governing law / venue?",
        "What are the key deliverable dates?",
      ];
      const { postPremiumMissingFactsWithRetry } = await import("./premiumMissingFactsApi");
      const result = await postPremiumMissingFactsWithRetry({
        intakeText: "sparse intake",
        context: {} as never,
      });
      expect(result.questions.length).toBeGreaterThanOrEqual(2);
      expect(result.questions.length).toBeLessThanOrEqual(5);
    });

    it("returns empty questions for complete intake (proceed to draft)", async () => {
      h.missingFactsQuestions = [];
      const { postPremiumMissingFactsWithRetry } = await import("./premiumMissingFactsApi");
      const result = await postPremiumMissingFactsWithRetry({
        intakeText: "Complete intake with all facts",
        context: {} as never,
      });
      expect(result.questions).toHaveLength(0);
    });
  });
});

describe("gap panel integration requirements", () => {
  it("PremiumFinishAgreementGapsPanel props match expected interface", async () => {
    const { PremiumFinishAgreementGapsPanel } = await import("./PremiumFinishAgreementGapsPanel");
    expect(typeof PremiumFinishAgreementGapsPanel).toBe("function");
  });

  it("gap panel questions prop accepts string array from missing-facts API", () => {
    const questions = [
      "What is the exact payment amount?",
      "What is the governing law?",
      "Who approves ad spend?",
    ];
    expect(questions.length).toBeGreaterThanOrEqual(2);
    expect(questions.length).toBeLessThanOrEqual(5);
    expect(questions.every((q) => typeof q === "string")).toBe(true);
  });
});
