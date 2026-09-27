/**
 * Detect intake section labels and invalid party-metadata values so they never
 * leak into recitals, notice addresses, or stacked party-block parsing.
 */

const BODY_VERB_RE =
  /\b(?:will|shall|must|may|should|are|is|was|were|have|has|had|agrees?|represents?)\b/i;

/** Known intake section headers from structured prompts (TEST429 North Star, clinical 4-party, etc.). */
const INTAKE_SECTION_LABEL_RE =
  /^(?:background|purpose|initial\s+term|scope(?:\s+of\s+(?:services|work))?|commercial\s+(?:terms|safeguards?)|user-stated\s+material\s+terms|economics\s+preserved\s+from\s+intake|payment(?:\s+schedule)?|revenue\s+allocation|term(?:ination)?|governance|coordination|confidentiality|liability|limitation\s+of\s+liability|governing\s+law|relationship\s+of\s+parties|general\s+provisions|include\s+a\s+complete|deliverables?(?:\s+and\s+ip)?|services?\s+and\s+scope|notices?|miscellaneous|compensation|effective\s+date|signer|party\s+notice|signatures?|e[-\s]?signatures?)\s*:?\s*,?\s*$/i;

/** Single-token / comma-only section labels ("Purpose", "Purpose,", "Initial Term"). */
export const STRUCTURED_PROMPT_SECTION_LABEL_TOKEN_RE =
  /^(?:background|purpose|initial\s+term|scope(?:\s+of\s+(?:services|work))?|commercial\s+(?:terms|safeguards?)|user-stated\s+material\s+terms|economics\s+preserved\s+from\s+intake|payment(?:\s+schedule)?|revenue\s+allocation|term(?:ination)?|governance|coordination|confidentiality|liability|limitation\s+of\s+liability|governing\s+law|relationship\s+of\s+parties|general\s+provisions|deliverables?(?:\s+and\s+ip)?|services?\s+and\s+scope|notices?|miscellaneous|compensation|effective\s+date|signatures?|e[-\s]?signatures?)$/i;

/** Inline comma boundary before the next structured section label in fused prose. */
export const STRUCTURED_PROMPT_SECTION_INLINE_BOUNDARY_RE =
  /,\s*(?:purpose|initial\s+term|scope(?:\s+of\s+(?:services|work))?|governance|compensation|commercial\s+terms|background|term(?:ination)?|confidentialit(?:y|ies)|governing\s+law|payment(?:\s+schedule)?|revenue\s+allocation|deliverables?|liability|coordination|miscellaneous)\b/i;

function stripSectionLabelPunctuation(line: string): string {
  return String(line ?? "").replace(/\s+/g, " ").trim().replace(/[,;.:]+$/g, "").trim();
}

export function isStructuredPromptSectionLabelToken(token: string | null | undefined): boolean {
  const t = stripSectionLabelPunctuation(String(token ?? ""));
  if (!t) return false;
  if (PARTY_METADATA_FIELD_LABEL_RE.test(`${t}:`)) return false;
  if (STRUCTURED_PROMPT_SECTION_LABEL_TOKEN_RE.test(t)) return true;
  return false;
}

const INVALID_PARTY_METADATA_VALUE_RE =
  /^(?:address|client address|service provider address|principal place of business|principal office|notice address|mailing address|n\/a|none|tbd|not supplied|unknown)$/i;

/** Intake field labels that must never become signer/contact metadata values. */
const PARTY_METADATA_FIELD_LABEL_RE =
  /^(?:email|signer\s+email|address|mailing\s+address|physical\s+address|party\s+address|represented\s+by|representative(?:\s+name)?|signer\s+name|signer\s+title|title|legal\s+entity(?:\s*\/\s*party\s+name)?|party\s+name|rep\.?)\s*:?\s*$/i;

/** Title-case intake label line ending with colon (e.g. "Background:"). */
const GENERIC_INTAKE_LABEL_LINE_RE =
  /^[A-Z][A-Za-z'-]*(?:\s+[A-Za-z][A-Za-z'-]*){0,6}\s*:\s*$/;

export function isIntakeSectionLabelLine(line: string): boolean {
  const t = (line || "").trim();
  if (!t) return false;
  if (PARTY_METADATA_FIELD_LABEL_RE.test(t)) return false;
  if (/^If to\s+.+/i.test(t)) return false;
  if (INTAKE_SECTION_LABEL_RE.test(t)) return true;
  const stripped = stripSectionLabelPunctuation(t);
  if (isStructuredPromptSectionLabelToken(stripped)) return true;
  if (GENERIC_INTAKE_LABEL_LINE_RE.test(t) && !BODY_VERB_RE.test(t)) return true;
  return false;
}

/**
 * Split monolithic intake prose at structured section labels (Purpose, Initial Term, etc.).
 * Preserves section body text without the label lines — for purpose/scope theming and recital repair.
 */
export function splitTextAtStructuredPromptSectionLabels(text: string): string[] {
  const raw = String(text ?? "").replace(/\r\n/g, "\n").trim();
  if (!raw) return [];

  const lineChunks: string[] = [];
  let current: string[] = [];
  for (const line of raw.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed) {
      if (current.length) current.push("");
      continue;
    }
    if (isIntakeSectionLabelLine(trimmed)) {
      if (current.length) lineChunks.push(current.join("\n").trim());
      current = [];
      continue;
    }
    current.push(trimmed);
  }
  if (current.length) lineChunks.push(current.join("\n").trim());
  const fromLines = lineChunks.filter((c) => c.length >= 12);
  if (fromLines.length >= 2) return fromLines;

  const inlineBoundary = STRUCTURED_PROMPT_SECTION_INLINE_BOUNDARY_RE.exec(raw);
  if (inlineBoundary?.index != null && inlineBoundary.index >= 8) {
    const head = raw.slice(0, inlineBoundary.index).replace(/,\s*$/, "").trim();
    const tail = raw.slice(inlineBoundary.index + 1).trim();
    const inlineChunks = [head, ...splitTextAtStructuredPromptSectionLabels(tail)].filter(Boolean);
    if (inlineChunks.length >= 2 && head.length >= 8) return inlineChunks;
  }

  return fromLines.length ? fromLines : [raw];
}

/** True when a line is a field label (e.g. "Email:", "Address:") with no value on the same line. */
export function isPartyMetadataFieldLabelLine(line: string | null | undefined): boolean {
  const clean = String(line ?? "").replace(/\s+/g, " ").trim();
  if (!clean) return false;
  return PARTY_METADATA_FIELD_LABEL_RE.test(clean);
}

/** True when a stored metadata value is actually a field label, not real content. */
export function isPartyMetadataLabelValue(value: string | null | undefined): boolean {
  const clean = String(value ?? "").replace(/\s+/g, " ").trim();
  if (!clean) return true;
  if (PARTY_METADATA_FIELD_LABEL_RE.test(clean)) return true;
  return isInvalidPartyMetadataValue(clean);
}

/** True when a value must not be used as party address / principal-place-of-business metadata. */
export function isInvalidPartyMetadataValue(value: string | null | undefined): boolean {
  const clean = String(value ?? "").replace(/\s+/g, " ").trim();
  if (!clean) return true;
  if (PARTY_METADATA_FIELD_LABEL_RE.test(clean)) return true;
  if (INVALID_PARTY_METADATA_VALUE_RE.test(clean)) return true;
  if (isIntakeSectionLabelLine(clean)) return true;
  if (/^\[.*\]$/.test(clean)) return true;
  if (!/[A-Za-z0-9]/.test(clean)) return true;
  return false;
}
