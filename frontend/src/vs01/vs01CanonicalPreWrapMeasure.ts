/**
 * Georgia 13px pre-wrap visual line counting — shared by paginator stack units and layout contract.
 * Uses canvas measureText (Chromium-aligned in browser + jsdom) instead of char-width heuristics.
 */
import {
  VS01_PACKET_LINE_HEIGHT_PT,
  VS01_PACKET_MARGIN_LEFT_PT,
  VS01_PACKET_MARGIN_RIGHT_PT,
  VS01_PACKET_PAGE_WIDTH_PT,
} from "./vs01PacketLayoutConstants";
import type { Vs01CanonicalFlowLineDescriptor } from "./vs01CanonicalTextLayout";

export const VS01_CANONICAL_BODY_FONT_SIZE_PX = 13;
export const VS01_CANONICAL_BODY_LINE_HEIGHT_PX = VS01_PACKET_LINE_HEIGHT_PT;
export const VS01_CANONICAL_DOCUMENT_TITLE_FONT_SCALE = 1.28;

export const VS01_CANONICAL_MEASURE_FONT_FAMILY = 'Georgia, "Times New Roman", serif';

export type Vs01CanonicalMeasureFont = {
  fontSizePx: number;
  fontWeight: number | string;
  fontFamily: string;
};

let measureCanvas: HTMLCanvasElement | null = null;
let measureCtx: CanvasRenderingContext2D | null = null;
const wrapLineCountCache = new Map<string, number>();
const WRAP_LINE_COUNT_CACHE_MAX = 12_000;

function wrapLineCountCacheKey(
  text: string,
  contentWidthPx: number,
  font: Vs01CanonicalMeasureFont,
): string {
  return `${font.fontWeight}|${font.fontSizePx}|${contentWidthPx}|${text}`;
}

function getMeasureContext(): CanvasRenderingContext2D | null {
  if (typeof document === "undefined") return null;
  if (!measureCanvas) {
    measureCanvas = document.createElement("canvas");
    measureCtx = measureCanvas.getContext("2d");
  }
  return measureCtx;
}

function applyMeasureFont(ctx: CanvasRenderingContext2D, font: Vs01CanonicalMeasureFont): void {
  ctx.font = `${font.fontWeight} ${font.fontSizePx}px ${font.fontFamily}`;
}

function breakOversizedToken(
  ctx: CanvasRenderingContext2D,
  token: string,
  maxWidthPx: number,
): string[] {
  const parts: string[] = [];
  let chunk = "";
  for (const ch of token) {
    const next = chunk + ch;
    if (chunk && ctx.measureText(next).width > maxWidthPx) {
      parts.push(chunk);
      chunk = ch;
    } else {
      chunk = next;
    }
  }
  if (chunk) parts.push(chunk);
  return parts.length > 0 ? parts : [token];
}

function tokenizePreWrapParagraph(paragraph: string): string[] {
  return paragraph.match(/\S+|\s+/g) ?? (paragraph ? [paragraph] : []);
}

/**
 * Count visual rows for white-space:pre-wrap + overflow-wrap:break-word at a fixed content width.
 */
