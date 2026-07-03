import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

describe("AgreementReview canonical post-generation wiring", () => {
  const agreementReviewPath = join(__dirname, "AgreementReview.tsx");

  it("uses shared post-generation flow across wizard and simple home review", () => {
    const source = readFileSync(agreementReviewPath, "utf8");
    expect(source).toContain("AgreementPostGenerationFlow");
    expect(source).toContain("useAgreementPostGenerationPresentation");
    expect(source).toContain("simpleHomeCanonicalReview");
    expect(source).toContain("wizardCanonicalDetailsFlow");
    expect(source).toContain("showWorkspaceReviewFirstSummary");
  });
});
