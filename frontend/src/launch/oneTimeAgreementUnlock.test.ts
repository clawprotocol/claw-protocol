import { describe, expect, it } from "vitest";
import { FEATURE_GATE_REGISTRY } from "../config/featureFlags/keys";
import { FEATURE_GATE_ENV_KEYS } from "../config/featureFlags/envMap";
import { featureFlags } from "../config/featureFlags";
import { isOneTimeAgreementUnlockEnabled, isSingleAgreementCheckoutIntent } from "./oneTimeAgreementUnlock";

describe("one-time agreement unlock is out of paid-beta", () => {
  it("cannot be enabled by helper, intent, feature flag, or control-plane gate", () => {
    expect(isOneTimeAgreementUnlockEnabled()).toBe(false);
    expect(isSingleAgreementCheckoutIntent(new URLSearchParams("intent=single_agreement"))).toBe(false);
    expect("oneTimeAgreementUnlock" in featureFlags).toBe(false);
    expect("one_time_agreement_unlock_enabled" in FEATURE_GATE_REGISTRY).toBe(false);
    expect("one_time_agreement_unlock_enabled" in FEATURE_GATE_ENV_KEYS).toBe(false);
  });
});
