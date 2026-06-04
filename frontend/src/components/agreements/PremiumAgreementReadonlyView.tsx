import { useId, useLayoutEffect } from "react";
import {
  emitVisibleProPaperBoundaryDiagnostics,
  type VisibleProPaperDiagnosticsTrace,
} from "./visibleProPaperRenderBoundary";

const DOC_STYLES = `
.premium-readonly-doc{font-family:ui-serif,Georgia,Cambria,"Times New Roman",Times,serif;color:#1c1917;-webkit-font-smoothing:antialiased;text-rendering:optimizeLegibility}
.premium-readonly-doc .premium-doc-body{max-width:38.5rem;margin:0 auto;padding:0 0.125rem 0.5rem}
.premium-readonly-doc h1{font-size:clamp(1.45rem,2.6vw,1.85rem);font-weight:700;letter-spacing:0.04em;color:#0c0a09;margin:0.35rem 0 1.85rem;line-height:1.2;text-align:center;text-transform:uppercase}
.premium-readonly-doc h1 + p{margin-top:0;margin-bottom:1.45rem}
.premium-readonly-doc h2{font-size:0.72rem;font-weight:700;letter-spacing:0.14em;text-transform:uppercase;color:#292524;margin:2.65rem 0 0.85rem;line-height:1.45;padding-bottom:0.2rem;border-bottom:1px solid rgba(28,25,23,0.12)}
.premium-readonly-doc h1 + h2{margin-top:1.5rem}
.premium-readonly-doc p{font-size:15px;line-height:1.75;margin:0 0 1.2rem;color:#292524;text-align:left;word-spacing:normal}
@media (min-width:640px){.premium-readonly-doc p{line-height:1.92}}
.premium-readonly-doc p:last-child{margin-bottom:0}
.premium-readonly-doc h2 + p{margin-top:0}
.premium-readonly-doc p + h2{margin-top:0.25rem}
.premium-readonly-doc .premium-doc-callout{font-size:11px;line-height:1.5;color:#57534d;font-style:italic;margin:0.4rem 0 1.15rem;padding:0.55rem 0.65rem 0.55rem 0.75rem;border-left:3px solid rgba(180,83,9,0.38);background:rgba(254,243,199,0.42);border-radius:0 5px 5px 0;max-width:36rem}
.premium-readonly-doc .premium-doc-callout-inline{display:block;margin-top:0.55rem;font-size:11px;line-height:1.45;font-style:italic;color:#57534d;padding:0.45rem 0 0.1rem 0.65rem;border-left:3px solid rgba(180,83,9,0.38);background:rgba(254,243,199,0.35);border-radius:0 4px 4px 0;max-width:36rem}
.premium-readonly-doc p.premium-doc-signature-party-start{margin-top:2.35rem;padding-top:1.4rem;border-top:1px solid rgba(28,25,23,0.1);font-weight:600;color:#0c0a09;letter-spacing:0.03em}
.premium-readonly-doc p.premium-doc-signature-party-start:first-of-type{margin-top:1.65rem}
.premium-readonly-doc p.premium-doc-signature-entity-name{margin:0.1rem 0 0.75rem;font-weight:600;color:#0c0a09;line-height:1.5;max-width:26rem}
.premium-readonly-doc p.premium-doc-signature-field{margin:0 0 0.5rem;max-width:26rem;line-height:1.65;font-weight:400;color:#292524}
.premium-readonly-doc p.premium-doc-signature-field + p.premium-doc-signature-party-start{margin-top:2.5rem}
.premium-readonly-doc p.premium-doc-notice-group-label{margin:0.55rem 0 0.15rem;max-width:26rem;font-size:10px;font-weight:600;letter-spacing:0.14em;text-transform:uppercase;color:#78716c}
.premium-readonly-doc p.premium-doc-signature-notice{margin-bottom:0.2rem;max-width:26rem;padding-left:0.125rem;font-weight:400;color:#292524;line-height:1.55}
.premium-readonly-doc p.premium-doc-signature-notice + p.premium-doc-signature-notice{margin-top:0.08rem}
@media (max-width:480px){
.premium-readonly-doc[data-paid-pro-review-paper="true"]{box-sizing:border-box;max-width:100%;min-width:0;overflow-x:hidden}
.premium-readonly-doc[data-paid-pro-review-paper="true"] .premium-doc-body{max-width:100%;width:100%;min-width:0;box-sizing:border-box}
.premium-readonly-doc[data-paid-pro-review-paper="true"] h1{font-size:clamp(1.05rem,4.8vw,1.35rem);letter-spacing:0.03em;overflow-wrap:anywhere;word-break:break-word;hyphens:auto;margin-left:0;margin-right:0}
.premium-readonly-doc[data-paid-pro-review-paper="true"] p,.premium-readonly-doc[data-paid-pro-review-paper="true"] h2{overflow-wrap:break-word;word-break:break-word}
.premium-readonly-doc[data-paid-pro-review-paper="true"] p.premium-doc-signature-party-start,
.premium-readonly-doc[data-paid-pro-review-paper="true"] p.premium-doc-signature-entity-name,
.premium-readonly-doc[data-paid-pro-review-paper="true"] p.premium-doc-signature-field,
.premium-readonly-doc[data-paid-pro-review-paper="true"] p.premium-doc-signature-notice,
.premium-readonly-doc[data-paid-pro-review-paper="true"] p.premium-doc-notice-group-label{max-width:100%;width:100%;box-sizing:border-box}
.premium-readonly-doc[data-paid-pro-review-paper="true"] [style*="display:grid"]{max-width:100%!important;width:100%!important;box-sizing:border-box}
.premium-readonly-doc[data-paid-pro-review-paper="true"] [style*="grid-template-columns:minmax(0,1fr) 100px"]{grid-template-columns:minmax(0,1fr)!important}
}
`;

