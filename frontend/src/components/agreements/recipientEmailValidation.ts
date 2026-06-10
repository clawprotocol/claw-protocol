/** Shared recipient email helpers for create-flow and handoff merge. */

export function stripRecipientEmailNoise(s: string): string {
  return (s || "").replace(/[\u200B-\u200D\uFEFF]/g, "").replace(/\u00A0/g, " ").trim();
}

/** Loose but practical gate: dotful domains OR longer no-dot hosts (e.g. internal). */
export function looksLikeEmail(s: string): boolean {
  const t = stripRecipientEmailNoise(s);
  if (!t.includes("@")) return false;
  const at = t.lastIndexOf("@");
  if (at <= 0 || at === t.length - 1) return false;
  const local = t.slice(0, at);
  const domain = t.slice(at + 1);
  if (!local || !domain || local.includes(" ") || domain.includes(" ") || domain.includes("@")) return false;
  if (domain.includes(".")) return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(t);
  return domain.length >= 4;
}

/** Incomplete address the user may still be typing — suppress eager inline errors. */
export function isRecipientEmailTypingInProgress(s: string): boolean {
  const t = stripRecipientEmailNoise(s);
  if (!t) return false;
  if (t.endsWith("@") || t.endsWith(".")) return true;
  const at = t.lastIndexOf("@");
  if (at <= 0) return false;
  const domain = t.slice(at + 1);
  if (!domain) return true;
  if (domain.endsWith(".") && !/\.[^\s.@]{2,}$/.test(domain)) return true;
  return false;
}

export type RecipientEmailFormatErrorOptions = {
  /** When true, show invalid format even if the value looks in-progress. */
  touched?: boolean;
};

/** Whether to surface a visible email format error (blur, finalize, or clearly invalid mid-typing). */
export function shouldShowRecipientEmailFormatError(
  s: string,
  options?: RecipientEmailFormatErrorOptions,
): boolean {
  const t = stripRecipientEmailNoise(s);
  if (!t) return false;
  if (looksLikeEmail(t)) return false;
  if (!options?.touched && isRecipientEmailTypingInProgress(t)) return false;
  return true;
}
