import { describe, expect, it } from "vitest";
import {
  GUIDED_FINAL_REVIEW_MIN_CORPUS_LEN,
  resolveSimpleProFinalReviewCorpus,
} from "./simpleProFinalReviewCorpus";

describe("simpleProFinalReviewCorpus (test28)", () => {
  it("recovers final review display when display corpus empty but recovery snapshot is full", () => {
    const out = resolveSimpleProFinalReviewCorpus({
      authoritativePlain: "",
      recoveryAuthoritativePlain: "y".repeat(8800),
      finalReviewAuthorityOnly: true,
      appliedAnswerCount: 3,
    });
    expect(out.plainText.length).toBeGreaterThanOrEqual(GUIDED_FINAL_REVIEW_MIN_CORPUS_LEN);
    expect(out.source).toBe("last_known_good");
  });

  it("auto-recovers final review when full body existed but display corpus too short", () => {
    const out = resolveSimpleProFinalReviewCorpus({
      authoritativePlain: "x".repeat(400),
      recoveryAuthoritativePlain: "y".repeat(8856),
      finalReviewAuthorityOnly: true,
    });
    expect(out.plainText.length).toBe(8856);
    expect(out.corpusRecovered).toBe(true);
    expect(out.corpusBlocked).not.toBe(true);
  });
});
