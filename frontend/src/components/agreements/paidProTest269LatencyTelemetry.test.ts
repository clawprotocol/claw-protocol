import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ParsedDraftShape } from "./intakeSmartDefaults";
import * as acceptedProCorpusSafeDisplayModule from "./acceptedProCorpusSafeDisplay";
import { applyAcceptedProCorpusSafeDisplay } from "./acceptedProCorpusSafeDisplay";
import {
  clearAcceptedProCorpusSafeDisplayCacheForTests,
  readAcceptedProCorpusSafeDisplayCacheSizeForTests,
} from "./paidProAcceptedCorpusSafeDisplayCache";
import {
  classifyPaidProLatencyBound,
  clearLastFinishedPaidProPerformanceTrace,
  clearPaidProPerformanceTrace,
  finishPaidProPerformanceWaterfall,
  paidProPerfRecordInstant,
  startPaidProPerformanceTrace,
} from "./paidProPerformanceTrace";
import {
  clearPaidProPipelineAcceptedCorpusHashForTests,
  markPaidProPipelineAcceptedCorpusHash,
  paidProPipelineAcceptedCorpusHash,
  readPaidProPipelineAcceptedCorpusHash,
} from "./paidProPipelineAcceptedCorpus";
import {
  readPaidProPassTimingByPassOnly,
  readPaidProDuplicateExpensiveWorkWarnings,
  resetPaidProPassTimingAggregatorForTests,
} from "./paidProPassTimingAggregator";
import {
  establishPaidProSourceOfTruth,
  clearPaidProSourceOfTruth,
  getPaidProDocumentForSurface,
} from "./paidProSourceOfTruth";
import {
  markPaidProCheckoutReturnAt,
  markPaidProFirstReviewPaintAt,
  resetPaidProQaPerfTraceForTests,
  tracePaidProQaPassText,
} from "./paidProQaPerfTrace";
import { buildHydratedAuthoritativeSigningCorpusFromAuthority } from "./authoritativeSignerHydration";
import {
  buildLivePaidProSignerMetadataAuthority,
  clearConsumedPaidProSignerMetadataAuthority,
  setConsumedPaidProSignerMetadataAuthority,
} from "./paidProSignerMetadataAuthority";
import { buildPaidProReviewPlainMemoKey } from "./paidProVisibleRenderMemo";

