import { describe, expect, it } from "vitest";
import { buildLegalRedlineDocumentViewModel } from "./legalRedlineBlocks";
import {
  blockPriorAndRevisedPlain,
  blockQualifiesForBeforeAfterPanel,
  buildRecipientSemanticRedlinePresentation,
  recipientSemanticAnchorForBlockId,
} from "./recipientWholeDocSemanticRender";

describe("buildRecipientSemanticRedlinePresentation", () => {
  it("uses inline_edit for a small wording tweak", () => {
    const vm = buildLegalRedlineDocumentViewModel("Fee is due on receipt.", "Fee is Net 30.");
    const p = buildRecipientSemanticRedlinePresentation(vm);
    expect(p.mode).toBe("inline_edit");
    expect(p.beforeAfterBlockIds.length).toBe(0);
  });

  it("uses whole_section_replacement when many blocks read as clause-scale rewrites", () => {
    const cur =
      "1. Payment\nFees due on receipt and late fees may apply.\n\n2. Scope\nWebsite only with limited support.\n\n3. Term\nOne year with automatic renewal.\n\n4. Confidentiality\nKeep secrets strictly.";
    const prop =
      "1. Payment\nInvoices due within 10 calendar days. Developer may pause work for nonpayment.\n\n2. Scope\nWebsite and analytics milestones per exhibit A with ongoing support.\n\n3. Term\nInitial term eighteen months with renewal options.\n\n4. Confidentiality\nKeep confidential information strictly private.";
    const vm = buildLegalRedlineDocumentViewModel(cur, prop);
    const p = buildRecipientSemanticRedlinePresentation(vm);
    expect(p.mode).toBe("whole_section_replacement");
    expect(p.beforeAfterBlockIds.length).toBeGreaterThan(0);
  });
});

describe("blockQualifiesForBeforeAfterPanel", () => {
  it("returns false for a single-line payment swap", () => {
    const vm = buildLegalRedlineDocumentViewModel("Payment due within 30 days.", "Invoices due within 10 calendar days.");
    const b = vm.blocks.find((x) => x.hasChange);
    expect(b).toBeTruthy();
    expect(blockQualifiesForBeforeAfterPanel(b!)).toBe(false);
  });
});

describe("recipientSemanticAnchorForBlockId", () => {
  it("produces stable slug anchors", () => {
    expect(recipientSemanticAnchorForBlockId("m_3/foo")).toBe("semantic-m_3_foo");
  });
});

describe("blockPriorAndRevisedPlain", () => {
  it("prefers currentText and proposedText when present", () => {
    const vm = buildLegalRedlineDocumentViewModel("A", "B");
    const b = vm.blocks[0]!;
    const t = blockPriorAndRevisedPlain({ ...b, currentText: "Old section.", proposedText: "New section." });
    expect(t.prior).toContain("Old section");
    expect(t.revised).toContain("New section");
  });
});
