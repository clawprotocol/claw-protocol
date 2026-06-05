import type { ReviewFirstDiffPart } from "./reviewFirstTextDiff";

export type ReviewFirstChangeMagnitude = "phrase" | "clause" | "section";

export type ReviewFirstPhraseDelta = {
  beforePhrase: string;
  afterPhrase: string;
  phrasePreviousParts: ReviewFirstDiffPart[];
  phraseProposedParts: ReviewFirstDiffPart[];
  changeMagnitude: ReviewFirstChangeMagnitude;
};

function joinPhraseParts(parts: ReviewFirstDiffPart[]): string {
  return parts
    .map((part) => part.text)
    .join(" ")
    .replace(/\s+([,.;:!?])/g, "$1")
    .trim();
}

/** Pull a tight phrase window around changed tokens with limited same-token context. */
export function extractPhraseParts(
  parts: ReviewFirstDiffPart[],
  changedKind: "removed" | "added",
  contextWords = 2,
): ReviewFirstDiffPart[] {
  const changedIdx = parts
    .map((part, index) => (part.kind === changedKind ? index : -1))
    .filter((index) => index >= 0);
  if (!changedIdx.length) {
    return parts.slice(0, Math.min(parts.length, 10));
  }
  const min = Math.min(...changedIdx);
  const max = Math.max(...changedIdx);
  let start = min;
  let end = max;
  let before = 0;
  for (let i = min - 1; i >= 0 && before < contextWords; i -= 1) {
    if (parts[i]?.kind !== "same") break;
    start = i;
    before += 1;
  }
  let after = 0;
  for (let i = max + 1; i < parts.length && after < contextWords; i += 1) {
    if (parts[i]?.kind !== "same") break;
    end = i;
    after += 1;
  }
  return parts.slice(start, end + 1);
}

function wordingTokens(text: string): string[] {
  return (text || "").replace(/\s+/g, " ").trim().match(/\S+/g) ?? [];
}

