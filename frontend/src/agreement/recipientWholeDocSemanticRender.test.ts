import { describe, expect, it } from "vitest";
import { buildLegalRedlineDocumentViewModel } from "./legalRedlineBlocks";
import {
  blockPriorAndRevisedPlain,
  blockQualifiesForBeforeAfterPanelStrict,
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

  it("does not promote a moderate multi-section rewrite to whole_section_replacement (reserved for extreme diffs)", () => {
    const cur =
      "1. Payment\nFees due on receipt and late fees may apply.\n\n2. Scope\nWebsite only with limited support.\n\n3. Term\nOne year with automatic renewal.\n\n4. Confidentiality\nKeep secrets strictly.";
    const prop =
      "1. Payment\nInvoices due within 10 calendar days. Developer may pause work for nonpayment.\n\n2. Scope\nWebsite and analytics milestones per exhibit A with ongoing support.\n\n3. Term\nInitial term eighteen months with renewal options.\n\n4. Confidentiality\nKeep confidential information strictly private.";
    const vm = buildLegalRedlineDocumentViewModel(cur, prop);
    const p = buildRecipientSemanticRedlinePresentation(vm);
    expect(p.mode).toBe("inline_edit");
    expect(p.shortRevisedVsLongBaseline).toBe(false);
  });

  it("Sarah-style short revised memo vs long original: not whole_section_replacement and flags short baseline", () => {
    const cur =
      "WEB DEVELOPMENT AGREEMENT\n\nDraft Agreement (non-binding template)\n\n" +
      "1. Services.\nDeveloper will build the website and provide support.\n\n".repeat(80) +
      "IN WITNESS WHEREOF, the parties execute below.\n";
    const prop =
      "Payment terms: Net 45.\nScope: add analytics dashboard per Exhibit A.\nConfidentiality: mutual NDA terms apply.\n";
    const vm = buildLegalRedlineDocumentViewModel(cur, prop);
    const p = buildRecipientSemanticRedlinePresentation(vm);
    expect(p.shortRevisedVsLongBaseline).toBe(true);
    expect(p.mode).not.toBe("whole_section_replacement");
  });
});

describe("blockQualifiesForBeforeAfterPanelStrict", () => {
  it("returns false for a single-line payment swap", () => {
    const vm = buildLegalRedlineDocumentViewModel("Payment due within 30 days.", "Invoices due within 10 calendar days.");
    const b = vm.blocks.find((x) => x.hasChange);
    expect(b).toBeTruthy();
    expect(blockQualifiesForBeforeAfterPanelStrict(b!)).toBe(false);
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
