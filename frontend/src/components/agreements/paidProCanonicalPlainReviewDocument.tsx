/**
 * Canonical paid Pro plain-text review — styled legal document block (paragraph breaks preserved).
 */

import { useEffect, useId } from "react";
import { PREMIUM_READONLY_DOC_STYLES } from "./PremiumAgreementReadonlyView";
import {
  classifyPaidProDocumentBlocks,
  detectPaidProPlainParagraphHeadingLeaks,
  isMainSectionHeadingLine,
} from "./paidProDocumentBlockClassifier";
import { logTest314HeadingInvariant } from "./paidProFirstReviewDisplayAuthority";
import { hashPaidProCorpus } from "./paidProSourceOfTruth";

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
  const blocks = classifyPaidProDocumentBlocks(plain);

  useEffect(() => {
    if (typeof import.meta === "undefined" || !import.meta.env?.DEV) return;
    const leaks = detectPaidProPlainParagraphHeadingLeaks(plain);
    const sectionOneEl = blocks.find(
      (b) => /^1\.\s+/.test(b.firstLine.trim()) && isMainSectionHeadingLine(b.firstLine.trim()),
    );
    logTest314HeadingInvariant({
      source: authoritativeSource,
      renderer: "react",
      plain,
      sectionOneClass:
        sectionOneEl?.kind === "main_section_heading" || sectionOneEl?.kind === "legacy_section_heading"
          ? "premium-doc-section-heading"
          : sectionOneEl?.kind ?? null,
    });
    if (leaks.plainParagraphHeadingLeakCount <= 0) return;
    // eslint-disable-next-line no-console
    console.warn("[test313-heading-render-leak]", {
      source: authoritativeSource,
      plainParagraphHeadingLeakCount: leaks.plainParagraphHeadingLeakCount,
      leakedLines: leaks.leakedLines.slice(0, 8),
    });
  }, [plain, authoritativeSource, blocks]);

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
      data-claw-review-corpus-len={plain.trim().length > 0 ? String(plain.trim().length) : undefined}
      data-claw-review-corpus-hash={
        plain.trim().length > 0 ? hashPaidProCorpus(plain.trim()) : undefined
      }
    >
      <div className="premium-doc-body" data-testid="simple-pro-final-review-paid-sot-body">
        {blocks.map(({ block, blockIndex, kind, firstLine }) => {
          if (kind === "document_title") {
            return (
              <h1 key={`block-${blockIndex}`} className="text-center uppercase tracking-[0.04em]">
                {firstLine}
              </h1>
            );
          }
          if (kind === "main_section_heading" || kind === "legacy_section_heading") {
            const remainder = block.trim().slice(firstLine.length).trim();
            return (
              <div key={`block-${blockIndex}`}>
                <h2 className="premium-doc-section-heading">{firstLine}</h2>
                {remainder ? <p className="whitespace-pre-wrap">{remainder}</p> : null}
              </div>
            );
          }
          return (
            <p key={`block-${blockIndex}`} className="whitespace-pre-wrap">
              {block.trim()}
            </p>
          );
        })}
      </div>
    </article>
    </>
  );
}
