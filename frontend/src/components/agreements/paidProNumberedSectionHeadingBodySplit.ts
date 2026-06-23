/**
 * General numbered section heading / body boundary detection and split.
 * Structural heuristics only — no section-title allowlists.
 */

import { isPaidProNumberedSectionHeadingLine } from "./paidProNumberedSectionHeading";

const HEADING_PARTICLES = new Set([
  "and",
  "or",
  "of",
  "for",
  "the",
  "to",
  "in",
  "on",
  "at",
  "by",
  "with",
  "upon",
  "under",
  "per",
  "a",
  "an",
  "&",
]);

const BODY_SENTENCE_STARTERS = new Set([
  "fees",
  "notices",
  "the",
  "this",
  "each",
  "either",
  "any",
  "neither",
  "both",
  "upon",
  "unless",
  "if",
  "when",
  "during",
  "within",
  "after",
  "before",
  "client",
  "provider",
  "service",
  "all",
  "some",
  "such",
  "notwithstanding",
  "an",
  "a",
  "in",
  "for",
  "where",
  "as",
  "one",
  "party",
  "no",
  "not",
  "total",
  "fixed",
  "termination",
  "consultant",
  "company",
  "parties",
  "payment",
  "payments",
  "invoices",
  "taxes",
  "invoicing",
  "whereas",
  "neither",
  "either",
  "contractor",
  "licensor",
  "licensee",
]);

const OPERATIVE_VERB_RE =
  /\b(?:shall|will|must|may|should|is|are|was|were|have|has|had|agrees?|represents?)\b/i;

const NUMBERED_MAIN_LINE_RE = /^(\d{1,2})\.\s+(?!\d+\.\d)(.+)$/s;

function cleanToken(word: string): string {
  return word.replace(/^[("']+|[)",.;:!?'"]+$/g, "");
}

function isAllCapsHeadingToken(word: string): boolean {
  const token = cleanToken(word);
  if (!token) return false;
  if (token.length === 1) return /^[A-Z]$/.test(token);
  return /^[A-Z0-9][A-Z0-9&'/-]*$/.test(token) && !/[a-z]/.test(token);
}

function isTitleCaseHeadingToken(word: string): boolean {
  const token = cleanToken(word);
  return /^[A-Z][a-zA-Z'/-]*$/.test(token);
}

function isHeadingParticleToken(word: string): boolean {
  return HEADING_PARTICLES.has(cleanToken(word).toLowerCase());
}

function isBodySentenceStarterToken(word: string): boolean {
  return BODY_SENTENCE_STARTERS.has(cleanToken(word).toLowerCase());
}

function tokenLooksLikeHeadingContinuation(word: string): boolean {
  return (
    isAllCapsHeadingToken(word) ||
    isHeadingParticleToken(word) ||
    isTitleCaseHeadingToken(word)
  );
}

/** Detect heading vs body boundary inside the title portion of a numbered section line. */
export function detectHeadingBodyBoundaryInSectionTitle(
  titlePart: string,
): { headingTitle: string; body: string } | null {
  const words = titlePart.split(/\s+/).filter(Boolean);
  if (words.length < 2) return null;

  let splitAt: number | null = null;
  let sawCapsRun = false;
  const headingLemma = new Set<string>();

  for (let i = 0; i < words.length; i += 1) {
    const word = words[i]!;
    const lemma = cleanToken(word).toLowerCase();

    if (isAllCapsHeadingToken(word)) {
      sawCapsRun = true;
      headingLemma.add(lemma);
      continue;
    }

    if (isHeadingParticleToken(word)) {
      continue;
    }

    if (i >= 1) {
      const prior = words.slice(0, i);
      const hasHeadingShape =
        prior.some((w) => isAllCapsHeadingToken(w)) ||
        prior.every((w) => isTitleCaseHeadingToken(w) || isHeadingParticleToken(w) || isAllCapsHeadingToken(w));
      if (!hasHeadingShape) {
        if (isTitleCaseHeadingToken(word)) {
          headingLemma.add(lemma);
          continue;
        }
        break;
      }

      if (headingLemma.has(lemma)) {
        splitAt = i;
        break;
      }

      if (sawCapsRun && !isAllCapsHeadingToken(word) && !isHeadingParticleToken(word)) {
        splitAt = i;
        break;
      }

      if (isBodySentenceStarterToken(word)) {
        splitAt = i;
        break;
      }

      const rest = words.slice(i);
      const restAllHeading = rest.every((w) => tokenLooksLikeHeadingContinuation(w));
      if (!restAllHeading) {
        for (let j = 0; j < rest.length; j += 1) {
          const rw = rest[j]!;
          const rLemma = cleanToken(rw).toLowerCase();
          if (
            isBodySentenceStarterToken(rw) ||
            headingLemma.has(rLemma) ||
            (!tokenLooksLikeHeadingContinuation(rw) && j > 0)
          ) {
            splitAt = i + j;
            break;
          }
        }
        if (splitAt != null) break;
      }
    }

    if (isTitleCaseHeadingToken(word)) {
      headingLemma.add(lemma);
      continue;
    }

    if (i >= 1) {
      splitAt = i;
      break;
    }
  }

  if (splitAt == null || splitAt <= 0 || splitAt >= words.length) return null;

  const headingTitle = words.slice(0, splitAt).join(" ");
  const body = words.slice(splitAt).join(" ");
  if (headingTitle.split(/\s+/).filter(Boolean).length > 24) return null;
  if (body.length < 4) return null;
  if (OPERATIVE_VERB_RE.test(headingTitle) && !/\b(?:AND|OR|OF|FOR)\b/.test(headingTitle)) return null;
  return { headingTitle, body };
}

/** Split one glued numbered section line into isolated heading + body. */
export function splitGluedNumberedSectionLine(
  line: string,
): { heading: string; body: string } | null {
  const trimmed = line.trim();
  const match = trimmed.match(NUMBERED_MAIN_LINE_RE);
  if (!match?.[1] || !match[2]) return null;

  const boundary = detectHeadingBodyBoundaryInSectionTitle(match[2].trim());
  if (!boundary) return null;

  const heading = `${match[1]}. ${boundary.headingTitle}`.trim();
  if (!isPaidProNumberedSectionHeadingLine(heading)) return null;
  return { heading, body: boundary.body.trim() };
}
