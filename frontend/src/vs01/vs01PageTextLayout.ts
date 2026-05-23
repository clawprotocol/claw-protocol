/**
 * Normalized text geometry for VS01 field placement (PDF extraction or corpus simulation).
 */

import { signaturePatchStartIndex } from "../components/agreements/guidedDealCompletion/signatureRegion";

export type Vs01TextRectKind = "body" | "heading" | "signature_label" | "footer";

export type Vs01NormTextRect = {
  x: number;
  y: number;
  width: number;
  height: number;
  text: string;
  kind: Vs01TextRectKind;
};

export type Vs01PageTextLayout = {
  pageIndex: number;
  source: "pdf" | "corpus_sim";
  textRects: Vs01NormTextRect[];
};

export type Vs01ByLinePlacement = {
  partyIndex: number;
  blockHeading: string;
  x: number;
  y: number;
  width: number;
  height: number;
  lineText: string;
};

const CORPUS_CONTENT_TOP = 0.088;
const CORPUS_LINE_HEIGHT = 0.0182;
const CORPUS_MARGIN_LEFT = 0.072;
const CORPUS_CHAR_WIDTH = 0.00515;

function estimateLineWidth(line: string): number {
  return Math.min(0.9, Math.max(0.05, line.trim().length * CORPUS_CHAR_WIDTH));
}

function classifyLineKind(line: string): Vs01TextRectKind {
  const t = line.trim();
  if (/^(CLIENT|SERVICE PROVIDER|PARTY\s+\d+)\s*:?\s*$/i.test(t)) return "heading";
  if (/^(By|Signature|Name|Title|Date)\s*:/i.test(t)) return "signature_label";
  if (/^IN WITNESS WHEREOF/i.test(t)) return "heading";
  return "body";
}

function layoutLinesOnPage(pageIndex: number, slice: string[]): Vs01PageTextLayout {
  const textRects: Vs01NormTextRect[] = [];
  let lineIdx = 0;
  for (const raw of slice) {
    const text = raw;
    if (!text.trim()) {
      lineIdx += 1;
      continue;
    }
    const y = CORPUS_CONTENT_TOP + lineIdx * CORPUS_LINE_HEIGHT;
    textRects.push({
      x: CORPUS_MARGIN_LEFT,
      y,
      width: estimateLineWidth(text),
      height: CORPUS_LINE_HEIGHT * 0.94,
      text,
      kind: classifyLineKind(text),
    });
    lineIdx += 1;
  }
  return { pageIndex, source: "corpus_sim", textRects };
}

/** Distribute corpus lines across pages; witness/signature tail is pinned to the last page. */
export function buildCorpusSimulatedPageLayouts(
  corpusText: string,
  pageCount: number,
): Vs01PageTextLayout[] {
  const pages = Math.max(1, pageCount);
  const normalized = corpusText.replace(/\r\n/g, "\n");
  const witnessIdx = normalized.search(/\bIN WITNESS WHEREOF\b/i);
  if (witnessIdx >= 0 && pages > 1) {
    const bodyLines = normalized.slice(0, witnessIdx).split("\n");
    const tailLines = normalized.slice(witnessIdx).split("\n");
    const bodyPages = pages - 1;
    const perBodyPage = Math.max(1, Math.ceil(bodyLines.length / bodyPages));
    const layouts: Vs01PageTextLayout[] = [];
    for (let p = 0; p < bodyPages; p += 1) {
      layouts.push(
        layoutLinesOnPage(p, bodyLines.slice(p * perBodyPage, (p + 1) * perBodyPage)),
      );
    }
    layouts.push(layoutLinesOnPage(pages - 1, tailLines));
    return layouts;
  }

  const lines = normalized.split("\n");
  const perPage = Math.ceil(lines.length / pages);
  const layouts: Vs01PageTextLayout[] = [];
  for (let p = 0; p < pages; p += 1) {
    layouts.push(layoutLinesOnPage(p, lines.slice(p * perPage, (p + 1) * perPage)));
  }
  return layouts;
}

