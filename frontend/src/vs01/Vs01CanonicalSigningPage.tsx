import { useLayoutEffect, useMemo, useRef, type ReactNode } from "react";
import type { Vs01SigningPacketPage } from "./buildVs01SigningPacketModel";
import { canonicalPageTypographyPx } from "./vs01CanonicalPageRender";
import {
  buildFlowLineDescriptors,
  flowLinesForPage,
  logVs01CanonicalTextLayout,
  logVs01CanonicalTextLayoutFail,
  measureCanonicalFlowTextLayout,
  resolveCanonicalTextLayoutMode,
  logVs01SignatureAnchorDomMeasured,
  type Vs01MeasuredSignatureLine,
} from "./vs01CanonicalTextLayout";

export type Vs01CanonicalPageLayoutResult = {
  pageIndex: number;
  renderedLineCount: number;
  overlappingTextRects: number;
  textEntersInitialsBand: boolean;
  signatureLines: Vs01MeasuredSignatureLine[];
};

export type Vs01CanonicalSigningPageProps = {
  page: Vs01SigningPacketPage;
  pageWidthPx: number;
  onTextPainted?: (pageIndex: number, renderedTextNodeCount: number) => void;
  onLayoutMeasured?: (result: Vs01CanonicalPageLayoutResult) => void;
};

function pct(n: number): string {
  return `${n * 100}%`;
}

function renderSignatureLineContent(line: string): ReactNode {
  const m = line.match(/^((?:By|Signature)\s*:\s*)(_+)?(.*)$/i);
  if (!m) return line;
  const [, prefix, underscores] = m;
  return (
    <>
      <span>{prefix}</span>
      <span className="vs01-canonical-signature-underline">{underscores ?? "______________________"}</span>
    </>
  );
}

export function Vs01CanonicalSigningPage({
  page,
  pageWidthPx,
  onTextPainted,
  onLayoutMeasured,
}: Vs01CanonicalSigningPageProps) {
  const contentRef = useRef<HTMLDivElement>(null);
  const { lineHeightPx, fontSizePx } = canonicalPageTypographyPx(pageWidthPx);
  const flowLines = useMemo(() => flowLinesForPage(page), [page]);
  const lineDescriptors = useMemo(() => buildFlowLineDescriptors(flowLines), [flowLines]);
  const layoutMode = useMemo(() => resolveCanonicalTextLayoutMode(page), [page]);

  useLayoutEffect(() => {
    const surface = contentRef.current?.closest(".vs01-sign-page-surface") as HTMLElement | null;
    const flowRoot = contentRef.current?.querySelector<HTMLElement>(".vs01-canonical-flow-body");
    if (!surface || !flowRoot) return;

    const { report, signatureLines, firstBadRects } = measureCanonicalFlowTextLayout({
      flowRoot,
      surface,
      page,
      mode: layoutMode,
    });
    logVs01CanonicalTextLayout(report);
    if (report.overlappingTextRects > 0 || report.textEntersInitialsBand) {
      logVs01CanonicalTextLayoutFail({
        page: report.page,
        reason: report.textEntersInitialsBand ? "text_in_initials_band" : "overlapping_text_rects",
        overlappingTextRects: report.overlappingTextRects,
        firstBadRects: firstBadRects.slice(0, 2),
      });
    }

    onTextPainted?.(page.pageIndex, report.renderedLineCount);
    onLayoutMeasured?.({
      pageIndex: page.pageIndex,
      renderedLineCount: report.renderedLineCount,
      overlappingTextRects: report.overlappingTextRects,
      textEntersInitialsBand: report.textEntersInitialsBand,
      signatureLines,
    });

    const fieldHost = surface.querySelector<HTMLElement>(".vs01-sign-page-placement-host");
    for (const measured of signatureLines) {
      const fieldEl = fieldHost?.querySelector<HTMLElement>(
        `[data-vs01-signature-field-party="${measured.partyIndex}"]`,
      );
      const lineRect = measured.lineRect;
      const fieldRect = fieldEl?.getBoundingClientRect();
      const intersects = Boolean(
        fieldRect &&
          lineRect.left < fieldRect.right &&
          lineRect.right > fieldRect.left &&
          lineRect.top < fieldRect.bottom &&
          lineRect.bottom > fieldRect.top,
      );
      logVs01SignatureAnchorDomMeasured({
        page: page.pageIndex,
        signer: measured.partyIndex,
        lineRect: { x: lineRect.x, y: lineRect.y, w: lineRect.width, h: lineRect.height },
        fieldRect: fieldRect
          ? { x: fieldRect.x, y: fieldRect.y, w: fieldRect.width, h: fieldRect.height }
          : null,
        intersects,
        deltaY: fieldRect ? fieldRect.top - lineRect.top : null,
      });
    }
  }, [page, pageWidthPx, layoutMode, lineDescriptors, onTextPainted, onLayoutMeasured]);

  const { contentRect, initialsBandRect } = page;

  return (
    <div
      ref={contentRef}
      className="vs01-canonical-page-content"
      aria-label={`Canonical signing page ${page.pageIndex + 1}`}
      data-vs01-canonical-layout-mode={layoutMode}
    >
      <div
        className="vs01-canonical-flow-body"
        style={{
          left: pct(contentRect.x),
          top: pct(contentRect.y),
          width: pct(contentRect.width),
          height: pct(contentRect.height),
          fontSize: `${fontSizePx}px`,
          lineHeight: `${lineHeightPx}px`,
        }}
      >
        {lineDescriptors.map((line, i) => {
          if (!line.trimmed) {
            return <div key={`sp-${page.pageIndex}-${i}`} className="vs01-canonical-flow-spacer" aria-hidden />;
          }
          if (line.isSignatureExecutionLine) {
            return (
              <div
                key={`sig-${page.pageIndex}-${i}`}
                data-vs01-canonical-text
                data-vs01-signature-execution-line
                data-vs01-signature-party={String(line.partyIndex ?? 0)}
                className="vs01-canonical-flow-line vs01-canonical-flow-line--signature"
              >
                {renderSignatureLineContent(line.trimmed)}
              </div>
            );
          }
          return (
            <div
              key={`line-${page.pageIndex}-${i}`}
              data-vs01-canonical-text
              className={`vs01-canonical-flow-line vs01-canonical-flow-line--${line.kind}`}
            >
              {line.text}
            </div>
          );
        })}
      </div>
      <div
        className="vs01-canonical-initials-band"
        aria-hidden
        style={{
          left: pct(initialsBandRect.x),
          top: pct(initialsBandRect.y),
          width: pct(initialsBandRect.width),
          height: pct(initialsBandRect.height),
        }}
      />
    </div>
  );
}
