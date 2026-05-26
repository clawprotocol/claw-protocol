export type ReviewFirstChangedSection = {
  title: string;
  summary: string;
  previous: string;
  proposed: string;
  fullPrevious: string;
  fullProposed: string;
  previousParts: ReviewFirstDiffPart[];
  proposedParts: ReviewFirstDiffPart[];
  added: string[];
  removed: string[];
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
};

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
    .split(/\n\s*\n|\n(?=\s*(?:SCHEDULE|SECTION|ARTICLE)\b)/i)
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

function joinTokenParts(parts: ReviewFirstDiffPart[]): string {
  return parts
    .map((part) => part.text)
    .join(" ")
    .replace(/\s+([,.;:!?])/g, "$1")
    .trim();
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

function buildInlineDiff(previous: string, proposed: string): {
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

  const compactPreviousParts = compactParts(previousParts, "removed");
  const compactProposedParts = compactParts(proposedParts, "added");
  return {
    previousParts: compactPreviousParts,
    proposedParts: compactProposedParts,
    removed: previousParts.filter((part) => part.kind === "removed").map((part) => part.text),
    added: proposedParts.filter((part) => part.kind === "added").map((part) => part.text),
  };
}

function sectionTitle(previous: string, proposed: string, index: number): string {
  const candidate = [proposed, previous]
    .flatMap((body) => body.split("\n"))
    .map((line) => line.trim())
    .find((line) => /^(schedule|section|article)\b/i.test(line));
  if (candidate) return candidate.length > 90 ? `${candidate.slice(0, 90).trim()}...` : candidate;
  return index === 0 ? "Updated wording" : `Updated wording ${index + 1}`;
}

function sectionSummary(title: string, previous: string, proposed: string): string {
  const haystack = `${title} ${previous} ${proposed}`.toLocaleLowerCase();
  if (/\b(owner|owns|ownership|deliverables|work product|intellectual property|ip)\b/.test(haystack)) {
    return "Ownership clause revised";
  }
  if (/\b(payment|fee|invoice|net \d+|compensation|due|schedule a)\b/.test(haystack)) {
    return title.toLocaleLowerCase().includes("schedule") ? "Payment schedule updated" : "Payment terms updated";
  }
  if (/\b(support|response|escalation|handoff|acceptance)\b/.test(haystack)) {
    return "Support response timing changed";
  }
  if (/\b(terminate|termination|cancel|notice)\b/.test(haystack)) {
    return "Termination wording updated";
  }
  if (/\b(confidential|confidentiality|non-disclosure)\b/.test(haystack)) {
    return "Confidentiality wording updated";
  }
  if (/\b(liability|indemn|damages|warranty)\b/.test(haystack)) {
    return "Risk allocation wording updated";
  }
  if (/\b(scope|services|statement of work|sow)\b/.test(haystack)) {
    return "Scope wording updated";
  }
  return title && !/^updated wording/i.test(title) ? `${title} updated` : "Agreement wording updated";
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
    const title = sectionTitle(changedPrevious, changedProposed, sections.length);
    const inline = buildInlineDiff(changedPrevious, changedProposed);
    const previousParts = inline.previousParts.length ? inline.previousParts : [{ text: "(No prior wording)", kind: "removed" as const }];
    const proposedParts = inline.proposedParts.length ? inline.proposedParts : [{ text: "(Removed)", kind: "added" as const }];
    sections.push({
      title,
      summary: sectionSummary(title, changedPrevious, changedProposed),
      previous: joinTokenParts(previousParts) || "(No prior wording)",
      proposed: joinTokenParts(proposedParts) || "(Removed)",
      fullPrevious: changedPrevious || "(No prior wording)",
      fullProposed: changedProposed || "(Removed)",
      previousParts,
      proposedParts,
      added: inline.added,
      removed: inline.removed,
    });
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
      const title = sectionTitle(changedPrevious, changedProposed, sections.length);
      const inline = buildInlineDiff(changedPrevious, changedProposed);
      const previousParts = inline.previousParts.length ? inline.previousParts : [{ text: "(No prior wording)", kind: "removed" as const }];
      const proposedParts = inline.proposedParts.length ? inline.proposedParts : [{ text: "(Removed)", kind: "added" as const }];
      sections.push({
        title,
        summary: sectionSummary(title, changedPrevious, changedProposed),
        previous: joinTokenParts(previousParts) || "(No prior wording)",
        proposed: joinTokenParts(proposedParts) || "(Removed)",
        fullPrevious: changedPrevious || "(No prior wording)",
        fullProposed: changedProposed || "(Removed)",
        previousParts,
        proposedParts,
        added: inline.added,
        removed: inline.removed,
      });
    }
  }
  return sections;
}

export function buildReviewFirstTextDiffSummary(previousText: string, proposedText: string): ReviewFirstTextDiffSummary {
  const normalizedPrevious = normalizeReviewTextForComparison(previousText);
  const normalizedProposed = normalizeReviewTextForComparison(proposedText);
  if (!normalizedProposed) {
    return {
      hasMaterialChanges: false,
      status: "empty",
      summary: "Paste the complete updated agreement to compare wording changes.",
      changedSections: [],
      normalizedPrevious,
      normalizedProposed,
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
    };
  }
  const changedSections = getChangedReviewSections(previousText, proposedText);
  const count = changedSections.length || 1;
  return {
    hasMaterialChanges: true,
    status: "changed",
    summary: count === 1 ? "1 material wording update found." : `${count} material wording updates found.`,
    changedSections,
    normalizedPrevious,
    normalizedProposed,
  };
}

export function canSubmitReviewFirstProposal(args: {
  diff: ReviewFirstTextDiffSummary | null;
  hasReviewerAttribution: boolean;
  comparisonPreviewRendered: boolean;
}): boolean {
  return Boolean(args.diff?.hasMaterialChanges && args.hasReviewerAttribution && args.comparisonPreviewRendered);
}
