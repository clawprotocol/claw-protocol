import { describe, expect, it } from "vitest";
import { PREMIUM_POST_CHECKOUT_HARD_FAILOPEN_MS } from "./postCheckoutModalTimeout";
import {
  PREMIUM_POST_CHECKOUT_PATIENCE_TITLE,
  PREMIUM_RETURN_RETRY_GENERATION_LABEL,
  PREMIUM_RETURN_USE_STARTER_LABEL,
  resolvePremiumCheckoutModalCopy,
  shouldEnterPremiumReturnPatienceExtended,
  shouldLogPremiumReturnLateSuccess,
  shouldTriggerPremiumModalFailopen,
} from "./premiumPostCheckoutReturnUx";

describe("premium post-checkout return UX policy", () => {
  it("120s hard ceiling while request in flight does not trigger modal failopen", () => {
    expect(
      shouldTriggerPremiumModalFailopen({
        hasAcceptedServerFullDraftBody: false,
        premiumFullDraftRequestFailed: false,
        authoritativeRequestInFlight: true,
      }),
    ).toBe(false);
  });

  it("enters patience extended state at hard ceiling when request still in flight", () => {
    expect(
      shouldEnterPremiumReturnPatienceExtended({
        elapsedMs: PREMIUM_POST_CHECKOUT_HARD_FAILOPEN_MS,
        authoritativeRequestInFlight: true,
        hasAcceptedServerFullDraftBody: false,
      }),
    ).toBe(true);
  });

  it("patience extended modal copy does not use connection-issue framing", () => {
    const copy = resolvePremiumCheckoutModalCopy("patience_extended");
    expect(copy.title).toBe(PREMIUM_POST_CHECKOUT_PATIENCE_TITLE);
    expect(copy.body).toMatch(/payment was detected/i);
    expect(copy.body).not.toMatch(/connection issue/i);
    expect(copy.showPatienceActions).toBe(true);
    expect(PREMIUM_RETURN_RETRY_GENERATION_LABEL).toMatch(/Retry Pro generation/);
    expect(PREMIUM_RETURN_USE_STARTER_LABEL).toMatch(/starter draft/i);
  });

  it("late success log applies after patience extended without terminal failopen", () => {
    expect(
      shouldLogPremiumReturnLateSuccess({
        hardFailopenWasActive: false,
        patienceExtendedWasActive: true,
      }),
    ).toBe(true);
    expect(
      shouldLogPremiumReturnLateSuccess({
        hardFailopenWasActive: false,
        patienceExtendedWasActive: false,
      }),
    ).toBe(false);
  });

  it("terminal failopen still allowed when request is not in flight and no body", () => {
    expect(
      shouldTriggerPremiumModalFailopen({
        hasAcceptedServerFullDraftBody: false,
        premiumFullDraftRequestFailed: true,
        authoritativeRequestInFlight: false,
      }),
    ).toBe(true);
  });
});
