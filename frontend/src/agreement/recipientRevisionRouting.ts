/** Mirrors backend `llm_usage_guard.MAX_INSTRUCTION_RECIPIENT`. */
export const RECIPIENT_MAX_INSTRUCTION_CHARS = 6000;

export type RecipientCompareRouting =
  | "quick_change"
  | "revised_text_upload"
  | "revised_text_paste"
  | "direct_edit";

/** Heuristic: paste looks like a full revised agreement (route quick-change users to whole-doc mode). */
export function looksLikeFullRevisedAgreementDraft(text: string): boolean {
  const t = (text || "").trim();
  if (t.length >= 4500) return true;
  const lines = t.split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (lines.length >= 45) return true;
  const low = t.toLowerCase();
  if (/\bthis agreement\b/i.test(t) && t.length >= 900) return true;
  if (/\bin witness whereof\b/i.test(t) || /\bsignature\b/i.test(low)) {
    if (t.length >= 700) return true;
  }
  const numbered = (t.match(/^\s*\d+\s*[\.\)]\s+\S+/gm) ?? []).length;
  if (numbered >= 4 && t.length >= 1200) return true;
  if ((low.includes("exhibit") || low.includes("schedule a")) && t.length >= 800) return true;
  return false;
}

export const RECIPIENT_FULL_DOC_SWITCH_HINT =
  "Looks like a full revised draft. Use Send back a revised version so LawDog can compare.";

export const RECIPIENT_QUICK_CHANGE_TOO_LARGE_HINT =
  "Looks like a revised agreement. Use Send back a revised version so LawDog can compare.";

export const RECIPIENT_COMPARE_FAILED_FALLBACK =
  "We couldn't compare this version. Try pasting only the edited sections or download a fresh draft and edit again.";
