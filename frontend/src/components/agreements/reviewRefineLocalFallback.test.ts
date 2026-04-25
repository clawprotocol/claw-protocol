import { describe, expect, it } from "vitest";
import type { ParsedDraftShape } from "./intakeSmartDefaults";
import { tryApplyLocalReviewRefineInstruction } from "./reviewRefineLocalFallback";

const base = (): ParsedDraftShape => ({
  title: "Agreement",
  jurisdiction: "Delaware",
  parties: [
    { name: "A", role: "party" },
    { name: "B", role: "party" },
  ],
  purpose: "Services",
  payment_terms: "$1,000 monthly",
  duration: "12 months",
  due_date: null,
  effective_date: "Upon full execution",
  payment: { amount: 1000, cadence: "monthly", valid: true },
});

describe("tryApplyLocalReviewRefineInstruction", () => {
  it("maps reasonable-notice termination request to termination_summary", () => {
    const d = base();
    const out = tryApplyLocalReviewRefineInstruction(
      d,
      "Add a termination clause with reasonable notice for both parties.",
    );
    expect(out).not.toBeNull();
    expect(out!.termination_summary?.toLowerCase()).toContain("reasonable prior written notice");
  });

  it("returns null for unrelated text", () => {
    expect(tryApplyLocalReviewRefineInstruction(base(), "Please fix the universe.")).toBeNull();
  });
});
