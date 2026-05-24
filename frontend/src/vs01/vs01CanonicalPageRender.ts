import type { Vs01SigningPacketPage } from "./buildVs01SigningPacketModel";
import {
  VS01_PACKET_LINE_HEIGHT_PT,
  VS01_PACKET_PAGE_HEIGHT_PT,
  VS01_PACKET_PAGE_WIDTH_PT,
} from "./buildVs01SigningPacketModel";

export type Vs01CanonicalPageRenderMetrics = {
  page: number;
  textBlockCount: number;
  charCount: number;
  signatureAnchorCount: number;
  initialsBandRect: Vs01SigningPacketPage["initialsBandRect"];
  renderedTextNodeCount: number;
};

export function canonicalPageTypographyPx(pageWidthPx: number): {
  pageHeightPx: number;
  lineHeightPx: number;
  fontSizePx: number;
} {
  const pageHeightPx = (pageWidthPx * VS01_PACKET_PAGE_HEIGHT_PT) / VS01_PACKET_PAGE_WIDTH_PT;
  const lineHeightPx = (pageHeightPx * VS01_PACKET_LINE_HEIGHT_PT) / VS01_PACKET_PAGE_HEIGHT_PT;
  const fontSizePx = Math.max(10.5, Math.round(lineHeightPx * 0.82 * 10) / 10);
  return { pageHeightPx, lineHeightPx, fontSizePx };
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

export function signingPacketHasVisibleText(pages: readonly Vs01SigningPacketPage[]): boolean {
  return pages.some((p) => p.textBlocks.some((b) => b.text.trim().length > 0));
}

export function signingPacketTotalCharCount(pages: readonly Vs01SigningPacketPage[]): number {
  return pages.reduce(
    (sum, p) => sum + p.textBlocks.reduce((lineSum, b) => lineSum + b.text.trim().length, 0),
    0,
  );
}
