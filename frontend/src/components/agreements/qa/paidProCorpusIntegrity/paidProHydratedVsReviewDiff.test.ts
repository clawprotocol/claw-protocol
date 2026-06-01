import { afterEach, describe, expect, it } from "vitest";
import { clearAuthoritativeSigningSnapshot } from "../../authoritativeSigningSnapshot";
import { clearPaidProPinnedSignerAppliedCorpus } from "../../paidProFinalHydratedCorpus";
import { clearConsumedPaidProSignerMetadataAuthority } from "../../paidProSignerMetadataAuthority";
import { clearPaidProSourceOfTruth } from "../../paidProSourceOfTruth";
import { resolvePaidProFinalHydratedCorpusForSurface } from "../../paidProFinalHydratedCorpus";
import {
  applyPaidProReviewRenderSanitizer,
  resolvePaidProReviewRenderPlain,
  resolvePartiesForReviewRender,
} from "../../paidProReviewRenderCorpus";
import {
  armPaidProHardeningSession,
  loadPaidProHardeningFixture,
} from "../paidProHardening/paidProHardeningFixtures";
import {
  diffNormalizedCorpora,
  normalizeCorpusForCopyCompare,
} from "./paidProCorpusIntegrityMetrics";

const FIXTURE = "freeProQaTemplateATest204";

/** Historical MONITOR drift (pre-hydration name repair): legal entity in Name: vs human signer names. */
export const PAID_PRO_HYDRATED_REVIEW_DRIFT_CLASS =
  "SIGNATURE_BLOCK_NAME_LINE_REPAIR" as const;

function byteDiffReport(a: string, b: string): {
  aLen: number;
  bLen: number;
  deltaBytes: number;
  firstDiffIndex: number;
  aSlice: string;
  bSlice: string;
  onlyInA: string[];
  onlyInB: string[];
} {
  const left = normalizeCorpusForCopyCompare(a);
  const right = normalizeCorpusForCopyCompare(b);
  let idx = 0;
  while (idx < left.length && idx < right.length && left[idx] === right[idx]) idx += 1;
  const endA = left.length;
  const endB = right.length;
  let endIdx = 0;
  while (
    endIdx < endA - idx &&
    endIdx < endB - idx &&
    left[endA - 1 - endIdx] === right[endB - 1 - endIdx]
  ) {
    endIdx += 1;
  }
  const aMid = left.slice(idx, endA - endIdx || endA);
  const bMid = right.slice(idx, endB - endIdx || endB);
  return {
    aLen: left.length,
    bLen: right.length,
    deltaBytes: right.length - left.length,
    firstDiffIndex: idx,
    aSlice: JSON.stringify(aMid),
    bSlice: JSON.stringify(bMid),
    onlyInA: aMid ? [aMid] : [],
    onlyInB: bMid ? [bMid] : [],
  };
}

describe("paidProCorpusIntegrity hydrated vs review render diff", () => {
  afterEach(() => {
    clearPaidProSourceOfTruth();
    clearConsumedPaidProSignerMetadataAuthority();
    clearAuthoritativeSigningSnapshot();
    clearPaidProPinnedSignerAppliedCorpus();
  });

  it("prints exact normalized diff between hydrated resolver and review render plain", () => {
    const fixture = loadPaidProHardeningFixture(FIXTURE);
    armPaidProHardeningSession({ fixture, withSignerMetadata: true });
    const opts = { draft: fixture.draft, intakeText: fixture.intakeText };

    const hydrated = resolvePaidProFinalHydratedCorpusForSurface("review", opts).text;
    const review = resolvePaidProReviewRenderPlain(opts);
    const parties = resolvePartiesForReviewRender(opts);
    const sanitizedHydratedOnly = applyPaidProReviewRenderSanitizer(hydrated, parties).text;

    const report = {
      driftClass: PAID_PRO_HYDRATED_REVIEW_DRIFT_CLASS,
      hydratedLen: hydrated.length,
      reviewLen: review.length,
      sanitizedHydratedOnlyLen: sanitizedHydratedOnly.length,
      hydratedVsReview: byteDiffReport(hydrated, review),
      hydratedVsSanitizedHydrated: byteDiffReport(hydrated, sanitizedHydratedOnly),
      sanitizedHydratedVsReview: byteDiffReport(sanitizedHydratedOnly, review),
      diffNormalized: diffNormalizedCorpora(hydrated, review),
      nameLinesHydrated: (hydrated.match(/^(\s*)Name:\s*.+$/gim) || []).slice(-2),
      nameLinesReview: (review.match(/^(\s*)Name:\s*.+$/gim) || []).slice(-2),
    };

    // eslint-disable-next-line no-console
    console.info("[paid-pro-hydrated-vs-review-diff]", JSON.stringify(report, null, 2));

    expect(normalizeCorpusForCopyCompare(hydrated)).toBe(normalizeCorpusForCopyCompare(review));
    expect(report.hydratedVsReview.deltaBytes).toBe(0);
    expect(report.diffNormalized).toBeNull();
  });
});
