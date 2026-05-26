import { describe, expect, it } from "vitest";
import { canonicalizeProAgreementText } from "./proAgreementCanonicalizer";
import {
  assertNoBareProSkeletonClauses,
  isBareSkeletonHeadingAt,
  repairBareProSkeletonClauses,
  SUE_LEE_QA_BAD_CORPUS,
} from "./proCorpusSkeletonSafety";

describe("proCorpusSkeletonSafety", () => {
  it("detects bare subsection headings ending with a period", () => {
    const lines = [
      "4. Ownership and Work Product",
      "4.1 Service Provider tools and know-how.",
      "4.2 Client owns deliverables upon full payment.",
    ];
    expect(isBareSkeletonHeadingAt(lines, 1)).toBe(true);
    expect(isBareSkeletonHeadingAt(lines, 2)).toBe(false);
  });

  it("hydrates or removes bare headings in repairBareProSkeletonClauses", () => {
    const repaired = repairBareProSkeletonClauses(`1. Purpose and Scope\n\n2. Fees and Payment\n2.1 Net 30 applies.`);
    expect(repaired.text).not.toMatch(/^1\. Purpose and Scope\s*(?:\n\s*)*2\./m);
    expect(repaired.repairs.length).toBeGreaterThan(0);
  });

  it("assertNoBareProSkeletonClauses passes on canonicalized Sue Lee QA corpus", () => {
    const { text } = canonicalizeProAgreementText(SUE_LEE_QA_BAD_CORPUS, {
      canonicalPartyNames: ["Sue Lee", "Example Provider LLC"],
      canonicalRoles: ["Client", "Service Provider"],
      canonicalTerminationNoticeDays: 30,
    });
    const invariant = assertNoBareProSkeletonClauses(text);
    expect(invariant.ok).toBe(true);
    expect(invariant.violations).toEqual([]);
  });
});
