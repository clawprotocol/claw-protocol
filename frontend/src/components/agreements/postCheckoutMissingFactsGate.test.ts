import { describe, expect, it } from "vitest";
import {
  evaluatePostCheckoutMissingFactsGate,
  shouldProceedToDraft,
  shouldShowGapQuestions,
  isFailClosedDecision,
  type PostCheckoutMissingFactsGateDecision,
} from "./postCheckoutMissingFactsGate";

/**
 * Test suite for the post-checkout missing-facts gate.
 *
 * When intake is incomplete (NEEDS_CLARIFICATION / missing facts returned),
 * the create flow must:
 * 1. Block before calling premium-full-draft
 * 2. Show 2–5 clarifying questions via the gap panel
 * 3. Only proceed to drafting after user answers or uses defaults
 *
 * When intake is complete (no missing facts), drafting proceeds.
 *
 * On API error, the gate fails closed — do not draft.
 */

describe("evaluatePostCheckoutMissingFactsGate", () => {
  describe("when missing-facts API returns questions", () => {
    it("returns await_gaps with questions when 2–5 questions returned", () => {
      const questions = [
        "What is the exact payment amount?",
        "What is the governing law / venue?",
        "What are the key deliverable dates?",
      ];
      const decision = evaluatePostCheckoutMissingFactsGate({
        apiResult: { questions },
        apiError: null,
      });

      expect(decision.action).toBe("await_gaps");
      expect(shouldShowGapQuestions(decision)).toBe(true);
      expect(shouldProceedToDraft(decision)).toBe(false);
      expect(isFailClosedDecision(decision)).toBe(false);

      if (decision.action === "await_gaps") {
        expect(decision.questions).toHaveLength(3);
        expect(decision.questions[0]).toContain("payment amount");
      }
    });

    it("returns await_gaps with single question", () => {
      const decision = evaluatePostCheckoutMissingFactsGate({
        apiResult: { questions: ["What is the commission base?"] },
        apiError: null,
      });

      expect(decision.action).toBe("await_gaps");
      expect(shouldShowGapQuestions(decision)).toBe(true);
      expect(shouldProceedToDraft(decision)).toBe(false);
    });

    it("caps questions at 5 even if more returned", () => {
      const questions = [
        "Q1", "Q2", "Q3", "Q4", "Q5", "Q6", "Q7",
      ];
      const decision = evaluatePostCheckoutMissingFactsGate({
        apiResult: { questions },
        apiError: null,
      });

      expect(decision.action).toBe("await_gaps");
      if (decision.action === "await_gaps") {
        expect(decision.questions).toHaveLength(5);
      }
    });
  });

  describe("when missing-facts API returns empty questions (complete intake)", () => {
    it("returns proceed_to_draft when questions array is empty", () => {
      const decision = evaluatePostCheckoutMissingFactsGate({
        apiResult: { questions: [] },
        apiError: null,
      });

      expect(decision.action).toBe("proceed_to_draft");
      expect(shouldProceedToDraft(decision)).toBe(true);
      expect(shouldShowGapQuestions(decision)).toBe(false);
      expect(isFailClosedDecision(decision)).toBe(false);
    });
  });

  describe("when missing-facts API fails (error path)", () => {
    it("returns fail_closed on API error — does NOT proceed to draft", () => {
      const decision = evaluatePostCheckoutMissingFactsGate({
        apiResult: null,
        apiError: new Error("Network timeout"),
      });

      expect(decision.action).toBe("fail_closed");
      expect(isFailClosedDecision(decision)).toBe(true);
      expect(shouldProceedToDraft(decision)).toBe(false);
      expect(shouldShowGapQuestions(decision)).toBe(false);

      if (decision.action === "fail_closed") {
        expect(decision.reason).toContain("Network timeout");
      }
    });

    it("returns fail_closed on null result — does NOT proceed to draft", () => {
      const decision = evaluatePostCheckoutMissingFactsGate({
        apiResult: null,
        apiError: null,
      });

      expect(decision.action).toBe("fail_closed");
      expect(isFailClosedDecision(decision)).toBe(true);
      expect(shouldProceedToDraft(decision)).toBe(false);
    });

    it("returns fail_closed when questions is not an array", () => {
      const decision = evaluatePostCheckoutMissingFactsGate({
        apiResult: { questions: "not an array" as unknown as string[] },
        apiError: null,
      });

      expect(decision.action).toBe("fail_closed");
      expect(isFailClosedDecision(decision)).toBe(true);
      expect(shouldProceedToDraft(decision)).toBe(false);
    });
  });
});