export function resolveVs01PageLayouts(args: {
  corpusText?: string | null;
  pageCount: number;
  pageLayouts?: readonly Vs01PageTextLayout[] | null;
}): Vs01PageTextLayout[] {
  return reconcileVs01PageLayouts(args).layouts;
}

export type Vs01ReconciledPageLayouts = {
  layouts: Vs01PageTextLayout[];
  witnessPageIndex: number | null;
  pdfPageCount: number;
  simulatedPageCount: number;
  finalPageCount: number;
  layoutSource: "pdf+corpus" | "pdf" | "corpus_sim";
};

function normalizePdfPageLayouts(
  pdfLayouts: readonly Vs01PageTextLayout[],
  pageCount: number,
): Vs01PageTextLayout[] {
  const out: Vs01PageTextLayout[] = [];
  for (let i = 0; i < pageCount; i += 1) {
    const found = pdfLayouts.find((l) => l.pageIndex === i);
    out.push(
      found ?? {
        pageIndex: i,
        source: "pdf",
        textRects: [],
      },
    );
  }
  return out;
}

export function scoreWitnessPage(layout: Vs01PageTextLayout | null | undefined): {
  score: number;
  byCount: number;
  hasWitness: boolean;
} {
  if (!layout?.textRects.length) return { score: -1, byCount: 0, hasWitness: false };
  const sigLines = findSignatureLinePlacementsFromPageLayout(layout);
  const hasWitness = layout.textRects.some((r) => /\bIN WITNESS WHEREOF\b/i.test(r.text));
  const hasScheduleOnly =
    layout.textRects.some((r) => /\bSCHEDULE\s+A\b/i.test(r.text)) &&
    sigLines.length === 0 &&
    !hasWitness;
  const hasExecutionPlaceholder = layout.textRects.some((r) =>
    /Execution and signature placement are handled/i.test(r.text),
  );
  let score = sigLines.length * 100;
  if (hasWitness) score += 40;
  if (sigLines.length >= 2) score += 50;
  if (hasScheduleOnly) score -= 250;
  if (hasExecutionPlaceholder && !hasWitness && sigLines.length === 0) score -= 200;
  return { score, byCount: sigLines.length, hasWitness };
}

function pickWitnessPageIndex(
  pdfLayouts: readonly Vs01PageTextLayout[],
  corpusLayouts: readonly Vs01PageTextLayout[],
  corpusText: string | null | undefined,
  minRoles: number,
): number | null {
  const pdfIdx = detectWitnessSignaturePageIndex(pdfLayouts, corpusText, minRoles);
  const corpusIdx =
    corpusLayouts.length > 0
      ? detectWitnessSignaturePageIndex(corpusLayouts, corpusText, minRoles)
      : null;
  if (pdfIdx == null) return corpusIdx;
  if (corpusIdx == null) return pdfIdx;
  const pdfSig = findSignatureLinePlacementsFromPageLayout(pageLayoutForIndex(pdfLayouts, pdfIdx));
  if (pdfSig.length >= minRoles) return pdfIdx;
  const pdfScore = scoreWitnessPage(pageLayoutForIndex(pdfLayouts, pdfIdx)).score;
  const corpusScore = scoreWitnessPage(pageLayoutForIndex(corpusLayouts, corpusIdx)).score;
  return corpusScore >= pdfScore ? corpusIdx : pdfIdx;
}

/** Scan all page layouts for the page that contains the canonical witness / By: block. */
export function detectWitnessSignaturePageIndex(
  layouts: readonly Vs01PageTextLayout[],
  corpusText: string | null | undefined,
  minRoles = 2,
): number | null {
  if (!layouts.length) return null;
  let bestIdx = -1;
  let bestScore = -1;
  for (const layout of layouts) {
    const { score } = scoreWitnessPage(layout);
    if (score > bestScore) {
      bestScore = score;
      bestIdx = layout.pageIndex;
    }
  }
  if (bestIdx >= 0 && bestScore > 0) return bestIdx;
  const corpus = (corpusText ?? "").trim();
  if (corpus.length >= 40 && /\bIN WITNESS WHEREOF\b/i.test(corpus)) {
    const sim = buildCorpusSimulatedPageLayouts(corpus, layouts.length);
    return detectWitnessSignaturePageIndex(sim, corpus, minRoles);
  }
  return null;
}

