/**
 * Canonical structured party address — single authority for lossless intake → pipeline propagation.
 * Normalizes display whitespace; never drops valid address components; rejects party/prose boundaries.
 */

import { isPartyMetadataLabelValue, isIntakeSectionLabelLine, isStructuredPromptSectionLabelToken, STRUCTURED_PROMPT_SECTION_INLINE_BOUNDARY_RE } from "./intakeSectionLabels";
import { looksLikeStackedPartyLegalEntityLine } from "./starterPartyIdentityIsolation";

const PARTY_BLOCK_HEADER_RE = /^\s*party\s*(\d+)\s*[:\-]?\s*$/i;
const PARTY_BLOCK_WITH_ROLE_HEADER_RE =
  /^\s*party\s*(\d+)\s*(?:\(\s*[^)]+\s*\))?\s*:?\s*$/i;
const PARTY_BLOCK_WITH_ROLE_INLINE_RE =
  /^\s*party\s*(\d+)\s*\(\s*[^)]+\s*\)\s*:\s*.+$/i;
const PARTY_ROLE_PAREN_RE = /\bparty\s+\d+\s*\([^)]+\)/i;
const HORIZONTAL_RULE_RE = /^[\s—–\-_=]+$/;
const INTAKE_INSTRUCTION_LINE_RE =
  /^\s*(?:draft\b|include\s+(?:provisions|a\b)|commercial\s+terms|require\b|requirement\b|governing\s+law|term(?:ination)?\b|payment\b|background\b|scope\b)/i;
const INLINE_ADDRESS_BOUNDARY_RE =
  /,\s*(?:party\s+\d+\b(?:\s*\([^)]*\))?|draft\b|include\b|require\b|commercial\s+terms\b)/i;

/** Instructional / execution prose fused after a notice or intake address line (TEST486). */
const NOTICE_INSTRUCTION_INLINE_BOUNDARY_RE =
  /,\s*(?:each party should\b|signature block\b|in witness whereof\b|parties (?:shall )?execute\b|parties (?:have|may) (?:signed|executed)\b)/i;

/**
 * Pre-signer notice placeholder copied from SoT into address fields on resume.
 * Must never be treated as a real postal address (finalize rejects corpora that still contain it).
 */
const SIGNER_SETUP_ADDRESS_PLACEHOLDER_RE = /provided during signer setup/i;

function inlineAddressBoundaryMatch(segment: string): RegExpMatchArray | null {
  const partyMatch = segment.match(INLINE_ADDRESS_BOUNDARY_RE);
  if (partyMatch) return partyMatch;
  const noticeMatch = segment.match(NOTICE_INSTRUCTION_INLINE_BOUNDARY_RE);
  if (noticeMatch) return noticeMatch;
  return segment.match(STRUCTURED_PROMPT_SECTION_INLINE_BOUNDARY_RE);
}

export type PartyAddressBoundaryTrimDiagnostic = {
  slot?: number;
  removedSuffixPreview: string;
  source: string;
};

function cleanAddressLine(line: string): string {
  return String(line ?? "").replace(/\s+/g, " ").trim();
}

function diagnosticsEnabled(): boolean {
  return (
    typeof import.meta !== "undefined" &&
    (import.meta.env?.DEV === true || import.meta.env?.MODE === "test")
  );
}

export function logPartyAddressBoundaryTrimmed(diag: PartyAddressBoundaryTrimDiagnostic): void {
  if (!diagnosticsEnabled()) return;
  // eslint-disable-next-line no-console
  console.info("[party-address-boundary-trimmed]", diag);
}