describe("gate decision helpers", () => {
  it("shouldProceedToDraft returns true only for proceed_to_draft", () => {
    const proceed: PostCheckoutMissingFactsGateDecision = { action: "proceed_to_draft" };
    const gaps: PostCheckoutMissingFactsGateDecision = { action: "await_gaps", questions: ["Q1"] };
    const fail: PostCheckoutMissingFactsGateDecision = { action: "fail_closed", reason: "err" };

    expect(shouldProceedToDraft(proceed)).toBe(true);
    expect(shouldProceedToDraft(gaps)).toBe(false);
    expect(shouldProceedToDraft(fail)).toBe(false);
  });

  it("shouldShowGapQuestions returns true only for await_gaps", () => {
    const proceed: PostCheckoutMissingFactsGateDecision = { action: "proceed_to_draft" };
    const gaps: PostCheckoutMissingFactsGateDecision = { action: "await_gaps", questions: ["Q1"] };
    const fail: PostCheckoutMissingFactsGateDecision = { action: "fail_closed", reason: "err" };

    expect(shouldShowGapQuestions(proceed)).toBe(false);
    expect(shouldShowGapQuestions(gaps)).toBe(true);
    expect(shouldShowGapQuestions(fail)).toBe(false);
  });

  it("isFailClosedDecision returns true only for fail_closed", () => {
    const proceed: PostCheckoutMissingFactsGateDecision = { action: "proceed_to_draft" };
    const gaps: PostCheckoutMissingFactsGateDecision = { action: "await_gaps", questions: ["Q1"] };
    const fail: PostCheckoutMissingFactsGateDecision = { action: "fail_closed", reason: "err" };

    expect(isFailClosedDecision(proceed)).toBe(false);
    expect(isFailClosedDecision(gaps)).toBe(false);
    expect(isFailClosedDecision(fail)).toBe(true);
  });
});

describe("gate integration: runModelPass should not be called", () => {
  it("when questions exist, runModelPass must NOT be called (await_gaps blocks)", () => {
    const decision = evaluatePostCheckoutMissingFactsGate({
      apiResult: { questions: ["What is the payment?", "What is the venue?"] },
      apiError: null,
    });

    // Simulate the gate check in the post-checkout flow
    let runModelPassCalled = false;
    const mockRunModelPass = () => { runModelPassCalled = true; };

    if (shouldProceedToDraft(decision)) {
      mockRunModelPass();
    }

    expect(runModelPassCalled).toBe(false);
    expect(decision.action).toBe("await_gaps");
  });

  it("when API errors, runModelPass must NOT be called (fail_closed blocks)", () => {
    const decision = evaluatePostCheckoutMissingFactsGate({
      apiResult: null,
      apiError: new Error("Server 500"),
    });

    let runModelPassCalled = false;
    const mockRunModelPass = () => { runModelPassCalled = true; };

    if (shouldProceedToDraft(decision)) {
      mockRunModelPass();
    }

    expect(runModelPassCalled).toBe(false);
    expect(decision.action).toBe("fail_closed");
  });

  it("when questions empty, runModelPass IS called (proceed_to_draft)", () => {
    const decision = evaluatePostCheckoutMissingFactsGate({
      apiResult: { questions: [] },
      apiError: null,
    });

    let runModelPassCalled = false;
    const mockRunModelPass = () => { runModelPassCalled = true; };

    if (shouldProceedToDraft(decision)) {
      mockRunModelPass();
    }

    expect(runModelPassCalled).toBe(true);
    expect(decision.action).toBe("proceed_to_draft");
  });
});

describe("product constraint: NEEDS_CLARIFICATION blocks draft", () => {
  it("model bake-off finding: intake with missing facts must not draft", () => {
    // Simulates the Aug 18–19 2026 bake-off scenario where every scored case
    // was already NEEDS_CLARIFICATION before the model ran
    const sparseIntakeQuestions = [
      "What is the exact payment amount or rate?",
      "What is the governing law / venue?",
      "Who is responsible for approving expenses?",
    ];

    const decision = evaluatePostCheckoutMissingFactsGate({
      apiResult: { questions: sparseIntakeQuestions },
      apiError: null,
    });

    // The gate MUST block drafting
    expect(shouldProceedToDraft(decision)).toBe(false);
    expect(decision.action).toBe("await_gaps");

    // The gate MUST show questions
    expect(shouldShowGapQuestions(decision)).toBe(true);
    if (decision.action === "await_gaps") {
      expect(decision.questions.length).toBeGreaterThanOrEqual(2);
      expect(decision.questions.length).toBeLessThanOrEqual(5);
    }
  });

  it("complete intake with no missing facts proceeds to draft", () => {
    // When the LLM determines intake is specific enough for a strong first draft
    const decision = evaluatePostCheckoutMissingFactsGate({
      apiResult: { questions: [] },
      apiError: null,
    });

    expect(shouldProceedToDraft(decision)).toBe(true);
    expect(decision.action).toBe("proceed_to_draft");
  });

  it("error path fails closed — never drafts on API failure", () => {
    // Product constraint: do not fail-open missing-facts to [] and then draft
    const decision = evaluatePostCheckoutMissingFactsGate({
      apiResult: null,
      apiError: new Error("OpenAI rate limit"),
    });

    expect(shouldProceedToDraft(decision)).toBe(false);
    expect(decision.action).toBe("fail_closed");
  });
});