function tokenKey(token: string): string {
  return token.toLowerCase().replace(/^[,.;:()[\]{}"']+|[,.;:()[\]{}"']+$/g, "");
}

/** Trim phrase windows to the smallest aligned span around changed tokens. */
export function tightenPhrasePair(beforePhrase: string, afterPhrase: string, contextWords = 2): {
  beforePhrase: string;
  afterPhrase: string;
} {
  const prevTokens = wordingTokens(beforePhrase);
  const propTokens = wordingTokens(afterPhrase);
  if (!prevTokens.length || !propTokens.length) {
    return { beforePhrase, afterPhrase };
  }
  let prefix = 0;
  while (
    prefix < prevTokens.length &&
    prefix < propTokens.length &&
    tokenKey(prevTokens[prefix]) === tokenKey(propTokens[prefix])
  ) {
    prefix += 1;
  }
  let suffix = 0;
  while (
    suffix < prevTokens.length - prefix &&
    suffix < propTokens.length - prefix &&
    tokenKey(prevTokens[prevTokens.length - 1 - suffix]) === tokenKey(propTokens[propTokens.length - 1 - suffix])
  ) {
    suffix += 1;
  }
  const start = Math.max(0, prefix - contextWords);
  const prevEnd = suffix > 0 ? prevTokens.length - suffix + contextWords : prevTokens.length;
  const propEnd = suffix > 0 ? propTokens.length - suffix + contextWords : propTokens.length;
  return {
    beforePhrase: prevTokens.slice(start, Math.min(prevEnd, prevTokens.length)).join(" ").replace(/\s+([,.;:!?])/g, "$1"),
    afterPhrase: propTokens.slice(start, Math.min(propEnd, propTokens.length)).join(" ").replace(/\s+([,.;:!?])/g, "$1"),
  };
}

export function inferChangeMagnitude(
  beforePhrase: string,
  afterPhrase: string,
  fullPrevious: string,
  fullProposed: string,
): ReviewFirstChangeMagnitude {
  const phraseLen = Math.max(beforePhrase.length, afterPhrase.length);
  const fullLen = Math.max(fullPrevious.length, fullProposed.length, 1);
  const phraseTokens = Math.max(wordingTokens(beforePhrase).length, wordingTokens(afterPhrase).length);
  if (phraseLen <= 120 && phraseTokens <= 16 && phraseLen / fullLen <= 0.75) return "phrase";
  if (phraseLen <= 280) return "clause";
  return "section";
}

const ALIGNED_PHRASE_PATTERNS = [
  /\bwithin\s+.+?\s+days?\s+after\s+receipt\b/i,
  /\b(?:thirty|fifteen|twenty|ten|forty|sixty|ninety|\d+)\s*\(\s*\d+\s*\)\s*days?\b/i,
  /\bfees?\s+paid\s+in\s+the\s+prior\s+.+?\s+months?\b/i,
  /\binitial\s+term\s+is\s+.+?\s+months?\b/i,
];

function alignedPatternPhrase(fullPrevious: string, fullProposed: string): { beforePhrase: string; afterPhrase: string } | null {
  for (const pattern of ALIGNED_PHRASE_PATTERNS) {
    const before = fullPrevious.match(pattern);
    const after = fullProposed.match(pattern);
    if (before?.[0] && after?.[0] && before[0] !== after[0]) {
      return { beforePhrase: before[0].trim(), afterPhrase: after[0].trim() };
    }
  }
  return null;
}

export function buildPhraseDelta(args: {
  previousParts: ReviewFirstDiffPart[];
  proposedParts: ReviewFirstDiffPart[];
  fullPrevious: string;
  fullProposed: string;
  buildInlineParts?: (before: string, after: string) => {
    previousParts: ReviewFirstDiffPart[];
    proposedParts: ReviewFirstDiffPart[];
  };
}): ReviewFirstPhraseDelta {
  const anchored = alignedPatternPhrase(args.fullPrevious, args.fullProposed);
  const phrasePreviousParts = extractPhraseParts(args.previousParts, "removed", 2);
  const phraseProposedParts = extractPhraseParts(args.proposedParts, "added", 2);
  const rawBeforePhrase =
    anchored?.beforePhrase || joinPhraseParts(phrasePreviousParts) || args.fullPrevious.slice(0, 120).trim();
  const rawAfterPhrase =
    anchored?.afterPhrase || joinPhraseParts(phraseProposedParts) || args.fullProposed.slice(0, 120).trim();
  const tightened = anchored ?? tightenPhrasePair(rawBeforePhrase, rawAfterPhrase, 2);
  const beforePhrase = tightened.beforePhrase;
  const afterPhrase = tightened.afterPhrase;
  const inlineParts = args.buildInlineParts?.(beforePhrase, afterPhrase);
  const displayPreviousParts = inlineParts?.previousParts.length
    ? inlineParts.previousParts
    : expandPhrasePartsToPhrase(phrasePreviousParts, beforePhrase);
  const displayProposedParts = inlineParts?.proposedParts.length
    ? inlineParts.proposedParts
    : expandPhrasePartsToPhrase(phraseProposedParts, afterPhrase);
  return {
    beforePhrase,
    afterPhrase,
    phrasePreviousParts: displayPreviousParts,
    phraseProposedParts: displayProposedParts,
    changeMagnitude: inferChangeMagnitude(beforePhrase, afterPhrase, args.fullPrevious, args.fullProposed),
  };
}

function expandPhrasePartsToPhrase(parts: ReviewFirstDiffPart[], phrase: string): ReviewFirstDiffPart[] {
  const phraseTokens = wordingTokens(phrase);
  if (!phraseTokens.length) return parts;
  const rebuilt: ReviewFirstDiffPart[] = [];
  for (const token of phraseTokens) {
    const match = parts.find((part) => part.text === token);
    rebuilt.push(match ?? { text: token, kind: "same" });
  }
  return rebuilt;
}

/** Prefer numbered clause headings like "3.2 Invoicing and Payment Timing". */
export function resolveClauseLabel(previous: string, proposed: string): string {
  const candidates = [...previous.split("\n"), ...proposed.split("\n")]
    .map((line) => line.replace(/\s+/g, " ").trim())
    .filter(Boolean);

  for (const line of candidates) {
    const numberedSection = line.match(/^(\d+(?:\.\d+)+\s+[^.]{3,90})/);
    if (numberedSection) return numberedSection[1].trim();
  }
  for (const line of candidates) {
    const numberedClause = line.match(/^(\d+\.\s+[^.]{3,72})/);
    if (numberedClause) return numberedClause[1].trim();
  }
  for (const line of candidates) {
    if (/^(schedule|section|article)\b/i.test(line)) {
      return line.length > 90 ? `${line.slice(0, 90).trim()}...` : line;
    }
    if (/^(ownership|payment|termination|liability|confidentiality|parties)\b/i.test(line)) {
      return line.length > 90 ? `${line.slice(0, 90).trim()}...` : line;
    }
  }
  return "";
}

export function clauseContextSnippet(text: string, maxChars = 140): string {
  const line = text
    .replace(/\s+/g, " ")
    .trim()
    .split(/(?<=[.!?])\s+/)
    .find((part) => part.length >= 24);
  const snippet = (line ?? text.replace(/\s+/g, " ").trim()).trim();
  if (snippet.length <= maxChars) return snippet;
  return `${snippet.slice(0, maxChars - 1).trim()}…`;
}
