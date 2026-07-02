import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

describe("AgreementReview workspace review-first details", () => {
  const agreementReviewPath = join(__dirname, "AgreementReview.tsx");

  it("defaults wizard details step to summary-first presentation", () => {
    const source = readFileSync(agreementReviewPath, "utf8");
    expect(source).toContain("workspaceReviewFirstDetails");
    expect(source).toContain('workspaceDetailsPresentation === "summary"');
    expect(source).toContain("AgreementReadySummaryCard");
    expect(source).toContain("AgreementDetailsReadOnlyPanel");
    expect(source).toContain("showWorkspaceReviewFirstSummary");
  });
});
