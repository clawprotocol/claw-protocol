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
  /^\s*Sarah\s+Collins\s+proposed\s+revised\s+draft\s+for\s+qa\s+testing\b/i,
  /^\s*prepared\s+as\s+sarah\s+collins\s+proposed\s+revised\s+agreement\s+draft\b/i,
  /^\s*this\s+is\s+a\s+clean\s+revised\s+draft\b/i,
  /revised\s+draft\s+for\s+lawdog\s+qa\b/i,
  /^\s*page\s+\d+\s+of\s+\d+\s*$/i,
  /^\s*-\s*page\s+\d+\s*-\s*$/i,
  /^\s*Page\s+\d+\s*\/\s*\d+\s*$/i,
  /^\s*Page\s+\d+\s*$/i,
  /^\s*CONFIDENTIAL\s*-\s*DRAFT\s*$/i,
];

export type SanitizeRecipientImportedRevisionResult = {
  agreementText: string;
  reviewerNotes: string | null;
  artifactsRemoved: string[];
};

/** Paragraphs that are reviewer / QA commentary, not operative agreement text. */
const INLINE_REVIEWER_PARA_RES: RegExp[] = [
  /^\s*REVIEWER\s+NOTES\b/i,
  /\bREVIEWER\s+PERSPECTIVE\b/i,
  /Suggested\s+UX\s+expectation\b/i,
  /\bLawDog\s+QA\b/i,
  /^\s*Reasoning\s*:/i,
  /^\s*NOTES\s+FOR\s+SENDER\b/i,
  /\bSARAH\s+COLLINS\s+REVIEWER\b/i,
  /\bprepared\s+as\s+sarah\s+collins\s+proposed\s+revised\s+agreement\s+draft\b/i,
  /^\s*this\s+is\s+a\s+clean\s+revised\s+draft\b/i,
];

/**
 * Removes reviewer-style paragraphs from the agreement body and merges them into notes.
 */
function extractInlineReviewerParagraphs(body: string, artifacts: string[]): { agreementText: string; pulled: string[] } {
  const paras = body.split(/\n\n+/);
  const kept: string[] = [];
  const pulled: string[] = [];
  for (const p of paras) {
    const t = p.trim();
    if (!t) continue;
    let isReviewer = false;
    for (const r of INLINE_REVIEWER_PARA_RES) {
      if (r.test(t)) {
        isReviewer = true;
        break;
      }
    }
    if (isReviewer) {
      pulled.push(t);
      artifacts.push("Reviewer commentary (kept out of agreement compare)");
    } else {
      kept.push(p);
    }
  }
  return { agreementText: kept.join("\n\n").trim(), pulled };
}

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
  const inlinePull = extractInlineReviewerParagraphs(body, artifactsRemoved);
  body = inlinePull.agreementText;
  if (inlinePull.pulled.length > 0) {
    const joined = inlinePull.pulled.join("\n\n");
    reviewerNotes = reviewerNotes ? `${joined}\n\n${reviewerNotes}` : joined;
  }
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
