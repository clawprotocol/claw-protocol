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

  it("uses pinned finalized signer corpus over picker when provided", () => {
    const pinned = "Pinned signer-applied body with Acme LLC. ".repeat(100);
    const picker = `${pinned} Stale picker appendix. `.repeat(5);
    const out = resolveSimpleProFinalReviewCorpus({
      authoritativePlain: "shorter authoritative",
      pickerPlain: picker,
      pinnedFinalizedSignerPlain: pinned,
      finalReviewAuthorityOnly: false,
    });
    expect(out.plainText.trim()).toBe(pinned.trim());
    expect(out.plainText).not.toContain("Stale picker appendix");
  });

  it("does not prefer longer picker/server draft over signer-applied authoritative on final review", () => {
    const signerApplied = "Signer-applied body with Acme LLC and Joe Brown. ".repeat(120);
    const stalePicker = `${signerApplied} Stale picker appendix from server_full_document_text. `.repeat(8);
    expect(stalePicker.length).toBeGreaterThan(signerApplied.length);
    const out = resolveSimpleProFinalReviewCorpus({
      authoritativePlain: signerApplied,
      pickerPlain: stalePicker,
      finalReviewAuthorityOnly: true,
    });
    expect(out.plainText.trim()).toBe(signerApplied.trim());
    expect(out.source).toBe("authoritative_hydrated");
    expect(out.plainText).toContain("Acme LLC");
    expect(out.plainText).not.toContain("Stale picker appendix");
    expect(out.plainText.length).toBeLessThan(stalePicker.length);
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
