import { afterEach, describe, expect, it, vi } from "vitest";
import * as proAgreementCanonicalizer from "./proAgreementCanonicalizer";
import * as finalAgreementCompilerIntegrity from "./finalAgreementCompilerIntegrity";
import {
  assertPaidProSurfaceCorpus,
  clearPaidProSourceOfTruth,
  establishPaidProSourceOfTruth,
  getPaidProDocumentForSurface,
  getPaidProSourceOfTruth,
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

  describe("first-authoritative-success-wins overwrite protection", () => {
    const shortRejectedBody = [
      "SERVICES AGREEMENT",
      "",
      "This Agreement is between Red Mesa Logistics LLC and Harbor Peak Automation LLC.",
      "",
      "1. Scope. Brief.",
    ].join("\n");

    it("a rejected_paid_corpus source can never overwrite an existing SoT (throws)", () => {
      const accepted = establishPaidProSourceOfTruth({ text: sourceText });
      expect(() =>
        establishPaidProSourceOfTruth({ text: shortRejectedBody, source: "rejected_paid_corpus" }),
      ).toThrow(/paid-pro-sot-commit-blocked/);
      // The first authoritative SoT survives.
      expect(getPaidProSourceOfTruth()?.text).toBe(accepted.text);
      expect(getPaidProSourceOfTruth()?.hash).toBe(accepted.hash);
    });

    it("a later shorter degraded body cannot overwrite the accepted full-document SoT", () => {
      const accepted = establishPaidProSourceOfTruth({ text: sourceText, source: "server_full_draft" });
      // Duplicate-race second response: degraded/json_parse came back with a much shorter body.
      const result = establishPaidProSourceOfTruth({ text: shortRejectedBody, source: "server_full_draft" });
      // The overwrite is ignored; the first authoritative SoT is returned unchanged.
      expect(result.text).toBe(accepted.text);
      expect(result.hash).toBe(accepted.hash);
      expect(getPaidProSourceOfTruth()?.text).toBe(accepted.text);
      expect(getPaidProSourceOfTruth()?.text.length).toBe(accepted.text.length);
    });

    it("an equal or longer body may still re-establish (no false downgrade block)", () => {
      const accepted = establishPaidProSourceOfTruth({ text: sourceText, source: "server_full_draft" });
      const longer = `${sourceText}\n\n5. Additional commercial clause that extends the body. ${"x".repeat(200)}`;
      const result = establishPaidProSourceOfTruth({ text: longer, source: "server_full_draft" });
      expect(result.text.length).toBeGreaterThanOrEqual(accepted.text.length);
    });

    it("an explicit user-approved revision may legitimately shorten the body", () => {
      establishPaidProSourceOfTruth({ text: sourceText, source: "server_full_draft" });
      const result = establishPaidProSourceOfTruth({
        text: shortRejectedBody,
        source: "server_full_draft",
        allowShorterOverwrite: true,
      });
      expect(result.text.length).toBeLessThan(sourceText.length);
      expect(getPaidProSourceOfTruth()?.text).toBe(result.text);
    });
  });
});
