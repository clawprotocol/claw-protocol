/** @vitest-environment jsdom */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  REVIEW_LINK_PERSIST_BLOCKING_MESSAGE,
  REVIEW_LINK_PERSIST_ENDPOINT,
  buildReviewLinkPersistDiagnostics,
  classifyReviewLinkPersistFailure,
  formatReviewLinkPersistDebugInfo,
} from "./reviewLinkPersistDiagnostics";

describe("reviewLinkPersistDiagnostics", () => {
  beforeEach(() => {
    vi.stubGlobal("window", {
      location: { origin: "https://qa-frontend.up.railway.app" },
    });
    vi.stubEnv("VITE_CLAW_API_BASE", "https://claw-protocol-production.up.railway.app");
    vi.resetModules();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it("classifies DNS resolution failures", () => {
    expect(
      classifyReviewLinkPersistFailure(new TypeError("Failed to fetch: net::ERR_NAME_NOT_RESOLVED")),
    ).toBe("dns");
  });

  it("classifies cross-origin Failed to fetch as cors", () => {
    expect(classifyReviewLinkPersistFailure(new TypeError("Failed to fetch"))).toBe("cors");
  });

  it("classifies HTTP draft POST failures", () => {
    expect(classifyReviewLinkPersistFailure(new Error("create_failed_http_503"), 503)).toBe("http");
  });

  it("builds routing diagnostics for review-link persist endpoint", async () => {
    const { apiUrl } = await import("../../lib/clawApi");
    const diag = buildReviewLinkPersistDiagnostics({
      error: new TypeError("Failed to fetch"),
      reason: "persist_failed",
    });
    expect(diag.pageOrigin).toBe("https://qa-frontend.up.railway.app");
    expect(diag.apiOrigin).toBe("https://claw-protocol-production.up.railway.app");
    expect(diag.endpoint).toBe(apiUrl(REVIEW_LINK_PERSIST_ENDPOINT));
    expect(diag.failureClass).toBe("cors");
    expect(diag.reason).toBe("persist_failed");
  });

  it("formats copyable debug payload", () => {
    const diag = buildReviewLinkPersistDiagnostics({
      error: new TypeError("Failed to fetch"),
      reason: "persist_failed",
    });
    const text = formatReviewLinkPersistDebugInfo(diag);
    expect(text).toContain('"failureClass": "cors"');
    expect(text).toContain('"endpoint"');
  });

  it("exposes professional blocking copy for persist failures", () => {
    expect(REVIEW_LINK_PERSIST_BLOCKING_MESSAGE).toContain("agreement save service");
    expect(REVIEW_LINK_PERSIST_BLOCKING_MESSAGE).toContain("still saved in this browser");
  });
});
