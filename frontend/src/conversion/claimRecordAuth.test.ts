import { describe, expect, it } from "vitest";
import { getClaimRecordEmailContinueHref, getClaimRecordGoogleAuthHref, shouldDeferClaimUpgradePrompt } from "./claimRecordAuth";

describe("claimRecordAuth", () => {
  it("returns default email href when env unset", () => {
    expect(getClaimRecordEmailContinueHref()).toBe("/app/settings");
  });

  it("returns null google href when env unset", () => {
    expect(getClaimRecordGoogleAuthHref()).toBeNull();
  });

  it("shouldDeferClaimUpgradePrompt is a no-op stub for future billing", () => {
    expect(shouldDeferClaimUpgradePrompt("any")).toBe(false);
  });
});
