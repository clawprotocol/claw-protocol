import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ParsedDraftShape } from "./intakeSmartDefaults";
import { preparePaidProServerDocumentForAcceptance } from "./paidProConciseServicesQuality";
import { removeOrphanPartyLinesBeforeExecutionTail } from "./paidProOrphanPartyLines";
import {
  clearPaidProCorpusScanCache,
  readPaidProCorpusScanCacheSize,
  runCachedCorpusScan,
} from "./paidProCorpusScanCache";
import {
  buildCheckoutPreflightAgreementPreviewText,
  clearPaidProCheckoutPreviewPreflightCache,
} from "./paidProCheckoutPreviewPreflightCache";
import {
  clearPremiumParseSessionGuard,
  markPremiumAuthoritativeServerCorpusAccepted,
} from "./premiumParseSessionGuard";
import {
  clearPaidProSourceOfTruth,
  establishPaidProSourceOfTruth,
  getPaidProSourceOfTruthText,
  hashPaidProCorpus,
} from "./paidProSourceOfTruth";
import {
  clearLastFinishedPaidProPerformanceTrace,
  clearPaidProPerformanceTrace,
  finishPaidProPerformanceWaterfall,
  paidProPerfSpanEnd,
  paidProPerfSpanStart,
  readLastFinishedPaidProPerformanceTrace,
  startPaidProPerformanceTrace,
} from "./paidProPerformanceTrace";
import { recordPremiumFullDraftCall } from "./paidProPremiumGenerationCallAudit";
import { clearPremiumGenerationCallAudit } from "./paidProPremiumGenerationCallAudit";
import {
  PAID_PRO_HARDENING_CLIENT,
  PAID_PRO_HARDENING_PROVIDER,
} from "./qa/paidProHardening/paidProHardeningFixtures";

const DRAFT: ParsedDraftShape = {
  title: "Mutual Consulting Agreement",
  jurisdiction: "Delaware",
  parties: [
    { name: PAID_PRO_HARDENING_CLIENT, role: "Client" },
    { name: PAID_PRO_HARDENING_PROVIDER, role: "Service Provider" },
  ],
  purpose: "AI workflow",
  payment_terms: "$8,500",
  duration: null,
  due_date: null,
  effective_date: null,
  payment: { amount: null, cadence: null, valid: false },
};

const SERVER_TAIL_SAMPLE = [
  "11.6 Counterparts.",
  "Electronic signatures are effective.",
  "",
  PAID_PRO_HARDENING_CLIENT,
  "",
  PAID_PRO_HARDENING_PROVIDER,
  "",
  "12. ACCEPTANCE AND DEMONSTRATION REVIEW",
  "Review period applies.",
  "",
  "IN WITNESS WHEREOF",
  `CLIENT: ${PAID_PRO_HARDENING_CLIENT}`,
  `SERVICE PROVIDER: ${PAID_PRO_HARDENING_PROVIDER}`,
].join("\n");

