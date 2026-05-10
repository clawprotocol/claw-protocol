import { describe, expect, it } from "vitest";
import { buildLegalRedlineDocumentViewModel, type LegalRedlineDocumentViewModel } from "./legalRedlineBlocks";
import {
  businessReviewCardCompactImpactLine,
  businessReviewCardForSemanticId,
  businessReviewCardTitleSubline,
  extractBusinessReviewCardPreviewExcerpt,
  getPrimaryScrollTargetBlockIdForSemanticId,
  getScrollTargetBlockIdForSemanticOrFallback,
} from "./recipientBusinessReviewCardsModel";

describe("extractBusinessReviewCardPreviewExcerpt", () => {
  it("returns null when diff text looks like reviewer / sender notes (never in agreement excerpts)", () => {
    const vm: LegalRedlineDocumentViewModel = {
      blocks: [
        {
          id: "b1",
          kind: "paragraph",
          label: "Payment",
          segments: [
            { type: "delete", text: "Reviewer notes: shorten payment clause." },
            { type: "insert", text: "Net 30." },
          ],
          insertCount: 1,
          deleteCount: 1,
          sameCount: 0,
          hasInsert: true,
          hasDelete: true,
          hasChange: true,
        },
      ],
      stats: {
        blockCount: 1,
        changedBlockCount: 1,
        insertCount: 1,
        deleteCount: 1,
        sameCount: 0,
        segmentCount: 2,
        currentLen: 10,
        proposedLen: 10,
      },
      hasChanges: true,
    };
    expect(extractBusinessReviewCardPreviewExcerpt(vm, "payment_terms")).toBeNull();
  });
});

describe("businessReviewCardTitleSubline", () => {
  it("uses the first sentence of why it matters when reasonable", () => {
    const card = businessReviewCardForSemanticId("payment_terms", "Payment timing");
    const sub = businessReviewCardTitleSubline(card);
    expect(sub.endsWith(".")).toBe(true);
    expect(sub.length).toBeLessThanOrEqual(card.whyMatters.length);
  });
});

describe("businessReviewCardCompactImpactLine", () => {
  it("joins risk band and commercial effect in one line", () => {
    const card = businessReviewCardForSemanticId("payment_terms", "Payment");
    const line = businessReviewCardCompactImpactLine(card);
    expect(line.length).toBeGreaterThan(10);
    expect(line).toMatch(/Low|Medium|High/i);
  });
});

describe("getScrollTargetBlockIdForSemanticOrFallback", () => {
  it("falls back to the first changed block when semantic keyword match is absent", () => {
    const vm = buildLegalRedlineDocumentViewModel("Only body text without payment keywords.", "Only revised body.");
    const firstChanged = vm.blocks.find((b) => b.hasChange)?.id ?? null;
    expect(firstChanged).toBeTruthy();
    expect(getScrollTargetBlockIdForSemanticOrFallback(vm, "payment_terms")).toBe(firstChanged);
  });
});

describe("getPrimaryScrollTargetBlockIdForSemanticId", () => {
  it("returns the payment block id, not a confidentiality-only block", () => {
    const vm = buildLegalRedlineDocumentViewModel(
      "7. Confidentiality\nKeep secrets.\n\n4. Payment\nDue on receipt.",
      "7. Confidentiality\nKeep strictly private.\n\n4. Payment\nNet 30 from invoice.",
    );
    const id = getPrimaryScrollTargetBlockIdForSemanticId(vm, "payment_terms");
    expect(id).toBeTruthy();
    const block = vm.blocks.find((b) => b.id === id);
    expect(block?.label?.toLowerCase() ?? "").toMatch(/payment/);
  });
});
