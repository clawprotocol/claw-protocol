import { normalizeNewlinesForLegalRedline } from "./legalRedlineBlocks";
import { stripRecipientQaDraftNoiseLines } from "./recipientRevisionPreambleStrip";

const DRAFT_TEMPLATE_INLINE_RE = /draft\s+agreement\s*\(\s*non-?binding\s+template\s*\)/gi;
const PAGE_ARTIFACT_LINE_RE = /^\s*page\s+\d+\s+of\s+\d+\s*$/gim;
const PAGE_ARTIFACT_INLINE_RE = /\bpage\s+\d+\s+of\s+\d+\b/gi;
const CREATED_WITH_LAWDOG_LINE_RE = /^\s*created\s+with\s+lawdog\b.*$/gim;
const CREATED_WITH_LAWDOG_INLINE_RE = /\bcreated\s+with\s+lawdog\b.*?(?=$|\s+\d+\.)/gi;
const LAWDOG_HEADER_LINE_RE = /^\s*(?:powered\s+by\s+)?lawdog(?:\s+pro)?\b.*$/gim;

function stripCopyEditingArtifacts(text: string): string {
  let out = text.replace(DRAFT_TEMPLATE_INLINE_RE, " ");
  out = out.replace(PAGE_ARTIFACT_LINE_RE, "");
  out = out.replace(PAGE_ARTIFACT_INLINE_RE, " ");
  out = out.replace(CREATED_WITH_LAWDOG_LINE_RE, "");
  out = out.replace(CREATED_WITH_LAWDOG_INLINE_RE, " ");
  out = out.replace(LAWDOG_HEADER_LINE_RE, "");
  return stripRecipientQaDraftNoiseLines(out);
}

function collapseRunsToSingleSpaces(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

function finalizeParagraphSpacing(text: string): string {
  return normalizeNewlinesForLegalRedline(text)
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n[ \t]+/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function needsStructuralRepair(text: string): boolean {
  const paragraphBreaks = (text.match(/\n\n+/g) || []).length;
  const lines = text.split("\n");
  const longLines = lines.filter((line) => line.trim().length > 220).length;
  if (paragraphBreaks >= 6) return false;
  if (text.length > 800 && paragraphBreaks < 3) return true;
  return longLines > 0 && paragraphBreaks < 4;
}

function insertStructuralBreaks(collapsed: string): string {
  let t = collapsed;
  t = t.replace(/\s+(?=(IN WITNESS WHEREOF)\b)/gi, "\n\n");
  t = t.replace(/\s+(?=(CLIENT|SERVICE PROVIDER|CONSULTANT|COMPANY)\s*:)/gi, "\n\n");
  t = t.replace(/\s+(?=(\d+\.\d+)\s+([A-Z][A-Za-z]))/g, "\n\n");
  t = t.replace(/\s+(?=(\d+)\.(?!\d)\s+([A-Z][A-Za-z][^\.]{3,}?))(?=\s+\d+\.\d+\s)/g, "\n\n");
  return t;
}

/**
 * Formats agreement plain text for copy/paste editing without mutating authoritative corpus.
 * Repairs collapsed HTML/PDF extraction while preserving section and signature structure.
 */
export function formatAgreementPlainTextForEditing(raw: string): string {
  const trimmed = String(raw ?? "").trim();
  if (!trimmed) return "";

  let text = normalizeNewlinesForLegalRedline(trimmed);
  text = stripCopyEditingArtifacts(text);

  if (!needsStructuralRepair(text)) {
    return finalizeParagraphSpacing(text);
  }

  const collapsed = collapseRunsToSingleSpaces(text);
  const repaired = insertStructuralBreaks(collapsed);
  return finalizeParagraphSpacing(repaired);
}