type Props = {
  html: string;
  /** Shown when html is empty */
  emptyFallback?: string;
  /** When true, never show empty placeholder (guided completion keeps last-known-good visible). */
  suppressEmptyFallback?: boolean;
  /** Canonical paid review renders in normal document flow, not a nested scroll viewport. */
  fullDocumentFlow?: boolean;
  /** Tighter top inset when the shell already shows title + trust line (post-checkout review). */
  compactDocumentTopPadding?: boolean;
  /** Extra padding below document body when a bottom sticky CTA is visible (px). */
  bottomScrollInsetPx?: number;
  /** Paid Pro final DOM boundary diagnostics (dev-only logs). */
  visibleProPaperTrace?: VisibleProPaperDiagnosticsTrace;
};

export function PremiumAgreementReadonlyView({
  html,
  emptyFallback,
  suppressEmptyFallback = false,
  fullDocumentFlow = false,
  compactDocumentTopPadding = false,
  bottomScrollInsetPx = 0,
  visibleProPaperTrace,
}: Props) {
  const sid = useId().replace(/:/g, "");
  const safe = html.trim();

  useLayoutEffect(() => {
    if (!visibleProPaperTrace || !safe) return;
    emitVisibleProPaperBoundaryDiagnostics({
      html: safe,
      renderPlain: visibleProPaperTrace.renderPlain,
      declaredSource: visibleProPaperTrace.declaredSource,
      candidates: visibleProPaperTrace.candidates,
      intakeText: visibleProPaperTrace.intakeText,
      draft: visibleProPaperTrace.draft,
      paidProReviewSurface: visibleProPaperTrace.paidProReviewSurface,
      isAuthoritative: visibleProPaperTrace.isAuthoritative,
      isFreeBodyMatch: visibleProPaperTrace.isFreeBodyMatch,
    });
  }, [
    safe,
    visibleProPaperTrace?.renderPlain,
    visibleProPaperTrace?.declaredSource,
    visibleProPaperTrace?.candidates,
    visibleProPaperTrace?.intakeText,
    visibleProPaperTrace?.paidProReviewSurface,
    visibleProPaperTrace?.isAuthoritative,
    visibleProPaperTrace?.isFreeBodyMatch,
  ]);
  const paperPaddingClass = compactDocumentTopPadding
    ? "box-border max-w-full min-w-0 overflow-x-hidden max-[480px]:px-4 sm:px-[clamp(1.25rem,4vw,3.5rem)]"
    : "px-[clamp(1.85rem,6.5vw,3.5rem)]";

  return (
    <>
      <style id={`premium-doc-styles-${sid}`}>{DOC_STYLES}</style>
      <div
        role="article"
        aria-label="Agreement document preview"
        data-testid="premium-agreement-readonly-article"
        data-paid-pro-review-paper={compactDocumentTopPadding ? "true" : undefined}
        className={`premium-readonly-doc text-left [font-feature-settings:'kern'_1,'liga'_1,'onum'_1] ${paperPaddingClass} ${
          fullDocumentFlow
            ? compactDocumentTopPadding
              ? "min-h-0 overflow-visible pb-12 pt-8"
              : "min-h-0 overflow-visible pb-16 pt-11"
            : `max-h-[min(78vh,54rem)] min-h-[min(68vh,44rem)] overflow-y-auto pt-11${bottomScrollInsetPx > 0 ? "" : " pb-16"}`
        }`}
        style={
          !fullDocumentFlow && bottomScrollInsetPx > 0
            ? { paddingBottom: `${bottomScrollInsetPx}px` }
            : undefined
        }
      >
        {safe ? (
          <div className="premium-doc-body" dangerouslySetInnerHTML={{ __html: safe }} />
        ) : suppressEmptyFallback ? (
          <div className="premium-doc-body min-h-[12rem]" aria-hidden />
        ) : (
          <p className="text-sm text-stone-500">{emptyFallback ?? "No document text yet."}</p>
        )}
      </div>
    </>
  );
}
