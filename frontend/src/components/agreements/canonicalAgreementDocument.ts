/**
 * Canonical vs render-only agreement text.
 * Authoritative premium bodies are polished once, marked, and must not be re-mutated for display.
 */

import { hashPremiumDocText } from "../../lib/premiumDocFingerprint";

/** Stripped from user-visible render; marks commit-complete polish. */
export const CANONICAL_COMMIT_MARKER = "<!-- lawdog-canonical-commit -->";

const MARKER_RE = /<!--\s*lawdog-canonical-commit\s*-->\s*/gi;

export function stripCanonicalCommitMarker(text: string): string {
  return (text || "").replace(MARKER_RE, "").trimEnd();
}

export function isCanonicalCommittedText(text: string): boolean {
  return MARKER_RE.test(text || "");
}

export function markCanonicalCommittedText(text: string): string {
  const base = stripCanonicalCommitMarker(text);
  if (!base) return base;
  return `${base}\n${CANONICAL_COMMIT_MARKER}`;
}

export function canonicalDocumentFingerprint(text: string): string {
  return hashPremiumDocText(stripCanonicalCommitMarker(text));
}

/** True when re-running structural polish would be a no-op (idempotency guard). */
export function isIdempotentPolishOutput(input: string, output: string): boolean {
  const inFp = canonicalDocumentFingerprint(input);
  const outFp = canonicalDocumentFingerprint(output);
  if (inFp === outFp) return true;
  if (isCanonicalCommittedText(input) && stripCanonicalCommitMarker(input) === stripCanonicalCommitMarker(output)) {
    return true;
  }
  return false;
}

export type CanonicalPolishMode = "commit" | "validate_only";

export function resolveCanonicalPolishMode(
  text: string,
  opts?: { mode?: CanonicalPolishMode; forceCommit?: boolean },
): CanonicalPolishMode {
  if (opts?.forceCommit) return "commit";
  if (opts?.mode === "validate_only") return "validate_only";
  if (isCanonicalCommittedText(text)) return "validate_only";
  return "commit";
}