/** True when a line is a hard stop for multiline address capture (next party / prose / labels). */
export function isPartyAddressBoundaryLine(line: string | null | undefined): boolean {
  const t = cleanAddressLine(String(line ?? ""));
  if (!t) return false;
  if (isPartyMetadataLabelValue(t)) return true;
  if (PARTY_BLOCK_HEADER_RE.test(t)) return true;
  if (PARTY_BLOCK_WITH_ROLE_HEADER_RE.test(t)) return true;
  if (PARTY_BLOCK_WITH_ROLE_INLINE_RE.test(t)) return true;
  if (PARTY_ROLE_PAREN_RE.test(t)) return true;
  if (HORIZONTAL_RULE_RE.test(t)) return true;
  if (INTAKE_INSTRUCTION_LINE_RE.test(t)) return true;
  if (isIntakeSectionLabelLine(t)) return true;
  if (isStructuredPromptSectionLabelToken(t)) return true;
  if (/^\s*coordinator\s*[:\-]?\s*$/i.test(t)) return true;
  if (/^\s*(?:client|service\s+provider|provider|contractor|consultant)\s*:\s*$/i.test(t)) return true;
  if (looksLikeStackedPartyLegalEntityLine(t) && !t.includes(":")) return true;
  if (/\bdraft\s+a\s+(?:detailed\s+)?(?:agreement|contract)\b/i.test(t)) return true;
  if (/\bunder\s+which\b/i.test(t) && t.length > 40) return true;
  return false;
}

/** True when a comma-separated address segment is non-address metadata or prose. */
export function isPartyAddressContaminationSegment(segment: string | null | undefined): boolean {
  const t = cleanAddressLine(String(segment ?? ""));
  if (!t) return true;
  if (SIGNER_SETUP_ADDRESS_PLACEHOLDER_RE.test(t)) return true;
  if (isPartyAddressBoundaryLine(t)) return true;
  if (PARTY_ROLE_PAREN_RE.test(t)) return true;
  if (isStructuredPromptSectionLabelToken(t)) return true;
  if (/\bdraft\s+a\b/i.test(t)) return true;
  if (/\beach party should\b/i.test(t)) return true;
  if (/\bsignature block\b/i.test(t)) return true;
  if (/\bin witness whereof\b/i.test(t)) return true;
  if (/^(?:By|Name|Title|Date)\s*:/i.test(t)) return true;
  if (/\b(?:exclusive|regulatory|quality|distributor|manufacturer|licensor|consultant)\b/i.test(t) && /\bparty\s+\d+\b/i.test(t)) {
    return true;
  }
  return false;
}

function trimAddressSegmentAtInlineBoundary(segment: string): { value: string; removed: string } {
  const t = cleanAddressLine(segment);
  if (!t) return { value: "", removed: "" };
  const match = inlineAddressBoundaryMatch(t);
  if (match?.index != null && match.index >= 0) {
    const value = t.slice(0, match.index).replace(/,\s*$/, "").trim();
    const removed = t.slice(match.index).trim();
    return { value, removed };
  }
  if (isPartyAddressContaminationSegment(t)) {
    return { value: "", removed: t };
  }
  return { value: t, removed: "" };
}

/** Split stored address into logical lines (newline or comma-separated segments). */
export function splitCanonicalPartyAddressLines(address: string | null | undefined): string[] {
  const raw = String(address ?? "").replace(/\r\n/g, "\n").trim();
  if (!raw) return [];
  const lines = raw.includes("\n")
    ? raw.split(/\n/).map(cleanAddressLine).filter(Boolean)
    : raw.split(/\s*,\s*/).map(cleanAddressLine).filter(Boolean);
  const out: string[] = [];
  for (const line of lines) {
    if (isPartyAddressContaminationSegment(line)) break;
    const { value, removed } = trimAddressSegmentAtInlineBoundary(line);
    if (removed) {
      logPartyAddressBoundaryTrimmed({
        removedSuffixPreview: removed.slice(0, 120),
        source: "splitCanonicalPartyAddressLines",
      });
    }
    if (value) out.push(value);
    if (removed) break;
  }
  return out.filter((line) => !isPartyMetadataLabelValue(line));
}

