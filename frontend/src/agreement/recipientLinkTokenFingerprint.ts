/**
 * Stable short fingerprint for a recipient link token (storage keys, logs).
 * Not cryptographic; only used for isolation and redacted diagnostics.
 */
export function recipientLinkTokenFingerprint(raw: string | null | undefined): string {
  const t = String(raw || "").trim();
  if (!t) return "";
  let h = 2166136261 >>> 0;
  for (let i = 0; i < t.length; i++) {
    h ^= t.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h.toString(36).slice(0, 16);
}
