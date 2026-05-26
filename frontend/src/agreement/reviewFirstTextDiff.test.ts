import { describe, expect, it } from "vitest";
import {
  buildReviewFirstTextDiffSummary,
  canSubmitReviewFirstProposal,
  normalizeReviewTextForComparison,
} from "./reviewFirstTextDiff";

describe("reviewFirstTextDiff", () => {
  it("ignores whitespace, bullet indentation, smart quotes, and capitalization-only changes", () => {
    const previous = "Schedule A\n\n- Payment is due within 30 days.\nClient owns the final copy.";
    const proposed = "schedule a\n\n   *   Payment   is due within 30 days.\nclient owns the final copy.";

    const diff = buildReviewFirstTextDiffSummary(previous, proposed);

    expect(normalizeReviewTextForComparison(previous)).toBe(normalizeReviewTextForComparison(proposed));
    expect(diff.status).toBe("no_change");
    expect(diff.hasMaterialChanges).toBe(false);
  });

  it("identifies changed Schedule A wording", () => {
    const previous = "Agreement\n\nSchedule A\nPayment is due within 30 days.\nSupport is email only.";
    const proposed = "Agreement\n\nSchedule A\nPayment is due within 15 days.\nSupport includes phone escalation.";

    const diff = buildReviewFirstTextDiffSummary(previous, proposed);

    expect(diff.status).toBe("changed");
    expect(diff.hasMaterialChanges).toBe(true);
    expect(diff.changedSections[0]?.title).toContain("Schedule A");
    expect(diff.changedSections[0]?.previous).toContain("30 days");
    expect(diff.changedSections[0]?.proposed).toContain("15 days");
  });

  it("requires changed wording, attribution, and rendered preview before submit", () => {
    const diff = buildReviewFirstTextDiffSummary("Payment is due in 30 days.", "Payment is due in 15 days.");

    expect(
      canSubmitReviewFirstProposal({
        diff,
        hasReviewerAttribution: true,
        comparisonPreviewRendered: true,
      }),
    ).toBe(true);
    expect(
      canSubmitReviewFirstProposal({
        diff,
        hasReviewerAttribution: false,
        comparisonPreviewRendered: true,
      }),
    ).toBe(false);
    expect(
      canSubmitReviewFirstProposal({
        diff,
        hasReviewerAttribution: true,
        comparisonPreviewRendered: false,
      }),
    ).toBe(false);
  });
});