beforeEach(() => {
  clearPaidProCorpusScanCache();
  clearPaidProCheckoutPreviewPreflightCache();
  clearPremiumParseSessionGuard();
  clearPaidProSourceOfTruth();
  clearPremiumGenerationCallAudit();
  clearPaidProPerformanceTrace();
  clearLastFinishedPaidProPerformanceTrace();
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("paidPro Test267 orphan + latency", () => {
  it("documents before/after tail sample for orphan party strip", () => {
    const before = `AGREEMENT\n\n1. Scope.\n\n${SERVER_TAIL_SAMPLE}`;
    const stripped = removeOrphanPartyLinesBeforeExecutionTail(before, [
      PAID_PRO_HARDENING_CLIENT,
      PAID_PRO_HARDENING_PROVIDER,
    ]);
    expect(before).toContain(`\n${PAID_PRO_HARDENING_CLIENT}\n\n${PAID_PRO_HARDENING_PROVIDER}\n\n12.`);
    expect(stripped.removedLines).toEqual([
      PAID_PRO_HARDENING_CLIENT,
      PAID_PRO_HARDENING_PROVIDER,
    ]);
    expect(stripped.text).not.toContain(
      `\n${PAID_PRO_HARDENING_CLIENT}\n\n${PAID_PRO_HARDENING_PROVIDER}\n\n12.`,
    );
    const prepared = preparePaidProServerDocumentForAcceptance(before, DRAFT, "intake");
    // Domain-scope guard strips unauthorized acceptance/demo sections; execution blocks remain.
    expect(prepared.text).not.toMatch(/ACCEPTANCE AND DEMONSTRATION REVIEW/i);
    expect(prepared.text).toContain(`CLIENT: ${PAID_PRO_HARDENING_CLIENT}`);
    const reStrip = removeOrphanPartyLinesBeforeExecutionTail(prepared.text, [
      PAID_PRO_HARDENING_CLIENT,
      PAID_PRO_HARDENING_PROVIDER,
    ]);
    expect(reStrip.removedLines).toHaveLength(0);
  });

  it("dedupes prepare_paid_pro_server_acceptance by corpus hash", () => {
    const body = `AGREEMENT\n\n1. Scope.\n\n${SERVER_TAIL_SAMPLE}`;
    startPaidProPerformanceTrace({
      traceId: "t267-prep",
      sessionGenerationId: "gen-267",
      intakeFingerprint: "fp267",
    });
    const first = preparePaidProServerDocumentForAcceptance(body, DRAFT, "intake", {
      surface: "test267_prepare_cache",
    });
    const cacheAfterFirst = readPaidProCorpusScanCacheSize();
    const second = preparePaidProServerDocumentForAcceptance(body, DRAFT, "intake", {
      surface: "test267_prepare_cache",
    });
    expect(second.text).toBe(first.text);
    expect(cacheAfterFirst).toBeGreaterThan(0);
    expect(readPaidProCorpusScanCacheSize()).toBe(cacheAfterFirst);
    finishPaidProPerformanceWaterfall();
  });

  it("hash-dedupes deterministic orphan_party_lines scan", () => {
    const corpus = `11.6 Counterparts.\n\n${PAID_PRO_HARDENING_CLIENT}\n\n12. ACCEPTANCE\n\nIN WITNESS WHEREOF`;
    let runs = 0;
    runCachedCorpusScan({
      surface: "test267",
      corpus,
      phase: "p",
      scanType: "orphan_party_lines_pre_execution",
      run: () => {
        runs += 1;
        return { text: corpus, detected: false, removedLines: [], repairs: [] };
      },
    });
    runCachedCorpusScan({
      surface: "test267",
      corpus,
      phase: "p",
      scanType: "orphan_party_lines_pre_execution",
      run: () => {
        runs += 1;
        return { text: corpus, detected: false, removedLines: [], repairs: [] };
      },
    });
    expect(runs).toBe(1);
  });

  it("skips preview_premium_deliverable rebuild after server_full_draft acceptance", () => {
    const authoritative = [
      "MUTUAL CONSULTING AND IMPLEMENTATION AGREEMENT",
      "",
      `This Agreement is entered into as of the Effective Date by and between ${PAID_PRO_HARDENING_CLIENT} ("Client") and ${PAID_PRO_HARDENING_PROVIDER} ("Service Provider"), collectively as the "Parties".`,
      "",
      ...Array.from(
        { length: 80 },
        (_, i) =>
          `${i + 1}. Operative clause ${i + 1}. The parties will cooperate in good faith and use commercially reasonable efforts to deliver the agreed scope.`,
      ),
      "",
      "IN WITNESS WHEREOF, the Parties have executed this Agreement.",
      "",
      `CLIENT: ${PAID_PRO_HARDENING_CLIENT}`,
      `SERVICE PROVIDER: ${PAID_PRO_HARDENING_PROVIDER}`,
    ].join("\n");
    establishPaidProSourceOfTruth({ text: authoritative, source: "server_full_draft" });
    markPremiumAuthoritativeServerCorpusAccepted();
    const out = buildCheckoutPreflightAgreementPreviewText(
      DRAFT,
      { premiumDeliverablePreview: true, intakeText: "intake" },
      {
        premiumGenerationCallReason: "checkout_completion",
        sessionGenerationId: "sess-267",
        intakeFingerprint: "fp",
      },
    );
    expect(out).toBe(getPaidProSourceOfTruthText() || authoritative);
    expect(hashPaidProCorpus(out)).toBe(
      hashPaidProCorpus(getPaidProSourceOfTruthText() || authoritative),
    );
  });

  it("blocks duplicate checkout premium-full-draft orchestration", () => {
    const first = recordPremiumFullDraftCall({
      reason: "checkout_completion",
      intakeFingerprint: "fp",
      agreementGenerationId: "g1",
    });
    const second = recordPremiumFullDraftCall({
      reason: "checkout_completion",
      intakeFingerprint: "fp",
      agreementGenerationId: "g1",
    });
    expect(first.duplicateBlocked).toBe(false);
    expect(second.duplicateBlocked).toBe(true);
  });

  it("latency attribution reports top contributors when perf trace enabled", () => {
    vi.stubEnv("VITE_PAID_PRO_PERF_TRACE", "1");
    const info = vi.spyOn(console, "info").mockImplementation(() => {});
    startPaidProPerformanceTrace({
      traceId: "t267-lat",
      sessionGenerationId: "gen-lat",
      intakeFingerprint: "fp-lat",
    });
    paidProPerfSpanStart("premium_full_draft_api");
    paidProPerfSpanEnd("premium_full_draft_api", {
      extra: { requestReason: "checkout_completion", documentTextLen: 17_000 },
    });
    paidProPerfSpanStart("placeholder_gate");
    paidProPerfSpanEnd("placeholder_gate", { docLen: 17_000 });
    finishPaidProPerformanceWaterfall();
    const attrCall = info.mock.calls.find((c) => String(c[0]).includes("[premium-generation-attribution]"));
    expect(attrCall).toBeTruthy();
    const payload = attrCall?.[1] as Record<string, unknown>;
    expect(payload.topContributors).toBeTruthy();
    expect(payload.latencyBound).toBeTruthy();
    expect(readLastFinishedPaidProPerformanceTrace()?.spans.length).toBeGreaterThan(0);
    info.mockRestore();
  });
});
