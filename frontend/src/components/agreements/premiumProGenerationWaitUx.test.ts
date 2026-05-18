import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  PREMIUM_PRO_WAIT_REASSURANCE,
  PREMIUM_RETURN_RETRY_GENERATION_LABEL,
  resolvePremiumProWaitModalView,
} from "../../lib/premiumPostCheckoutReturnUx";

describe("premium Pro generation wait (static)", () => {
  const intake = readFileSync(join(__dirname, "AgreementBuilderIntake.tsx"), "utf8");

  it("uses single PremiumProGenerationWaitPanel for processing", () => {
    expect(intake).toContain("PremiumProGenerationWaitPanel");
    expect(intake).toContain("resolvePremiumProWaitVisualPhase");
    expect(intake).not.toContain("Still finishing your Pro agreement");
    expect(intake).not.toContain("PREMIUM_RETURN_KEEP_WAITING_LABEL");
  });

  it("keeps modal open on terminal_failure phase", () => {
    expect(intake).toContain('"terminal_failure"');
    expect(intake).toContain("logPremiumProWaitSuccessTransition");
  });

  it("unified copy includes reassurance", () => {
    expect(PREMIUM_PRO_WAIT_REASSURANCE).toContain(
      "Nothing is sent, signed, or shared until you confirm",
    );
    expect(resolvePremiumProWaitModalView("processing").reassurance).toBe(PREMIUM_PRO_WAIT_REASSURANCE);
  });

  it("does not duplicate still-building and still-finishing sources", () => {
    const ux = readFileSync(join(__dirname, "../../lib/premiumPostCheckoutReturnUx.ts"), "utf8");
    expect(ux).not.toContain("Still finishing your Pro agreement");
    expect(ux).toContain("Still building");
    expect(PREMIUM_RETURN_RETRY_GENERATION_LABEL).toBe("Retry Pro generation");
  });
});
