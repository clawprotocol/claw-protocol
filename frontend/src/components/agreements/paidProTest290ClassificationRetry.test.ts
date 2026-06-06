/** @vitest-environment jsdom */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  shouldBlockPaidProCanonicalFreezeOnApiFailure,
} from "./paidProApiFailureAuthorityGuard";
import {
  isPremiumFullDraftCorsBlocked,
  isPremiumFullDraftNetworkFailure,
  postPremiumFullDraftWithRetry,
  PREMIUM_FULL_DRAFT_MAX_NETWORK_ATTEMPTS,
} from "./premiumFullDraftApi";

const intakeSrc = readFileSync(
  join(__dirname, "AgreementBuilderIntake.tsx"),
  "utf8",
);

const minimalContext = {
  title: "T",
  jurisdiction: "DE",
  parties: [{ name: "A", role: "a" }],
  purpose: "p",
  payment_terms: "",
  duration: null as string | null,
  due_date: null as string | null,
  effective_date: null as string | null,
  agreement_family: "",
  material_asks: [] as string[],
};

const crossOriginWindow = {
  location: { origin: "https://believable-gentleness-production-3ab6.up.railway.app" },
  setTimeout: (fn: () => void) => {
    fn();
    return 0;
  },
  clearTimeout: () => {},
};

function stubCrossOriginEnv() {
  vi.stubEnv("MODE", "development");
  vi.stubEnv("VITE_CLAW_API_BASE", "https://claw-protocol-production.up.railway.app");
  vi.stubGlobal("window", crossOriginWindow);
}

describe("Test290 premium-full-draft classification", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("cross-origin generic Failed to fetch classifies as network_retryable, not CORS", async () => {
    stubCrossOriginEnv();
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("Failed to fetch")));
    const out = await postPremiumFullDraftWithRetry({
      intakeText: "x".repeat(80),
      context: minimalContext,
    });
    expect(out.ok).toBe(false);
    if (!out.ok) {
      expect(out.failure_kind).toBe("network_retryable");
      expect(out.retryable).toBe(true);
      expect(out.attemptCount).toBe(PREMIUM_FULL_DRAFT_MAX_NETWORK_ATTEMPTS);
    }
    expect(isPremiumFullDraftCorsBlocked(new TypeError("Failed to fetch"))).toBe(false);
    expect(isPremiumFullDraftNetworkFailure(new TypeError("Failed to fetch"))).toBe(true);
  });

  it("explicit browser CORS message classifies as cors on split origin", async () => {
    stubCrossOriginEnv();
    const corsErr = new TypeError(
      "Failed to fetch: Access to fetch at 'https://claw-protocol-production.up.railway.app/api/agreements/premium-full-draft' from origin 'https://believable-gentleness-production-3ab6.up.railway.app' has been blocked by CORS policy",
    );
    expect(isPremiumFullDraftCorsBlocked(corsErr)).toBe(true);
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(corsErr));
    const out = await postPremiumFullDraftWithRetry({
      intakeText: "x".repeat(80),
      context: minimalContext,
    });
    expect(out.ok).toBe(false);
    if (!out.ok) {
      expect(out.failure_kind).toBe("cors");
      expect(out.error_code).toBe("cors_blocked");
      expect(out.attemptCount).toBe(1);
    }
  });

  it("ERR_NETWORK_CHANGED classifies as network even on split origin", async () => {
    stubCrossOriginEnv();
    const err = new Error("Failed to fetch: net::ERR_NETWORK_CHANGED");
    expect(isPremiumFullDraftCorsBlocked(err)).toBe(false);
    expect(isPremiumFullDraftNetworkFailure(err)).toBe(true);
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(err));
    const out = await postPremiumFullDraftWithRetry({
      intakeText: "x".repeat(80),
      context: minimalContext,
    });
    expect(out.ok).toBe(false);
    if (!out.ok) {
      expect(out.failure_kind).toBe("network_retryable");
      expect(out.error_code).toBe("network_changed");
    }
  });
});

describe("Test290 intake retry wiring", () => {
  it("handleRetryProFullDraft arms explicit retry and passes explicit_retry_pro_draft", () => {
    expect(intakeSrc).toContain("armExplicitPremiumGenerationRetry()");
    expect(intakeSrc).toContain("logPremiumFullDraftRetryArmed");
    expect(intakeSrc).toContain('premiumGenerationCallReason: "explicit_retry_pro_draft"');
    expect(intakeSrc).toContain("args.premiumGenerationCallReason ?? \"checkout_completion\"");
  });
});

describe("Test290 starter fallback guard", () => {
  it("blocks canonical freeze for network_retryable pipeline with short starter corpus", () => {
    expect(
      shouldBlockPaidProCanonicalFreezeOnApiFailure({
        premiumRenderSource: "premium_network_retryable",
        premiumPostCheckoutPhase: "premium_network_recoverable",
        corpusLen: 911,
        corpusSource: "canonical_working_draft",
      }),
    ).toBe(true);
  });

  it("blocks canonical freeze for cors_blocked pipeline with short starter corpus", () => {
    expect(
      shouldBlockPaidProCanonicalFreezeOnApiFailure({
        premiumRenderSource: "premium_full_draft_cors_blocked",
        premiumPostCheckoutPhase: "premium_cors_blocked",
        corpusLen: 911,
        corpusSource: "canonical_working_draft",
      }),
    ).toBe(true);
  });
});
