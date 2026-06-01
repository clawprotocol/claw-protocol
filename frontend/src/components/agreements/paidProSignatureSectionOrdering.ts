/**
 * Paid Pro signature / execution ordering — substantive sections must not appear after
 * a standalone SIGNATURES heading; execution block stays singular at document tail.
 */

import { findSignatureRegionStart } from "./guidedDealCompletion/signatureRegion";

const NUMBERED_HEADING_RE = /^\s*(\d+(?:\.\d+)*)\.\s+(.+)$/;

/** Standalone SIGNATURES / N. SIGNATURES line — not "ELECTRONIC SIGNATURES" mid-title. */
export function isStandaloneSignaturesHeadingLine(line: string): boolean {
  const t = line.trim();
  if (!/^\s*(?:\d+\.\s+)?SIGNATURES\s*\.?\s*$/i.test(t)) return false;
  const withoutNum = t.replace(/^\d+\.\s+/, "").trim();
  return /^SIGNATURES\s*\.?\s*$/i.test(withoutNum);
}

function collapseDuplicateEntitySuffixPunct(text: string): string {
  return text.replace(/(Inc|LLC|Corp|Ltd|LP|L\.L\.C)(\.){2,}/gi, "$1.");
}

function isFillerSignatureLine(line: string): boolean {
  const t = line.trim();
  if (!t) return true;
  if (/^_{3,}$/.test(t)) return true;
  if (/^Name:\s*$/i.test(t)) return true;
  if (/^Title:\s*$/i.test(t)) return true;
  if (/^Date:\s*_{0,}\s*$/i.test(t)) return true;
  if (/^_{2,}\s*Date:/i.test(t)) return true;
  return false;
}

type NumberedBlock = { headingLine: string; headingTitle: string; bodyLines: string[] };

function parseNumberedBlocks(lines: readonly string[]): NumberedBlock[] {
  const blocks: NumberedBlock[] = [];
  let current: NumberedBlock | null = null;
  for (const line of lines) {
    const t = line.trim();
    const m = t.match(NUMBERED_HEADING_RE);
    if (m) {
      if (current) blocks.push(current);
      current = { headingLine: line, headingTitle: m[2]!.trim(), bodyLines: [] };
      continue;
    }
    if (current) current.bodyLines.push(line);
  }
  if (current) blocks.push(current);
  return blocks;
}

function findStandaloneSignaturesLineIndex(lines: readonly string[]): number {
  for (let i = 0; i < lines.length; i++) {
    if (isStandaloneSignaturesHeadingLine(lines[i]!)) return i;
  }
  return -1;
}

function findWitnessLineIndex(lines: readonly string[]): number {
  for (let i = 0; i < lines.length; i++) {
    if (/^\s*IN WITNESS WHEREOF\b/i.test(lines[i]!.trim())) return i;
  }
  return -1;
}

function findSection2Index(blocks: readonly NumberedBlock[]): number {
  return blocks.findIndex((b) => {
    const h = b.headingTitle.toLowerCase();
    return /^2\b/.test(b.headingLine.trim()) || /\bscope\b/i.test(h);
  });
}

function shouldMergeLateScopeSection(title: string): boolean {
  const h = title.toLowerCase();
  return (
    /\bscope\b/i.test(h) &&
    (/\bdeliverable|project\b/i.test(h) || /\bservices\s+and\s+project\b/i.test(h))
  );
}

export type PaidProSignatureSectionOrderingResult = {
  text: string;
  repairs: string[];
};

/**
 * Relocate substantive numbered sections that appear after a premature SIGNATURES heading,
 * normalize entity punctuation in the execution tail, and keep a single execution footer.
 */
