import { describe, expect, it } from "vitest";
import type { LegalRedlineBlock } from "./legalRedlineBlocks";
import { recipientBlockEligibleForAdvancedLegalMarkup } from "./recipientWholeDocSemanticRender";

describe("recipientBlockEligibleForAdvancedLegalMarkup", () => {
  it("returns false when prior and revised are semantically equivalent despite inline segments", () => {
    const b: LegalRedlineBlock = {
      id: "x",
      kind: "clause",
      currentText: "Payment is due on receipt.",
      proposedText: "Payment is due on receipt.",
      segments: [
        { type: "same", text: "Payment is due " },
        { type: "delete", text: "on receipt" },
        { type: "insert", text: "on receipt" },
        { type: "same", text: "." },
      ],
      insertCount: 1,
      deleteCount: 1,
      sameCount: 2,
      hasInsert: true,
      hasDelete: true,
      hasChange: true,
      isMeaningfullyChanged: true,
    };
    expect(recipientBlockEligibleForAdvancedLegalMarkup(b)).toBe(false);
  });

  it("returns true for material wording change with inline markup", () => {
    const b: LegalRedlineBlock = {
      id: "y",
      kind: "clause",
      currentText: "Fees are due on receipt.",
      proposedText: "Fees are Net 30 from invoice.",
      segments: [
        { type: "same", text: "Fees are " },
        { type: "delete", text: "due on receipt" },
        { type: "insert", text: "Net 30 from invoice" },
        { type: "same", text: "." },
      ],
      insertCount: 1,
      deleteCount: 1,
      sameCount: 2,
      hasInsert: true,
      hasDelete: true,
      hasChange: true,
      isMeaningfullyChanged: true,
    };
    expect(recipientBlockEligibleForAdvancedLegalMarkup(b)).toBe(true);
  });
});
