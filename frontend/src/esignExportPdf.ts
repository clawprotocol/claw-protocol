/**
 * Export filled PDF - flattens text/date/signature/initials field values into the PDF.
 * Uses pdf-lib; coordinates: xPct,yPct,wPct,hPct (0-1, top-left origin).
 * PDF uses bottom-left origin.
 */
import { PDFDocument, PDFFont, StandardFonts, rgb } from "pdf-lib";

export type EsignFieldForExport = {
  id: string;
  type: "signature" | "initials" | "date" | "text";
  pageIndex: number;
  xPct: number;
  yPct: number;
  wPct: number;
  hPct: number;
  value?: string;
};

const PADDING_FRAC = 0.06;

function dataUrlToBytes(dataUrl: string): { mime: "image/png" | "image/jpeg"; bytes: Uint8Array } | null {
  const m = dataUrl.match(/^data:(image\/(?:png|jpeg|jpg));base64,(.+)$/i);
  if (!m) return null;
  const mime = m[1].toLowerCase() === "image/png" ? "image/png" : "image/jpeg";
  const b64 = m[2];
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i += 1) bytes[i] = bin.charCodeAt(i);
  return { mime, bytes };
}

function fitFontSizeToBox(
  font: PDFFont,
  text: string,
  maxW: number,
  maxH: number
): number {
  const startSize = Math.max(8, Math.min(18, maxH * 0.65));
  const padding = Math.max(2, Math.min(6, maxW * PADDING_FRAC));
  const maxAvailW = maxW - padding * 2;
  const maxFontSizeByHeight = maxH * 0.8;

  let size = Math.min(startSize, maxFontSizeByHeight);
  while (size >= 4) {
    const w = font.widthOfTextAtSize(text, size);
    if (w <= maxAvailW && size <= maxFontSizeByHeight) return size;
    size -= 1;
  }
  return Math.max(4, size);
}

export async function exportFilledPdf(
  pdfBytes: ArrayBuffer,
  fields: EsignFieldForExport[],
  onDebug?: (msg: string, data?: unknown) => void
): Promise<Uint8Array> {
  const doc = await PDFDocument.load(pdfBytes);
  const fontRegular = await doc.embedFont(StandardFonts.Helvetica);
  const fontOblique = await doc.embedFont(StandardFonts.HelveticaOblique);

  const filledFields = fields.filter((f) => {
    const v = (f.value ?? "").trim();
    if (!v) return false;
    return f.type === "text" || f.type === "date" || f.type === "signature" || f.type === "initials";
  });

  if (onDebug) {
    onDebug("EXPORT_PDF", { fieldCount: fields.length, filledCount: filledFields.length });
  }

  const pages = doc.getPages();
  const color = rgb(0.07, 0.07, 0.07);

  for (const field of filledFields) {
    const pageIdx = Math.max(0, Math.min(field.pageIndex, pages.length - 1));
    const page = pages[pageIdx];
    const pageWidth = page.getWidth();
    const pageHeight = page.getHeight();

    const wPts = field.wPct * pageWidth;
    const hPts = field.hPct * pageHeight;
    const xLeft = field.xPct * pageWidth;
    const paddingPts = Math.max(2, Math.min(6, wPts * PADDING_FRAC));

    const text = String(field.value ?? "").trim();
    if (!text) continue;

    const yBottom = pageHeight - (field.yPct + field.hPct) * pageHeight;
    const isSignatureOrInitials = field.type === "signature" || field.type === "initials";

    if (isSignatureOrInitials && text.startsWith("data:image/")) {
      const parsed = dataUrlToBytes(text);
      if (!parsed) {
        // TODO: handle additional signature image encodings beyond data URL png/jpeg.
        continue;
      }
      const image =
        parsed.mime === "image/png"
          ? await doc.embedPng(parsed.bytes)
          : await doc.embedJpg(parsed.bytes);

      const innerW = Math.max(1, wPts - paddingPts * 2);
      const innerH = Math.max(1, hPts - paddingPts * 2);
      const scale = Math.min(innerW / image.width, innerH / image.height);
      const drawW = image.width * scale;
      const drawH = image.height * scale;
      const drawX = xLeft + (wPts - drawW) / 2;
      const drawY = yBottom + (hPts - drawH) / 2;

      if (onDebug) {
        onDebug("EXPORT_PDF_FIELD", {
          id: field.id,
          pageIndex: field.pageIndex,
          fontSize: null,
          wPts,
          hPts,
        });
      }
      page.drawImage(image, {
        x: drawX,
        y: drawY,
        width: drawW,
        height: drawH,
      });
      continue;
    }

    const font = isSignatureOrInitials ? fontOblique : fontRegular;
    let fontSize = fitFontSizeToBox(font, text, wPts, hPts);
    if (isSignatureOrInitials) fontSize = Math.max(4, fontSize * 0.9);

    const x = xLeft + paddingPts;
    const y = yBottom + (hPts - fontSize) / 2 + fontSize * 0.15;

    if (onDebug) {
      onDebug("EXPORT_PDF_FIELD", {
        id: field.id,
        pageIndex: field.pageIndex,
        fontSize,
        wPts,
        hPts,
      });
    }

    page.drawText(text, {
      x,
      y,
      size: fontSize,
      font,
      color,
    });
  }

  return doc.save();
}
