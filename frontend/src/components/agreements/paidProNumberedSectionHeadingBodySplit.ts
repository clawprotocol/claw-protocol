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

/**
 * Capitalized particles / short openers that begin body sentences rather than heading titles.
 * TEST345: "Acceptance To the extent…" and "Term The term…" must split before the opener.
 */
function capitalizedBodyOpenerAt(words: readonly string[], index: number): boolean {
  if (index < 1 || index >= words.length) return false;
  const word = words[index]!;
  if (!/^[A-Z]/.test(word)) return false;
  const lemma = cleanToken(word).toLowerCase();
  const next = words[index + 1] ? cleanToken(words[index + 1]!).toLowerCase() : "";
  if (lemma === "to" && next === "the") return true;
  if (lemma === "during" && next === "the") return true;
  if (
    ["the", "this", "each", "either", "any", "neither", "both", "a", "an", "as", "in", "for"].includes(
      lemma,
    )
  ) {
    // "The term…", "This Agreement…" — opener is capitalized and not an interior particle.
    return true;
  }
  return false;
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

    // Subsection markers (`5.1 …`) start the body/subheading — never absorb into the main title.
    if (/^\d+\.\d+/.test(cleanToken(word))) {
      splitAt = i;
      break;
    }

    if (isHeadingParticleToken(word)) {
      if (capitalizedBodyOpenerAt(words, i)) {
        splitAt = i;
        break;
      }
      continue;
    }

    if (i >= 1) {
      const prevWord = words[i - 1]!;
      if (cleanToken(prevWord).endsWith(",") || /,\s*$/.test(words.slice(0, i).join(" "))) {
        if (
          isTitleCaseHeadingToken(word) ||
          isHeadingParticleToken(word) ||
          isAllCapsHeadingToken(word)
        ) {
          headingLemma.add(lemma);
          continue;
        }
      }

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
        const prevLemma = i > 0 ? cleanToken(words[i - 1]!).toLowerCase() : "";
        // "Effect of Termination" / "and Termination" — repeated lemma after a particle
        // is still the title; the body repeat comes after a non-particle (TEST344).
        if (isHeadingParticleToken(words[i - 1] || "") || prevLemma === "and" || prevLemma === "or") {
          headingLemma.add(lemma);
          continue;
        }
        const rest = words.slice(i + 1);
        if (rest.length === 0 || rest.every((w) => tokenLooksLikeHeadingContinuation(w))) {
          continue;
        }
        splitAt = i;
        break;
      }

      if (sawCapsRun && !isAllCapsHeadingToken(word) && !isHeadingParticleToken(word)) {
        splitAt = i;
        break;
      }

      if (isBodySentenceStarterToken(word)) {
        const prev = i > 0 ? cleanToken(words[i - 1]!).toLowerCase() : "";
        if (
          (prev === "and" || prev === "or" || prev === "of") &&
          (isTitleCaseHeadingToken(word) || isHeadingParticleToken(word))
        ) {
          headingLemma.add(lemma);
          continue;
        }
        // Compound legal titles where the second word is also a common body opener.
        if (
          (prev === "independent" && lemma === "contractor") ||
          (prev === "service" && lemma === "provider") ||
          (prev === "general" && lemma === "contractor")
        ) {
          headingLemma.add(lemma);
          continue;
        }
        splitAt = i;
        break;
      }

      const rest = words.slice(i);
      const restAllHeading = rest.every((w) => tokenLooksLikeHeadingContinuation(w));
      if (!restAllHeading) {
        for (let j = 0; j < rest.length; j += 1) {
          const abs = i + j;
          const rw = rest[j]!;
          if (/^\d+\.\d+/.test(cleanToken(rw)) || capitalizedBodyOpenerAt(words, abs)) {
            splitAt = abs;
            break;
          }
          const rLemma = cleanToken(rw).toLowerCase();
          const prevAtAbs = abs > 0 ? words[abs - 1]! : "";
          // Same title-continuation rule as the main walk: "of Termination" stays in-title.
          if (
            headingLemma.has(rLemma) &&
            (isHeadingParticleToken(prevAtAbs) ||
              cleanToken(prevAtAbs).toLowerCase() === "and" ||
              cleanToken(prevAtAbs).toLowerCase() === "or")
          ) {
            continue;
          }
          if (
            isBodySentenceStarterToken(rw) ||
            headingLemma.has(rLemma) ||
            (!tokenLooksLikeHeadingContinuation(rw) && j > 0)
          ) {
            splitAt = abs;
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
  // `1. Clause 1. Terms…` — a mid-title numeral is not a body boundary. Splitting here
  // yields empty `N. Clause` parents and corrupts operative fingerprints.
  const bodyLead = cleanToken(words[splitAt] || "");
  if (/^\d+\.?$/.test(bodyLead) || /^\d+\.\s+\S/.test(body)) {
    return null;
  }
  // Main heading must not retain a trailing subsection marker (`Fees and Payment 5.1`).
  if (/\b\d+\.\d+\s*$/.test(headingTitle)) return null;
  return { headingTitle, body };
}

/** Split one glued numbered section line into isolated heading + body. */
export function splitGluedNumberedSectionLine(
  line: string,
): { heading: string; body: string } | null {
  const trimmed = line.trim();
  // Prefer explicit "N. Title. Body…" period glue before heuristic word walks.
  // Heuristics alone mis-split "1. Scope. White-label deployment…" after "White-label".
  const periodGlue = trimmed.match(
    /^(\d{1,2})\.\s+(?!\d+\.\d)([^.\n]{2,80}?)\.\s+([A-Z][\s\S]{8,})$/,
  );
  if (periodGlue?.[1] && periodGlue[2] && periodGlue[3]) {
    const title = periodGlue[2].trim();
    const body = periodGlue[3].trim();
    const heading = `${periodGlue[1]}. ${title}`.trim();
    // Reject period-glue titles that already swallowed a repeated body opener
    // ("…Termination Termination for Convenience. Either…") — prefer the word walk.
    const seenTitleLemmas = new Set<string>();
    let titleHasRepeatedContentToken = false;
    for (const w of title.split(/\s+/).filter(Boolean)) {
      const lemma = cleanToken(w).toLowerCase();
      if (!lemma || isHeadingParticleToken(w) || !/^[A-Z]/.test(w)) continue;
      if (seenTitleLemmas.has(lemma)) {
        titleHasRepeatedContentToken = true;
        break;
      }
      seenTitleLemmas.add(lemma);
    }
    if (
      !titleHasRepeatedContentToken &&
      title.split(/\s+/).filter(Boolean).length <= 12 &&
      !/\b(?:clause|section|item|schedule|exhibit)\s+\d+\b/i.test(title) &&
      !/^(?:Terms\.?\s*)+$/i.test(body) &&
      (isPaidProNumberedSectionHeadingLine(heading) || title.length >= 2)
    ) {
      return { heading, body };
    }
  }

  const match = trimmed.match(NUMBERED_MAIN_LINE_RE);
  if (!match?.[1] || !match[2]) return null;

  const boundary = detectHeadingBodyBoundaryInSectionTitle(match[2].trim());
  if (!boundary) return null;

  const heading = `${match[1]}. ${boundary.headingTitle}`.trim();
  if (!isPaidProNumberedSectionHeadingLine(heading)) return null;
  return { heading, body: boundary.body.trim() };
}
