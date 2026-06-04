/**
 * Paid Pro post-checkout review vertical rhythm (layout only).
 * Targets DocuSign / PandaDoc / Dropbox Sign: title + one trust line, then document immediately.
 */

/** Documented “before” spacing (approximate px from Tailwind at 16px root). */
export const PAID_PRO_REVIEW_VERTICAL_LAYOUT_BEFORE = {
  shellHeaderPaddingTopPx: 16,
  shellHeaderPaddingBottomPx: 8,
  shellTitleToSubtitleGapPx: 12,
  shellSubtitleToControlLineGapPx: 16,
  controlLineHeightPx: 20,
  controlLineMarginBottomPx: 16,
  previewRootMarginTopPx: 16,
  documentFrameMarginTopPx: 16,
  documentFramePaddingTopPx: 24,
  documentFramePaddingBottomPx: 24,
  reviewScreenStackGapPx: 12,
  inPanelHeadlineHeightPx: 28,
  inPanelSubcopyMarginTopPx: 8,
  inPanelSubcopyHeightPx: 20,
  statusPanelHeightPx: 88,
  nextStepCalloutHeightPx: 72,
  documentCardPaddingTopPx: 44,
} as const;

/** “After” spacing — tighter funnel to the agreement card. */
export const PAID_PRO_REVIEW_VERTICAL_LAYOUT_AFTER = {
  shellHeaderPaddingTopPx: 8,
  shellHeaderPaddingBottomPx: 4,
  shellTitleToSubtitleGapPx: 8,
  shellSubtitleToControlLineGapPx: 0,
  controlLineHeightPx: 0,
  controlLineMarginBottomPx: 0,
  previewRootMarginTopPx: 8,
  documentFrameMarginTopPx: 8,
  documentFramePaddingTopPx: 12,
  documentFramePaddingBottomPx: 12,
  reviewScreenStackGapPx: 8,
  inPanelHeadlineHeightPx: 0,
  inPanelSubcopyMarginTopPx: 0,
  inPanelSubcopyHeightPx: 0,
  statusPanelHeightPx: 88,
  nextStepCalloutHeightPx: 72,
  documentCardPaddingTopPx: 32,
} as const;

export function estimatePaidProReviewChromeBeforeDocumentPx(): number {
  const b = PAID_PRO_REVIEW_VERTICAL_LAYOUT_BEFORE;
  return (
    b.shellHeaderPaddingTopPx +
    b.shellHeaderPaddingBottomPx +
    b.shellTitleToSubtitleGapPx +
    36 + // h1 line box
    24 + // subtitle
    b.shellSubtitleToControlLineGapPx +
    b.controlLineHeightPx +
    b.controlLineMarginBottomPx +
    b.previewRootMarginTopPx +
    b.documentFrameMarginTopPx +
    b.documentFramePaddingTopPx +
    b.reviewScreenStackGapPx +
    b.inPanelHeadlineHeightPx +
    b.inPanelSubcopyMarginTopPx +
    b.inPanelSubcopyHeightPx +
    b.statusPanelHeightPx +
    b.nextStepCalloutHeightPx
  );
}

export function estimatePaidProReviewChromeAfterDocumentPx(): number {
  const a = PAID_PRO_REVIEW_VERTICAL_LAYOUT_AFTER;
  return (
    a.shellHeaderPaddingTopPx +
    a.shellHeaderPaddingBottomPx +
    a.shellTitleToSubtitleGapPx +
    36 +
    24 +
    a.previewRootMarginTopPx +
    a.documentFrameMarginTopPx +
    a.documentFramePaddingTopPx +
    a.documentCardPaddingTopPx
  );
}

export const PAID_PRO_REVIEW_VERTICAL_SAVINGS_PX =
  estimatePaidProReviewChromeBeforeDocumentPx() - estimatePaidProReviewChromeAfterDocumentPx();