export function repairPaidProSignatureSectionOrdering(text: string): PaidProSignatureSectionOrderingResult {
  const repairs: string[] = [];
  let working = (text || "").replace(/\r\n?/g, "\n").trim();
  if (!working) return { text: working, repairs };

  working = collapseDuplicateEntitySuffixPunct(working);

  const witnessIdx = working.search(/\bIN WITNESS WHEREOF\b/i);
  const headEnd = witnessIdx >= 0 ? witnessIdx : working.length;
  const headLines = working.slice(0, headEnd).split("\n");
  const tail = witnessIdx >= 0 ? working.slice(witnessIdx) : "";

  const sigLineIdx = findStandaloneSignaturesLineIndex(headLines);
  if (sigLineIdx < 0) {
    const punct = collapseDuplicateEntitySuffixPunct(working);
    if (punct !== working) repairs.push("signature_order:entity_punct");
    return { text: punct, repairs };
  }

  const witnessLineIdx = findWitnessLineIndex(headLines);
  const misplacedEnd = witnessLineIdx >= 0 ? witnessLineIdx : headLines.length;
  const prefixLines = headLines.slice(0, sigLineIdx);
  const misplacedLines = headLines.slice(sigLineIdx + 1, misplacedEnd);

  const misplacedBlocks = parseNumberedBlocks(misplacedLines);
  const nonSectionMisplaced = misplacedLines.filter((line) => {
    const t = line.trim();
    if (!t) return false;
    if (NUMBERED_HEADING_RE.test(t)) return false;
    if (isStandaloneSignaturesHeadingLine(line)) return false;
    if (isFillerSignatureLine(line)) return false;
    return true;
  });

  let prefixBlocks = parseNumberedBlocks(prefixLines);
  const blocksToInsert: NumberedBlock[] = [];

  for (const block of misplacedBlocks) {
    if (shouldMergeLateScopeSection(block.headingTitle)) {
      const s2 = findSection2Index(prefixBlocks);
      if (s2 >= 0) {
        prefixBlocks[s2]!.bodyLines.push("", ...block.bodyLines);
        repairs.push("signature_order:merged_late_scope_into_section_2");
        continue;
      }
    }
    blocksToInsert.push(block);
    repairs.push(`signature_order:relocated_section:${block.headingTitle.slice(0, 40)}`);
  }

  if (nonSectionMisplaced.length > 0 && blocksToInsert.length === 0) {
    const s2 = findSection2Index(prefixBlocks);
    if (s2 >= 0) {
      prefixBlocks[s2]!.bodyLines.push("", ...nonSectionMisplaced);
      repairs.push("signature_order:relocated_trailing_prose_into_section_2");
    } else {
      blocksToInsert.push({
        headingLine: "12. Scope of Services and Project Deliverables",
        headingTitle: "Scope of Services and Project Deliverables",
        bodyLines: nonSectionMisplaced,
      });
      repairs.push("signature_order:relocated_trailing_prose_as_section");
    }
  }

  prefixBlocks = [...prefixBlocks, ...blocksToInsert];

  const rebuiltPrefix: string[] = [];
  for (const block of prefixBlocks) {
    rebuiltPrefix.push(block.headingLine);
    rebuiltPrefix.push(...block.bodyLines);
    if (block.bodyLines.length && block.bodyLines[block.bodyLines.length - 1]?.trim()) {
      rebuiltPrefix.push("");
    }
  }

  const sigHeading = headLines[sigLineIdx]!.trim();
  const rebuiltHead = [...rebuiltPrefix, "", sigHeading]
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  let out = tail ? `${rebuiltHead}\n\n${tail.trim()}` : rebuiltHead;
  out = collapseDuplicateEntitySuffixPunct(out);
  repairs.push("signature_order:premature_signatures_relocated");
  return { text: out.trim(), repairs };
}

export function lastNumberedSectionHeadingIndex(text: string): number {
  const sigMatch = [...text.matchAll(/^[\s]*(?:\d+\.\s+)?SIGNATURES\s*\.?\s*$/gim)].find((m) =>
    isStandaloneSignaturesHeadingLine(m[0] ?? ""),
  );
  const sigIdx = sigMatch?.index ?? text.search(/\bSIGNATURES\b/i);
  const head = sigIdx >= 0 ? text.slice(0, sigIdx) : text;
  let last = -1;
  for (const m of head.matchAll(/^\s*\d+(?:\.\d+)*\.\s+\S+/gm)) {
    if (m.index != null) last = m.index;
  }
  return last;
}

/** Numbered section headings between standalone SIGNATURES and IN WITNESS WHEREOF (must be empty). */
export function numberedSectionHeadingsAfterSignatures(text: string): string[] {
  const lines = text.split("\n");
  const sigIdx = findStandaloneSignaturesLineIndex(lines);
  if (sigIdx < 0) return [];
  const witnessIdx = findWitnessLineIndex(lines);
  const end = witnessIdx >= 0 ? witnessIdx : lines.length;
  const hits: string[] = [];
  for (let i = sigIdx + 1; i < end; i++) {
    const t = lines[i]!.trim();
    if (NUMBERED_HEADING_RE.test(t)) hits.push(t);
  }
  return hits;
}

export function assertPaidProSignatureSectionOrderingInvariant(text: string): void {
  const body = (text || "").trim();
  const sigIdx = body.search(/^\s*(?:\d+\.\s+)?SIGNATURES\s*\.?\s*$/im);
  const witnessIdx = body.search(/\bIN WITNESS WHEREOF\b/i);
  if (sigIdx >= 0 && witnessIdx >= 0 && witnessIdx <= sigIdx) {
    throw new Error("IN WITNESS WHEREOF must follow SIGNATURES");
  }
  const afterSig = numberedSectionHeadingsAfterSignatures(body);
  if (afterSig.length > 0) {
    throw new Error(`numbered sections after SIGNATURES: ${afterSig.join("; ")}`);
  }
  const lastNum = lastNumberedSectionHeadingIndex(body);
  if (sigIdx >= 0 && lastNum >= 0 && sigIdx <= lastNum) {
    throw new Error("SIGNATURES must follow the last numbered section");
  }
  if (/(?:Inc|LLC|Corp|Ltd|LP|L\.L\.C)\.\./i.test(body)) {
    throw new Error("double entity punctuation in signature block");
  }
  const marker = findSignatureRegionStart(body);
  if (marker >= 0) {
    const tail = body.slice(marker);
    const numberedInTail = (tail.match(/^\s*\d+(?:\.\d+)*\.\s+\S+/gm) || []).filter((line) => {
      const beforeWitness = witnessIdx < 0 || (tail.indexOf(line) + marker) < witnessIdx;
      return !beforeWitness;
    });
    if (numberedInTail.length > 0) {
      throw new Error("numbered section in execution tail after witness");
    }
  }
}
