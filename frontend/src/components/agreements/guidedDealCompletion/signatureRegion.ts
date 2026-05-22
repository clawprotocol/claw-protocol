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
