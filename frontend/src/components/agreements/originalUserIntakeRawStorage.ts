/**
 * Preserves the longest meaningful home-path intake for premium completion.
 * Survives starter draft, upgrade checkout (via resume field + this key), and refresh when sessionStorage persists.
 */

const KEY = "claw_original_user_intake_raw_v1";

export function readOriginalUserIntakeRaw(): string {
  try {
    return sessionStorage.getItem(KEY)?.trim() || "";
  } catch {
    return "";
  }
}

/** Keep the longest captured text at or above minLen (commercial substance beats later trims). */
export function writeOriginalUserIntakeRawIfRicher(text: string, minLen = 40): void {
  const t = (text || "").trim();
  if (t.length < minLen) return;
  try {
    const prev = readOriginalUserIntakeRaw();
    if (t.length >= prev.length) sessionStorage.setItem(KEY, t);
  } catch {
    /* ignore */
  }
}

export function clearOriginalUserIntakeRaw(): void {
  try {
    sessionStorage.removeItem(KEY);
  } catch {
    /* ignore */
  }
}

/** Pick the longest trimmed candidate meeting min length (primary premium corpus). */
export function pickLongestPremiumIntakeCorpus(minLen: number, ...parts: (string | null | undefined)[]): string {
  let best = "";
  for (const p of parts) {
    const t = (p || "").trim();
    if (t.length < minLen) continue;
    if (t.length > best.length) best = t;
  }
  return best;
}
