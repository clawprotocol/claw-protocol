import { describe, expect, it } from "vitest";
import { buildLiveDraftPreview } from "./liveDraftHeuristics";
import {
  buildIntakeGuidedHints,
  isStructuredDraftUsableForLocalReviewFallback,
  isUsablePartialIntakeStructure,
} from "./intakeGuidedHints";

describe("intakeGuidedHints", () => {
  it("treats default starter NDA phrase as usable partial structure (inferred type)", () => {
    const text = "Simple NDA between two parties";
    const model = buildLiveDraftPreview(text);
    expect(model.docTitle).not.toBe("Agreement");
    expect(isUsablePartialIntakeStructure(model, text)).toBe(true);
    const hints = buildIntakeGuidedHints(model, text);
    expect(hints.length).toBeGreaterThanOrEqual(3);
    expect(hints.some((h) => /party|names/i.test(h))).toBe(true);
  });

  it("structured local-review fallback: true when heuristics are weak but parse has title, purpose, parties", () => {
    const text = "short";
    const model = buildLiveDraftPreview(text);
    expect(isUsablePartialIntakeStructure(model, text)).toBe(false);
    const ok = isStructuredDraftUsableForLocalReviewFallback(
      {
        title: "Consulting Retainer",
        purpose: "Provide marketing services for the client for a defined term and fee.",
        parties: [
          { name: "Acme LLC", role: "client" },
          { name: "Freelancer", role: "provider" },
        ],
      },
      model,
      text,
    );
    expect(ok).toBe(true);
  });
});
