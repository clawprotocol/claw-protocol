/**
 * Detect intake section labels and invalid party-metadata values so they never
 * leak into recitals, notice addresses, or stacked party-block parsing.
 */

const BODY_VERB_RE =
  /\b(?:will|shall|must|may|should|are|is|was|were|have|has|had|agrees?|represents?)\b/i;

/** Known intake section headers from structured prompts (TEST429 North Star, etc.). */
const INTAKE_SECTION_LABEL_RE =
  /^(?:background|scope(?:\s+of\s+services)?|commercial\s+terms|payment\s+schedule|revenue\s+allocation|term(?:ination)?|governance|coordination|confidentiality|liability|limitation\s+of\s+liability|governing\s+law|relationship\s+of\s+parties|general\s+provisions|include\s+a\s+complete|deliverables?|services?\s+and\s+scope|notices?|miscellaneous|payment|effective\s+date|signer|party\s+notice)\s*:?\s*$/i;

const INVALID_PARTY_METADATA_VALUE_RE =
  /^(?:address|client address|service provider address|principal place of business|principal office|notice address|mailing address|n\/a|none|tbd|not supplied|unknown)$/i;

/** Intake field labels that must never become signer/contact metadata values. */
const PARTY_METADATA_FIELD_LABEL_RE =
  /^(?:email|signer\s+email|address|mailing\s+address|physical\s+address|party\s+address|represented\s+by|representative(?:\s+name)?|signer\s+name|signer\s+title|title|legal\s+entity(?:\s*\/\s*party\s+name)?|party\s+name|rep\.?)\s*:?\s*$/i;

/** Title-case intake label line ending with colon (e.g. "Background:"). */
const GENERIC_INTAKE_LABEL_LINE_RE = /^[A-Z][A-Za-z]*(?:\s+[A-Za-z][A-Za-z'-]*){0,5}\s*:\s*$/;

export function isIntakeSectionLabelLine(line: string): boolean {
  const t = (line || "").trim();
  if (!t) return false;
  if (PARTY_METADATA_FIELD_LABEL_RE.test(t)) return false;
  if (/^If to\s+.+/i.test(t)) return false;
  if (INTAKE_SECTION_LABEL_RE.test(t)) return true;
  if (GENERIC_INTAKE_LABEL_LINE_RE.test(t) && !BODY_VERB_RE.test(t)) return true;
  return false;
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
