/**
 * Locate the signature block region without matching early "execution" / "signature" prose.
 */

/** Signature anchor must be in the latter portion of a full agreement. */
export const SIGNATURE_REGION_MIN_FRACTION = 0.45;

const WITNESS_RE = /\bIN WITNESS WHEREOF\b/gi;
const CLIENT_BLOCK_RE = /\n\s*CLIENT\s*:\s*(?:\n|$)/i;
const SIG_HEADING_RE = /\n\s*SIGNATURES?\s*:?\s*(?:\n|$)/gi;

/**
 * Index where signature-block patching may begin, or -1 if no safe anchor.
 * Never returns early "EXECUTION" / "SIGNATURE" matches in operative clauses.
 */
export function findSignatureRegionStart(text: string): number {
  const len = text.length;
  if (len < 80) return -1;

  const minFraction = len >= 2000 ? SIGNATURE_REGION_MIN_FRACTION : 0.12;
  const minPos = Math.floor(len * minFraction);

  const witnessMatches = [...text.matchAll(WITNESS_RE)];
  for (let i = witnessMatches.length - 1; i >= 0; i--) {
    const idx = witnessMatches[i].index ?? -1;
    if (idx >= minPos) return idx;
  }
  for (let i = witnessMatches.length - 1; i >= 0; i--) {
    const idx = witnessMatches[i].index ?? -1;
    if (idx >= len * 0.72) return idx;
  }

  const clientIdx = text.search(CLIENT_BLOCK_RE);
  if (clientIdx >= minPos) return clientIdx;

  const headingMatches = [...text.matchAll(SIG_HEADING_RE)];
  for (let i = headingMatches.length - 1; i >= 0; i--) {
    const idx = headingMatches[i].index ?? -1;
    if (idx >= minPos) return idx;
  }

  return -1;
}

/** When no anchor exists, limit signature-line scans to the document tail. */
export function signaturePatchStartIndex(text: string): number {
  const marker = findSignatureRegionStart(text);
  if (marker >= 0) return marker;
  const witness = text.search(/\bIN WITNESS WHEREOF\b/i);
  if (witness >= 0) return witness;
  const clientIdx = text.search(CLIENT_BLOCK_RE);
  if (clientIdx >= 0) return clientIdx;
  return Math.floor(text.length * 0.5);
}

export function isSafeSignatureTailReplacement(text: string, marker: number): boolean {
  if (marker < 0) return false;
  const minFraction = text.length >= 2000 ? SIGNATURE_REGION_MIN_FRACTION : 0.12;
  return marker >= Math.floor(text.length * minFraction);
}

/**
 * End offset (exclusive) of an existing signature tail starting at `start`.
 * Preserves substantive content that was incorrectly placed after signature blocks.
 */
export function findSignatureRegionEnd(text: string, start: number): number {
  if (start < 0) return text.length;
  const lines = text.slice(start).split("\n");
  let offset = 0;
  let afterHeading = false;
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) {
      offset += line.length + 1;
      continue;
    }
    const isWitness = /^\s*IN WITNESS WHEREOF\b/i.test(trimmed);
    const isHeading = /^\s*(?:CLIENT|SERVICE PROVIDER|PARTY\s+\d+)\s*:?\s*$/i.test(trimmed);
    const isSigField =
      /^\s*(?:By|Name|Title|Date|Email|Signature)\s*:/i.test(trimmed) || /^_{4,}$/.test(trimmed);
    if (isWitness || isHeading || isSigField) {
      afterHeading = isHeading || afterHeading;
      offset += line.length + 1;
      continue;
    }
    if (afterHeading && trimmed.length <= 80) {
      offset += line.length + 1;
      continue;
    }
    break;
  }
  return start + offset;
}

/** Count party signature block headings in the signature tail. */
export function countSignatureBlockHeadingsInTail(text: string): number {
  const start = signaturePatchStartIndex(text);
  const tail = start >= 0 ? text.slice(start) : text.slice(Math.floor(text.length * 0.72));
  return (tail.match(/^\s*(?:CLIENT|SERVICE PROVIDER|PARTY\s+\d+)\s*:/gim) || []).length;
}

/** Count execution-line anchors (`By:` or `Signature:`) in the signature tail. */
export function countSignatureExecutionLinesInTail(text: string): number {
  const start = signaturePatchStartIndex(text);
  const tail = start >= 0 ? text.slice(start) : text.slice(Math.floor(text.length * 0.72));
  return (tail.match(/^\s*(?:By|Signature)\s*:/gim) || []).length;
}

/** @deprecated Use {@link countSignatureExecutionLinesInTail}. */
export function countSignatureByLinesInTail(text: string): number {
  return countSignatureExecutionLinesInTail(text);
}

export function corpusHasVisibleSignatureExecutionLines(text: string): boolean {
  const trimmed = (text || "").trim();
  return countSignatureExecutionLinesInTail(trimmed) > 0;
}

export function corpusHasWitnessBlock(text: string): boolean {
  return /\bIN WITNESS WHEREOF\b/i.test((text || "").trim());
}

export function corpusSignatureBlocksHaveRequiredByLines(
  text: string,
  partyCount: number,
): boolean {
  const headings = countSignatureBlockHeadingsInTail(text);
  const executionLines = countSignatureExecutionLinesInTail(text);
  if (headings > 0) return executionLines >= headings;
  return executionLines >= Math.min(2, Math.max(1, partyCount));
}
