import { afterEach, describe, expect, it, vi } from "vitest";
import * as proAgreementCanonicalizer from "./proAgreementCanonicalizer";
import * as finalAgreementCompilerIntegrity from "./finalAgreementCompilerIntegrity";
import {
  assertPaidProSurfaceCorpus,
  clearPaidProSourceOfTruth,
  establishPaidProSourceOfTruth,
  getPaidProDocumentForSurface,
  hashPaidProCorpus,
} from "./paidProSourceOfTruth";

const sourceText = [
  "SERVICES AGREEMENT",
  "",
  "This Agreement is between Red Mesa Logistics LLC and Harbor Peak Automation LLC.",
  "",
  "1. Scope. Harbor Peak will provide AI workflow setup.",
  "",
  "2. Fees. Red Mesa will pay Harbor Peak $5,000.",
  "",
  "3. Governing Law. Texas law governs.",
  "",
  "4. Electronic Signatures. Electronic signatures are allowed.",
  "",
  "IN WITNESS WHEREOF, the parties execute this Agreement.",
  "",
  "CLIENT:",
  "Red Mesa Logistics LLC",
  "By: _________________________________",
  "",
  "SERVICE PROVIDER:",
  "Harbor Peak Automation LLC",
  "By: _________________________________",
  "",
  "Operative commercial clause. ".repeat(160),
].join("\n");

describe("paidProSourceOfTruth", () => {
  afterEach(() => {
    clearPaidProSourceOfTruth();
  });

  it("returns exact source text/hash for display, copy, review, finalized, and signer_setup", () => {
    const source = establishPaidProSourceOfTruth({ text: sourceText });
    for (const surface of ["display", "copy", "review", "finalized", "signer_setup"] as const) {
      const doc = getPaidProDocumentForSurface(surface);
      expect(doc?.text).toBe(source.text);
      expect(doc?.hash).toBe(source.hash);
      expect(doc?.source).toBe("paidProSourceOfTruth");
    }
  });

  it("does not call canonicalizer or final compiler mutation for source-of-truth surfaces", () => {
    establishPaidProSourceOfTruth({ text: sourceText });
    const canonicalizerSpy = vi.spyOn(proAgreementCanonicalizer, "canonicalizeProAgreementText");
    const compilerSpy = vi.spyOn(finalAgreementCompilerIntegrity, "stabilizeFinalAgreementCompilerOutput");
    for (const surface of ["display", "copy", "review", "finalized", "signer_setup", "vs01"] as const) {
      expect(getPaidProDocumentForSurface(surface)?.text).toBeTruthy();
    }
    expect(canonicalizerSpy).not.toHaveBeenCalled();
    expect(compilerSpy).not.toHaveBeenCalled();
    canonicalizerSpy.mockRestore();
    compilerSpy.mockRestore();
  });

  it("VS01 starts with source text and does not use short fallback corpus", () => {
    const source = establishPaidProSourceOfTruth({ text: sourceText });
    const doc = getPaidProDocumentForSurface("vs01");
    expect(doc?.text.startsWith(source.text)).toBe(true);
    expect(doc?.text.length).toBeGreaterThan(835);
    expect(hashPaidProCorpus(doc?.text ?? "")).toBe(source.hash);
  });

  it("logs FATAL_PAID_PRO_CORPUS_DRIFT when a surface returns a different hash", () => {
    const source = establishPaidProSourceOfTruth({ text: sourceText });
    const spy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    assertPaidProSurfaceCorpus({
      surface: "copy",
      text: `${source.text}\n\nInjected fallback mutation.`,
      actualSource: "handoff_corpus",
    });
    expect(spy).toHaveBeenCalledWith(
      "[FATAL_PAID_PRO_CORPUS_DRIFT]",
      expect.objectContaining({
        surface: "copy",
        expectedHash: source.hash,
        actualSource: "handoff_corpus",
      }),
    );
    spy.mockRestore();
  });
});
