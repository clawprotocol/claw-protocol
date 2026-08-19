/** @vitest-environment jsdom */
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { auditPaidProReviewLinkCorpusParity } from "./paidProReviewLinkCorpusParity";
import { countPaidProExecutionBlocks } from "./paidProExecutionBlockAuthority";
import { clearPaidProPinnedSignerAppliedCorpus, setPaidProPinnedSignerAppliedCorpus } from "./paidProFinalHydratedCorpus";
import { clearAuthoritativeSigningSnapshot } from "./authoritativeSigningSnapshot";
import { clearPaidProSourceOfTruth } from "./paidProSourceOfTruth";

function reviewFirstCorpusWithoutExecutionBlock(): string {
  const clauses = Array.from(
    { length: 12 },
    (_, i) =>
      `Section ${i + 1}. The Parties shall keep Confidential Information secret and use it only for the Permitted Purpose described in this Agreement.`,
  );
  return [
    "CONFIDENTIALITY AGREEMENT",
    "",
    "This Agreement is entered into by Alpha IP Holdings LLC, Beta Research LLC, and Gamma Distribution LLC.",
    "",
    ...clauses,
  ].join("\n");
}

function lockPostFinalizeSnapshot(plain: string): void {
  setPaidProPinnedSignerAppliedCorpus(plain);
}

describe("review-link corpus parity", () => {
  beforeEach(() => {
    clearPaidProSourceOfTruth();
    clearAuthoritativeSigningSnapshot();
    clearPaidProPinnedSignerAppliedCorpus();
    sessionStorage.clear();
  });

  afterEach(() => {
    sessionStorage.clear();
    clearPaidProPinnedSignerAppliedCorpus();
    clearAuthoritativeSigningSnapshot();
  });

  it("allows review-first mint when hashes match and the snapshot has no execution block", () => {
    const plain = reviewFirstCorpusWithoutExecutionBlock();
    expect(plain.length).toBeGreaterThan(500);
    expect(countPaidProExecutionBlocks(plain)).toBe(0);
    lockPostFinalizeSnapshot(plain);

    const parity = auditPaidProReviewLinkCorpusParity({
      creatorPlain: plain,
      reviewLinkPlain: plain,
      source: "authoritative_signing_snapshot",
    });

    expect(parity.creatorHash).toBe(parity.reviewLinkHash);
    expect(parity.creatorHash.length).toBeGreaterThan(0);
    expect(parity.executionBlockCount).toBe(0);
    expect(parity.blankSignerLinesRemaining).toBe(0);
    expect(parity.hydrated).toBe(false);
    expect(parity.invariantOk).toBe(true);
  });

  it("still blocks when creator and review-link hashes diverge", () => {
    const creator = reviewFirstCorpusWithoutExecutionBlock();
    const drifted = `${creator}\n\nSection 99. Drifted review-link copy.`;
    expect(countPaidProExecutionBlocks(creator)).toBe(0);
    lockPostFinalizeSnapshot(creator);

    const parity = auditPaidProReviewLinkCorpusParity({
      creatorPlain: creator,
      reviewLinkPlain: drifted,
      source: "authoritative_signing_snapshot",
    });

    expect(parity.creatorHash).not.toBe(parity.reviewLinkHash);
    expect(parity.invariantOk).toBe(false);
  });
});
