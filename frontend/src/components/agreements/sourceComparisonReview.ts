/**
 * Deterministic source-vs-revised comparison (no AI).
 */

import { analyzeDirectTextCompare, type ClauseRow } from "../../vs01/directAgreementTextCompare";
import { buildAgreementRedline, type RedlineSegment } from "../../vs01/agreementRedline";

const HEADING_LINE_RE = /^(?:\d+(?:\.\d+)*\s+.+|[A-Z][A-Z0-9\s/&-]{4,})$/;

export type SourceComparisonSectionStatus = "unchanged" | "changed" | "added" | "removed";

export type SourceComparisonSection = {
  id: string;
  label: string;
  status: SourceComparisonSectionStatus;
  sourceExcerpt: string;
  revisedExcerpt: string;
  rows: ClauseRow[];
  redlineSegments?: RedlineSegment[];
};

export type SourceComparisonView = {
  summary: {
    additions: number;
    deletions: number;
    changedSections: number;
    unchangedSections: number;
  };
  sections: SourceComparisonSection[];
  truncated: boolean;
};

function sectionLabelFromParagraph(p: string, index: number): string {
  const first = p.split("\n")[0]?.trim() || "";
  const m = first.match(/^(\d+(?:\.\d+)*)\s+(.+)/);
  if (m) return `Section ${m[1]} — ${m[2].slice(0, 48)}`;
  if (HEADING_LINE_RE.test(first) && first.length < 80) return first;
  return `Block ${index + 1}`;
}

function groupRowsIntoSections(rows: ClauseRow[]): SourceComparisonSection[] {
  const sections: SourceComparisonSection[] = [];
  let buf: ClauseRow[] = [];
  let bufLabel = "Preamble";
  let sectionIndex = 0;

  const flush = () => {
    if (!buf.length) return;
    let status: SourceComparisonSectionStatus = "unchanged";
    for (const r of buf) {
      if (r.kind === "add") status = status === "unchanged" ? "added" : "changed";
      else if (r.kind === "remove") status = status === "unchanged" ? "removed" : "changed";
      else if (r.kind === "edit") status = "changed";
    }
    const sourceParts: string[] = [];
    const revisedParts: string[] = [];
    for (const r of buf) {
      if (r.kind === "same") {
        sourceParts.push(r.text);
        revisedParts.push(r.text);
      } else if (r.kind === "remove") sourceParts.push(r.text);
      else if (r.kind === "add") revisedParts.push(r.text);
      else if (r.kind === "edit") {
        sourceParts.push(r.before);
        revisedParts.push(r.after);
      }
    }
    const sourceExcerpt = sourceParts.join("\n\n").trim();
    const revisedExcerpt = revisedParts.join("\n\n").trim();
    let redlineSegments: RedlineSegment[] | undefined;
    if (status === "changed" && sourceExcerpt && revisedExcerpt) {
      redlineSegments = buildAgreementRedline(sourceExcerpt, revisedExcerpt).segments;
    }
    sections.push({
      id: `sec-${sectionIndex}`,
      label: bufLabel,
      status,
      sourceExcerpt,
      revisedExcerpt,
      rows: [...buf],
      redlineSegments,
    });
    sectionIndex += 1;
    buf = [];
  };

  for (const row of rows) {
    const anchor =
      row.kind === "same" || row.kind === "remove"
        ? row.text
        : row.kind === "add"
          ? row.text
          : row.after;
    const firstLine = anchor.split("\n")[0]?.trim() || "";
    if (HEADING_LINE_RE.test(firstLine) || /^\d+\.\s/.test(firstLine)) {
      flush();
      bufLabel = sectionLabelFromParagraph(anchor, sectionIndex);
    }
    buf.push(row);
  }
  flush();
  return sections;
}

export function buildSourceComparisonView(
  sourceText: string,
  revisedText: string,
): SourceComparisonView {
  const compare = analyzeDirectTextCompare(sourceText, revisedText);
  const sections = groupRowsIntoSections(compare.clauseRows);
  const changedSections = sections.filter((s) => s.status !== "unchanged").length;
  const unchangedSections = sections.filter((s) => s.status === "unchanged").length;
  return {
    summary: {
      additions: compare.addedClauses,
      deletions: compare.removedClauses,
      changedSections,
      unchangedSections,
    },
    sections,
    truncated: compare.truncated,
  };
}

export function filterSourceComparisonSections(
  sections: SourceComparisonSection[],
  changedOnly: boolean,
): SourceComparisonSection[] {
  if (!changedOnly) return sections;
  return sections.filter((s) => s.status !== "unchanged");
}
