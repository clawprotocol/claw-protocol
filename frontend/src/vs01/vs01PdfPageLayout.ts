/**
 * Extract normalized text line geometry from a PDF page (pdf.js).
 */

import { loadPdfJsWithWorker } from "../agreement/recipientRevisedDraftPdfJs";
import type { Vs01NormTextRect, Vs01PageTextLayout } from "./vs01PageTextLayout";

type PdfTextItem = {
  str: string;
  transform: number[];
  width?: number;
  height?: number;
};

function itemNormRect(
  item: PdfTextItem,
  viewport: { width: number; height: number },
): Vs01NormTextRect | null {
  const str = (item.str ?? "").trim();
  if (!str) return null;
  const t = item.transform;
  if (!t || t.length < 6) return null;
  const fontSize = Math.max(6, Math.hypot(t[0] ?? 0, t[1] ?? 0) || 10);
  const xPx = t[4] ?? 0;
  const yPx = t[5] ?? 0;
  const wPx = item.width && item.width > 0 ? item.width : str.length * fontSize * 0.52;
  const hPx = item.height && item.height > 0 ? item.height : fontSize * 1.15;
  const x = xPx / viewport.width;
  const yTop = 1 - yPx / viewport.height;
  const height = hPx / viewport.height;
  const y = Math.max(0, yTop - height);
  const width = Math.min(1 - x, wPx / viewport.width);
  return {
    x: Math.max(0, Math.min(1, x)),
    y: Math.max(0, Math.min(1, y)),
    width: Math.max(0.01, width),
    height: Math.max(0.008, height),
    text: str,
    kind: /^(By|Name|Title|Date)\s*:/i.test(str)
      ? "signature_label"
      : /^(CLIENT|SERVICE PROVIDER|PARTY\s+\d+)\s*:?\s*$/i.test(str)
        ? "heading"
        : "body",
  };
}

function clusterItemsToLines(
  items: PdfTextItem[],
  viewport: { width: number; height: number },
): Vs01NormTextRect[] {
  const buckets = new Map<number, PdfTextItem[]>();
  for (const item of items) {
    const rect = itemNormRect(item, viewport);
    if (!rect) continue;
    const bucket = Math.round(rect.y * 800);
    const list = buckets.get(bucket) ?? [];
    list.push(item);
    buckets.set(bucket, list);
  }
  const lines: Vs01NormTextRect[] = [];
  for (const group of buckets.values()) {
    const parts = group
      .map((it) => ({ it, rect: itemNormRect(it, viewport) }))
      .filter((p): p is { it: PdfTextItem; rect: Vs01NormTextRect } => Boolean(p.rect))
      .sort((a, b) => a.rect.x - b.rect.x);
    if (parts.length === 0) continue;
    const text = parts.map((p) => p.it.str).join(" ").replace(/\s+/g, " ").trim();
    const x = Math.min(...parts.map((p) => p.rect.x));
    const y = Math.min(...parts.map((p) => p.rect.y));
    const right = Math.max(...parts.map((p) => p.rect.x + p.rect.width));
    const bottom = Math.max(...parts.map((p) => p.rect.y + p.rect.height));
    lines.push({
      x,
      y,
      width: Math.max(0.02, right - x),
      height: Math.max(0.008, bottom - y),
      text,
      kind: /^(By|Name|Title|Date)\s*:/i.test(text)
        ? "signature_label"
        : /^(CLIENT|SERVICE PROVIDER|PARTY\s+\d+)\s*:?\s*$/i.test(text)
          ? "heading"
          : "body",
    });
  }
  return lines.sort((a, b) => a.y - b.y || a.x - b.x);
}

export async function extractPdfPageLayoutsFromData(
  data: Uint8Array | ArrayBuffer,
): Promise<Vs01PageTextLayout[]> {
  const pdfjs = await loadPdfJsWithWorker();
  const bytes = data instanceof Uint8Array ? data : new Uint8Array(data);
  const pdf = await pdfjs.getDocument({ data: bytes }).promise;
  try {
    const layouts: Vs01PageTextLayout[] = [];
    for (let i = 1; i <= pdf.numPages; i += 1) {
      const page = await pdf.getPage(i);
      const viewport = page.getViewport({ scale: 1 });
      const content = await page.getTextContent();
      const items: PdfTextItem[] = [];
      for (const item of content.items) {
        if (
          typeof item === "object" &&
          item !== null &&
          "str" in item &&
          Array.isArray((item as PdfTextItem).transform)
        ) {
          items.push(item as PdfTextItem);
        }
      }
      layouts.push({
        pageIndex: i - 1,
        source: "pdf",
        textRects: clusterItemsToLines(items, viewport),
      });
    }
    return layouts;
  } finally {
    try {
      await pdf.destroy();
    } catch {
      /* cleanup */
    }
  }
}

export async function extractPdfPageLayoutsFromBlob(blob: Blob): Promise<Vs01PageTextLayout[]> {
  const buf = await blob.arrayBuffer();
  return extractPdfPageLayoutsFromData(buf);
}
