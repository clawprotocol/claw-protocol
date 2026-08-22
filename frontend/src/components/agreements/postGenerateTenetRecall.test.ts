import { describe, expect, it } from "vitest";
import { buildLocalMissingTenetQuestions } from "./proAgreementFiveTenets";
import {
  buildPostGenerateMissingTenetQuestions,
  evaluatePostGenerateTenetRecall,
  isPollutedTenetQuestionHint,
} from "./postGenerateTenetRecall";

function padToSubstantive(body: string, min = 1600): string {
  if (body.length >= min) return body;
  return `${body}\n\n${"The parties agree to the foregoing commercial terms. ".repeat(Math.ceil((min - body.length) / 52))}`;
}

const INCOMPLETE_PAINTED = padToSubstantive(`
PAINTING AGREEMENT

This Painting Agreement is entered into between Alex Rivera and Mike Chen.

Mike Chen will paint the office walls and trim at 100 Main Street, including
preparation, two coats, and cleanup. This agreement begins on the effective
date and continues for 30 days.

IN WITNESS WHEREOF the parties have executed this Agreement.

By: ____________________
`);

const COMPLETE_PAINTED = padToSubstantive(`
PAINTING AGREEMENT

This Painting Agreement is entered into between Alex Rivera and Mike Chen.

Mike Chen will paint the office walls and trim at 100 Main Street for $4,000
payable on completion. This agreement begins on the effective date and
continues for 30 days. Texas law governs this agreement.

IN WITNESS WHEREOF the parties have executed this Agreement.

By: ____________________
`);

const OUTLINE_DUMP = `DRAFT OUTLINE
1. Parties
2. Scope of Work — include all rooms and hallway plus stairwell notes
3. Compensation schedule to be inserted later
4. Term and renewal mechanics
5. Governing Law placeholder
6. Notices
7. Entire agreement
${"outline filler ".repeat(80)}`;

describe("post-generate tenet recall", () => {
  it("painted body missing payment/law → asks only those, 2–5", () => {
    const decision = evaluatePostGenerateTenetRecall({
      paintedBody: INCOMPLETE_PAINTED,
      alreadyAsked: false,
    });
    expect(decision.action).toBe("await_gaps");
    expect(decision.missingTenets).toContain("payment");
    expect(decision.missingTenets).toContain("governing_law");
    expect(decision.missingTenets).not.toContain("parties");
    expect(decision.missingTenets).not.toContain("scope");
    expect(decision.questions.length).toBeGreaterThanOrEqual(2);
    expect(decision.questions.length).toBeLessThanOrEqual(5);
    expect(decision.questions.some((q) => /payment/i.test(q))).toBe(true);
    expect(decision.questions.some((q) => /law/i.test(q))).toBe(true);
    expect(decision.questions.some((q) => /parties to this agreement/i.test(q))).toBe(false);
    expect(decision.questions.some((q) => /purpose or scope/i.test(q))).toBe(false);
  });

  it("painted body with all five tenets → no post-generate ask", () => {
    const decision = evaluatePostGenerateTenetRecall({
      paintedBody: COMPLETE_PAINTED,
      alreadyAsked: false,
    });
    expect(decision.action).toBe("proceed");
    expect(decision.questions).toHaveLength(0);
    expect(decision.missingTenets).toHaveLength(0);
  });

  it("questions are clean one-liners (no pasted outline dump)", () => {
    const qs = buildPostGenerateMissingTenetQuestions(INCOMPLETE_PAINTED);
    expect(qs.length).toBeGreaterThanOrEqual(1);
    expect(qs.length).toBeLessThanOrEqual(5);
    for (const q of qs) {
      expect(q.includes("\n")).toBe(false);
      expect(q.length).toBeLessThanOrEqual(160);
      expect(isPollutedTenetQuestionHint(q)).toBe(false);
      expect(q).not.toMatch(/DRAFT OUTLINE/i);
      expect(q).not.toMatch(/1\.\s+Parties/);
      expect(q).not.toMatch(/include all rooms and hallway/i);
      expect(q).not.toMatch(/outline filler/i);
    }

    const localQs = buildLocalMissingTenetQuestions(OUTLINE_DUMP, {
      title: "Painting Agreement",
      parties: [{ name: "Alex Rivera" }, { name: "Mike Chen" }],
      purpose: "",
      payment_terms: "",
      duration: "30 days",
      jurisdiction: "",
    });
    expect(localQs.join(" ")).not.toMatch(/DRAFT OUTLINE/i);
    expect(localQs.join(" ")).not.toMatch(/1\.\s+Parties/);
    for (const q of localQs) {
      expect(q.includes("\n")).toBe(false);
      expect(q.split(".").filter(Boolean).length).toBeLessThanOrEqual(3);
    }
  });

  it("one-cycle cap: second paint does not re-ask", () => {
    const first = evaluatePostGenerateTenetRecall({
      paintedBody: INCOMPLETE_PAINTED,
      alreadyAsked: false,
    });
    expect(first.action).toBe("await_gaps");
    const second = evaluatePostGenerateTenetRecall({
      paintedBody: INCOMPLETE_PAINTED,
      alreadyAsked: true,
    });
    expect(second.action).toBe("proceed");
    expect(second.questions).toHaveLength(0);
  });
});
