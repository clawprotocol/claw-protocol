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
