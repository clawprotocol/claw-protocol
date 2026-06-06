/** @vitest-environment jsdom */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  PREMIUM_FULL_DRAFT_MAX_NETWORK_ATTEMPTS,
  postPremiumFullDraftWithRetry,
} from "./premiumFullDraftApi";
import { preflightPremiumBackendHealth } from "./premiumBackendHealth";
import { logPremiumSessionConsistency } from "./premiumSessionDiagnostics";

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

describe("postPremiumFullDraftWithRetry network attempts", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("exhausts four network attempts before returning retryable failure", async () => {
    vi.stubEnv("MODE", "development");
    const fetchMock = vi.fn().mockRejectedValue(new TypeError("Failed to fetch"));
    vi.stubGlobal("fetch", fetchMock);
    const log = vi.spyOn(console, "info").mockImplementation(() => {});

    const out = await postPremiumFullDraftWithRetry({
      intakeText: "x".repeat(80),
      context: minimalContext,
      agreementId: "4290abcd-1111-2222-3333-444455556666",
      agreementGenerationId: "341e25ba-session-gen",
    });

    expect(fetchMock).toHaveBeenCalledTimes(PREMIUM_FULL_DRAFT_MAX_NETWORK_ATTEMPTS);
    expect(out.ok).toBe(false);
    if (!out.ok) {
      expect(out.failure_kind).toBe("network_retryable");
      expect(out.retryable).toBe(true);
      expect(out.attemptCount).toBe(PREMIUM_FULL_DRAFT_MAX_NETWORK_ATTEMPTS);
    }
    const joined = JSON.stringify(log.mock.calls);
    expect(joined).toContain("[premium-network-error]");
    expect(joined).toContain("4290abcd");
    expect(joined).toContain("341e25ba");
    log.mockRestore();
  });

  it("succeeds on second network attempt after one failure", async () => {
    vi.stubEnv("MODE", "development");
    let calls = 0;
    const body = JSON.stringify({
      title: "T",
      agreement_family: "services",
      document_text: "x".repeat(9000),
      key_terms_found: [],
      missing_material_info: [],
      generation_outcome: "ok",
    });
    vi.stubGlobal("fetch", vi.fn().mockImplementation(() => {
      calls += 1;
      if (calls < 2) {
        return Promise.reject(new Error("net::ERR_NETWORK_CHANGED"));
      }
      return Promise.resolve({
        ok: true,
        status: 200,
        headers: { get: () => null },
        text: async () => body,
        json: async () => JSON.parse(body),
      });
    }));
    const log = vi.spyOn(console, "info").mockImplementation(() => {});

    const out = await postPremiumFullDraftWithRetry({
      intakeText: "x".repeat(80),
      context: minimalContext,
      agreementId: "ag-stable",
      agreementGenerationId: "gen-stable-session",
    });

    expect(out.ok).toBe(true);
    expect(calls).toBe(2);
    const joined = JSON.stringify(log.mock.calls);
    expect(joined).toContain("[premium-network-retry-success]");
    log.mockRestore();
  });
});

describe("preflightPremiumBackendHealth", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("returns ok when /health responds 200", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: true, status: 200 }),
    );
    const h = await preflightPremiumBackendHealth();
    expect(h.ok).toBe(true);
    expect(h.status).toBe(200);
  });
});

describe("premium session diagnostics", () => {
  it("logs agreement id separately from session generation id", () => {
    vi.stubEnv("MODE", "development");
    const log = vi.spyOn(console, "info").mockImplementation(() => {});
    logPremiumSessionConsistency({
      context: "test",
      agreementId: "4290abcd-agreement-id",
      agreementGenerationId: "341e25ba-session-gen",
    });
    const row = log.mock.calls.find((c) => c[0] === "[premium-session-consistency]");
    expect(row).toBeTruthy();
    expect(row?.[1]).toMatchObject({
      agreementIdShort: "4290abcd…",
      sessionGenerationIdShort: "341e25ba…",
    });
    log.mockRestore();
  });
});

describe("AgreementBuilderIntake premium network recovery wiring", () => {
  const intake = readFileSync(join(__dirname, "AgreementBuilderIntake.tsx"), "utf8");

  it("preserves runModelPass ref on retryable results (network and cors)", () => {
    expect(intake).toContain("isPremiumRetryablePipelineResult(result)");
    expect(intake).toContain("isPremiumNetworkRetryablePipelineResult(result)");
    expect(intake).toContain("isPremiumCorsBlockedPipelineResult(result)");
    expect(intake).toContain("armExplicitPremiumGenerationRetry()");
    expect(intake).toContain('premiumGenerationCallReason: "explicit_retry_pro_draft"');
  });

  it("preflights backend health before user retry", () => {
    expect(intake).toContain("preflightPremiumBackendHealth");
    expect(intake).toContain("PREMIUM_NETWORK_MODAL_STILL_RECONNECTING");
    expect(intake).toContain("premiumGapBaseIntakeRef.current = mergedIntake");
    expect(intake).toContain('premiumNetworkRetryInFlight ? "Trying again…"');
  });
});
