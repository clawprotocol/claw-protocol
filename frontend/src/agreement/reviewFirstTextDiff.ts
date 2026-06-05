import {
  buildPhraseDelta,
  clauseContextSnippet,
  resolveClauseLabel,
  type ReviewFirstChangeMagnitude,
} from "./reviewFirstChangeCardModel";
import { normalizeReviewFirstAgreementText } from "./reviewFirstPasteNormalization";

export type ReviewFirstChangedSection = {
  title: string;
  summary: string;
  /** Detected clause/section heading, when available. */
  clauseTitle: string;
  /** Preferred clause label (e.g. "3.2 Invoicing and Payment Timing"). */
  clauseLabel: string;
  /** Smallest meaningful changed phrase — primary review artifact. */
  beforePhrase: string;
  afterPhrase: string;
  phrasePreviousParts: ReviewFirstDiffPart[];
  phraseProposedParts: ReviewFirstDiffPart[];
  changeMagnitude: ReviewFirstChangeMagnitude;
  /** One-line clause preview for optional expansion. */
  clauseContextSnippet: string;
  previous: string;
  proposed: string;
  fullPrevious: string;
  fullProposed: string;
  previousParts: ReviewFirstDiffPart[];
  proposedParts: ReviewFirstDiffPart[];
  added: string[];
  removed: string[];
  classificationPriority: number;
};

export type ReviewFirstDiffPart = {
  text: string;
  kind: "same" | "added" | "removed";
};

export type ReviewFirstTextDiffSummary = {
  hasMaterialChanges: boolean;
  status: "empty" | "no_change" | "changed";
  summary: string;
  changedSections: ReviewFirstChangedSection[];
  normalizedPrevious: string;
  normalizedProposed: string;
  /** True when PDF/header/footer or formatting noise was stripped before compare. */
  formattingArtifactsIgnored: boolean;
};

export const REVIEW_FIRST_FORMATTING_ARTIFACTS_NOTE =
  "Formatting/header changes ignored.";

function normalizeLineForComparison(line: string): string {
  return line
    .replace(/[\u2018\u2019\u2032]/g, "'")
    .replace(/[\u201c\u201d\u2033]/g, '"')
    .replace(/[\u2013\u2014]/g, "-")
    .replace(/^\s*[-*+]\s+/g, "- ")
    .replace(/^\s*(?:\d+|[a-zA-Z])[\.)]\s+/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLocaleLowerCase();
}

export function normalizeReviewTextForComparison(text: string): string {
  const normalized = (text || "")
    .replace(/\r\n?/g, "\n")
    .replace(/\u00a0/g, " ")
    .replace(/[\u2018\u2019\u2032]/g, "'")
    .replace(/[\u201c\u201d\u2033]/g, '"')
    .replace(/[\u2013\u2014]/g, "-")
    .split("\n")
    .map((line) => normalizeLineForComparison(line))
    .filter(Boolean);
  return normalized.join(" ");
}

function displayBlocks(text: string): string[] {
  return (text || "")
    .replace(/\r\n?/g, "\n")
    .replace(/\u00a0/g, " ")
    .replace(/[\u2018\u2019\u2032]/g, "'")
    .replace(/[\u201c\u201d\u2033]/g, '"')
    .replace(/[\u2013\u2014]/g, "-")
    .split(/\n\s*\n|\n(?=\s*(?:SCHEDULE|SECTION|ARTICLE)\b)|\n(?=\s*\d+\.\s)/i)
    .map((block) =>
      block
        .split("\n")
        .map((line) => line.replace(/\s+/g, " ").trim())
        .filter(Boolean)
        .join("\n"),
    )
    .filter(Boolean);
}

function blockKey(block: string): string {
  return normalizeReviewTextForComparison(block).replace(/\n+/g, " ").trim();
}

