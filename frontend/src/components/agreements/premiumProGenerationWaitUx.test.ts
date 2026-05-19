import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  PREMIUM_PRO_WAIT_REASSURANCE,
  PREMIUM_PRO_WAIT_STALE_COPY_BANS,
  PREMIUM_RETURN_RETRY_GENERATION_LABEL,
  resolvePremiumProWaitModalView,
} from "../../lib/premiumPostCheckoutReturnUx";

describe("premium Pro generation wait (static)", () => {
  const intake = readFileSync(join(__dirname, "AgreementBuilderIntake.tsx"), "utf8");
  const panel = readFileSync(join(__dirname, "PremiumProGenerationWaitPanel.tsx"), "utf8");

  it("uses single PremiumProGenerationWaitPanel for processing", () => {
    expect(intake).toContain("PremiumProGenerationWaitPanel");
    expect(intake).toContain("resolvePremiumProWaitVisualPhase");
    expect(intake).not.toContain("Still finishing your Pro agreement");
    expect(intake).not.toContain("PREMIUM_RETURN_KEEP_WAITING_LABEL");
  });

  it("does not mount a second competing wait modal component", () => {
    expect(intake.match(/<PremiumProGenerationWaitPanel\b/g)?.length).toBe(1);
    expect(intake).not.toMatch(/Still building your Pro agreement/);
  });

  it("keeps modal open on terminal_failure phase", () => {
    expect(intake).toContain('"terminal_failure"');
    expect(intake).toContain("logPremiumProWaitSuccessTransition");
  });

  it("resets scroll to Pro review heading after authoritative payment success", () => {
    expect(intake).toContain("resetPremiumReviewScrollToTop");
    expect(intake).toContain('reason: "payment_success_authoritative_apply"');
    const createPage = readFileSync(join(__dirname, "../../launch/simpleProduct/SimpleCreatePage.tsx"), "utf8");
    expect(createPage).toContain("PREMIUM_PRO_REVIEW_SCROLL_ANCHOR_ID");
    expect(createPage).toContain("titleHeadingId={paidProReviewReadyShell");
  });

  it("panel logs wait view and uses compact progress pills", () => {
    expect(panel).toContain("logPremiumProWaitView");
    expect(panel).toContain("ProgressPill");
    expect(panel).not.toContain("StepIcon");
  });

  it("unified copy includes single reassurance", () => {
    expect(PREMIUM_PRO_WAIT_REASSURANCE).toContain(
      "Nothing is sent, signed, or shared until you confirm",
    );
    expect(resolvePremiumProWaitModalView("processing").reassurance).toBe(PREMIUM_PRO_WAIT_REASSURANCE);
  });

  it("extended_wait does not show recovery; terminal_failure does", () => {
    expect(resolvePremiumProWaitModalView("extended_wait").showRecoveryActions).toBe(false);
    expect(resolvePremiumProWaitModalView("terminal_failure").showRecoveryActions).toBe(true);
    expect(PREMIUM_RETURN_RETRY_GENERATION_LABEL).toBe("Retry Pro generation");
  });

  it("does not duplicate still-building and still-finishing user copy", () => {
    const phases = ["processing", "soft_wait", "extended_wait", "success"] as const;
    const copy = phases
      .map((p) => {
        const v = resolvePremiumProWaitModalView(p);
        return `${v.title} ${v.statusLine ?? ""}`;
      })
      .join(" ");
    expect(copy).not.toMatch(/Still finishing/i);
    expect(copy).toMatch(/Still building/i);
  });

  it("progress pills use Upgrade and Terms loaded, not Payment", () => {
    const view = resolvePremiumProWaitModalView("processing");
    const labels = view.progressSteps.map((s) => s.shortLabel).join(" ");
    expect(labels).toContain("Upgrade");
    expect(labels).toContain("Terms loaded");
    expect(labels).not.toMatch(/\bPayment\b/);
  });

  it("bans stale copy in resolved modal views", () => {
    const phases = ["processing", "soft_wait", "extended_wait", "terminal_failure", "success"] as const;
    const bundle = phases
      .map((p) => {
        const v = resolvePremiumProWaitModalView(p);
        return [v.title, v.statusLine, v.reassurance].join(" ");
      })
      .join(" ")
      .toLowerCase();
    for (const banned of PREMIUM_PRO_WAIT_STALE_COPY_BANS) {
      expect(bundle).not.toContain(banned.toLowerCase());
    }
  });
});
