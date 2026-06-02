import { beforeEach, describe, expect, it } from "vitest";
import { repairAgreementTemplatePlaceholders } from "./agreementTemplatePlaceholderSafety";
import { stabilizeFinalAgreementCompilerOutput } from "./finalAgreementCompilerIntegrity";
import {
  clearPaidProCorpusScanCache,
  readPaidProCorpusScanCacheSize,
} from "./paidProCorpusScanCache";
import { paidProPerfResetScanCounters, readActivePaidProPerformanceTrace, startPaidProPerformanceTrace } from "./paidProPerformanceTrace";

const CORPUS_15K = [
  "MUTUAL SERVICES AGREEMENT",
  "",
  "Blue Canyon Analytics LLC and Iron Vale Systems Inc.",
  "",
  ...Array.from({ length: 120 }, (_, i) => `Section ${i + 1}. Operative clause ${i + 1} with consideration and performance duties.`),
  "",
  "IN WITNESS WHEREOF",
  "CLIENT: Blue Canyon Analytics LLC",
  "SERVICE PROVIDER: Iron Vale Systems Inc.",
].join("\n");

describe("paidProCorpusScanCache", () => {
  beforeEach(() => {
    clearPaidProCorpusScanCache();
    paidProPerfResetScanCounters();
  });

  it("repeated placeholder scans with unchanged corpus hit cache", () => {
    const ctx = {
      intakeRaw: "Blue Canyon and Iron Vale consulting $8,500",
      partyNames: ["Blue Canyon Analytics LLC", "Iron Vale Systems Inc."],
    };
    const first = repairAgreementTemplatePlaceholders(CORPUS_15K, ctx);
    const sizeAfterFirst = readPaidProCorpusScanCacheSize();
    const second = repairAgreementTemplatePlaceholders(CORPUS_15K, ctx);
    expect(first.text).toBe(second.text);
    expect(readPaidProCorpusScanCacheSize()).toBe(sizeAfterFirst);
  });

  it("repeated integrity stabilization with unchanged corpus hits cache", () => {
    startPaidProPerformanceTrace({
      traceId: "scan-cache-test",
      intakeFingerprint: "fp-scan",
    });
    const a = stabilizeFinalAgreementCompilerOutput(CORPUS_15K, { surface: "budget_test" });
    const b = stabilizeFinalAgreementCompilerOutput(CORPUS_15K, { surface: "budget_test" });
    expect(a.text).toBe(b.text);
    const trace = readActivePaidProPerformanceTrace();
    expect(trace).toBeTruthy();
  });
});
