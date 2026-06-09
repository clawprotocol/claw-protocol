import { isMainSectionHeadingLine } from "../components/agreements/paidProDocumentBlockClassifier";
import { hashPaidProCorpus } from "../components/agreements/paidProSourceOfTruth";

export const SECTION_9_HEADING_RE = /^\s*9\.\s+MISCELLANEOUS\s*$/im;
export const SECTION_9_BODY_RE = /entire agreement between the parties/i;
export const SECTION_10_HEADING_RE = /^\s*10\.\s+ELECTRONIC SIGNATURES\s*$/im;

export function extractMainSectionNumbers(plain: string): number[] {
  const out: number[] = [];
  for (const line of plain.replace(/\r\n/g, "\n").split("\n")) {
    const t = line.trim();
    if (!isMainSectionHeadingLine(t)) continue;
    const m = t.match(/^(\d+)\./);
    if (m) out.push(Number(m[1]));
  }
  return out;
}

export function countMainSectionHeadings(plain: string): number {
  return extractMainSectionNumbers(plain).length;
}

export function extractVisiblePlainFromReviewHtml(html: string): string {
  return (html || "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|h1|h2|div|li|tr)>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/[ \t]{2,}/g, " ")
    .trim();
}

export function analyzeReviewerVisibleClauseParity(args: {
  corpusPlain: string;
  copyExportPlain: string;
  visibleHtml: string;
  clauseCountBeforePolish?: number;
  clauseCountAfterPolish?: number;
}): {
  sectionNumbersInCorpus: number[];
  sectionNumbersInCopyExport: number[];
  sectionNumbersInVisibleHtml: number[];
  hasSection9HeadingInCorpus: boolean;
  hasSection9BodyInCorpus: boolean;
  hasSection9HeadingInCopyExport: boolean;
  hasSection9BodyInCopyExport: boolean;
  hasSection9HeadingInVisibleHtml: boolean;
  hasSection9BodyInVisibleHtml: boolean;
  droppedHeadingNumbers: number[];
  clauseCountBeforePolish: number;
  clauseCountAfterPolish: number;
} {
  const visiblePlain = extractVisiblePlainFromReviewHtml(args.visibleHtml);
  const sectionNumbersInCorpus = extractMainSectionNumbers(args.corpusPlain);
  const sectionNumbersInCopyExport = extractMainSectionNumbers(args.copyExportPlain);
  const sectionNumbersInVisibleHtml = extractMainSectionNumbers(visiblePlain);
  const clauseCountBeforePolish = args.clauseCountBeforePolish ?? countMainSectionHeadings(args.corpusPlain);
  const clauseCountAfterPolish = args.clauseCountAfterPolish ?? countMainSectionHeadings(visiblePlain);
  const droppedHeadingNumbers = sectionNumbersInCopyExport.filter(
    (n) => !sectionNumbersInVisibleHtml.includes(n),
  );
  return {
    sectionNumbersInCorpus,
    sectionNumbersInCopyExport,
    sectionNumbersInVisibleHtml,
    hasSection9HeadingInCorpus: SECTION_9_HEADING_RE.test(args.corpusPlain),
    hasSection9BodyInCorpus: SECTION_9_BODY_RE.test(args.corpusPlain),
    hasSection9HeadingInCopyExport: SECTION_9_HEADING_RE.test(args.copyExportPlain),
    hasSection9BodyInCopyExport: SECTION_9_BODY_RE.test(args.copyExportPlain),
    hasSection9HeadingInVisibleHtml: SECTION_9_HEADING_RE.test(visiblePlain),
    hasSection9BodyInVisibleHtml: SECTION_9_BODY_RE.test(visiblePlain),
    droppedHeadingNumbers,
    clauseCountBeforePolish,
    clauseCountAfterPolish,
  };
}

export function corpusFingerprintShort(text: string): string {
  return hashPaidProCorpus((text || "").trim());
}
