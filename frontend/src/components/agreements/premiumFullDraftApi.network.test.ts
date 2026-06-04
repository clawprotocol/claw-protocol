/** @vitest-environment jsdom */
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  isPremiumFullDraftCorsBlocked,
  isPremiumFullDraftNetworkFailure,
  postPremiumFullDraftWithRetry,
  PREMIUM_FULL_DRAFT_MAX_NETWORK_ATTEMPTS,
  premiumFullDraftNetworkErrorCode,
} from "./premiumFullDraftApi";

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

describe("isPremiumFullDraftNetworkFailure", () => {
  it("classifies TypeError Failed to fetch and ERR_NETWORK_CHANGED", () => {
    expect(isPremiumFullDraftNetworkFailure(new TypeError("Failed to fetch"))).toBe(true);
    expect(isPremiumFullDraftNetworkFailure(new Error("net::ERR_NETWORK_CHANGED"))).toBe(true);
    expect(isPremiumFullDraftNetworkFailure(new Error("net::ERR_CONNECTION_REFUSED"))).toBe(true);
    expect(premiumFullDraftNetworkErrorCode(new Error("net::ERR_NETWORK_CHANGED"))).toBe("network_changed");
    expect(isPremiumFullDraftNetworkFailure(new Error("premium_full_draft_failed"))).toBe(false);
  });
});

describe("isPremiumFullDraftCorsBlocked", () => {
  it("classifies cross-origin Failed to fetch as CORS (not retryable network)", () => {
    vi.stubGlobal("window", {
      location: { origin: "https://qa-frontend.up.railway.app" },
      setTimeout: () => 0,
      clearTimeout: () => {},
    });
    vi.stubEnv("VITE_CLAW_API_BASE", "https://claw-protocol-production.up.railway.app");
    expect(isPremiumFullDraftCorsBlocked(new TypeError("Failed to fetch"))).toBe(true);
    vi.unstubAllGlobals();
  });
});

describe("postPremiumFullDraftWithRetry network handling", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("returns typed network failure after retries (not null)", async () => {
    vi.stubEnv("MODE", "development");
    vi.stubEnv("VITE_CLAW_API_BASE", "http://localhost:5173");
    vi.stubGlobal("window", {
      location: { origin: "http://localhost:5173" },
      setTimeout: (fn: () => void, _ms?: number) => {
        fn();
        return 0;
      },
      clearTimeout: () => {},
    });
    const log = vi.spyOn(console, "info").mockImplementation(() => {});
    vi.stubGlobal(
      "fetch",
      vi.fn().mockRejectedValue(new TypeError("Failed to fetch")),
    );
    const out = await postPremiumFullDraftWithRetry({
      intakeText: "x".repeat(80),
      context: minimalContext,
      agreementId: "4290test-agreement",
      agreementGenerationId: "341e25ba-gen",
    });
    expect(out.ok).toBe(false);
    if (!out.ok) {
      expect(out.failure_kind).toBe("network");
      expect(out.retryable).toBe(true);
      expect(out.document_text).toBe("");
      expect(out.attemptCount).toBe(PREMIUM_FULL_DRAFT_MAX_NETWORK_ATTEMPTS);
      expect(["network_changed", "network_error"]).toContain(out.error_code);
    }
    const joined = JSON.stringify(log.mock.calls);
    expect(joined).toContain("[premium-network-error]");
    expect(joined).toContain("[premium-network-classification]");
    expect(joined).toMatch(/"cause":"browser_fetch_failed"/);
    log.mockRestore();
  });

  it("returns cors failure_kind for cross-origin CORS block (no network retry)", async () => {
    vi.stubEnv("MODE", "development");
    vi.stubEnv("VITE_CLAW_API_BASE", "https://claw-protocol-production.up.railway.app");
    vi.stubGlobal("window", {
      location: { origin: "https://qa-frontend.up.railway.app" },
      setTimeout: (fn: () => void) => {
        fn();
        return 0;
      },
      clearTimeout: () => {},
    });
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("Failed to fetch")));
    const out = await postPremiumFullDraftWithRetry({
      intakeText: "x".repeat(80),
      context: minimalContext,
    });
    expect(out.ok).toBe(false);
    if (!out.ok) {
      expect(out.failure_kind).toBe("cors");
      expect(out.retryable).toBe(false);
      expect(out.error_code).toBe("cors_blocked");
      expect(out.attemptCount).toBe(1);
    }
    vi.unstubAllGlobals();
  });
});