function mergeWitnessPageLayout(
  pdfPage: Vs01PageTextLayout | null,
  corpusPage: Vs01PageTextLayout,
  pageIndex: number,
): Vs01PageTextLayout {
  const pdfSig = findSignatureLinePlacementsFromPageLayout(pdfPage);
  if (pdfSig.length >= 2 && pdfPage) {
    return { ...pdfPage, pageIndex };
  }
  return { ...corpusPage, pageIndex, source: "corpus_sim" };
}

export function logVs01LayoutPageMap(payload: Record<string, unknown>): void {
  if (typeof import.meta !== "undefined" && import.meta.env?.MODE === "test") return;
  // eslint-disable-next-line no-console
  console.info("[vs01-layout-page-map]", payload);
}

export function logVs01WitnessPageDetected(payload: Record<string, unknown>): void {
  if (typeof import.meta !== "undefined" && import.meta.env?.MODE === "test") return;
  // eslint-disable-next-line no-console
  console.info("[vs01-witness-page-detected]", payload);
}

/**
 * Merge PDF-extracted layouts with corpus simulation; pin witness/By geometry to the
 * detected witness page (not assumed last PDF page).
 */
export function reconcileVs01PageLayouts(args: {
  corpusText?: string | null;
  pageCount: number;
  pageLayouts?: readonly Vs01PageTextLayout[] | null;
  roleCount?: number;
}): Vs01ReconciledPageLayouts {
  const finalPageCount = Math.max(1, args.pageCount);
  const corpus = (args.corpusText ?? "").trim();
  const roleCount = Math.max(1, args.roleCount ?? 2);

  const pdfPageCount = args.pageLayouts?.length ?? 0;
  const pdfLayouts = pdfPageCount > 0 ? normalizePdfPageLayouts(args.pageLayouts!, finalPageCount) : [];

  const corpusLayouts =
    corpus.length >= 40 ? buildCorpusSimulatedPageLayouts(corpus, finalPageCount) : [];
  const simulatedPageCount = corpusLayouts.length;

  let witnessPageIndex = pickWitnessPageIndex(pdfLayouts, corpusLayouts, corpus, roleCount);

  const layouts: Vs01PageTextLayout[] = [];
  for (let i = 0; i < finalPageCount; i += 1) {
    const pdf = pageLayoutForIndex(pdfLayouts, i);
    const corpusPage = pageLayoutForIndex(corpusLayouts, i);
    if (witnessPageIndex === i && corpusPage) {
      const pdfSig = findSignatureLinePlacementsFromPageLayout(pdf);
      if (pdfSig.length < roleCount) {
        layouts.push(mergeWitnessPageLayout(pdf, corpusPage, i));
        continue;
      }
    }
    if (pdf && pdf.textRects.length > 0) {
      layouts.push({ ...pdf, pageIndex: i });
    } else if (corpusPage) {
      layouts.push(corpusPage);
    } else {
      layouts.push({ pageIndex: i, source: "corpus_sim", textRects: [] });
    }
  }

  witnessPageIndex = detectWitnessSignaturePageIndex(layouts, corpus, roleCount);

  const layoutSource: Vs01ReconciledPageLayouts["layoutSource"] =
    pdfLayouts.some((p) => p.textRects.length > 0) && corpusLayouts.length > 0
      ? "pdf+corpus"
      : pdfLayouts.some((p) => p.textRects.length > 0)
        ? "pdf"
        : "corpus_sim";

  logVs01LayoutPageMap({
    pdfPageCount,
    simulatedPageCount,
    finalPageCount,
    layoutSource,
    witnessPageIndex,
  });

  if (witnessPageIndex != null) {
    const wl = pageLayoutForIndex(layouts, witnessPageIndex);
    const by = findByLinePlacementsFromPageLayout(wl);
    logVs01WitnessPageDetected({
      pageIndex: witnessPageIndex,
      byLineCount: by.length,
      anchorText: by.map((b) => b.lineText).join(" | "),
      hasWitness: wl?.textRects.some((r) => /\bIN WITNESS WHEREOF\b/i.test(r.text)) ?? false,
    });
  }

  return {
    layouts,
    witnessPageIndex,
    pdfPageCount,
    simulatedPageCount,
    finalPageCount,
    layoutSource,
  };
}

