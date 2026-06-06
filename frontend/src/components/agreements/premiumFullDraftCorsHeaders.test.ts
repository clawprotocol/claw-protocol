/** @vitest-environment jsdom */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  isPremiumFullDraftCorsBlocked,
  postPremiumFullDraftWithRetry,
} from "./premiumFullDraftApi";

const corsPolicySrc = readFileSync(
  join(__dirname, "../../../../backend/cors_policy.py"),
  "utf8",
);
const premiumFullDraftApiSrc = readFileSync(join(__dirname, "premiumFullDraftApi.ts"), "utf8");

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

describe("premium-full-draft CORS header contract", () => {
  it("backend allow-list includes every x-claw header sent by premiumFullDraftApi", () => {
    expect(premiumFullDraftApiSrc).toContain("clawAgreementHeaders");
    expect(premiumFullDraftApiSrc).toContain("X-Claw-Paid-Pro-Perf-Trace");
    expect(corsPolicySrc).toContain("X-Claw-Paid-Pro-Perf-Trace");
    expect(corsPolicySrc).toContain("X-Claw-Org-Id");
    expect(corsPolicySrc).toContain("X-Claw-Affiliate-Code");
    expect(corsPolicySrc).toContain("cors_allow_request_headers_csv");
  });

  it("does not classify same-origin Failed to fetch as CORS blocked", () => {
    vi.stubEnv("VITE_CLAW_API_BASE", "https://qa-frontend.up.railway.app");
    vi.stubGlobal("window", {
      location: { origin: "https://qa-frontend.up.railway.app" },
    });
    expect(isPremiumFullDraftCorsBlocked(new TypeError("Failed to fetch"))).toBe(false);
    vi.unstubAllGlobals();
  });

  it("does not classify cross-origin generic Failed to fetch as CORS blocked", () => {
    vi.stubEnv("VITE_CLAW_API_BASE", "https://claw-protocol-production.up.railway.app");
    vi.stubGlobal("window", {
      location: { origin: "https://qa-frontend.up.railway.app" },
    });
    expect(isPremiumFullDraftCorsBlocked(new TypeError("Failed to fetch"))).toBe(false);
    vi.unstubAllGlobals();
  });
});

describe("postPremiumFullDraftWithRetry CORS vs success", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("successful cross-origin response is not cors_blocked", async () => {
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
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        headers: { get: () => null },
        text: async () =>
          JSON.stringify({
            document_text: "x".repeat(600),
            server_full_document_text: "x".repeat(600),
            generation_outcome: "ok",
          }),
      }),
    );
    const out = await postPremiumFullDraftWithRetry({
      intakeText: "x".repeat(80),
      context: minimalContext,
    });
    expect(out.ok).toBe(true);
    if (out.ok) {
      expect(out.result.document_text.length).toBeGreaterThanOrEqual(500);
    }
  });

  it("cross-origin generic fetch rejection classifies as network_retryable", async () => {
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
      expect(out.failure_kind).toBe("network_retryable");
      expect(out.retryable).toBe(true);
    }
  });
});
