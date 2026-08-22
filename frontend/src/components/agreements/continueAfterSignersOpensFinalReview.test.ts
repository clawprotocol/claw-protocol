import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const here = dirname(fileURLToPath(import.meta.url));
const intakeSrc = readFileSync(join(here, "AgreementBuilderIntake.tsx"), "utf8");

function continueAfterSignersBlock(src: string): string {
  const start = src.indexOf("Continue after complete signers opens SimpleProFinalReviewScreen");
  expect(start).toBeGreaterThan(-1);
  const end = src.indexOf("isPaidProReviewDecisionScrollReason", start);
  expect(end).toBeGreaterThan(start);
  return src.slice(start, end);
}

describe("Continue after complete signers opens SimpleProFinalReviewScreen", () => {
  it("first-screen and resume Continue finalize into final review, not /app/esign", () => {
    const block = continueAfterSignersBlock(intakeSrc);
    expect(block).toContain('cta.reason === "demo_session_signer_details_complete"');
    expect(block).toContain('cta.reason === "demo_session_signer_details_complete_fallback"');
    expect(block).toContain('cta.reason === "dashboard_signer_setup_resume_complete"');
    expect(block).toContain('cta.reason === "paid_pro_signer_details_complete"');
    expect(block).toContain("finalizePaidProSignerMetadataAndOpenReviewDecision");
    expect(block).not.toContain("handlePaidProPrepareSignaturesFromFirstReview");
    expect(block).not.toContain("enterGuidedSignatureTrackRoute");
    expect(block).not.toContain("/app/esign");
  });

  it("finalize leaves the forced first-review arm so SimpleProFinalReviewScreen can mount", () => {
    expect(intakeSrc).toMatch(
      /\(paidProForcedFirstReviewActive\s*&&\s*!paidProSignerMetadataFinalized\)/,
    );
    expect(intakeSrc).toContain("<SimpleProFinalReviewScreen");
    const finalizeFn = intakeSrc.slice(
      intakeSrc.indexOf("const finalizePaidProSignerMetadataAndOpenReviewDecision"),
      intakeSrc.indexOf("finalizePaidProSignerMetadataAndOpenReviewDecisionRef.current"),
    );
    expect(finalizeFn).toContain('setCreateFlowPhase("draft_ready_for_review")');
    expect(finalizeFn).toContain("setGuidedFinalReviewExplicitlyOpened(true)");
    expect(finalizeFn).toContain("setPaidProInlineSignerSetupLatched(false)");
    expect(finalizeFn).not.toContain("/app/esign");
  });
});