export function pageLayoutForIndex(
  layouts: readonly Vs01PageTextLayout[] | null | undefined,
  pageIndex: number,
): Vs01PageTextLayout | null {
  if (!layouts?.length) return null;
  return layouts.find((l) => l.pageIndex === pageIndex) ?? null;
}

function pdfPageIsFooterOnly(layout: Vs01PageTextLayout | null): boolean {
  const rects = layout?.textRects ?? [];
  if (rects.length === 0) return false;
  if (rects.some((r) => r.kind === "body" || r.kind === "heading")) return false;
  return rects.every((r) => r.kind === "footer" || r.y >= 0.9);
}

/** Prefer PDF text geometry; fall back to corpus simulation when a page has no readable body layer. */
export function mergePageLayoutForInitials(
  pdfLayout: Vs01PageTextLayout | null,
  corpusLayout: Vs01PageTextLayout | null,
): Vs01PageTextLayout | null {
  if (pdfLayout && pdfPageIsFooterOnly(pdfLayout)) {
    return pdfLayout;
  }
  const pdfRects = pdfLayout?.textRects ?? [];
  const pdfHasBody = pdfRects.some((r) => r.kind === "body" || r.kind === "heading");
  if (pdfHasBody && pdfLayout) return pdfLayout;
  if (corpusLayout && corpusLayout.textRects.length > 0) {
    return {
      ...corpusLayout,
      pageIndex: pdfLayout?.pageIndex ?? corpusLayout.pageIndex,
      source: pdfLayout?.source ?? "corpus_sim",
    };
  }
  return pdfLayout ?? corpusLayout;
}

const BLOCK_HEADING_RES = [
  { re: /^\s*CLIENT\s*:?\s*$/i, partyIndex: 0, label: "CLIENT" },
  { re: /^\s*SERVICE PROVIDER\s*:?\s*$/i, partyIndex: 1, label: "SERVICE PROVIDER" },
  { re: /^\s*PARTY\s+(\d+)\s*:?\s*$/i, partyIndex: -1, label: "PARTY" },
];

function parseSignatureLineWidth(lineText: string, lineRectWidth: number): number {
  const underline = lineText.match(/_+/);
  if (underline?.[0]) {
    return Math.min(0.58, Math.max(0.2, underline[0].length * CORPUS_CHAR_WIDTH));
  }
  const afterLabel = lineText.replace(/^(?:By|Signature)\s*:\s*/i, "").trim();
  if (afterLabel.length > 0) {
    return Math.min(0.58, Math.max(0.2, afterLabel.length * CORPUS_CHAR_WIDTH));
  }
  return Math.min(0.48, Math.max(0.22, lineRectWidth * 0.72));
}

function signatureLinePrefixNormX(lineText: string, lineX: number): number {
  const m = lineText.match(/^(?:By|Signature)\s*:\s*/i);
  const prefixChars = m ? m[0].length : 4;
  return lineX + prefixChars * CORPUS_CHAR_WIDTH;
}

function isSignatureExecutionLine(text: string): boolean {
  return /^(?:By|Signature)\s*:/i.test(text.trim());
}

