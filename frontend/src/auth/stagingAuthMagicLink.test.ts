import { afterEach, describe, expect, it, vi } from "vitest";
import {
  isAuthEmailRateLimitError,
  isStagingAuthAllowlistedEmailClient,
  isStagingAuthMagicLinkClientSurface,
  stagingAuthDefaultTestEmail,
} from "./stagingAuthMagicLink";

describe("stagingAuthMagicLink", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it("allowlists lawdogtest2 and cryptocurated plus family", () => {
    expect(stagingAuthDefaultTestEmail()).toBe("cryptocurated21+lawdogtest2@gmail.com");
    expect(isStagingAuthAllowlistedEmailClient("cryptocurated21+lawdogtest2@gmail.com")).toBe(true);
    expect(isStagingAuthAllowlistedEmailClient("cryptocurated21+other@gmail.com")).toBe(true);
    expect(isStagingAuthAllowlistedEmailClient("someone@gmail.com")).toBe(false);
  });

  it("detects email rate limit errors", () => {
    expect(isAuthEmailRateLimitError(new Error("email rate limit exceeded"))).toBe(true);
    expect(isAuthEmailRateLimitError(new Error("over_email_send_rate_limit"))).toBe(true);
    expect(isAuthEmailRateLimitError(new Error("invalid login"))).toBe(false);
  });

  it("enables staging surface on staging host, not production", () => {
    vi.stubGlobal("window", {
      location: { hostname: "believable-gentleness-staging.up.railway.app" },
    });
    expect(isStagingAuthMagicLinkClientSurface()).toBe(true);

    vi.stubGlobal("window", {
      location: { hostname: "believable-gentleness-production-3ab6.up.railway.app" },
    });
    expect(isStagingAuthMagicLinkClientSurface()).toBe(false);

    vi.stubGlobal("window", { location: { hostname: "lawdog.me" } });
    expect(isStagingAuthMagicLinkClientSurface()).toBe(false);
  });
});
