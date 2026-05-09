import { describe, expect, it } from "vitest";
import { buildRecipientCompareConfidence } from "./recipientCompareConfidence";
import {
  buildHumanReviewHeadline,
  buildHumanReviewNegativeAssurances,
  buildHumanReviewStructuredForPdf,
  classifyFriendlyChipBucket,
  friendlyChipToReviewBullet,
  groupFriendlyChipsForHumanReview,
  humanReviewMeaningfulCount,
} from "./recipientHumanReviewSummaryModel";

describe("groupFriendlyChipsForHumanReview", () => {
  it("buckets payment and scope as important by default", () => {
    const g = groupFriendlyChipsForHumanReview(["Payment terms updated", "Scope clarified"]);
    expect(g.important.length).toBe(2);
    expect(g.clarifications.length).toBe(0);
  });

  it("routes formatting-style chips to clarifications", () => {
    expect(classifyFriendlyChipBucket("Formatting / heading cleanup")).toBe("clarification");
  });
});

describe("friendlyChipToReviewBullet", () => {
  it("lowercases the first character", () => {
    expect(friendlyChipToReviewBullet("Payment terms updated")).toBe("payment terms updated");
  });
});

describe("buildHumanReviewHeadline", () => {
  it("uses a neutral reviewer label and count", () => {
    expect(buildHumanReviewHeadline("The reviewer", 6)).toBe("The reviewer proposed 6 meaningful revisions.");
    expect(buildHumanReviewHeadline("Alex", 1)).toBe("Alex proposed 1 meaningful revision.");
  });
});

describe("humanReviewMeaningfulCount", () => {
  it("prefers chip count when present", () => {
    expect(humanReviewMeaningfulCount(["a", "b"], 99)).toBe(2);
  });

  it("falls back to changed block count when no chips", () => {
    expect(humanReviewMeaningfulCount([], 5)).toBe(5);
    expect(humanReviewMeaningfulCount([], 0)).toBe(1);
  });
});

describe("buildHumanReviewNegativeAssurances", () => {
  it("emits conservative assurances when topics are absent", () => {
    const lines = buildHumanReviewNegativeAssurances("Net 30 only.", ["payment_terms"]);
    expect(lines.some((l) => /signing terms/i.test(l))).toBe(true);
    expect(lines.some((l) => /governing law/i.test(l))).toBe(true);
  });
});

describe("buildHumanReviewStructuredForPdf", () => {
  it("includes confidence lines without engine jargon", () => {
    const conf = buildRecipientCompareConfidence({
      artifactsRemovedCount: 0,
      paymentTermsInlinePlacementFailed: false,
      recipientIntentGapCount: 0,
      usedNoisyReviseGuard: false,
      hasLargeBlockFallbackReason: false,
      segmentCount: 12,
      changedBlockCount: 2,
      insertCount: 1,
      deleteCount: 1,
    });
    const pdf = buildHumanReviewStructuredForPdf({
      reviewerHeadlineName: "The reviewer",
      chips: ["Payment terms updated"],
      changedBlockCount: 2,
      instructionPlain: "Net 30",
      changedFieldKeys: ["payment_terms"],
      confidence: conf,
    });
    expect(pdf.headlinePlain).toContain("meaningful revision");
    expect(pdf.confidenceHeadline.toLowerCase()).toContain("confidence");
    expect(pdf.nothingSentFootnote.toLowerCase()).toContain("nothing is sent");
  });
});
