import { useLayoutEffect, useMemo, useRef, type CSSProperties, type ReactNode } from "react";
import type { Vs01SigningPacketPage } from "./buildVs01SigningPacketModel";
import { canonicalFlowStackBottomNorm } from "./buildVs01SigningPacketModel";
import { canonicalPageTypographyPx } from "./vs01CanonicalPageRender";
import {
  logVs01CanonicalFlowBodyDomDiagnostics,
  measureCanonicalFlowBodyDom,
} from "./vs01CanonicalFlowBodyDomMeasure";
import {
  buildFlowLineDescriptors,
  flowLinesForPage,
} from "./vs01CanonicalTextLayout";
import {
  VS01_EXECUTION_LABEL_LINE_HEIGHT_FRAC,
  VS01_EXECUTION_LABEL_MARGIN_TOP_EM,
  VS01_EXECUTION_LABEL_ROW_MARGIN_TOP_EM,
  VS01_EXECUTION_NAME_ROW_MARGIN_TOP_EM,
  VS01_EXECUTION_SIGNATURE_MARGIN_BOTTOM_EM,
  VS01_EXECUTION_SPACER_FRAC,
  VS01_SIGNATURE_INK_BASELINE_BIAS_PX,
  VS01_SIGNATURE_SIGNED_INK_BIAS_PX,
  VS01_SIGNATURE_SIGNED_INK_FONT_PX,
  VS01_SIGNATURE_SIGNED_INK_FONT_WEIGHT,
} from "./vs01VisualConstants";

export type Vs01CanonicalSigningPageProps = {
  page: Vs01SigningPacketPage;
  pageWidthPx?: number;
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
      <span>{prefix.replace(/^Signature/i, "By")}</span>
      <span className="vs01-canonical-signature-underline">{underscores ?? "______________________"}</span>
    </>
  );
}

export function Vs01CanonicalSigningPage({
  page,
  pageWidthPx,
}: Vs01CanonicalSigningPageProps) {
  const { contentRect, initialsBandRect } = page;
  const flowBodyRef = useRef<HTMLDivElement>(null);
  const { lineHeightPx, fontSizePx } = canonicalPageTypographyPx(pageWidthPx);
  const flowLines = useMemo(() => flowLinesForPage(page), [page]);
  const lineDescriptors = useMemo(
    () => buildFlowLineDescriptors(flowLines, { pageIndex: page.pageIndex }),
    [flowLines, page.pageIndex],
  );
  const flowBodyStyle: CSSProperties = {
    left: pct(contentRect.x),
    top: pct(contentRect.y),
    width: pct(contentRect.width),
    height: pct(contentRect.height),
    fontSize: `${fontSizePx}px`,
    lineHeight: `${lineHeightPx}px`,
    "--vs01-canonical-line-height": `${lineHeightPx}px`,
    "--vs01-execution-label-line-height-frac": String(VS01_EXECUTION_LABEL_LINE_HEIGHT_FRAC),
    "--vs01-execution-label-margin-top-em": String(VS01_EXECUTION_LABEL_MARGIN_TOP_EM),
    "--vs01-execution-label-row-margin-top-em": String(VS01_EXECUTION_LABEL_ROW_MARGIN_TOP_EM),
    "--vs01-execution-name-row-margin-top-em": String(VS01_EXECUTION_NAME_ROW_MARGIN_TOP_EM),
    "--vs01-execution-signature-margin-bottom-em": String(VS01_EXECUTION_SIGNATURE_MARGIN_BOTTOM_EM),
    "--vs01-execution-spacer-frac": String(VS01_EXECUTION_SPACER_FRAC),
    "--vs01-signature-ink-bias": `${VS01_SIGNATURE_INK_BASELINE_BIAS_PX}px`,
    "--vs01-signature-signed-ink-bias": `${VS01_SIGNATURE_SIGNED_INK_BIAS_PX}px`,
    "--vs01-signature-signed-ink-font": `${VS01_SIGNATURE_SIGNED_INK_FONT_PX}px`,
    "--vs01-signature-signed-ink-weight": String(VS01_SIGNATURE_SIGNED_INK_FONT_WEIGHT),
  } as CSSProperties;

  useLayoutEffect(() => {
    const flowBody = flowBodyRef.current;
    if (!flowBody) return;
    const metrics = measureCanonicalFlowBodyDom(flowBody, page, pageWidthPx);
    logVs01CanonicalFlowBodyDomDiagnostics(
      page.pageIndex,
      metrics,
      canonicalFlowStackBottomNorm(page),
    );
  }, [page, pageWidthPx]);

  return (
    <div
      className="vs01-canonical-page-content"
      aria-label={`Canonical signing page ${page.pageIndex + 1}`}
      data-vs01-canonical-layout-mode="flow"
    >
      <div
        ref={flowBodyRef}
        className="vs01-canonical-flow-body"
        style={flowBodyStyle}
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
      {initialsBandRect.height > 0.0001 ? (
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
      ) : null}
    </div>
  );
}
