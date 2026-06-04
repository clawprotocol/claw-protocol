/**
 * Minimal DOM scaffold mirroring Paid Pro review vertical stack for layout measurement tests.
 */

import { PremiumAgreementReadonlyView } from "../../components/agreements/PremiumAgreementReadonlyView";
import {
  PAID_PRO_REVIEW_VERTICAL_LAYOUT_AFTER,
  PAID_PRO_REVIEW_VERTICAL_LAYOUT_BEFORE,
} from "./paidProReviewVerticalLayout";

export type PaidProReviewLayoutFixtureMode = "before" | "after";

export function PaidProReviewVerticalLayoutFixture({
  mode,
}: {
  mode: PaidProReviewLayoutFixtureMode;
}) {
  const compact = mode === "after";
  const layout = compact ? PAID_PRO_REVIEW_VERTICAL_LAYOUT_AFTER : PAID_PRO_REVIEW_VERTICAL_LAYOUT_BEFORE;

  return (
    <div data-testid="paid-pro-review-layout-fixture">
      <header
        data-testid="paid-pro-review-shell-header"
        className={
          compact
            ? "vs01-header pb-1 pt-2"
            : "vs01-header pb-2 pt-4"
        }
      >
        <h1 className="vs01-header-title text-xl sm:text-3xl">Review your Pro agreement</h1>
        <p
          data-testid="paid-pro-review-shell-subtitle"
          className={
            compact
              ? "vs01-header-subtitle mt-2 text-base sm:mt-1.5"
              : "vs01-header-subtitle mt-3 text-base sm:mt-2"
          }
        >
          Nothing is sent or signed until you choose the next step.
        </p>
      </header>
      {!compact ? (
        <p
          data-testid="paid-pro-review-shell-control-line"
          className="mb-4 text-center text-xs sm:mb-5 sm:text-left sm:text-sm"
        >
          Nothing is sent or signed until you choose the next step.
        </p>
      ) : null}
      <div
        data-testid="paid-pro-review-preview-root"
        className={compact ? "mt-2 block min-w-0" : "mt-4 block min-w-0"}
      >
        <div
          data-testid="paid-pro-review-document-frame"
          className={
            compact
              ? "mt-2 rounded-2xl border px-1 py-3 sm:mt-2.5 sm:py-4"
              : "mt-4 rounded-2xl border px-1 py-6 sm:mt-5 sm:py-8"
          }
        >
          <div
            data-testid="simple-pro-final-review-screen"
            className={compact ? "flex flex-col gap-2" : "flex flex-col gap-3"}
          >
            {!compact ? (
              <div data-testid="paid-pro-review-in-panel-chrome">
                <h2 className="text-lg font-semibold">PRO AGREEMENT</h2>
                <p className="mt-2 text-xs">This is the final agreement version prepared for review and signing.</p>
              </div>
            ) : null}
            {!compact ? (
              <>
                <section data-testid="paid-pro-review-status-panel" className="h-[88px] rounded border" />
                <section data-testid="paid-pro-review-next-step-callout" className="h-[72px] rounded border" />
              </>
            ) : null}
            <div
              data-testid="simple-pro-final-review-document"
              className="rounded-sm border bg-white shadow-sm"
            >
              <PremiumAgreementReadonlyView
                html="<p>Agreement body paragraph for layout measurement.</p>"
                fullDocumentFlow
                compactDocumentTopPadding={compact}
              />
            </div>
            {compact ? (
              <>
                <section data-testid="paid-pro-review-status-panel" className="h-[88px] rounded border" />
                <section data-testid="paid-pro-review-next-step-callout" className="h-[72px] rounded border" />
              </>
            ) : null}
          </div>
        </div>
      </div>
      <span data-layout-expected-document-top-px={layout.documentCardPaddingTopPx} className="sr-only" />
    </div>
  );
}
