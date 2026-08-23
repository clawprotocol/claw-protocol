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

  it("SimpleCreatePage disables homeHeroAutoGenerate after pay so leftover free ask cannot remount", () => {
    expect(createPage).toContain("!premiumCompletionReturn");
    expect(createPage).toContain("!hasPaidPremiumCompletionSession()");
    const homeAuto = createPage.indexOf("const homeHeroAutoGenerate =");
    expect(homeAuto).toBeGreaterThan(-1);
    const homeAutoBlock = createPage.slice(homeAuto, homeAuto + 520);
    expect(homeAutoBlock).toContain("!checkoutBackRestoreActive");
    expect(homeAutoBlock).toContain("!premiumCompletionReturn");
    expect(homeAutoBlock).toContain("!hasPaidPremiumCompletionSession()");
  });

  it("starter review Continue with Pro uses launch_pro_checkout (not continue_basic_draft)", () => {
    expect(intake).toContain('action: "launch_pro_checkout"');
    expect(intake).toContain("restored_starter_review_cta");
    expect(intake).toContain('case "launch_pro_checkout"');
    expect(intake).toMatch(/if \(showUpgradeToFullDraftOnReview\)[\s\S]*launch_pro_checkout/);
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
