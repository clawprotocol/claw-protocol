/** @vitest-environment jsdom */
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  isPremiumFullDraftNetworkFailure,
  postPremiumFullDraftWithRetry,
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
    expect(premiumFullDraftNetworkErrorCode(new Error("net::ERR_NETWORK_CHANGED"))).toBe("network_changed");
    expect(isPremiumFullDraftNetworkFailure(new Error("premium_full_draft_failed"))).toBe(false);
  });
});

describe("postPremiumFullDraftWithRetry network handling", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("returns typed network failure after retries (not null)", async () => {
    vi.stubEnv("MODE", "development");
    const log = vi.spyOn(console, "info").mockImplementation(() => {});
    vi.stubGlobal(
      "fetch",
      vi.fn().mockRejectedValue(new TypeError("Failed to fetch")),
    );
    const out = await postPremiumFullDraftWithRetry({
      intakeText: "x".repeat(80),
      context: minimalContext,
      agreementIdShort: "ag_test12",
    });
    expect(out.ok).toBe(false);
    if (!out.ok) {
      expect(out.failure_kind).toBe("network");
      expect(out.retryable).toBe(true);
      expect(out.document_text).toBe("");
      expect(out.attemptCount).toBe(2);
      expect(["network_changed", "network_error"]).toContain(out.error_code);
    }
    const joined = JSON.stringify(log.mock.calls);
    expect(joined).toContain("[premium-network-error]");
    log.mockRestore();
  });
});
