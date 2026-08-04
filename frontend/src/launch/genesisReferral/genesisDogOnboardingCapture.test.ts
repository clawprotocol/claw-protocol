/** @vitest-environment jsdom */
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  GENESIS_DOG_ONBOARDING_DESTINATION,
  GENESIS_DOG_ONBOARDING_PATH,
  buildGenesisDogSignupLink,
  captureGenesisDogOnboardingFromLocation,
  clearGenesisDogOnboardingIntent,
  genesisDogOnboardingBindFields,
  getGenesisDogOnboardingIntent,
  hasGenesisDogOnboardingIntent,
  rememberGenesisDogOnboardingIntent,
  suggestGenesisReferralCode,
} from "./genesisDogOnboardingCapture";

describe("genesisDogOnboardingCapture", () => {
  beforeEach(() => {
    localStorage.clear();
    document.cookie.split(";").forEach((c) => {
      const name = c.split("=")[0]?.trim();
      if (name) document.cookie = `${name}=; Path=/; Max-Age=0`;
    });
  });

  afterEach(() => {
    clearGenesisDogOnboardingIntent();
  });

  it("persists signup intent from /genesis-dogs and ?join=genesis-dogs", () => {
    expect(captureGenesisDogOnboardingFromLocation(GENESIS_DOG_ONBOARDING_PATH, "")).toBeTruthy();
    expect(hasGenesisDogOnboardingIntent()).toBe(true);
    clearGenesisDogOnboardingIntent();
    expect(captureGenesisDogOnboardingFromLocation("/app", "?join=genesis-dogs")).toBeTruthy();
    expect(getGenesisDogOnboardingIntent()).toEqual({
      community_slug: "genesis-dogs",
      signup_intent: "genesis-referral",
      affiliate_candidate: true,
    });
    expect(genesisDogOnboardingBindFields()?.affiliate_candidate).toBe(true);
  });

  it("ignores unrelated join values", () => {
    expect(captureGenesisDogOnboardingFromLocation("/app", "?join=other")).toBeNull();
    expect(hasGenesisDogOnboardingIntent()).toBe(false);
  });

  it("builds signup link and suggest referral codes with plus-email local part", () => {
    expect(buildGenesisDogSignupLink("https://lawdog.me")).toBe("https://lawdog.me/genesis-dogs");
    expect(GENESIS_DOG_ONBOARDING_DESTINATION).toBe("/app?join=genesis-dogs");
    expect(
      suggestGenesisReferralCode({ email: "cryptocurated21+lawdogtest2@gmail.com" }),
    ).toBe("CRYPTOCURATED21");
    rememberGenesisDogOnboardingIntent();
    clearGenesisDogOnboardingIntent();
    expect(hasGenesisDogOnboardingIntent()).toBe(false);
  });
});