describe("paidPro Test269 latency telemetry and dedupe", () => {
  beforeEach(() => {
    resetPaidProQaPerfTraceForTests();
    resetPaidProPassTimingAggregatorForTests();
    clearPaidProPerformanceTrace();
    clearLastFinishedPaidProPerformanceTrace();
    clearAcceptedProCorpusSafeDisplayCacheForTests();
    clearPaidProPipelineAcceptedCorpusHashForTests();
    clearPaidProSourceOfTruth();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    resetPaidProQaPerfTraceForTests();
    resetPaidProPassTimingAggregatorForTests();
    clearPaidProPerformanceTrace();
    clearLastFinishedPaidProPerformanceTrace();
    clearAcceptedProCorpusSafeDisplayCacheForTests();
    clearPaidProPipelineAcceptedCorpusHashForTests();
    clearPaidProSourceOfTruth();
  });

  it("duplicate structure_repair span labels alone do not classify duplicate_work_bound", () => {
    vi.stubEnv("MODE", "test");
    vi.stubEnv("VITE_PAID_PRO_PERF_TRACE", "1");
    expect(readPaidProDuplicateExpensiveWorkWarnings()).toEqual([]);
    const bound = classifyPaidProLatencyBound({
      totalMs: 118_801,
      serverRoundTripMs: 100_000,
      localPostProcessingMs: 2_500,
      duplicateExpensiveWorkWarnings: [],
      duplicateExpensiveWorkTotalMs: 0,
    });
    expect(bound).toBe("backend_bound");
  });

  it("duplicate_work_bound requires repeated expensive pass aggregate time", () => {
    const bound = classifyPaidProLatencyBound({
      totalMs: 12_000,
      serverRoundTripMs: 2_000,
      localPostProcessingMs: 8_000,
      duplicateExpensiveWorkWarnings: ["applyAcceptedProCorpusSafeDisplayx3:2400ms"],
      duplicateExpensiveWorkTotalMs: 2_400,
    });
    expect(bound).toBe("duplicate_work_bound");
  });

  it("waterfall reports duplicateSpanLabelWarnings separately from duplicateExpensiveWork", () => {
    vi.stubEnv("MODE", "test");
    vi.stubEnv("VITE_PAID_PRO_PERF_TRACE", "1");
    markPaidProCheckoutReturnAt();
    startPaidProPerformanceTrace({
      traceId: "t269-span",
      sessionGenerationId: "t269-span",
      intakeFingerprint: "fp",
      deferFinish: true,
    });
    paidProPerfRecordInstant("premium_full_draft_api", 100_000, { docLen: 9000 });
    paidProPerfRecordInstant("structure_repair", 120, { docLen: 5000 });
    paidProPerfRecordInstant("structure_repair", 1800, { docLen: 5000 });
    paidProPerfRecordInstant("premium_local_post_processing_total", 1920, { docLen: 5000 });
    markPaidProFirstReviewPaintAt();
    const info = vi.spyOn(console, "info").mockImplementation(() => {});
    finishPaidProPerformanceWaterfall();
    const waterfall = info.mock.calls.find((c) => c[0] === "[paid-pro-waterfall]");
    expect(waterfall?.[1]).toMatchObject({
      duplicateSpanLabelWarnings: ["structure_repairx2"],
    });
    expect((waterfall?.[1] as { latencyBound: string }).latencyBound).not.toBe("duplicate_work_bound");
    const expensiveWarnings = (waterfall?.[1] as { duplicateExpensiveWorkWarnings?: string[] })
      .duplicateExpensiveWorkWarnings;
    expect(expensiveWarnings ?? []).toEqual([]);
    info.mockRestore();
  });

  it("same hash safe-display second call hits cache", () => {
    vi.stubEnv("MODE", "test");
    vi.stubEnv("VITE_PAID_PRO_PERF_TRACE", "1");
    const raw =
      "MUTUAL CONSULTING AGREEMENT\n\nBetween Acme LLC, a Delaware LLC, and Beta Inc., a California corporation.\n\n1. SCOPE\nServices.\n\nIN WITNESS WHEREOF\n\nCLIENT:\nAcme LLC\n\nSERVICE PROVIDER:\nBeta Inc.";
    const first = applyAcceptedProCorpusSafeDisplay(raw, { surface: "test269_cache" });
    expect(readAcceptedProCorpusSafeDisplayCacheSizeForTests()).toBe(1);
    const second = applyAcceptedProCorpusSafeDisplay(raw, { surface: "test269_cache" });
    expect(second.text).toBe(first.text);
    const rows = readPaidProPassTimingByPassOnly().find(
      (r) => r.passName === "applyAcceptedProCorpusSafeDisplay",
    );
    expect(rows?.count).toBeGreaterThanOrEqual(2);
  });

  it("establishPaidProSourceOfTruth skips redundant safe-display when pipeline hash matches", () => {
    const body =
      "MUTUAL CONSULTING AGREEMENT\n\nBetween Acme LLC, a Delaware LLC, and Beta Inc., a California corporation.\n\n1. SCOPE\nThe Service Provider will deliver AI workflow automation consulting services.\n\n2. TERM\nOne year.\n\n3. FEES\nAs agreed.\n\n4. CONFIDENTIALITY\nStandard terms.\n\n5. IP\nWork product belongs to Client.\n\nIN WITNESS WHEREOF\n\nCLIENT:\nAcme LLC\nBy: ___________________\nName:\nTitle:\nEmail:\nAddress:\n\nSERVICE PROVIDER:\nBeta Inc.\nBy: ___________________\nName:\nTitle:\nEmail:\nAddress:";
    const prepared = applyAcceptedProCorpusSafeDisplay(body, { surface: "pipeline_mark" }).text;
    markPaidProPipelineAcceptedCorpusHash(prepared);
    const spy = vi.spyOn(acceptedProCorpusSafeDisplayModule, "applyAcceptedProCorpusSafeDisplay");
    establishPaidProSourceOfTruth({
      text: prepared,
      source: "server_full_draft",
      draft: {
        parties: [
          { name: "Acme LLC", role: "client" },
          { name: "Beta Inc.", role: "service provider" },
        ],
      } as ParsedDraftShape,
      intakeText: "Acme LLC and Beta Inc AI workflow automation consulting agreement",
    });
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
    expect(paidProPipelineAcceptedCorpusHash(prepared)).toBe(readPaidProPipelineAcceptedCorpusHash());
  });

  it("signer finalize still updates Name/Title/Email/Address fields", () => {
    const base = [
      "AGREEMENT",
      "",
      "IN WITNESS WHEREOF, the Parties execute this Agreement.",
      "",
      "CLIENT:",
      "Acme LLC",
      "By: __________________________",
      "Name: _________________________",
      "Title: __________________________",
      "Email for Notice: __________________________",
      "Address for Notice: ________________________",
      "",
      "SERVICE PROVIDER:",
      "Beta Inc.",
      "By: __________________________",
      "Name: _________________________",
      "Title: __________________________",
      "Email for Notice: __________________________",
      "Address for Notice: ________________________",
    ].join("\n");
    const authority = buildLivePaidProSignerMetadataAuthority({
      partyCount: 2,
      recipient1Name: "Acme LLC",
      recipient2Name: "Beta Inc.",
      recipient1Email: "jane@acme.test",
      recipient2Email: "bob@beta.test",
      extraPartyReviewEmails: [],
      partySignerNames: ["Jane Client", "Bob Provider"],
      partySignerTitles: ["CEO", "President"],
      partyAddresses: ["1 Main St", "2 Oak Ave"],
    });
    const hydrated = buildHydratedAuthoritativeSigningCorpusFromAuthority({
      rawCorpus: base,
      authority,
      intakeRaw: "",
      surface: "test269_signer_finalize",
    });
    expect(hydrated.corpus).toMatch(/Name:\s*Jane Client/i);
    expect(hydrated.corpus).toMatch(/Title:\s*CEO/i);
    expect(hydrated.corpus).toMatch(/Email for Notice:\s*jane@acme\.test/i);
    expect(hydrated.corpus).toMatch(/Address for Notice:\s*1 Main St/i);
    expect(hydrated.corpus).toMatch(/Name:\s*Bob Provider/i);
    expect(hydrated.corpus).toMatch(/Email for Notice:\s*bob@beta\.test/i);
  });

  it("clearPaidProSourceOfTruth clears safe-display cache and review/html memo", () => {
    const raw =
      "MUTUAL CONSULTING AGREEMENT\n\nBetween Acme LLC and Beta Inc.\n\n1. SCOPE\nWork.\n\nIN WITNESS WHEREOF\n\nCLIENT:\nAcme LLC\n\nSERVICE PROVIDER:\nBeta Inc.";
    applyAcceptedProCorpusSafeDisplay(raw, { surface: "clear_sot_test" });
    expect(readAcceptedProCorpusSafeDisplayCacheSizeForTests()).toBe(1);
    clearPaidProSourceOfTruth();
    expect(readAcceptedProCorpusSafeDisplayCacheSizeForTests()).toBe(0);
    expect(readPaidProPipelineAcceptedCorpusHash()).toBeNull();
  });

  it("signerOverlayEpoch changes when signer metadata authority hash changes", () => {
    const plain = "A".repeat(120);
    const keyA = buildPaidProReviewPlainMemoKey(plain, "review");
    const authA = buildLivePaidProSignerMetadataAuthority({
      partyCount: 2,
      recipient1Name: "Acme LLC",
      recipient2Name: "Beta Inc.",
      recipient1Email: "a@acme.test",
      recipient2Email: "b@beta.test",
      extraPartyReviewEmails: [],
      partySignerNames: ["Jane Client", "Bob Provider"],
      partySignerTitles: ["CEO", "President"],
      partyAddresses: ["1 Main St", "2 Oak Ave"],
    });
    setConsumedPaidProSignerMetadataAuthority(authA);
    const keyWithA = buildPaidProReviewPlainMemoKey(plain, "review");
    setConsumedPaidProSignerMetadataAuthority(
      buildLivePaidProSignerMetadataAuthority({
        partyCount: 2,
        recipient1Name: "Acme LLC",
        recipient2Name: "Beta Inc.",
        recipient1Email: "a@acme.test",
        recipient2Email: "b@beta.test",
        extraPartyReviewEmails: [],
        partySignerNames: ["Jane Client", "Bob Provider"],
        partySignerTitles: ["CEO", "President"],
        partyAddresses: ["9 Other St", "2 Oak Ave"],
      }),
    );
    const keyWithB = buildPaidProReviewPlainMemoKey(plain, "review");
    clearConsumedPaidProSignerMetadataAuthority();
    expect(keyWithA).not.toBe(keyA);
    expect(keyWithB).not.toBe(keyWithA);
  });

  it("review and copy surfaces share authoritative corpus hash after establish", () => {
    const body =
      "MUTUAL CONSULTING AGREEMENT\n\nBetween Acme LLC, a Delaware LLC, and Beta Inc., a California corporation.\n\n1. SCOPE\nServices.\n\n2. TERM\nOne year.\n\n3. FEES\nAs agreed.\n\n4. CONFIDENTIALITY\nStandard.\n\n5. IP\nClient owns work product.\n\nIN WITNESS WHEREOF\n\nCLIENT:\nAcme LLC\n\nSERVICE PROVIDER:\nBeta Inc.";
    establishPaidProSourceOfTruth({
      text: body,
      source: "server_full_draft",
      draft: {
        parties: [
          { name: "Acme LLC", role: "client" },
          { name: "Beta Inc.", role: "service provider" },
        ],
      } as ParsedDraftShape,
      intakeText: "Acme LLC and Beta Inc AI consulting",
    });
    const review = getPaidProDocumentForSurface("review")!;
    const copy = getPaidProDocumentForSurface("copy")!;
    expect(review.hash).toBe(copy.hash);
    expect(review.text).toBe(copy.text);
  });

  it("[premium-pass-timing-summary] emits once per session even if first review paint fires twice", () => {
    vi.stubEnv("MODE", "test");
    vi.stubEnv("VITE_PAID_PRO_PERF_TRACE", "1");
    const info = vi.spyOn(console, "info").mockImplementation(() => {});
    markPaidProFirstReviewPaintAt();
    markPaidProFirstReviewPaintAt();
    const summaries = info.mock.calls.filter((c) => c[0] === "[premium-pass-timing-summary]");
    expect(summaries).toHaveLength(1);
    info.mockRestore();
  });

  it("[premium-pass-timing-summary] reports accurate count and totalMs", () => {
    vi.stubEnv("MODE", "test");
    vi.stubEnv("VITE_PAID_PRO_PERF_TRACE", "1");
    const body = "SERVICES AGREEMENT\n\n1. SCOPE\nBody.";
    tracePaidProQaPassText("resolvePaidProReviewRenderPlain", "review", body, () => body);
    tracePaidProQaPassText("resolvePaidProReviewRenderPlain", "review", body, () => body);
    const info = vi.spyOn(console, "info").mockImplementation(() => {});
    markPaidProFirstReviewPaintAt();
    const summary = info.mock.calls.find((c) => c[0] === "[premium-pass-timing-summary]");
    expect(summary).toBeDefined();
    const passTotals = (summary?.[1] as { passTotals: { passName: string; count: number; totalMs: number }[] })
      .passTotals;
    const row = passTotals.find((r) => r.passName === "resolvePaidProReviewRenderPlain");
    expect(row?.count).toBe(2);
    expect(row?.totalMs).toBeGreaterThanOrEqual(0);
    info.mockRestore();
  });
});
