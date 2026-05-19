import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Regression: checkout return with restore=starterReview&premiumCompletion=1 must render
 * authoritative Pro review (not retry/finish-first) when server returns long server_full_draft
 * even if generation_outcome is needs_details.
 */
describe("paid checkout authoritative render (source contract)", () => {
  const intakePath = join(__dirname, "AgreementBuilderIntake.tsx");
  const src = readFileSync(intakePath, "utf8");

  it("defines canonical authoritativePremiumUiCommitted before starter upsell and recovery panels", () => {
    const authIdx = src.indexOf("const authoritativePremiumUiCommitted = useMemo");
    const starterIdx = src.indexOf("const showStarterProRefineUpsell = useMemo");
    const retryIdx = src.indexOf("const showStrictRetryNeedsDetailsPanel =");
    expect(authIdx).toBeGreaterThan(-1);
    expect(starterIdx).toBeGreaterThan(authIdx);
    expect(retryIdx).toBeGreaterThan(authIdx);
  });

  it("suppresses strict retry and blocked preview when authoritativePremiumUiCommitted", () => {
    expect(src).toMatch(
      /const showStrictRetryNeedsDetailsPanel =\s*!\s*authoritativePremiumUiCommitted\s*&&\s*shouldShowRetryNeedsDetailsPanel/,
    );
    expect(src).toMatch(
      /const showStrictBlockedDraftPreviewLabel =\s*!\s*authoritativePremiumUiCommitted\s*&&\s*shouldShowBlockedDraftPreviewLabel/,
    );
  });

  it("suppresses amber recovery and paid retry when authoritativePremiumUiCommitted", () => {
    expect(src).toMatch(/showProAmberRecoveryPanel = Boolean\([\s\S]*?!authoritativePremiumUiCommitted/);
    expect(src).toMatch(/const shouldShowPaidRetry = Boolean\([\s\S]*?!authoritativePremiumUiCommitted/);
  });

  it("shows commercial Pro chip when authoritativePremiumUiCommitted on paid surface", () => {
    expect(src).toMatch(
      /if \(authoritativePremiumUiCommitted\) \{\s*return \{ version: CHIP_VERSION_PRO, state: CHIP_STATE_COMMERCIAL \};/,
    );
  });

  it("repair effect clears retry flags, hydrates review, scroll-resets, and cleans URL", () => {
    expect(src).toContain("authoritativePremiumRepairLoggedRef");
    expect(src).toMatch(/if \(authoritativePremiumUiCommitted\)[\s\S]*?setProFullDraftQualityRetry\(false\)/);
    expect(src).toMatch(
      /authoritativePremiumUiCommitted[\s\S]*?resetPremiumReviewScrollToTop\(\{ reason: "payment_success_authoritative_apply"/,
    );
    expect(src).toMatch(/authoritativePremiumUiCommitted[\s\S]*?cleanPremiumUrlAfterAuthoritativeCommit\(\)/);
    expect(src).toMatch(/logPremiumAuthoritativeCommit\([\s\S]*?logPremiumFallbackSuppressed\("authoritative_doc_present"\)/);
  });

  it("applySuccess skips paid gate retry path when authoritativeCommittedForGate.committed", () => {
    expect(src).toContain("const authoritativeCommittedForGate = resolveAuthoritativePremiumCommitted");
    expect(src).toMatch(/if \(!fin\.ok && !authoritativeCommittedForGate\.committed\)/);
  });

  it("does not set finish-draft placeholder when authoritative pipeline applies", () => {
    const gateBlock = src.slice(
      src.indexOf("const authoritativeCommittedForGate = resolveAuthoritativePremiumCommitted"),
      src.indexOf("setProFullDraftQualityRetry(false);", src.indexOf("const authoritativeCommittedForGate")),
    );
    expect(gateBlock).toContain("Review and edit the document below when it appears");
    expect(gateBlock).toContain("return;");
    expect(gateBlock).toContain("!authoritativeCommittedForGate.committed");
  });
});
