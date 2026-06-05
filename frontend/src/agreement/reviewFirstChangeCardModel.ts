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
    return [];
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

function phrasePartsAroundAdded(
  prev: ReviewFirstDiffPart[],
  prop: ReviewFirstDiffPart[],
  contextWords = 3,
): { previousParts: ReviewFirstDiffPart[]; proposedParts: ReviewFirstDiffPart[] } {
  const proposedParts = extractPhraseParts(prop, "added", contextWords);
  if (proposedParts.some((part) => part.kind === "added")) {
    const addedIdx = prop.map((part, index) => (part.kind === "added" ? index : -1)).filter((index) => index >= 0);
    const min = Math.min(...addedIdx);
    const max = Math.max(...addedIdx);
    let start = min;
    let end = max;
    let before = 0;
    for (let i = min - 1; i >= 0 && before < contextWords; i -= 1) {
      if (prop[i]?.kind !== "same") break;
      start = i;
      before += 1;
    }
    let after = 0;
    for (let i = max + 1; i < prop.length && after < contextWords; i += 1) {
      if (prop[i]?.kind !== "same") break;
      end = i;
      after += 1;
    }
    const proposedSlice = prop.slice(start, end + 1);
    let sameBefore = 0;
    for (let i = 0; i < start; i += 1) {
      if (prop[i]?.kind === "same") sameBefore += 1;
    }
    let prevStart = 0;
    let seenSame = 0;
    for (let i = 0; i < prev.length; i += 1) {
      if (prev[i]?.kind === "same") {
        if (seenSame === sameBefore) {
          prevStart = Math.max(0, i - before);
          break;
        }
        seenSame += 1;
      }
    }
    const previousSlice = prev.slice(prevStart, prevStart + proposedSlice.length);
    return {
      previousParts: previousSlice.length ? previousSlice : proposedSlice,
      proposedParts: proposedSlice,
    };
  }
  return {
    previousParts: extractPhraseParts(prev, "removed", contextWords),
    proposedParts: extractPhraseParts(prop, "added", contextWords),
  };
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
  const symmetric = phrasePartsAroundAdded(args.previousParts, args.proposedParts, 2);
  const phrasePreviousParts = symmetric.previousParts;
  const phraseProposedParts = symmetric.proposedParts;
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

export type SectionHeadingAnchor = {
  offset: number;
  label: string;
  depth: number;
};

const SUBSECTION_HEADING_RE =
  /(?:^|\n)(\d+(?:\.\d+)+\s+[A-Z][A-Za-z0-9\s,&;:'()/-]{2,96}?)(?=\.(?:\s|$|\n)|\n|$)/g;

const TOP_LEVEL_HEADING_RE =
  /(?:^|\n)(\d+\.\s+(?!\d)[A-Z][A-Za-z0-9\s,&;:'()/-]{2,96}?)(?=\.(?:\s|$|\n)|\n|$)/g;

/** Collect numbered headings with document offsets for nearest-before-phrase anchoring. */
export function extractSectionHeadingAnchors(corpus: string): SectionHeadingAnchor[] {
  const text = (corpus || "").replace(/\r\n/g, "\n");
  const headings: SectionHeadingAnchor[] = [];
  const seen = new Set<string>();

  const push = (match: RegExpExecArray) => {
    const label = match[1].replace(/\s+/g, " ").trim();
    const number = label.match(/^(\d+(?:\.\d+)*)/)?.[1] ?? "";
    const depth = number ? number.split(".").length : 1;
    const offset = match.index + (match[0].startsWith("\n") ? 1 : 0);
    const key = `${offset}:${label}`;
    if (seen.has(key)) return;
    seen.add(key);
    headings.push({ offset, label, depth });
  };

  for (const re of [SUBSECTION_HEADING_RE, TOP_LEVEL_HEADING_RE]) {
    re.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = re.exec(text)) !== null) {
      push(match);
    }
  }

  return headings.sort((a, b) => a.offset - b.offset || b.depth - a.depth);
}

function findAllPhraseOffsets(corpus: string, changedPhrase: string): number[] {
  const phrase = changedPhrase.trim();
  if (!phrase || !corpus) return [];
  const offsets: number[] = [];
  let from = 0;
  while (from < corpus.length) {
    const idx = corpus.indexOf(phrase, from);
    if (idx < 0) break;
    offsets.push(idx);
    from = idx + Math.max(1, phrase.length);
  }
  if (offsets.length) return offsets;
  const escaped = phrase.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/\s+/g, "\\s+");
  const re = new RegExp(escaped, "gi");
  let match: RegExpExecArray | null;
  while ((match = re.exec(corpus)) !== null) {
    offsets.push(match.index);
  }
  return offsets;
}

function headingAnchorBeforeOffset(headings: SectionHeadingAnchor[], offset: number): SectionHeadingAnchor | null {
  if (offset < 0 || !headings.length) return null;
  const eligible = headings.filter((heading) => heading.offset <= offset);
  if (!eligible.length) return null;
  return eligible.sort((a, b) => a.offset - b.offset || b.depth - a.depth).at(-1) ?? null;
}

function resolveHeadingFromPhraseOffsets(headings: SectionHeadingAnchor[], offsets: number[]): string {
  let best: SectionHeadingAnchor | null = null;
  for (const offset of offsets) {
    const anchor = headingAnchorBeforeOffset(headings, offset);
    if (!anchor) continue;
    if (
      !best ||
      anchor.depth > best.depth ||
      (anchor.depth === best.depth && anchor.offset > best.offset)
    ) {
      best = anchor;
    }
  }
  return best?.label ?? "";
}

export type ResolveClauseLabelArgs = {
  previous: string;
  proposed: string;
  changedPhrase?: string;
};

/**
 * Resolve the clause label from the nearest authoritative heading that precedes the changed phrase.
 * Never returns the first heading in the document unless the change actually lives there.
 */
export function resolveClauseLabel(args: ResolveClauseLabelArgs): string {
  const phrase = (args.changedPhrase || "").trim();
  const corpora = [args.proposed, args.previous].filter((text) => (text || "").trim().length > 0);

  for (const corpus of corpora) {
    const normalized = corpus.replace(/\r\n/g, "\n");
    const headings = extractSectionHeadingAnchors(normalized);
    const nearest = resolveHeadingFromPhraseOffsets(headings, findAllPhraseOffsets(normalized, phrase));
    if (nearest) return nearest;
  }

  for (const corpus of corpora) {
    const lines = corpus
      .replace(/\r\n/g, "\n")
      .split("\n")
      .map((line) => line.replace(/\s+/g, " ").trim())
      .filter(Boolean);
    for (const line of lines) {
      if (/^(schedule|section|article)\b/i.test(line)) {
        return line.length > 90 ? `${line.slice(0, 90).trim()}...` : line;
      }
    }
  }
  return "";
}

export function clauseContextSnippet(text: string, maxChars = 140, anchorPhrase = ""): string {
  const normalized = text.replace(/\s+/g, " ").trim();
  if (anchorPhrase.trim()) {
    const anchorIdx = normalized.toLowerCase().indexOf(anchorPhrase.trim().toLowerCase());
    if (anchorIdx >= 0) {
      const left = normalized.slice(0, anchorIdx);
      const sentenceStart = Math.max(
        left.lastIndexOf(". ") + 2,
        left.lastIndexOf("! ") + 2,
        left.lastIndexOf("? ") + 2,
        0,
      );
      const sentenceEnd = normalized.slice(anchorIdx).search(/[.!?](?:\s|$)/);
      const sentence =
        sentenceEnd >= 0
          ? normalized.slice(sentenceStart, anchorIdx + sentenceEnd + 1).trim()
          : normalized.slice(sentenceStart).trim();
      if (sentence.length >= 24) {
        if (sentence.length <= maxChars) return sentence;
        return `${sentence.slice(0, maxChars - 1).trim()}…`;
      }
    }
  }
  const line = normalized
    .split(/(?<=[.!?])\s+/)
    .find((part) => part.length >= 24);
  const snippet = (line ?? normalized).trim();
  if (snippet.length <= maxChars) return snippet;
  return `${snippet.slice(0, maxChars - 1).trim()}…`;
}
