export type ReviewFirstChangedSection = {
  title: string;
  previous: string;
  proposed: string;
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

function sectionTitle(previous: string, proposed: string, index: number): string {
  const candidate = [proposed, previous]
    .flatMap((body) => body.split("\n"))
    .map((line) => line.trim())
    .find((line) => /^(schedule|section|article)\b/i.test(line));
  if (candidate) return candidate.length > 90 ? `${candidate.slice(0, 90).trim()}...` : candidate;
  return index === 0 ? "Updated wording" : `Updated wording ${index + 1}`;
}

export function getChangedReviewSections(previousText: string, proposedText: string): ReviewFirstChangedSection[] {
  const previousBlocks = displayBlocks(previousText);
  const proposedBlocks = displayBlocks(proposedText);
  const previousKeys = previousBlocks.map(blockKey);
  const proposedKeys = proposedBlocks.map(blockKey);

  let start = 0;
  while (start < previousKeys.length && start < proposedKeys.length && previousKeys[start] === proposedKeys[start]) {
    start += 1;
  }

  let previousEnd = previousKeys.length - 1;
  let proposedEnd = proposedKeys.length - 1;
  while (previousEnd >= start && proposedEnd >= start && previousKeys[previousEnd] === proposedKeys[proposedEnd]) {
    previousEnd -= 1;
    proposedEnd -= 1;
  }

  const changedPrevious = previousBlocks.slice(start, previousEnd + 1).join("\n\n").trim();
  const changedProposed = proposedBlocks.slice(start, proposedEnd + 1).join("\n\n").trim();
  if (!changedPrevious && !changedProposed) return [];

  return [
    {
      title: sectionTitle(changedPrevious, changedProposed, 0),
      previous: changedPrevious || "(No prior wording)",
      proposed: changedProposed || "(Removed)",
    },
  ];
}

export function buildReviewFirstTextDiffSummary(previousText: string, proposedText: string): ReviewFirstTextDiffSummary {
  const normalizedPrevious = normalizeReviewTextForComparison(previousText);
  const normalizedProposed = normalizeReviewTextForComparison(proposedText);
  if (!normalizedProposed) {
    return {
      hasMaterialChanges: false,
      status: "empty",
      summary: "Paste updated agreement wording or upload a .txt or .md file.",
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
    summary: count === 1 ? "One section changed." : `${count} sections changed.`,
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
