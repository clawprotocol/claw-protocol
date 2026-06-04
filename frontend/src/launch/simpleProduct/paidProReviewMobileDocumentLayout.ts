/**
 * Paid Pro post-checkout review — mobile document paper layout (≤480px only).
 * Layout-only; does not touch corpus, authority, or signer metadata.
 */

export const PAID_PRO_REVIEW_MOBILE_BREAKPOINT_PX = 480;
export const PAID_PRO_REVIEW_MOBILE_VIEWPORT_PX = 376;

/** Documented inline padding before mobile pass (article clamp minimum). */
export const PAID_PRO_REVIEW_MOBILE_ARTICLE_PADDING_BEFORE_PX = 30;

/** Target article horizontal padding at ≤480px. */
export const PAID_PRO_REVIEW_MOBILE_ARTICLE_PADDING_AFTER_PX = 16;

export const PAID_PRO_REVIEW_MOBILE_DATA_ATTR = "data-paid-pro-review-paper";

export const PAID_PRO_REVIEW_MOBILE_PREVIEW_SELECTOR =
  '#claw-simple-create-preview[data-paid-pro-review-compact="true"]';

export type PaidProMobilePaperContainmentRects = {
  viewportWidth: number;
  paperLeft: number;
  paperRight: number;
  titleLeft: number;
  titleRight: number;
  signatureLeft: number;
  signatureRight: number;
};

export type PaidProMobilePaperContainmentAudit = {
  pass: boolean;
  issues: readonly string[];
};

/** True when paper, title, and signature blocks sit inside the viewport width (±1px). */
export function auditPaidProMobilePaperContainment(
  rects: PaidProMobilePaperContainmentRects,
): PaidProMobilePaperContainmentAudit {
  const issues: string[] = [];
  const vw = rects.viewportWidth;
  const within = (left: number, right: number, label: string) => {
    if (left < -1) issues.push(`${label} overflows left (${left}px)`);
    if (right > vw + 1) issues.push(`${label} overflows right (${right}px > ${vw}px)`);
  };
  within(rects.paperLeft, rects.paperRight, "paper");
  within(rects.titleLeft, rects.titleRight, "title");
  within(rects.signatureLeft, rects.signatureRight, "signature");
  return { pass: issues.length === 0, issues };
}

export function estimatePaidProMobileArticlePaddingSavingsPx(): number {
  return (PAID_PRO_REVIEW_MOBILE_ARTICLE_PADDING_BEFORE_PX - PAID_PRO_REVIEW_MOBILE_ARTICLE_PADDING_AFTER_PX) * 2;
}
