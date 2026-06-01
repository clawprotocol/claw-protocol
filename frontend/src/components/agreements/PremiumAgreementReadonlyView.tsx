import { useId, useLayoutEffect } from "react";
import type { ParsedDraftShape } from "./intakeSmartDefaults";
import {
  emitVisibleProPaperBoundaryDiagnostics,
  type ProVisiblePaperCandidate,
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
`;

type Props = {
  html: string;
  /** Shown when html is empty */
  emptyFallback?: string;
  /** When true, never show empty placeholder (guided completion keeps last-known-good visible). */
  suppressEmptyFallback?: boolean;
  /** Canonical paid review renders in normal document flow, not a nested scroll viewport. */
  fullDocumentFlow?: boolean;
  /** Extra padding below document body when a bottom sticky CTA is visible (px). */
  bottomScrollInsetPx?: number;
  /** Paid Pro final DOM boundary diagnostics (dev-only logs). */
  visibleProPaperTrace?: {
    declaredSource: string;
    candidates: readonly ProVisiblePaperCandidate[];
    intakeText?: string | null;
    draft?: ParsedDraftShape | null;
    paidProReviewSurface?: boolean;
    isAuthoritative?: boolean;
    isFreeBodyMatch?: boolean;
  };
};

export function PremiumAgreementReadonlyView({
  html,
  emptyFallback,
  suppressEmptyFallback = false,
  fullDocumentFlow = false,
  bottomScrollInsetPx = 0,
  visibleProPaperTrace,
}: Props) {
  const sid = useId().replace(/:/g, "");
  const safe = html.trim();

  useLayoutEffect(() => {
    if (!visibleProPaperTrace || !safe) return;
    emitVisibleProPaperBoundaryDiagnostics({
      html: safe,
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
    visibleProPaperTrace?.declaredSource,
    visibleProPaperTrace?.candidates,
    visibleProPaperTrace?.intakeText,
    visibleProPaperTrace?.paidProReviewSurface,
    visibleProPaperTrace?.isAuthoritative,
    visibleProPaperTrace?.isFreeBodyMatch,
  ]);
  return (
    <>
      <style id={`premium-doc-styles-${sid}`}>{DOC_STYLES}</style>
      <div
        role="article"
        aria-label="Agreement document preview"
        data-testid="premium-agreement-readonly-article"
        className={`premium-readonly-doc px-[clamp(1.85rem,6.5vw,3.5rem)] pt-11 text-left [font-feature-settings:'kern'_1,'liga'_1,'onum'_1] ${
          fullDocumentFlow
            ? "min-h-0 overflow-visible pb-16"
            : `max-h-[min(78vh,54rem)] min-h-[min(68vh,44rem)] overflow-y-auto${bottomScrollInsetPx > 0 ? "" : " pb-16"}`
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
