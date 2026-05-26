import { describe, expect, it } from "vitest";
import {
  buildReviewFirstTextDiffSummary,
  canReviewChanges,
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
    expect(diff.changedSections[0]?.title).toBe("Payment terms changed");
    expect(diff.changedSections[0]?.previous).toContain("30 days");
    expect(diff.changedSections[0]?.proposed).toContain("15 days");
    expect(diff.summary).toBe("1 material wording update found.");
    expect(diff.changedSections[0]?.summary).toBe("Payment terms changed");
    expect(diff.changedSections[0]?.previousParts.some((part) => part.kind === "removed" && part.text.includes("30"))).toBe(true);
    expect(diff.changedSections[0]?.proposedParts.some((part) => part.kind === "added" && part.text.includes("15"))).toBe(true);
  });

  it("shows compact changed snippets instead of entire unchanged clauses", () => {
    const previous =
      "Ownership and Work Product\nCompany owns the project deliverables and work product created specifically for Company after payment. Existing background materials remain separately owned. This paragraph also confirms routine cooperation, ordinary access, and unchanged project administration terms that do not affect ownership.";
    const proposed =
      "Ownership and Work Product\nClient owns the project deliverables and work product created specifically for Client after full payment. Existing scripts, background technology, and reusable automation components remain separately owned. This paragraph also confirms routine cooperation, ordinary access, and unchanged project administration terms that do not affect ownership.";

    const diff = buildReviewFirstTextDiffSummary(previous, proposed);
    const section = diff.changedSections[0];

    expect(section?.summary).toBe("Ownership changed");
    expect(section?.previous).toContain("Company");
    expect(section?.previous).toContain("after payment");
    expect(section?.proposed).toContain("Client");
    expect(section?.proposed).toContain("after full payment");
    expect(section?.proposed).toContain("scripts");
    expect(section?.previous.length ?? 0).toBeLessThan(previous.length);
    expect(section?.proposed.length ?? 0).toBeLessThan(proposed.length);
  });

  it("enables review changes from pasted text diff only (not attribution)", () => {
    const diff = buildReviewFirstTextDiffSummary("Payment is due in 30 days.", "Payment is due in 15 days.");

    expect(canReviewChanges({ diff, proposedText: "Payment is due in 15 days." })).toBe(true);
    expect(canReviewChanges({ diff, proposedText: "" })).toBe(false);
    expect(
      canReviewChanges({
        diff: buildReviewFirstTextDiffSummary("Payment is due in 30 days.", "Payment is due in 30 days."),
        proposedText: "Payment is due in 30 days.",
      }),
    ).toBe(false);
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
