import { describe, expect, it } from "vitest";
import type { PremiumSuccessGateResult } from "./premiumSuccessGate";
import {
  shouldShowBlockedDraftPreviewLabel,
  shouldShowRetryNeedsDetailsPanel,
} from "./premiumTruthGateUi";

const strictBlockedGate: PremiumSuccessGateResult = {
  state: "premium_needs_details",
  successBannerAllowed: false,
  signerCtaAllowed: false,
  validation: { ok: false, reasons: ["strict_pipeline_ineligible"] },
  successBannerReasons: ["strict_pipeline_ineligible"],
  intent_id: "founder_equity_vesting",
  intent_confidence: 0.9,
  strict_intent: true,
};

describe("premium truth gate UI helpers", () => {
  it("strict founder + blocked gate shows retry panel", () => {
    expect(
      shouldShowRetryNeedsDetailsPanel({
        proFullDraftQualityRetry: false,
        premiumProTruthGate: strictBlockedGate,
      }),
    ).toBe(true);
  });

  it("strict founder + live preview shows draft-preview warning label", () => {
    expect(
      shouldShowBlockedDraftPreviewLabel({
        premiumProTruthGate: strictBlockedGate,
        renderSource: "live_generated_preview",
      }),
    ).toBe(true);
  });

  it("custom_unknown fallback preview does not show strict retry gate", () => {
    expect(
      shouldShowRetryNeedsDetailsPanel({
        proFullDraftQualityRetry: false,
        premiumProTruthGate: {
          ...strictBlockedGate,
          strict_intent: false,
          intent_id: "custom_unknown",
        },
      }),
    ).toBe(false);
    expect(
      shouldShowBlockedDraftPreviewLabel({
        premiumProTruthGate: {
          ...strictBlockedGate,
          strict_intent: false,
          intent_id: "custom_unknown",
        },
        renderSource: "fallback_preview",
      }),
    ).toBe(false);
  });

  it("successful gate does not show retry panel", () => {
    expect(
      shouldShowRetryNeedsDetailsPanel({
        proFullDraftQualityRetry: false,
        premiumProTruthGate: {
          ...strictBlockedGate,
          state: "premium_success",
          successBannerAllowed: true,
          signerCtaAllowed: true,
        },
      }),
    ).toBe(false);
  });
});
