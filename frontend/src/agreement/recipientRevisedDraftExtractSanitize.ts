/**
 * Post-extraction cleanup for recipient revised-draft imports (especially PDF text).
 * Separates reviewer tail notes and strips repeated page artifacts so redline alignment
 * does not treat headers/footers as agreement clauses.
 */

/** Start of a trailing reviewer block (not part of the agreement body). */
const REVIEWER_NOTES_SPLIT_RE =
  /(?:^|\n\n)\s*(?:REVIEWER\s+NOTES\s+FOR\s+SENDER[^\n]*|Reviewer\s+notes\s+for\s+sender[^\n]*|NOTES\s+TO\s+SENDER\b)/im;

/** Lines that look like PDF running headers / QA cover lines, not contract text. */
const PAGE_ARTIFACT_LINE_RES: RegExp[] = [
  /^\s*Sarah\s+Collins\s+revised\s+draft\b/i,
  /revised\s+draft\s+for\s+lawdog\s+qa\b/i,
  /^\s*page\s+\d+\s+of\s+\d+\s*$/i,
  /^\s*-\s*page\s+\d+\s*-\s*$/i,
  /^\s*Page\s+\d+\s*\/\s*\d+\s*$/i,
  /^\s*CONFIDENTIAL\s*-\s*DRAFT\s*$/i,
];

export type SanitizeRecipientImportedRevisionResult = {
  agreementText: string;
  reviewerNotes: string | null;
  artifactsRemoved: string[];
};

function stripLawDogFooterChunks(text: string, artifacts: string[]): string {
  if (!/\bcreated\s+with\s+lawdog\b/i.test(text)) return text;
  artifacts.push("LawDog footer / branding");
  return text.replace(/\bcreated\s+with\s+lawdog\b[\s\S]*$/i, "").trimEnd();
}

function dedupeRepeatedLeadingParagraphs(text: string, artifacts: string[]): string {
  const paras = text.split(/\n\n+/);
  // Short PDFs can still repeat the title block a few times; avoid requiring many paragraphs.
  if (paras.length < 3) return text;
  const norm = (s: string) =>
    s
      .replace(/\s+/g, " ")
      .trim()
      .toLowerCase();
  const first = norm(paras[0] ?? "");
  if (first.length < 50) return text;
  let repeats = 0;
  for (let i = 1; i < Math.min(paras.length, 15); i++) {
    if (norm(paras[i] ?? "") === first) repeats++;
  }
  if (repeats < 2) return text;
  artifacts.push("Repeated leading paragraph (PDF duplicate)");
  const kept: string[] = [];
  for (let i = 0; i < paras.length; i++) {
    const p = paras[i] ?? "";
    if (i > 0 && norm(p) === first) continue;
    kept.push(p);
  }
  return kept.join("\n\n").trim();
}

function stripPageArtifactLines(text: string, artifacts: string[]): string {
  const lines = text.replace(/\r\n/g, "\n").split("\n");
  const out: string[] = [];
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) {
      out.push(line);
      continue;
    }
    let drop = false;
    for (const r of PAGE_ARTIFACT_LINE_RES) {
      if (r.test(trimmed)) {
        drop = true;
        artifacts.push(`Header/footer line: ${trimmed.slice(0, 72)}`);
        break;
      }
    }
    if (!drop) out.push(line);
  }
  return out.join("\n").replace(/\n{3,}/g, "\n\n").trim();
}

/**
 * Splits trailing reviewer notes, strips common PDF artifacts, and trims LawDog boilerplate tails.
 */
export function sanitizeRecipientImportedRevisionText(raw: string): SanitizeRecipientImportedRevisionResult {
  const artifactsRemoved: string[] = [];
  let body = String(raw ?? "").replace(/\r\n/g, "\n").replace(/\r/g, "\n");

  let reviewerNotes: string | null = null;
  const splitIdx = body.search(REVIEWER_NOTES_SPLIT_RE);
  if (splitIdx >= 0) {
    reviewerNotes = body.slice(splitIdx).trim();
    body = body.slice(0, splitIdx).trim();
    artifactsRemoved.push("Reviewer notes block (split from agreement body)");
  }

  body = stripPageArtifactLines(body, artifactsRemoved);
  body = dedupeRepeatedLeadingParagraphs(body, artifactsRemoved);
  body = stripLawDogFooterChunks(body, artifactsRemoved);

  if (reviewerNotes) {
    reviewerNotes = stripPageArtifactLines(reviewerNotes, artifactsRemoved);
    reviewerNotes = stripLawDogFooterChunks(reviewerNotes, artifactsRemoved);
    if (!reviewerNotes.trim()) reviewerNotes = null;
  }

  return {
    agreementText: body.trim(),
    reviewerNotes: reviewerNotes?.trim() || null,
    artifactsRemoved,
  };
}
