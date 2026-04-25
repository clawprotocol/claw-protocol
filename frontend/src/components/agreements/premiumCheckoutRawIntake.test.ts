import { describe, expect, it } from "vitest";
import type { ParsedDraftShape } from "./intakeSmartDefaults";
import { buildReviewCoercionRawIntakeFromDraft } from "./premiumCheckoutRawIntake";

const emptyPayment = { amount: null as number | null, cadence: null as string | null, valid: false };

describe("buildReviewCoercionRawIntakeFromDraft", () => {
  it("yields non-empty text when review cleared the live buffer but a starter draft exists (premium checkout path)", () => {
    const draft: ParsedDraftShape = {
      title: "Consulting Agreement",
      jurisdiction: "Delaware",
      parties: [
        { name: "Acme Corp", role: "party" },
        { name: "Jane Consultant", role: "party" },
      ],
      purpose: "Marketing services for Q2 launch.",
      payment_terms: "Net 30.",
      duration: "6 months",
      due_date: null,
      effective_date: "April 1, 2026",
      payment: emptyPayment,
    };
    const coerced = buildReviewCoercionRawIntakeFromDraft(draft, "");
    expect(coerced.length).toBeGreaterThan(32);
    expect(coerced).toContain("Consulting");
    expect(coerced).toContain("Acme");
  });
});