export function measureCanonicalPreWrapVisualLineCount(
  text: string,
  contentWidthPx: number,
  font: Vs01CanonicalMeasureFont,
): number {
  const trimmed = text.trim();
  if (!trimmed) return 1;
  if (contentWidthPx <= 0) return 1;

  const cacheKey = wrapLineCountCacheKey(trimmed, contentWidthPx, font);
  const cached = wrapLineCountCache.get(cacheKey);
  if (cached !== undefined) return cached;

  const ctx = getMeasureContext();
  if (!ctx) {
    wrapLineCountCache.set(cacheKey, 1);
    return 1;
  }

  applyMeasureFont(ctx, font);

  let totalLines = 0;
  const paragraphs = text.split("\n");
  for (const paragraph of paragraphs) {
    if (!paragraph.trim()) {
      totalLines += 1;
      continue;
    }

    let lineWidth = 0;
    let paragraphLines = 1;
    const tokens = tokenizePreWrapParagraph(paragraph);

    for (let token of tokens) {
      if (!token) continue;
      if (!/\s/.test(token) && ctx.measureText(token).width > contentWidthPx) {
        const broken = breakOversizedToken(ctx, token, contentWidthPx);
        for (let i = 0; i < broken.length; i += 1) {
          const piece = broken[i]!;
          const pieceWidth = ctx.measureText(piece).width;
          if (lineWidth > 0 && lineWidth + pieceWidth > contentWidthPx) {
            paragraphLines += 1;
            lineWidth = pieceWidth;
          } else {
            lineWidth += pieceWidth;
          }
        }
        continue;
      }

      const tokenWidth = ctx.measureText(token).width;
      if (lineWidth > 0 && lineWidth + tokenWidth > contentWidthPx) {
        paragraphLines += 1;
        lineWidth = /^\s+$/.test(token) ? 0 : tokenWidth;
      } else {
        lineWidth += tokenWidth;
      }
    }

    totalLines += Math.max(1, paragraphLines);
  }

  const result = Math.max(1, totalLines);
  if (wrapLineCountCache.size >= WRAP_LINE_COUNT_CACHE_MAX) {
    wrapLineCountCache.clear();
  }
  wrapLineCountCache.set(cacheKey, result);
  return result;
}

export function canonicalBodyMeasureFont(fontWeight: number | string = 400): Vs01CanonicalMeasureFont {
  return {
    fontSizePx: VS01_CANONICAL_BODY_FONT_SIZE_PX,
    fontWeight,
    fontFamily: VS01_CANONICAL_MEASURE_FONT_FAMILY,
  };
}

export function canonicalDocumentTitleMeasureFont(): Vs01CanonicalMeasureFont {
  return {
    fontSizePx: VS01_CANONICAL_BODY_FONT_SIZE_PX * VS01_CANONICAL_DOCUMENT_TITLE_FONT_SCALE,
    fontWeight: 700,
    fontFamily: VS01_CANONICAL_MEASURE_FONT_FAMILY,
  };
}

export function canonicalContentWidthPx(pageWidthPx = VS01_PACKET_PAGE_WIDTH_PT): number {
  const scale = pageWidthPx / VS01_PACKET_PAGE_WIDTH_PT;
  return pageWidthPx - (VS01_PACKET_MARGIN_LEFT_PT + VS01_PACKET_MARGIN_RIGHT_PT) * scale;
}

export function canonicalDescriptorVisualLineCount(
  descriptor: Pick<Vs01CanonicalFlowLineDescriptor, "trimmed" | "kind" | "isSignatureExecutionLine">,
  contentWidthPx?: number,
): number {
  const width = contentWidthPx ?? canonicalContentWidthPx();
  const t = descriptor.trimmed;
  if (!t) return 1;
  if (descriptor.isSignatureExecutionLine) return 1;

  if (descriptor.kind === "document_title") {
    return measureCanonicalPreWrapVisualLineCount(t, width, canonicalDocumentTitleMeasureFont());
  }

  const fontWeight = descriptor.kind === "heading" ? 700 : 400;
  return measureCanonicalPreWrapVisualLineCount(t, width, canonicalBodyMeasureFont(fontWeight));
}

/** DOM block height in body-line-height units (17.5px @ 1:1 page scale). */
export function canonicalDescriptorDomHeightUnits(
  descriptor: Pick<Vs01CanonicalFlowLineDescriptor, "trimmed" | "kind" | "isSignatureExecutionLine">,
  contentWidthPx?: number,
): number {
  const t = descriptor.trimmed;
  if (!t) return 0;

  if (descriptor.isSignatureExecutionLine) return 0;

  if (descriptor.kind === "document_title") {
    const fontSizePx = VS01_CANONICAL_BODY_FONT_SIZE_PX * VS01_CANONICAL_DOCUMENT_TITLE_FONT_SCALE;
    const visualLines = canonicalDescriptorVisualLineCount(descriptor, contentWidthPx);
    const blockHeightPx =
      visualLines * fontSizePx * 1.2 + fontSizePx * 0.35;
    return blockHeightPx / VS01_CANONICAL_BODY_LINE_HEIGHT_PX;
  }

  const visualLines = canonicalDescriptorVisualLineCount(descriptor, contentWidthPx);
  return visualLines;
}
