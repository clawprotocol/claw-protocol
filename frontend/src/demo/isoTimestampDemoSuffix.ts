/**
 * Last six digits from an ISO-8601 timestamp for demo epoch/timeline ids.
 * Digit-only stripping avoids bracket-regex literals that Tailwind's content
 * scanner misreads as arbitrary CSS property utilities.
 */
export function isoTimestampDemoSuffix(iso: string): string {
  return iso.replace(/\D/g, "").slice(-6);
}
