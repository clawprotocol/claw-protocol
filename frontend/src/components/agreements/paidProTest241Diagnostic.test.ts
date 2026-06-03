import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  logPaidProEnterprisePolish,
  logPaidProRecitalPolish,
} from "./paidProAgreementPolish";
import { validateAndRepairPremiumAgreementStructure } from "./premiumAgreementStructure";
import { shouldTreatPremiumReviewFailureAsNonfatal } from "./paidProPremiumReviewNetworkGuard";
import { isPremiumFullDraftNetworkFailure } from "./premiumFullDraftApi";
import { ingestPaidProPaymentToReviewServerTiming } from "./paidProPaymentToReviewTrace";
import {
  markPaidProPremiumHttpEndAt,
  readPaidProQaPerfTraceStateForTests,
  resetPaidProQaPerfTraceForTests,
} from "./paidProQaPerfTrace";
import { applyAcceptedProCorpusSafeDisplay } from "./acceptedProCorpusSafeDisplay";
import { hashPaidProCorpus } from "./paidProSourceOfTruth";
import { shouldSkipPremiumAdvisoryAfterAuthoritativeAccept } from "./premiumAdvisorySkipAfterAuthority";

describe("paidProTest241 diagnostic audit", () => {
  beforeEach(() => {
    vi.unstubAllEnvs();
    resetPaidProQaPerfTraceForTests();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    resetPaidProQaPerfTraceForTests();
  });

  it("production-like build still logs material enterprise polish changes", () => {
    vi.stubEnv("MODE", "production");
    vi.stubEnv("DEV", false);
    vi.stubEnv("VITE_PAID_PRO_PERF_TRACE", "");
    const info = vi.spyOn(console, "info").mockImplementation(() => {});
    logPaidProEnterprisePolish({
      effectiveDateAdded: true,
      disputeWindowAdded: false,
      uptimeTargetAdded: false,
      survivalPolished: false,
      attorneysFeesAdded: false,
    });
    logPaidProRecitalPolish({
      applied: false,
      partyCount: 2,
      confidence: "high",
      reason: "already_normalized",
    });
    expect(info.mock.calls.some((c) => c[0] === "[paid-pro-enterprise-polish]")).toBe(true);
    expect(info.mock.calls.some((c) => c[0] === "[paid-pro-recital-polish]")).toBe(false);
    info.mockRestore();
  });

  it("records server timing header presence when perf trace is enabled", () => {
    vi.stubEnv("MODE", "test");
    vi.stubEnv("VITE_PAID_PRO_PERF_TRACE", "1");
    markPaidProPremiumHttpEndAt();
    ingestPaidProPaymentToReviewServerTiming(
      JSON.stringify({
        spans: [{ name: "backend_llm_primary", startMs: 0, durationMs: 117000 }],
      }),
    );
    const state = readPaidProQaPerfTraceStateForTests();
    expect(state.checkoutMilestones.serverTimingHeaderObserved).toBe(true);
    expect(state.checkoutMilestones.serverTimingHeaderPresent).toBe(true);
    expect(state.checkoutMilestones.lastBackendSpans.some((s) => s.name === "backend_llm_primary")).toBe(
      true,
    );
  });

  it("treats ERR_NETWORK_CHANGED on premium-review as nonfatal when SoT is established", () => {
    const err = new Error("Failed to fetch: net::ERR_NETWORK_CHANGED");
    expect(isPremiumFullDraftNetworkFailure(err)).toBe(true);
    expect(
      shouldTreatPremiumReviewFailureAsNonfatal({
        paidProSourceOfTruthEstablished: true,
        err,
      }),
    ).toBe(true);
  });

  it("diagnostic trace wrappers do not mutate accepted SoT display text", () => {
    const raw =
      "CONSULTING AGREEMENT\n\nBetween Acme LLC and Beta Inc.\n\n1. SCOPE\nServices.\n\nIN WITNESS WHEREOF\n\nClient: ____________________\nService Provider: ____________________";
    vi.stubEnv("MODE", "test");
    vi.stubEnv("VITE_PAID_PRO_PERF_TRACE", "");
    const off = applyAcceptedProCorpusSafeDisplay(raw, { intakeText: "Acme consulting Acme LLC Beta Inc." });
    vi.stubEnv("VITE_PAID_PRO_PERF_TRACE", "1");
    resetPaidProQaPerfTraceForTests();
    const on = applyAcceptedProCorpusSafeDisplay(raw, { intakeText: "Acme consulting Acme LLC Beta Inc." });
    expect(on.text).toBe(off.text);
    expect(hashPaidProCorpus(on.text)).toBe(hashPaidProCorpus(off.text));
  });

  it("shouldSkipPremiumAdvisoryAfterAuthoritativeAccept is false without SoT", () => {
    expect(shouldSkipPremiumAdvisoryAfterAuthoritativeAccept()).toBe(false);
  });

  it("structure repair console logs when repairs occur even without QA trace", () => {
    const body = [
      "CONSULTING AGREEMENT",
      "",
      "3. GOVERNANCE",
      "Any dispute shall be resolved by binding arbitration under Delaware law.",
      "Any dispute shall be resolved by binding arbitration under Delaware law.",
      "",
      "IN WITNESS WHEREOF:",
      "Party A",
      "Party B",
    ].join("\n");
    const result = validateAndRepairPremiumAgreementStructure(body, { surface: "test241" });
    expect(result.repairs.length).toBeGreaterThan(0);
    vi.stubEnv("MODE", "production");
    vi.stubEnv("DEV", false);
    vi.stubEnv("VITE_PAID_PRO_PERF_TRACE", "");
    const info = vi.spyOn(console, "info").mockImplementation(() => {});
    validateAndRepairPremiumAgreementStructure(body, { surface: "test241_repeat" });
    expect(info.mock.calls.some((c) => c[0] === "[premium-structure-repair]")).toBe(true);
    info.mockRestore();
  });
});
