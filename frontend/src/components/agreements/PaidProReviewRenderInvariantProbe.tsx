/**
 * DOM probe for paid Pro review render invariant — fires when shell + corpus but no document.
 */

import { useEffect, useRef } from "react";
import {
  assertPaidProReviewRenderInvariant,
  countDomMatches,
  logPaidProReviewBranch,
  PAID_PRO_REVIEW_CTA_REGION_SELECTORS,
  PAID_PRO_REVIEW_DOCUMENT_RENDERER_SELECTORS,
  type PaidProReviewBranchSnapshot,
} from "./paidProReviewBranchInstrumentation";

type Props = {
  snapshot: PaidProReviewBranchSnapshot;
  reviewShellMounted: boolean;
};

export function PaidProReviewRenderInvariantProbe({ snapshot, reviewShellMounted }: Props) {
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!reviewShellMounted) return;
    const root = rootRef.current?.closest("#fadeWrapper") ?? rootRef.current ?? document;
    const documentRendererCount = countDomMatches(root, PAID_PRO_REVIEW_DOCUMENT_RENDERER_SELECTORS);
    const ctaRegionCount = countDomMatches(root, PAID_PRO_REVIEW_CTA_REGION_SELECTORS);
    const liveSnapshot: PaidProReviewBranchSnapshot = {
      ...snapshot,
      documentMounted: documentRendererCount > 0,
      chromeMounted: ctaRegionCount > 0,
      signerMounted: root.querySelector('[data-testid="paid-pro-inline-signer-setup"]') !== null,
    };
    logPaidProReviewBranch(liveSnapshot);
    assertPaidProReviewRenderInvariant({
      reviewShellMounted,
      hasCanonicalCorpus: liveSnapshot.hasCanonicalCorpus,
      canonicalReviewCorpusLen: liveSnapshot.canonicalReviewCorpusLen,
      documentRendererCount,
      ctaRegionCount,
      path: liveSnapshot.path,
    });
  }, [reviewShellMounted, snapshot]);

  return (
    <div
      ref={rootRef}
      data-testid="paid-pro-review-render-invariant-probe"
      data-paid-pro-review-path={snapshot.path}
      className="sr-only"
      aria-hidden
    />
  );
}