/** Join address lines for canonical storage (comma-separated display form). */
export function joinCanonicalPartyAddressLines(lines: readonly string[]): string {
  const parts: string[] = [];
  for (const rawLine of lines) {
    const line = cleanAddressLine(rawLine);
    if (!line || isPartyMetadataLabelValue(line)) continue;
    if (isPartyAddressContaminationSegment(line)) break;
    const { value, removed } = trimAddressSegmentAtInlineBoundary(line);
    if (removed) {
      logPartyAddressBoundaryTrimmed({
        removedSuffixPreview: removed.slice(0, 120),
        source: "joinCanonicalPartyAddressLines",
      });
    }
    if (value) parts.push(value);
    if (removed) break;
  }
  const seen = new Set<string>();
  const out: string[] = [];
  for (const part of parts) {
    const key = part.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(part);
  }
  return out.join(", ");
}

/**
 * Remove party-boundary / prose contamination from a stored address.
 * Preserves valid multi-line and international address components.
 */
export function sanitizeCanonicalPartyAddress(
  value: string | null | undefined,
  opts?: { slot?: number; source?: string },
): string {
  const raw = String(value ?? "").trim();
  if (!raw) return "";
  // Entire field is (or is dominated by) the pre-signer notice placeholder — treat as empty.
  if (SIGNER_SETUP_ADDRESS_PLACEHOLDER_RE.test(raw)) {
    const withoutPlaceholder = raw
      .replace(SIGNER_SETUP_ADDRESS_PLACEHOLDER_RE, "")
      .replace(/^[\s,;:]+|[\s,;:]+$/g, "")
      .trim();
    if (!withoutPlaceholder || isPartyAddressContaminationSegment(withoutPlaceholder)) {
      logPartyAddressBoundaryTrimmed({
        slot: opts?.slot,
        removedSuffixPreview: raw.slice(0, 120),
        source: opts?.source ?? "sanitizeCanonicalPartyAddress:signer_setup_placeholder",
      });
      return "";
    }
  }
  const joined = joinCanonicalPartyAddressLines(splitCanonicalPartyAddressLines(value));
  if (raw && joined && raw.length > joined.length + 4) {
    logPartyAddressBoundaryTrimmed({
      slot: opts?.slot,
      removedSuffixPreview: raw.slice(joined.length).trim().slice(0, 120),
      source: opts?.source ?? "sanitizeCanonicalPartyAddress",
    });
  }
  return joined;
}

/**
 * Merge two address strings without dropping components from either side.
 * Stops at party/prose boundaries; never unions contamination segments.
 */
export function mergeCanonicalPartyAddresses(
  existing: string | null | undefined,
  incoming: string | null | undefined,
): string {
  const a = sanitizeCanonicalPartyAddress(existing, { source: "mergeCanonicalPartyAddresses:existing" });
  const b = sanitizeCanonicalPartyAddress(incoming, { source: "mergeCanonicalPartyAddresses:incoming" });
  if (!b) return a;
  if (!a) return b;
  if (a === b) return a;
  const aLower = a.toLowerCase();
  const bLower = b.toLowerCase();
  if (bLower.includes(aLower)) return b;
  if (aLower.includes(bLower)) return a;
  return joinCanonicalPartyAddressLines([...splitCanonicalPartyAddressLines(a), ...splitCanonicalPartyAddressLines(b)]);
}

/** Normalize intake address for canonical storage — preserves valid lines, rejects boundaries. */
export function normalizeCanonicalPartyAddress(
  value: string | null | undefined,
  opts?: { slot?: number; source?: string },
): string {
  const raw = String(value ?? "").replace(/\r\n/g, "\n").trim();
  if (!raw || isPartyMetadataLabelValue(raw)) return "";
  if (raw.includes("\n")) {
    return sanitizeCanonicalPartyAddress(raw, { ...opts, source: opts?.source ?? "normalizeCanonicalPartyAddress" });
  }
  return sanitizeCanonicalPartyAddress(cleanAddressLine(raw), {
    ...opts,
    source: opts?.source ?? "normalizeCanonicalPartyAddress",
  });
}
