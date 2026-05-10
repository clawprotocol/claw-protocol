import { describe, expect, it } from "vitest";
import { buildLegalRedlineDocumentViewModel } from "./legalRedlineBlocks";
import {
  applyRecipientMeaningfulChangePass,
  recipientBlockHasInlineMarkupDiff,
  recipientBlockShowsRedline,
  recipientClauseMeaningfulMaterialRatio,
} from "./recipientMeaningfulRedlinePass";
import { isStructuralHeadingOnlyBlock } from "./recipientStructuralHeadingOnly";

describe("applyRecipientMeaningfulChangePass", () => {
  it("collapses whitespace-only or equivalent clauses so they are not meaningfully changed", () => {
    const cur = "1. Services\nThe Developer will build the website.\n\n2. Payment\nDue on receipt.";
    const prop = "1. Services\nThe Developer will build the website.\n\n2. Payment\nDue on receipt.";
    const vm = applyRecipientMeaningfulChangePass(buildLegalRedlineDocumentViewModel(cur, prop));
    expect(vm.hasChanges).toBe(false);
    expect(vm.blocks.every((b) => !recipientBlockShowsRedline(b))).toBe(true);
  });

  it("keeps payment timing edits as meaningfully changed", () => {
    const cur = "4. Payment\nFees due on receipt.";
    const prop = "4. Payment\nInvoices due Net 30.";
    const vm = applyRecipientMeaningfulChangePass(buildLegalRedlineDocumentViewModel(cur, prop));
    const pay = vm.blocks.find((b) => /payment/i.test(b.label ?? "") || /payment/i.test(String(b.heading)));
    expect(pay && recipientBlockShowsRedline(pay)).toBeTruthy();
    expect(recipientBlockHasInlineMarkupDiff(pay!)).toBe(true);
  });

  it("suppresses orphan heading redline when the following body is equivalent", () => {
    const cur = "2. Fees and Payment\nThe fee is fixed.\n\n3. Term\nOne year.";
    const prop = "2. Fees and Payment\nThe fee is fixed.\n\n3. Term\nOne year.";
    const vm = applyRecipientMeaningfulChangePass(buildLegalRedlineDocumentViewModel(cur, prop));
    expect(vm.blocks.filter((b) => b.kind === "heading" && recipientBlockShowsRedline(b)).length).toBe(0);
  });

  it("does not surface duplicate agreement title or Background heading as material redline when body is unchanged", () => {
    const cur = [
      "WEB DEVELOPMENT AGREEMENT",
      "",
      "WEB DEVELOPMENT AGREEMENT",
      "",
      "Background and Purpose",
      "",
      "Background and Purpose",
      "",
      "1. Services",
      "Developer shall deliver on schedule.",
    ].join("\n");
    const prop = [
      "WEB DEVELOPMENT AGREEMENT",
      "",
      "Background and Purpose",
      "",
      "1. Services",
      "Developer shall deliver on schedule.",
    ].join("\n");
    const vm = applyRecipientMeaningfulChangePass(buildLegalRedlineDocumentViewModel(cur, prop));
    const blob = vm.blocks.map((b) => b.segments.map((s) => s.text).join("")).join(" ");
    expect(blob).not.toMatch(/WEB\s+DEVELOPMENT\s+AGREEMENT\s+WEB\s+DEVELOPMENT\s+AGREEMENT/i);
    expect(blob).not.toMatch(/Background\s+and\s+Purpose\s+Background\s+and\s+Purpose/i);
    expect(vm.blocks.filter((b) => isStructuralHeadingOnlyBlock(b) && recipientBlockShowsRedline(b)).length).toBe(0);
  });
});

describe("recipientClauseMeaningfulMaterialRatio", () => {
  it("returns 0 when there are no clause blocks", () => {
    const vm = buildLegalRedlineDocumentViewModel("a", "b");
    expect(recipientClauseMeaningfulMaterialRatio(vm)).toBe(0);
  });
});
