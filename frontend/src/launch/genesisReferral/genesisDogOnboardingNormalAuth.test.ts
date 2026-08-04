/** @vitest-environment jsdom */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  captureGenesisDogOnboardingFromLocation,
  clearGenesisDogOnboardingIntent,
  genesisDogOnboardingBindFields,
  hasGenesisDogOnboardingIntent,
} from "./genesisDogOnboardingCapture";

describe("genesis dog onboarding vs normal auth", () => {
  beforeEach(() => {
    localStorage.clear();
    clearGenesisDogOnboardingIntent();
  });

  afterEach(() => {
    clearGenesisDogOnboardingIntent();
    vi.unstubAllGlobals();
  });

  it("does not stamp bind fields for normal /app visits", () => {
    expect(captureGenesisDogOnboardingFromLocation("/app", "")).toBeNull();
    expect(captureGenesisDogOnboardingFromLocation("/app/sign-in", "")).toBeNull();
    expect(hasGenesisDogOnboardingIntent()).toBe(false);
    expect(genesisDogOnboardingBindFields()).toBeNull();
  });

  it("signup and referral links are public paths without secrets", async () => {
    const { buildGenesisDogSignupLink } = await import("./genesisDogOnboardingCapture");
    const { buildGenesisReferralLink } = await import("./genesisReferralCapture");
    const signup = buildGenesisDogSignupLink("https://lawdog.me");
    const referral = buildGenesisReferralLink("TESTDOG", "https://lawdog.me");
    expect(signup).toBe("https://lawdog.me/genesis-dogs");
    expect(referral).toBe("https://lawdog.me/app/create?ref=TESTDOG");
    expect(signup.toLowerCase()).not.toMatch(/secret|token|bearer|admin/);
    expect(referral.toLowerCase()).not.toMatch(/secret|token|bearer|admin/);
  });
});
