import { describe, expect, it } from "vitest";
import { buildLegalRedlineDocumentViewModel } from "./legalRedlineBlocks";
import { applyRecipientMeaningfulChangePass } from "./recipientMeaningfulRedlinePass";
import { pdfImportPlainAfterSanitize } from "./recipientRevisedDraftImportText";
import { recipientRecoverAgreementBodyFromPdfRawText } from "./recipientRevisedDraftExtractSanitize";

/**
 * Simulates: rawLen large, thin sanitize body empty, pdfThinSanitizeUsedRaw, then recovered body for compare.
 * Ensures we do not build a whole-document deletion redline against an empty proposed shell.
 */
describe("raw fallback bodyLen 0 → recovered compare redline sanity", () => {
  it("recovered agreement text pairs without mass heading-only deletion stats", () => {
    const filler = "Supporting operational text for pagination simulation. ".repeat(400);
    const raw = [
      "Created with LawDog — Revised Draft for Review — Page 1",
      "",
      "WEB DEVELOPMENT AGREEMENT",
      "",
      "Background and Purpose",
      "The parties want a modern commerce site.",
      "",
      "1. Services",
      "Developer shall deliver milestones within forty-five days.",
      "",
      "2. Payment",
      "Fees are Net 45 from invoice date.",
      "",
      filler,
    ].join("\n");
    expect(raw.length).toBeGreaterThan(18_000);

    const san = { agreementText: "   ", reviewerNotes: null as string | null, artifactsRemoved: [] as string[] };
    const routed = pdfImportPlainAfterSanitize(raw, san);
    expect(routed.kind).toBe("use_raw_for_classification");
    if (routed.kind !== "use_raw_for_classification") throw new Error("unexpected route");
    expect(routed.pdfThinSanitizeUsedRaw).toBe(true);

    const recovered = recipientRecoverAgreementBodyFromPdfRawText(raw);
    expect(recovered.agreementText.trim().length).toBeGreaterThan(400);
    expect(recovered.agreementText.toLowerCase()).toContain("net 45");

    const baseline = [
      "WEB DEVELOPMENT AGREEMENT",
      "",
      "Background and Purpose",
      "The parties want a modern commerce site.",
      "",
      "1. Services",
      "Developer shall deliver milestones on schedule.",
      "",
      "2. Payment",
      "Fees are Net 30 from invoice date.",
    ].join("\n");

    const vm = applyRecipientMeaningfulChangePass(
      buildLegalRedlineDocumentViewModel(baseline, recovered.agreementText),
    );
    expect(vm.stats.deleteCount).toBeLessThan(120);
    expect(vm.stats.changedBlockCount).toBeLessThan(40);
    const joined = vm.blocks
      .filter((b) => b.hasChange)
      .map((b) => b.segments.map((s) => s.text).join(""))
      .join(" ");
    expect(joined).not.toMatch(/WEB\s+DEVELOPMENT\s+AGREEMENT\s+WEB\s+DEVELOPMENT\s+AGREEMENT/i);
  });
});
