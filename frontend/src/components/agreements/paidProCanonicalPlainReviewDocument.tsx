/**
 * Canonical paid Pro plain-text review — styled legal document block (paragraph breaks preserved).
 */

import { useId } from "react";
import { PREMIUM_READONLY_DOC_STYLES } from "./PremiumAgreementReadonlyView";
import { splitCanonicalPlainIntoBlocks } from "./paidProFirstReviewRenderGuard";

const SECTION_HEADING_RE = /^(?:\d+\.\s+)?[A-Z][A-Z0-9\s/&,\-]{3,}$/;

type Props = {
  plain: string;
  tailPaddingClass: string;
  compactTopPadding: boolean;
  authoritativeSource: string;
};

export function PaidProCanonicalPlainReviewDocument({
  plain,
  tailPaddingClass,
  compactTopPadding,
  authoritativeSource,
}: Props) {
  const sid = useId().replace(/:/g, "");
  const blocks = splitCanonicalPlainIntoBlocks(plain);

  return (
    <>
      <style id={`paid-pro-canonical-plain-styles-${sid}`}>{PREMIUM_READONLY_DOC_STYLES}</style>
    <article
      aria-label="Agreement document preview"
      className={`premium-readonly-doc box-border max-w-full min-w-0 overflow-x-hidden ${tailPaddingClass} text-left max-[480px]:px-4 sm:px-[clamp(1.25rem,4vw,3.5rem)] ${
        compactTopPadding ? "pt-4 sm:pt-5" : "pt-11"
      } min-h-0 overflow-visible`}
      data-testid="premium-agreement-readonly-article"
      data-paid-pro-review-paper={compactTopPadding ? "true" : undefined}
      data-paid-pro-authoritative-source={authoritativeSource}
    >
      <div className="premium-doc-body" data-testid="simple-pro-final-review-paid-sot-body">
        {blocks.map((block, index) => {
          const lines = block.split("\n").map((line) => line.trim()).filter(Boolean);
          const firstLine = lines[0] ?? "";
          const isDocumentTitle =
            index === 0 &&
            firstLine.length >= 8 &&
            firstLine.length <= 160 &&
            (firstLine === firstLine.toUpperCase() || /^[A-Z][^.!?]{12,}$/.test(firstLine));
          if (isDocumentTitle && lines.length === 1) {
            return (
              <h1 key={`block-${index}`} className="text-center uppercase tracking-[0.04em]">
                {firstLine}
              </h1>
            );
          }
          if (lines.length === 1 && SECTION_HEADING_RE.test(firstLine)) {
            return <h2 key={`block-${index}`}>{firstLine}</h2>;
          }
          if (/^Section\s+\d+\./i.test(firstLine) && lines.length === 1) {
            return <h2 key={`block-${index}`}>{firstLine}</h2>;
          }
          return (
            <p key={`block-${index}`} className="whitespace-pre-wrap">
              {block.trim()}
            </p>
          );
        })}
      </div>
    </article>
    </>
  );
}