function tokenKey(token: string): string {
  return normalizeReviewTextForComparison(token).replace(/^[,.;:()[\]{}"']+|[,.;:()[\]{}"']+$/g, "");
}

function wordingTokens(text: string): string[] {
  return (text || "").replace(/\s+/g, " ").trim().match(/\S+/g) ?? [];
}

function lcsPairs(previousKeys: string[], proposedKeys: string[]): Array<[number, number]> {
  const rows = previousKeys.length;
  const cols = proposedKeys.length;
  const dp = Array.from({ length: rows + 1 }, () => Array<number>(cols + 1).fill(0));
  for (let i = rows - 1; i >= 0; i -= 1) {
    for (let j = cols - 1; j >= 0; j -= 1) {
      dp[i][j] = previousKeys[i] === proposedKeys[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
    }
  }
  const pairs: Array<[number, number]> = [];
  let i = 0;
  let j = 0;
  while (i < rows && j < cols) {
    if (previousKeys[i] === proposedKeys[j]) {
      pairs.push([i, j]);
      i += 1;
      j += 1;
    } else if (dp[i + 1][j] >= dp[i][j + 1]) {
      i += 1;
    } else {
      j += 1;
    }
  }
  return pairs;
}

function joinTokenParts(parts: ReviewFirstDiffPart[], maxChars = 280): string {
  const joined = parts
    .map((part) => part.text)
    .join(" ")
    .replace(/\s+([,.;:!?])/g, "$1")
    .trim();
  if (joined.length <= maxChars) return joined;
  const startsClipped = joined.startsWith("...");
  const endsClipped = joined.endsWith("...");
  const core = joined.replace(/^\.\.\.\s*/, "").replace(/\s*\.\.\.$/, "");
  const clipped = core.slice(0, maxChars - (startsClipped ? 4 : 0) - 2).trim();
  return `${startsClipped ? "... " : ""}${clipped}${endsClipped || core.length > clipped.length ? "..." : ""}`;
}

function compactParts(parts: ReviewFirstDiffPart[], changedKind: "added" | "removed"): ReviewFirstDiffPart[] {
  const changed = parts
    .map((part, index) => (part.kind === changedKind ? index : -1))
    .filter((index) => index >= 0);
  if (!changed.length) return [];
  const keep = new Set<number>();
  const context = 3;
  for (const index of changed) {
    for (let i = Math.max(0, index - context); i <= Math.min(parts.length - 1, index + context); i += 1) {
      keep.add(i);
    }
  }
  const compacted: ReviewFirstDiffPart[] = [];
  let last = -1;
  for (const index of [...keep].sort((a, b) => a - b)) {
    if (last >= 0 && index > last + 1) compacted.push({ text: "...", kind: "same" });
    else if (last === -1 && index > 0) compacted.push({ text: "...", kind: "same" });
    compacted.push(parts[index]);
    last = index;
  }
  if (last < parts.length - 1) compacted.push({ text: "...", kind: "same" });
  return compacted;
}

function buildRawInlineDiff(previous: string, proposed: string): {
  previousParts: ReviewFirstDiffPart[];
  proposedParts: ReviewFirstDiffPart[];
  removed: string[];
  added: string[];
} {
  const previousTokens = wordingTokens(previous);
  const proposedTokens = wordingTokens(proposed);
  const pairs = lcsPairs(previousTokens.map(tokenKey), proposedTokens.map(tokenKey));
  const previousParts: ReviewFirstDiffPart[] = [];
  const proposedParts: ReviewFirstDiffPart[] = [];
  let prevCursor = 0;
  let propCursor = 0;
  for (const [prevMatch, propMatch] of pairs) {
    for (let i = prevCursor; i < prevMatch; i += 1) previousParts.push({ text: previousTokens[i], kind: "removed" });
    for (let i = propCursor; i < propMatch; i += 1) proposedParts.push({ text: proposedTokens[i], kind: "added" });
    previousParts.push({ text: previousTokens[prevMatch], kind: "same" });
    proposedParts.push({ text: proposedTokens[propMatch], kind: "same" });
    prevCursor = prevMatch + 1;
    propCursor = propMatch + 1;
  }
  for (let i = prevCursor; i < previousTokens.length; i += 1) previousParts.push({ text: previousTokens[i], kind: "removed" });
  for (let i = propCursor; i < proposedTokens.length; i += 1) proposedParts.push({ text: proposedTokens[i], kind: "added" });
  return {
    previousParts,
    proposedParts,
    removed: previousParts.filter((part) => part.kind === "removed").map((part) => part.text),
    added: proposedParts.filter((part) => part.kind === "added").map((part) => part.text),
  };
}

function buildInlineDiff(previous: string, proposed: string): {
  previousParts: ReviewFirstDiffPart[];
  proposedParts: ReviewFirstDiffPart[];
  removed: string[];
  added: string[];
  rawPreviousParts: ReviewFirstDiffPart[];
  rawProposedParts: ReviewFirstDiffPart[];
} {
  const raw = buildRawInlineDiff(previous, proposed);
  return {
    previousParts: compactParts(raw.previousParts, "removed"),
    proposedParts: compactParts(raw.proposedParts, "added"),
    removed: raw.removed,
    added: raw.added,
    rawPreviousParts: raw.previousParts,
    rawProposedParts: raw.proposedParts,
  };
}

function sectionTitle(previous: string, proposed: string): string {
  const candidate = [proposed, previous]
    .flatMap((body) => body.split("\n"))
    .map((line) => line.trim())
    .find((line) => /^(schedule|section|article)\b/i.test(line));
  if (candidate) return candidate.length > 90 ? `${candidate.slice(0, 90).trim()}...` : candidate;
  return "";
}

const PAYMENT_TIMING_CHANGE_RE =
  /\b(?:thirty|fifteen|twenty|ten|forty|sixty|ninety|\d+)\s*\(\s*\d+\s*\)\s*days?\b|\bwithin\s+(?:thirty|fifteen|twenty|ten|\d+)\s*(?:\(\s*\d+\s*\)\s*)?days?\b|\bnet\s*\d+\b/i;

const OWNERSHIP_CHANGE_RE =
  /\b(?:ownership|owns?\s+the|work\s+product|intellectual\s+property|title\s+to|assigns?\s+(?:to|all)|deliverables)\b/i;

const PAYMENT_CONTEXT_RE = /\b(?:payment|fee|invoice|invoic|compensation|net\s*\d+|due)\b/i;

function isPaymentTimingChange(changeHaystack: string, contextHaystack: string): boolean {
  if (!PAYMENT_CONTEXT_RE.test(contextHaystack) && !/\bschedule a\b/.test(contextHaystack)) return false;
  if (PAYMENT_TIMING_CHANGE_RE.test(changeHaystack)) return true;
  const spelledDayCountChanged = /\b(?:thirty|fifteen|twenty|ten|forty|sixty|ninety)\b/.test(changeHaystack);
  const numericDayCountChanged =
    /\b\d+\b/.test(changeHaystack) &&
    (/\bdays?\b/.test(changeHaystack) ||
      /\(\s*\d+\s*\)/.test(changeHaystack) ||
      /\bwithin\b/.test(contextHaystack) ||
      /\bschedule a\b/.test(contextHaystack));
  return spelledDayCountChanged || numericDayCountChanged;
}

function isOwnershipClauseChange(clauseTitle: string, changeHaystack: string, contextHaystack: string): boolean {
  const ownershipHeading = /\b(?:ownership|work\s+product|intellectual\s+property)\b/i.test(clauseTitle);
  const ownershipContext = ownershipHeading || OWNERSHIP_CHANGE_RE.test(contextHaystack.slice(0, 160));
  if (!ownershipContext) return false;
  return (
    OWNERSHIP_CHANGE_RE.test(changeHaystack) ||
    /\b(?:owns?|assigns?|deliverables|work\s+product|intellectual\s+property|company|client)\b/.test(changeHaystack)
  );
}

function sectionLabel(
  clauseTitle: string,
  previous: string,
  proposed: string,
  changed: { added: string[]; removed: string[] },
): { label: string; priority: number } {
  const changeHaystack = [...changed.added, ...changed.removed].join(" ").toLocaleLowerCase();
  const contextHaystack = `${clauseTitle} ${previous} ${proposed}`.toLocaleLowerCase();

  if (isPaymentTimingChange(changeHaystack, contextHaystack)) {
    return { label: "Payment timing changed", priority: 8 };
  }
  if (/\bschedule a\b/.test(contextHaystack)) {
    return { label: "Payment terms changed", priority: 10 };
  }
  if (isOwnershipClauseChange(clauseTitle, changeHaystack, contextHaystack)) {
    return { label: "Ownership changed", priority: 30 };
  }
  if (
    /\b(?:party|parties)\b/.test(contextHaystack) &&
    /\b(?:llc|inc|corp|company|client|provider|contractor|between)\b/.test(changeHaystack)
  ) {
    return { label: "Party changed", priority: 22 };
  }
  if (PAYMENT_CONTEXT_RE.test(contextHaystack) && PAYMENT_CONTEXT_RE.test(changeHaystack)) {
    return { label: "Payment terms changed", priority: 10 };
  }
  if (/\b(purpose|scope|services|statement of work|sow)\b/.test(contextHaystack)) {
    return { label: "Purpose and scope changed", priority: 20 };
  }
  if (/\b(?:deliverable|deliverables|milestone|acceptance criteria)\b/.test(contextHaystack)) {
    return { label: "Deliverable changed", priority: 35 };
  }
  if (/\b(?:work\s+product)\b/.test(contextHaystack) && !isOwnershipClauseChange(clauseTitle, changeHaystack, contextHaystack)) {
    return { label: "Work product changed", priority: 32 };
  }
  if (/\b(?:term|duration|renewal|initial term)\b/.test(contextHaystack) && !/\b(?:terminate|termination)\b/.test(changeHaystack)) {
    return { label: "Term changed", priority: 45 };
  }
  if (/\b(support|response|escalation|handoff|acceptance)\b/.test(contextHaystack)) {
    return { label: "Support terms changed", priority: 40 };
  }
  if (/\b(terminate|termination|cancel)\b/.test(contextHaystack)) {
    return { label: "Termination terms changed", priority: 50 };
  }
  if (/\b(confidential|confidentiality|non-disclosure)\b/.test(contextHaystack)) {
    return { label: "Confidentiality changed", priority: 60 };
  }
  if (/\b(liability|indemn|damages|warranty)\b/.test(contextHaystack)) {
    return { label: "Liability changed", priority: 70 };
  }
  if (/\b(signature|signed by|signer)\b/.test(contextHaystack)) {
    return { label: "Signer name changed", priority: 100 };
  }
  return { label: "Agreement wording changed", priority: 90 };
}

function buildChangedSection(args: {
  changedPrevious: string;
  changedProposed: string;
  fullPreviousText?: string;
  fullProposedText?: string;
  label: { label: string; priority: number };
  rawTitle: string;
  inline: ReturnType<typeof buildInlineDiff>;
}): ReviewFirstChangedSection {
  const { changedPrevious, changedProposed, label, rawTitle, inline } = args;
  const previousParts = inline.previousParts.length
    ? inline.previousParts
    : [{ text: "(No prior wording)", kind: "removed" as const }];
  const proposedParts = inline.proposedParts.length
    ? inline.proposedParts
    : [{ text: "(Removed)", kind: "added" as const }];
  const phrase = buildPhraseDelta({
    previousParts: inline.rawPreviousParts,
    proposedParts: inline.rawProposedParts,
    fullPrevious: changedPrevious,
    fullProposed: changedProposed,
    buildInlineParts: (before, after) => {
      const raw = buildRawInlineDiff(before, after);
      return { previousParts: raw.previousParts, proposedParts: raw.proposedParts };
    },
  });
  const clauseLabel =
    resolveClauseLabel({
      previous: args.fullPreviousText ?? changedPrevious,
      proposed: args.fullProposedText ?? changedProposed,
      changedPhrase: phrase.beforePhrase || phrase.afterPhrase,
    }) || rawTitle;
  return {
    title: label.label,
    summary: label.label,
    clauseTitle: rawTitle,
    clauseLabel,
    beforePhrase: phrase.beforePhrase,
    afterPhrase: phrase.afterPhrase,
    phrasePreviousParts: phrase.phrasePreviousParts,
    phraseProposedParts: phrase.phraseProposedParts,
    changeMagnitude: phrase.changeMagnitude,
    clauseContextSnippet: clauseContextSnippet(
      args.fullProposedText || changedProposed || changedPrevious,
      140,
      phrase.afterPhrase || phrase.beforePhrase,
    ),
    previous: phrase.beforePhrase || joinTokenParts(previousParts) || "(No prior wording)",
    proposed: phrase.afterPhrase || joinTokenParts(proposedParts) || "(Removed)",
    fullPrevious: changedPrevious || "(No prior wording)",
    fullProposed: changedProposed || "(Removed)",
    previousParts,
    proposedParts,
    added: inline.added,
    removed: inline.removed,
    classificationPriority: label.priority,
  };
}

export function getChangedReviewSections(previousText: string, proposedText: string): ReviewFirstChangedSection[] {
  const previousBlocks = displayBlocks(previousText);
  const proposedBlocks = displayBlocks(proposedText);
  const previousKeys = previousBlocks.map(blockKey);
  const proposedKeys = proposedBlocks.map(blockKey);
  const anchors = lcsPairs(previousKeys, proposedKeys);
  const sections: ReviewFirstChangedSection[] = [];
  let previousCursor = 0;
  let proposedCursor = 0;
  const flush = (previousEnd: number, proposedEnd: number) => {
    const changedPrevious = previousBlocks.slice(previousCursor, previousEnd).join("\n\n").trim();
    const changedProposed = proposedBlocks.slice(proposedCursor, proposedEnd).join("\n\n").trim();
    previousCursor = previousEnd + 1;
    proposedCursor = proposedEnd + 1;
    if (!changedPrevious && !changedProposed) return;
    const rawTitle = sectionTitle(changedPrevious, changedProposed);
    const inline = buildInlineDiff(changedPrevious, changedProposed);
    const label = sectionLabel(rawTitle, changedPrevious, changedProposed, inline);
    sections.push(
      buildChangedSection({
        changedPrevious,
        changedProposed,
        fullPreviousText: previousText,
        fullProposedText: proposedText,
        label,
        rawTitle,
        inline,
      }),
    );
  };

  for (const [previousAnchor, proposedAnchor] of anchors) {
    if (previousAnchor > previousCursor || proposedAnchor > proposedCursor) {
      flush(previousAnchor, proposedAnchor);
    } else {
      previousCursor = previousAnchor + 1;
      proposedCursor = proposedAnchor + 1;
    }
  }
  if (previousCursor < previousBlocks.length || proposedCursor < proposedBlocks.length) {
    const previousEnd = previousBlocks.length;
    const proposedEnd = proposedBlocks.length;
    const changedPrevious = previousBlocks.slice(previousCursor, previousEnd).join("\n\n").trim();
    const changedProposed = proposedBlocks.slice(proposedCursor, proposedEnd).join("\n\n").trim();
    if (changedPrevious || changedProposed) {
      const rawTitle = sectionTitle(changedPrevious, changedProposed);
      const inline = buildInlineDiff(changedPrevious, changedProposed);
      const label = sectionLabel(rawTitle, changedPrevious, changedProposed, inline);
      sections.push(
        buildChangedSection({
          changedPrevious,
          changedProposed,
          fullPreviousText: previousText,
          fullProposedText: proposedText,
          label,
          rawTitle,
          inline,
        }),
      );
    }
  }
  return sections.sort((a, b) => a.classificationPriority - b.classificationPriority);
}

export function buildReviewFirstTextDiffSummary(previousText: string, proposedText: string): ReviewFirstTextDiffSummary {
  const preparedPrevious = normalizeReviewFirstAgreementText(previousText);
  const preparedProposed = normalizeReviewFirstAgreementText(proposedText);
  const formattingArtifactsIgnored =
    preparedPrevious.hadFormattingArtifacts || preparedProposed.hadFormattingArtifacts;
  const normalizedPrevious = normalizeReviewTextForComparison(preparedPrevious.text);
  const normalizedProposed = normalizeReviewTextForComparison(preparedProposed.text);
  if (!normalizedProposed) {
    return {
      hasMaterialChanges: false,
      status: "empty",
      summary: "Paste the complete updated agreement to compare wording changes.",
      changedSections: [],
      normalizedPrevious,
      normalizedProposed,
      formattingArtifactsIgnored,
    };
  }
  if (normalizedPrevious === normalizedProposed) {
    return {
      hasMaterialChanges: false,
      status: "no_change",
      summary: "No wording changes found.",
      changedSections: [],
      normalizedPrevious,
      normalizedProposed,
      formattingArtifactsIgnored,
    };
  }
  const changedSections = getChangedReviewSections(preparedPrevious.text, preparedProposed.text);
  const count = changedSections.length || 1;
  return {
    hasMaterialChanges: true,
    status: "changed",
    summary: count === 1 ? "1 material wording update found." : `${count} material wording updates found.`,
    changedSections,
    normalizedPrevious,
    normalizedProposed,
    formattingArtifactsIgnored,
  };
}

export function canReviewChanges(args: {
  diff: ReviewFirstTextDiffSummary | null;
  proposedText: string;
}): boolean {
  return Boolean(args.proposedText.trim() && args.diff?.hasMaterialChanges);
}

export function canSubmitReviewFirstProposal(args: {
  diff: ReviewFirstTextDiffSummary | null;
  hasReviewerAttribution: boolean;
  comparisonPreviewRendered: boolean;
}): boolean {
  return Boolean(args.diff?.hasMaterialChanges && args.hasReviewerAttribution && args.comparisonPreviewRendered);
}

/** Dev/test QA only — logs review-first proposal readiness (compare vs submit gates). */
export function logReviewFirstProposalReadiness(payload: {
  hasProposedText: boolean;
  hasMaterialChanges: boolean;
  hasParticipantAttribution: boolean;
  canReviewChanges: boolean;
  canSubmitProposedUpdate: boolean;
  submitBlockReason?: string | null;
  normalizedOriginalLength: number;
  normalizedProposedLength: number;
}): void {
  if (typeof import.meta !== "undefined" && import.meta.env?.MODE === "production") return;
  if (typeof window === "undefined") return;
  const on =
    Boolean(typeof import.meta !== "undefined" && import.meta.env?.DEV) ||
    import.meta.env?.MODE === "test" ||
    window.localStorage?.getItem("lawdogReviewFirstCompareDiag") === "1";
  if (!on) return;
  // eslint-disable-next-line no-console
  console.info("[review-first-proposal-readiness]", payload);
}

/** Dev/test QA only — logs review-first proposal compare diagnostics. */
export function logReviewFirstProposalCompareDiag(payload: {
  normalizedOriginalLen: number;
  normalizedProposalLen: number;
  changedSectionCount: number;
  comparisonGenerated: boolean;
  integrityIsCompleteNoOp: boolean;
  proposalReadyState: boolean;
}): void {
  if (typeof import.meta !== "undefined" && import.meta.env?.MODE === "production") return;
  if (typeof window === "undefined") return;
  const on =
    Boolean(typeof import.meta !== "undefined" && import.meta.env?.DEV) ||
    window.localStorage?.getItem("lawdogReviewFirstCompareDiag") === "1";
  if (!on) return;
  // eslint-disable-next-line no-console
  console.info("[review-first-proposal-compare]", payload);
}
