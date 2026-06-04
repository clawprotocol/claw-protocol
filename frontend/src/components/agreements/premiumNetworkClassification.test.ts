import { describe, expect, it } from "vitest";
import { classifyPremiumNetworkFailure } from "./premiumNetworkClassification";

describe("premiumNetworkClassification", () => {
  it("classifies ERR_NETWORK_CHANGED as browser_network_changed and recoverable", () => {
    const c = classifyPremiumNetworkFailure(new Error("Failed to fetch: net::ERR_NETWORK_CHANGED"));
    expect(c.cause).toBe("browser_network_changed");
    expect(c.recoverable).toBe(true);
  });

  it("classifies fetch timeout abort separately from user abort", () => {
    const timeout = new DOMException("premium_full_draft_fetch_timeout", "AbortError");
    expect(classifyPremiumNetworkFailure(timeout).cause).toBe("request_fetch_timeout");
    const userAbort = new DOMException("The user aborted a request.", "AbortError");
    expect(classifyPremiumNetworkFailure(userAbort).cause).toBe("request_aborted_user");
  });

  it("classifies generic Failed to fetch as browser_fetch_failed", () => {
    expect(classifyPremiumNetworkFailure(new TypeError("Failed to fetch")).cause).toBe(
      "browser_fetch_failed",
    );
  });
});
