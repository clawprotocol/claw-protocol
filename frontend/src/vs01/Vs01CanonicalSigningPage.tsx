import { useLayoutEffect, useRef, type CSSProperties } from "react";
import type { Vs01SigningPacketPage } from "./buildVs01SigningPacketModel";
import {
  canonicalPageTypographyPx,
  countCanonicalPageTextMetrics,
  logVs01CanonicalPageRender,
  logVs01SignatureLineDomAnchor,
} from "./vs01CanonicalPageRender";
import type { Vs01NormTextRect } from "./vs01PageTextLayout";

export type Vs01CanonicalSigningPageProps = {
  page: Vs01SigningPacketPage;
  pageWidthPx: number;
  onTextPainted?: (pageIndex: number, renderedTextNodeCount: number) => void;
};

function pct(n: number): string {
  return `${n * 100}%`;
}

function blockStyle(
  block: Vs01NormTextRect,
  lineHeightPx: number,
  fontSizePx: number,
): CSSProperties {
  const isLabel = block.kind === "signature_label";
  return {
    left: pct(block.x),
    top: pct(block.y),
    width: pct(Math.max(block.width, 0.12)),
    minHeight: `${lineHeightPx}px`,
    fontSize: `${fontSizePx}px`,
    lineHeight: `${lineHeightPx}px`,
    fontWeight: block.kind === "heading" ? 700 : 400,
    borderBottom: isLabel && /_{3,}/.test(block.text) ? "1px solid #111827" : undefined,
  };
}

export function Vs01CanonicalSigningPage({
  page,
  pageWidthPx,
  onTextPainted,
}: Vs01CanonicalSigningPageProps) {
  const contentRef = useRef<HTMLDivElement>(null);
  const { lineHeightPx, fontSizePx } = canonicalPageTypographyPx(pageWidthPx);
  const { textBlockCount, charCount } = countCanonicalPageTextMetrics(page);

  useLayoutEffect(() => {
    const renderedTextNodeCount =
      contentRef.current?.querySelectorAll("[data-vs01-canonical-text]").length ?? 0;
    logVs01CanonicalPageRender({
      page: page.pageIndex,
      textBlockCount,
      charCount,
      signatureAnchorCount: page.signatureAnchorRects.length,
      initialsBandRect: page.initialsBandRect,
      renderedTextNodeCount,
    });
    onTextPainted?.(page.pageIndex, renderedTextNodeCount);

    for (const anchor of page.signatureAnchorRects) {
      const underline = contentRef.current?.querySelector<HTMLElement>(
        `[data-vs01-signature-underline="${page.pageIndex}-${anchor.partyIndex}"]`,
      );
      const fieldHost = contentRef.current?.closest(".vs01-sign-page-surface");
      const fieldEl = fieldHost?.querySelector<HTMLElement>(
        `[data-vs01-signature-field-party="${anchor.partyIndex}"]`,
      );
      if (!underline) continue;
      const lineRect = underline.getBoundingClientRect();
      const fieldRect = fieldEl?.getBoundingClientRect();
      const intersects = Boolean(
        fieldRect &&
          lineRect.left < fieldRect.right &&
          lineRect.right > fieldRect.left &&
          lineRect.top < fieldRect.bottom &&
          lineRect.bottom > fieldRect.top,
      );
      logVs01SignatureLineDomAnchor({
        page: page.pageIndex,
        signer: anchor.partyIndex,
        lineRect: lineRect.width > 0 ? { x: lineRect.x, y: lineRect.y, w: lineRect.width, h: lineRect.height } : null,
        fieldRect: fieldRect
          ? { x: fieldRect.x, y: fieldRect.y, w: fieldRect.width, h: fieldRect.height }
          : null,
        intersects,
        deltaY: fieldRect ? fieldRect.top - lineRect.top : null,
      });
    }
  }, [page, pageWidthPx, textBlockCount, charCount, onTextPainted]);

  return (
    <div
      ref={contentRef}
      className="vs01-canonical-page-content"
      aria-label={`Canonical signing page ${page.pageIndex + 1}`}
      style={{ fontSize: `${fontSizePx}px`, lineHeight: `${lineHeightPx}px` }}
    >
      {page.textBlocks.map((block, i) => (
        <div
          key={`${page.pageIndex}-${i}-${block.text.slice(0, 16)}`}
          data-vs01-canonical-text
          className={`vs01-canonical-text-block vs01-canonical-text-block--${block.kind}`}
          style={blockStyle(block, lineHeightPx, fontSizePx)}
        >
          {block.text}
        </div>
      ))}
      {page.signatureAnchorRects.map((anchor) => (
        <div
          key={`sig-line-${page.pageIndex}-${anchor.partyIndex}`}
          data-vs01-signature-underline={`${page.pageIndex}-${anchor.partyIndex}`}
          className="vs01-canonical-signature-underline"
          aria-hidden
          style={{
            left: pct(anchor.x),
            top: pct(anchor.y + anchor.height * 0.72),
            width: pct(Math.max(anchor.width, 0.2)),
          }}
        />
      ))}
      <div
        className="vs01-canonical-initials-band"
        aria-hidden
        style={{
          left: pct(page.initialsBandRect.x),
          top: pct(page.initialsBandRect.y),
          width: pct(page.initialsBandRect.width),
          height: pct(page.initialsBandRect.height),
        }}
      />
    </div>
  );
}
