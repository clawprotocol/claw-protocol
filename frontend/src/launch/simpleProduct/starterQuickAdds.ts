/** Optional quick-add chips on fresh `/app/create` stage-A — append only, never replace user input. */
export type StarterQuickAddKey = "confidentiality" | "work_for_hire" | "return_destroy";

export type StarterQuickAdd = {
  key: StarterQuickAddKey;
  label: string;
  append: string;
};

export const STARTER_QUICK_ADDS: readonly StarterQuickAdd[] = [
  {
    key: "confidentiality",
    label: "Confidentiality term",
    append:
      " Include confidentiality obligations for non-public business, technical, customer, and financial information.",
  },
  {
    key: "work_for_hire",
    label: "Work for hire",
    append:
      " Include work-made-for-hire and IP ownership language for deliverables, where applicable.",
  },
  {
    key: "return_destroy",
    label: "Return / destroy",
    append:
      " Include return or destruction of confidential materials after termination or upon request.",
  },
] as const;

export const STARTER_QUICK_ADDS_SECTION_TITLE = "Optional quick adds";
export const STARTER_QUICK_ADDS_HELPER =
  "Tap one to add common terms, or ignore them and draft from your own words.";

/**
 * Append a quick-add snippet to existing textarea content without replacing prior text.
 */
export function appendStarterQuickAddSnippet(current: string, snippet: string): string {
  const base = current.trimEnd();
  const add = snippet.trim();
  if (!add) return base;
  if (!base) return add;
  return base + (snippet.startsWith(" ") ? snippet : ` ${add}`);
}

export function logStarterSuggestionApplied(args: {
  suggestionKey: StarterQuickAddKey;
  inputLenBefore: number;
  inputLenAfter: number;
}): void {
  console.info("[starter-suggestion-applied]", args);
}
