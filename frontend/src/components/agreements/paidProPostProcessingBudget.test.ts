import { beforeEach, describe, expect, it } from "vitest";
import { repairAgreementTemplatePlaceholders } from "./agreementTemplatePlaceholderSafety";
import { stabilizeFinalAgreementCompilerOutput } from "./finalAgreementCompilerIntegrity";
import { clearPaidProCorpusScanCache } from "./paidProCorpusScanCache";
import {
  clearPaidProPerformanceTrace,
  paidProPerfReadScanCount,
  paidProPerfResetScanCounters,
  startPaidProPerformanceTrace,
} from "./paidProPerformanceTrace";

const CORPUS_15K = [
  "MUTUAL CONSULTING AND IMPLEMENTATION AGREEMENT",
  "",
  "Blue Canyon Analytics LLC and Iron Vale Systems Inc.",
  "",
  ...Array.from({ length: 140 }, (_, i) => `Section ${i + 1}. Payment, scope, and confidentiality obligations for milestone ${i + 1}.`),
  "",
  "IN WITNESS WHEREOF",
  "CLIENT: Blue Canyon Analytics LLC",
  "SERVICE PROVIDER: Iron Vale Systems Inc.",
].join("\n");

const LOCAL_POST_PROCESS_BUDGET_MS = 2_500;

describe("paidProPostProcessingBudget", () => {
  beforeEach(() => {
    clearPaidProCorpusScanCache();
    clearPaidProPerformanceTrace();
    paidProPerfResetScanCounters("budget-trace");
  });

  it("post-processes a fixed ~15k corpus under a local frontend budget", () => {
    const started = performance.now();
    const placeholder = repairAgreementTemplatePlaceholders(CORPUS_15K, {
      intakeRaw: "Blue Canyon Iron Vale $8,500",
      partyNames: ["Blue Canyon Analytics LLC", "Iron Vale Systems Inc."],
    });
    const integrity = stabilizeFinalAgreementCompilerOutput(placeholder.text, {
      surface: "budget_test",
    });
    const elapsed = performance.now() - started;
    expect(integrity.text.length).toBeGreaterThan(10_000);
    expect(elapsed).toBeLessThan(LOCAL_POST_PROCESS_BUDGET_MS);
  });

  it("unchanged corpus second review pass does not repeat placeholder or integrity scans", () => {
    startPaidProPerformanceTrace({
      traceId: "budget-trace",
      intakeFingerprint: "fp-budget",
    });
    const ctx = {
      intakeRaw: "Blue Canyon Iron Vale",
      partyNames: ["Blue Canyon Analytics LLC", "Iron Vale Systems Inc."],
    };
    repairAgreementTemplatePlaceholders(CORPUS_15K, ctx);
    stabilizeFinalAgreementCompilerOutput(CORPUS_15K, { surface: "first_review" });
    repairAgreementTemplatePlaceholders(CORPUS_15K, ctx);
    stabilizeFinalAgreementCompilerOutput(CORPUS_15K, { surface: "first_review" });
    expect(paidProPerfReadScanCount("budget-trace", "placeholder_scan")).toBeLessThanOrEqual(2);
    expect(paidProPerfReadScanCount("budget-trace", "integrity_auto_repair")).toBeLessThanOrEqual(2);
  });
});
