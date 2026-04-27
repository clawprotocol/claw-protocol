const REFINE_START_RE =
  /^(?:please\s+revise,?\s*|please\s+update,?\s*|add\b|replace\b|confirm\b|do\s+not\s+change,?\s*|i\s+(?:want|need)\s+to\s+change\b)/i;

/**
 * True when the review step-buffer line reads like a delta / edit instruction, not a fresh
 * full intake description. Client-side only — used to route the green CTA through /refine.
 */
export function looksLikeRefinementIntent(text: string): boolean {
  const t = (text || "").replace(/^\s+/, "");
  if (!t) return false;
  if (REFINE_START_RE.test(t)) return true;
  const firstLine = t.split(/\r?\n/)[0]?.trim() ?? "";
  return /^(add|remove|update|change|clarif\w*|tweak|fix|include|insert|append|append:|delete|shorten|soften|strengthen|limit|broaden)\b/i.test(
    firstLine,
  );
}
