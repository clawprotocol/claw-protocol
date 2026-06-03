import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { resolvePremiumAgreementParseTimeoutMs } from "../../lib/premiumAgreementParseTimeout";

describe("paidPro Test242 premium_parse_timeout checkout", () => {
  const agreementsDir = dirname(fileURLToPath(import.meta.url));

  it("checkout parse timeout exceeds legacy 90s wall", () => {
    expect(
      resolvePremiumAgreementParseTimeoutMs({ aiModelClass: "premium", checkoutCompletion: true }),
    ).toBeGreaterThan(90_000);
  });

  it("AgreementBuilderIntake uses checkoutCompletion parse for post-checkout ensure", () => {
    const src = readFileSync(join(agreementsDir, "AgreementBuilderIntake.tsx"), "utf8");
    expect(src).toContain("checkoutCompletion: true");
    expect(src).toContain("resolvePremiumAgreementParseTimeoutMs");
    expect(src).toContain("premium_parse_timeout_deferred_retry");
    expect(src).not.toMatch(/const parseTimeoutMs = isPremium \? 90_000/);
  });

  it("skips quality-regen second parse on checkout_completion", () => {
    const src = readFileSync(join(agreementsDir, "premiumCompletionPipeline.ts"), "utf8");
    expect(src).toContain('input.premiumGenerationCallReason !== "checkout_completion"');
    expect(src).toMatch(/await\s+input\.parseDraft\(rawForSoT \|\| rawIntake\)/);
  });

  it("defers trouble-finalizing copy for parse-timeout retry", () => {
    const src = readFileSync(join(agreementsDir, "AgreementBuilderIntake.tsx"), "utf8");
    expect(src).toContain("deferInFlightClearForParseTimeoutRetry");
    expect(src).toContain("isPremiumParseTimeoutDeferredCheckoutRetry");
  });
});