/** Locate witness-block `By:` / `Signature:` lines from rendered/simulated page text geometry. */
export function findSignatureLinePlacementsFromPageLayout(
  layout: Vs01PageTextLayout | null | undefined,
): Vs01ByLinePlacement[] {
  if (!layout?.textRects.length) return [];
  const sorted = [...layout.textRects].sort((a, b) => a.y - b.y || a.x - b.x);
  let current: { partyIndex: number; blockHeading: string } | null = null;
  const out: Vs01ByLinePlacement[] = [];

  for (const rect of sorted) {
    const trimmed = rect.text.trim();
    if (!trimmed) continue;
    for (const h of BLOCK_HEADING_RES) {
      const m = trimmed.match(h.re);
      if (m) {
        const partyIndex = h.partyIndex >= 0 ? h.partyIndex : Math.max(0, Number(m[1]) - 1);
        current = { partyIndex, blockHeading: h.label };
        break;
      }
    }
    if (!isSignatureExecutionLine(trimmed)) continue;
    const partyIndex =
      current?.partyIndex ?? (out.length === 0 ? 0 : out.length === 1 ? 1 : out.length);
    const blockHeading = current?.blockHeading ?? (partyIndex === 0 ? "CLIENT" : "SERVICE PROVIDER");
    if (out.some((a) => a.partyIndex === partyIndex)) continue;
    const width = parseSignatureLineWidth(trimmed, rect.width);
    const x = signatureLinePrefixNormX(trimmed, rect.x);
    out.push({
      partyIndex,
      blockHeading,
      x,
      y: rect.y,
      width,
      height: rect.height,
      lineText: trimmed,
    });
  }
  return out.sort((a, b) => a.partyIndex - b.partyIndex);
}

/** @deprecated Use {@link findSignatureLinePlacementsFromPageLayout}. */
export function findByLinePlacementsFromPageLayout(
  layout: Vs01PageTextLayout | null | undefined,
): Vs01ByLinePlacement[] {
  return findSignatureLinePlacementsFromPageLayout(layout);
}

/** Text rects on the signature tail page (witness block through end). */
export function signatureTailTextRectsOnPage(
  layout: Vs01PageTextLayout,
  corpusText: string,
): Vs01NormTextRect[] {
  const witness = corpusText.search(/\bIN WITNESS WHEREOF\b/i);
  const tailStart = witness >= 0 ? signaturePatchStartIndex(corpusText) : -1;
  if (tailStart < 0) {
    const witnessRects = layout.textRects.filter((r) =>
      /IN WITNESS WHEREOF|^\s*(CLIENT|SERVICE PROVIDER|PARTY\s+\d+)\s*:?\s*$/i.test(r.text.trim()),
    );
    if (witnessRects.length === 0) return [];
    const minY = Math.min(...witnessRects.map((r) => r.y)) - 0.01;
    return layout.textRects.filter((r) => r.y >= minY - 1e-5);
  }
  const lines = corpusText.replace(/\r\n/g, "\n").split("\n");
  const tailLineStart = lines.findIndex((l) => /\bIN WITNESS WHEREOF\b/i.test(l));
  if (tailLineStart < 0) return [];
  const pages = Math.max(1, Math.ceil(lines.length / Math.max(1, layout.pageIndex + 1)));
  const perPage = Math.ceil(lines.length / pages);
  const pageLineStart = layout.pageIndex * perPage;
  const relStart = Math.max(0, tailLineStart - pageLineStart);
  const tailRects = [...layout.textRects].sort((a, b) => a.y - b.y);
  if (relStart >= tailRects.length) {
    return tailRects.slice(Math.max(0, tailRects.length - 14));
  }
  return tailRects.slice(relStart);
}

export function textRectsToObstacles(
  rects: readonly Vs01NormTextRect[],
  pad = 0.006,
): Array<{ x: number; y: number; width: number; height: number }> {
  return rects.map((r) => ({
    x: Math.max(0, r.x - pad),
    y: Math.max(0, r.y - pad),
    width: Math.min(1, r.width + pad * 2),
    height: Math.min(1, r.height + pad * 2),
  }));
}
