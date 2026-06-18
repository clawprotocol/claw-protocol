/**
 * Shared deterministic Paid Pro numbered section-heading classifier.
 * Structural invariant only — no title allowlists or prompt-specific patterns.
 */

/** Subsection lines like "1.1", "8.1" — remain body paragraphs. */
export const PAID_PRO_SUBSECTION_NUMBER_RE = /^\d+\.\d+(?:\.\d+)*\.?\s+/;

const NUMBERED_MAIN_SECTION_RE = /^(\d{1,2})\.\s+(.+)$/;
const MAX_SECTION_HEADING_WORDS = 24;
const MAX_SECTION_HEADING_CHARS = 200;
const MIN_SECTION_HEADING_CHARS = 3;

/** Numbered operative sentence — not a section title. */
const NUMBERED_OPERATIVE_OPENING_RE =
  /^\d{1,2}\.\s+(?:The|This|Each|Either|Any|Neither|Both|A|An)\s+/i;

export type ParsedPaidProNumberedSectionLine = {
  number: number;
  title: string;
};

export function parsePaidProNumberedSectionLine(line: string): ParsedPaidProNumberedSectionLine | null {
  const t = line.trim();
  if (!t || PAID_PRO_SUBSECTION_NUMBER_RE.test(t)) return null;
  const m = t.match(NUMBERED_MAIN_SECTION_RE);
  if (!m?.[1] || !m[2]) return null;
  const number = Number.parseInt(m[1], 10);
  if (number < 1 || number > 99) return null;
  const title = m[2].trim();
  if (title.length < MIN_SECTION_HEADING_CHARS || title.length > MAX_SECTION_HEADING_CHARS) return null;
  return { number, title };
}

function hasOperativeVerbInTitle(title: string): boolean {
  return /\b(?:shall|will|must|agrees?|represents?)\b/i.test(title);
}

/** Body sentence glued to a heading title on the same line (not part of the title). */
function hasGluedBodySentenceOnSameLine(title: string): boolean {
  if (
    /\.\s+(?:[a-z]|The|This|Each|Either|Any|Neither|Both|Upon|Unless|If|When|During|Within|After|Before|Client|Service\s+Provider|Notwithstanding)\b/.test(
      title,
    )
  ) {
    return true;
  }
  if (
    /\s+(?:The|This|Each|Either|Any|Neither|Both|Upon|Unless|If|When|During|Within|After|Before|Client|Service\s+Provider|Neither\s+party|Either\s+party|Notwithstanding|The\s+parties)\s+\S[\s\S]{0,240}?\s+(?:shall|will|must)\b/i.test(
      title,
    )
  ) {
    return true;
  }
  if (/\s+Each\s+party\s+(?:shall|will|must|represents?)\b/i.test(title)) return true;
  if (/\s+\d+\.\d+\s+/.test(title)) return true;
  return false;
}

/**
 * True when a single line is a top-level numbered section heading (1–99), not a subsection
 * or operative numbered paragraph.
 */
export function isPaidProNumberedSectionHeadingLine(line: string): boolean {
  const parsed = parsePaidProNumberedSectionLine(line);
  if (!parsed) return false;
  const { title } = parsed;
  if (!/[A-Za-z]/.test(title)) return false;
  if (title.split(/\s+/).filter(Boolean).length > MAX_SECTION_HEADING_WORDS) return false;
  const trimmed = line.trim();
  if (NUMBERED_OPERATIVE_OPENING_RE.test(trimmed) && hasOperativeVerbInTitle(title)) return false;
  if (/^\d{1,2}\.\s+Each\s+party\s+(?:shall|will|must|agrees?|represents?)\b/i.test(trimmed)) {
    return false;
  }
  if (hasOperativeVerbInTitle(title)) return false;
  if (hasGluedBodySentenceOnSameLine(title)) return false;
  return true;
}
