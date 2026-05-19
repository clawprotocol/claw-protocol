import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

describe("checkout back → starter review restore (static)", () => {
  const createPage = readFileSync(join(__dirname, "SimpleCreatePage.tsx"), "utf8");
  const intake = readFileSync(join(__dirname, "../../components/agreements/AgreementBuilderIntake.tsx"), "utf8");
  const checkout = readFileSync(join(__dirname, "SimpleCheckoutPage.tsx"), "utf8");
  const nav = readFileSync(join(__dirname, "../LaunchNavContext.tsx"), "utf8");

  it("SimpleCreatePage disables homeHeroAutoGenerate when checkout restore is active", () => {
    expect(createPage).toContain("checkoutBackRestoreActive");
    expect(createPage).toContain("shouldSkipHomeAutoGenerateForStoredReview");
    expect(createPage).not.toMatch(/homeHeroAutoGenerate\s*=\s*\n?\s*heroHandoff\?\.autoGenerate[\s\S]*!hasStoredCreateReviewState/);
  });

  it("AgreementBuilderIntake restores checkout snapshot before home auto-generate", () => {
    expect(intake).toContain("logCheckoutBackRestoreStart");
    expect(intake).toContain("persistStarterReviewBeforeCheckout");
    expect(intake).toContain("buildCreateReturnToWithStarterReviewRestore");
    expect(intake).toContain("clearCreateReviewAgreementResumeIdOnly");
    expect(intake).toMatch(
      /logCheckoutBackRestoreStart[\s\S]*useLayoutEffect\(\(\) => \{[\s\S]*checkoutBackRestoreActive[\s\S]*logHomeCreateSubmit/,
    );
  });

  it("SimpleCheckoutPage Back navigates to create with restore marker", () => {
    expect(checkout).toContain("buildCreateReturnToWithStarterReviewRestore");
    expect(checkout).not.toContain("onClick={() => window.history.back()}");
  });

  it("LaunchNav preserves handoff when restore=starterReview", () => {
    expect(nav).toContain('get("restore") === "starterReview"');
    expect(nav).toContain("hasCheckoutBackRestoreSnapshot");
  });
});
