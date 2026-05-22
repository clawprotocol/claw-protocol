import { describe, expect, it } from "vitest";
import { canApplyLatePremiumCompletionFromModal } from "./premiumPostCheckoutModalRace";

describe("canApplyLatePremiumCompletionFromModal", () => {
  it("allows late success when the effect run is still current and the user did not dismiss", () => {
    expect(
      canApplyLatePremiumCompletionFromModal({
        runIsStillCurrent: true,
        userDismissedPostCheckoutWait: false,
      }),
    ).toEqual({ apply: true, reason: "ok" });
  });

  it("blocks when the run is no longer current (e.g. effect cleanup)", () => {
    expect(
      canApplyLatePremiumCompletionFromModal({
        runIsStillCurrent: false,
        userDismissedPostCheckoutWait: false,
      }),
    ).toEqual({ apply: false, reason: "stale_unmounted" });
  });

  it("blocks late success when the user already dismissed the post-checkout wait (escape)", () => {
    expect(
      canApplyLatePremiumCompletionFromModal({
        runIsStillCurrent: true,
        userDismissedPostCheckoutWait: true,
      }),
    ).toEqual({ apply: false, reason: "user_dismissed" });
  });

  it("always applies retryable network/generation results even when run unmounted", () => {
    expect(
      canApplyLatePremiumCompletionFromModal({
        runIsStillCurrent: false,
        userDismissedPostCheckoutWait: true,
        retryableResult: true,
      }),
    ).toEqual({ apply: true, reason: "ok" });
  });
});
