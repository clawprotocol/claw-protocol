/**
 * Canonical structured party address — single authority for lossless intake → pipeline propagation.
 * Normalizes display whitespace; never drops address components during merge.
 */

import { isPartyMetadataLabelValue } from "./intakeSectionLabels";

function cleanAddressLine(line: string): string {
  return String(line ?? "").replace(/\s+/g, " ").trim();
}

/** Split stored address into logical lines (newline or comma-separated segments). */
export function splitCanonicalPartyAddressLines(address: string | null | undefined): string[] {
  const raw = String(address ?? "").replace(/\r\n/g, "\n").trim();
  if (!raw) return [];
  const lines = raw.includes("\n")
    ? raw.split(/\n/).map(cleanAddressLine).filter(Boolean)
    : raw.split(/\s*,\s*/).map(cleanAddressLine).filter(Boolean);
  return lines.filter((line) => !isPartyMetadataLabelValue(line));
}

/** Join address lines for canonical storage (comma-separated display form). */
export function joinCanonicalPartyAddressLines(lines: readonly string[]): string {
  const parts = lines.map(cleanAddressLine).filter((line) => line && !isPartyMetadataLabelValue(line));
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
 * Merge two address strings without dropping components from either side.
 * Prefers the superset when one contains the other; otherwise unions segments.
 */
export function mergeCanonicalPartyAddresses(
  existing: string | null | undefined,
  incoming: string | null | undefined,
): string {
  const a = joinCanonicalPartyAddressLines(splitCanonicalPartyAddressLines(existing));
  const b = joinCanonicalPartyAddressLines(splitCanonicalPartyAddressLines(incoming));
  if (!b) return a;
  if (!a) return b;
  if (a === b) return a;
  const aLower = a.toLowerCase();
  const bLower = b.toLowerCase();
  if (bLower.includes(aLower)) return b;
  if (aLower.includes(bLower)) return a;
  return joinCanonicalPartyAddressLines([...splitCanonicalPartyAddressLines(a), ...splitCanonicalPartyAddressLines(b)]);
}

/** Normalize intake address for canonical storage — preserves all non-empty lines. */
export function normalizeCanonicalPartyAddress(value: string | null | undefined): string {
  const raw = String(value ?? "").replace(/\r\n/g, "\n").trim();
  if (!raw || isPartyMetadataLabelValue(raw)) return "";
  if (raw.includes("\n")) {
    return joinCanonicalPartyAddressLines(raw.split(/\n/));
  }
  return cleanAddressLine(raw);
}
