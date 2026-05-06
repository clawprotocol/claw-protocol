import { escapeHtml } from "../components/agreements/premiumAgreementDocumentHtml";
import type { LegalRedlineDocumentViewModel, LegalRedlineSegment } from "./legalRedlineBlocks";
import { lineLooksLikeSectionHeading, splitSegmentTextToParagraphLines } from "./RecipientLegalRedlineDocument";

export type RecipientPreviewPdfExportKind = "original" | "proposed" | "redline";

const PDF_LINE_BASE =
  "display:block;margin:0 0 3px 0;font:15px/1.65 Georgia,'Times New Roman',Times,serif;";
const PDF_SAME = `${PDF_LINE_BASE}color:#0f172a;`;
const PDF_INS = `${PDF_LINE_BASE}color:#064e3b;background:#d1fae8;text-decoration:underline;text-decoration-color:#047857;text-underline-offset:2px;padding:1px 4px;border-radius:2px;`;
const PDF_DEL = `${PDF_LINE_BASE}color:#9f1239;background:#fff1f2;text-decoration:line-through;text-decoration-color:#be123c;padding:1px 4px;border-radius:2px;`;

function spanForSegment(type: LegalRedlineSegment["type"], line: string): string {
  const inner = escapeHtml(line.length ? line : "\u00a0");
  if (type === "same") return `<span style="${PDF_SAME}">${inner}</span>`;
  if (type === "insert") return `<span style="${PDF_INS}">${inner}</span>`;
  return `<span style="${PDF_DEL}">${inner}</span>`;
}

function wrapLineBlock(isSectionHeading: boolean, inner: string): string {
  if (isSectionHeading) {
    return `<div style="margin:14px 0 8px;padding-bottom:6px;border-bottom:1px solid #e2e8f0;">${inner}</div>`;
  }
  return `<div style="margin:0 0 4px;">${inner}</div>`;
}

function renderSegmentHtml(seg: LegalRedlineSegment): string {
  const blocks = splitSegmentTextToParagraphLines(seg.text);
  if (blocks.length === 0) {
    return wrapLineBlock(false, spanForSegment(seg.type, "\u00a0"));
  }
  const parts: string[] = [];
  for (const lines of blocks) {
    let firstInPara = true;
    for (const line of lines) {
      const heading = Boolean(firstInPara && lineLooksLikeSectionHeading(line));
      firstInPara = false;
      parts.push(wrapLineBlock(heading, spanForSegment(seg.type, line || "\u00a0")));
    }
  }
  return parts.join("");
}

/**
 * Inline-styled HTML for PyMuPDF Story / server PDF (no Tailwind — classes are stripped server-side).
 */
export function buildRecipientRedlinePdfHtml(vm: LegalRedlineDocumentViewModel): string {
  const sections: string[] = [];
  for (const block of vm.blocks) {
    const label = (block.label || block.heading || block.clauseNumber || "").trim();
    const header = label
      ? `<header style="margin:0 0 10px;padding-bottom:8px;border-bottom:1px solid #e2e8f0;"><p style="margin:0;font-size:12px;font-weight:600;color:#475569;letter-spacing:0.03em;">${escapeHtml(
          label,
        )}</p></header>`
      : "";
    const inner = block.segments.map((s) => renderSegmentHtml(s)).join("");
    const changed = block.hasChange;
    const sectionShell = changed
      ? "display:block;margin:0;padding:12px 0 14px 10px;border-left:2px solid #94a3b8;"
      : "display:block;margin:0;padding:12px 0 14px;border-left:2px solid transparent;";
    sections.push(`<section style="${sectionShell}">${header}${inner}</section>`);
  }
  if (sections.length === 0) {
    return `<article style="max-width:40rem;margin:0 auto;padding:8px 0;"><p style="margin:0;font:15px/1.65 Georgia,serif;color:#475569;">No redline content.</p></article>`;
  }
  return `<article style="max-width:40rem;margin:0 auto;padding:8px 0;">${sections.join("")}</article>`;
}
