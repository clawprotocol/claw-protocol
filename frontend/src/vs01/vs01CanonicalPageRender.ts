import type { Vs01SigningPacketPage } from "./buildVs01SigningPacketModel";
import { canonicalPageTypography } from "./vs01CanonicalPageLayoutContract";

export type Vs01CanonicalPageRenderMetrics = {
  page: number;
  textBlockCount: number;
  charCount: number;
  signatureAnchorCount: number;
  initialsBandRect: Vs01SigningPacketPage["initialsBandRect"];
  renderedTextNodeCount: number;
};

export function canonicalPageTypographyPx(pageWidthPx?: number): {
  pageHeightPx: number;
  lineHeightPx: number;
  fontSizePx: number;
} {
  const typography = canonicalPageTypography(pageWidthPx);
  return {
    pageHeightPx: typography.pageHeightPx,
    lineHeightPx: typography.lineHeightPx,
    fontSizePx: typography.fontSizePx,
  };
}

export function countCanonicalPageTextMetrics(page: Vs01SigningPacketPage): {
  textBlockCount: number;
  charCount: number;
} {
  const blocks = page.textBlocks.filter((b) => b.text.trim().length > 0);
  return {
    textBlockCount: blocks.length,
    charCount: blocks.reduce((sum, b) => sum + b.text.length, 0),
  };
}

export function logVs01CanonicalPageRender(metrics: Vs01CanonicalPageRenderMetrics): void {
  if (typeof import.meta !== "undefined" && import.meta.env?.MODE === "test") return;
  // eslint-disable-next-line no-console
  console.info("[vs01-canonical-page-render]", metrics);
  if (metrics.textBlockCount > 0 && metrics.renderedTextNodeCount === 0) {
    // eslint-disable-next-line no-console
    console.warn("[vs01-canonical-page-render-fail]", {
      page: metrics.page,
      reason: "text_blocks_not_painted",
      textBlockCount: metrics.textBlockCount,
      charCount: metrics.charCount,
    });
  }
}

export function logVs01SignatureLineDomAnchor(payload: Record<string, unknown>): void {
  if (typeof import.meta !== "undefined" && import.meta.env?.MODE === "test") return;
  // eslint-disable-next-line no-console
  console.info("[vs01-signature-line-dom-anchor]", payload);
}

export function logVs01SignatureOpticalOffset(payload: Record<string, unknown>): void {
  if (typeof import.meta !== "undefined" && import.meta.env?.MODE === "test") return;
  // eslint-disable-next-line no-console
  console.info("[vs01-signature-optical-offset]", payload);
}

export function signingPacketHasVisibleText(pages: readonly Vs01SigningPacketPage[]): boolean {
  return pages.some(
    (p) =>
      p.flowLines.some((line) => line.trim().length > 0) ||
      p.textBlocks.some((b) => b.text.trim().length > 0),
  );
}

export function signingPacketTotalCharCount(pages: readonly Vs01SigningPacketPage[]): number {
  return pages.reduce(
    (sum, p) => sum + p.textBlocks.reduce((lineSum, b) => lineSum + b.text.trim().length, 0),
    0,
  );
}
