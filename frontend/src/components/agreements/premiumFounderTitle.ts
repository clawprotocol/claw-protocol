/**
 * Heuristic: user-facing label is a thin generic "AGREEMENT" (not a professional instrument name).
 */
export function isLikelyGenericAgreementTitle(text: string | null | undefined): boolean {
  const t = (text || "")
    .replace(/\r\n/g, " ")
    .replace(/^#+\s*/g, "")
    .replace(/^\d+[\.)]\s*/g, "")
    .trim();
  if (t.length > 64) return false;
  if (!t) return true;
  return /^agreement\.?$/i.test(t) || /^the\s+agreement\.?$/i.test(t) || /^undated\s+agreement/i.test(t);
}
