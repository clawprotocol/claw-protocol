/**
 * Shared UX copy for portable review: reviewers work in their own tools, then
 * return suggested text; LawDog diffs and both sides confirm before the draft changes.
 */

/** Preamble added when the recipient pastes text they revised elsewhere (stored with the proposal). */
export const PORTABLE_REVIEW_EXTERNAL_PASTE_PREAMBLE =
  "The following are review notes and suggested edits the recipient brought back here — incorporate where it fits the draft:";

/**
 * Composes the recipient revision message from free-text instruction plus optional pasted import.
 * `hasExternal` is true when the second block (pasted import) is present.
 */
export function buildRecipientRevisionText(
  instruction: string,
  externalPasted: string
): { text: string; hasExternal: boolean } {
  const ext = externalPasted.trim();
  const externalBlock =
    ext.length > 0
      ? [PORTABLE_REVIEW_EXTERNAL_PASTE_PREAMBLE, ext].join("\n\n")
      : "";
  const inst = instruction.trim();
  const text = [inst, externalBlock].filter(Boolean).join("\n\n");
  return { text, hasExternal: ext.length > 0 };
}

export const PORTABLE_REVIEW_HEADER = "Review in your preferred tool";
export const PORTABLE_REVIEW_SUB =
  "Copy the current draft, revise elsewhere if you like, then bring back suggested edits. LawDog will organize the differences. Nothing in the owner’s draft changes until you send and they confirm — use Preview to check first.";
export const PORTABLE_REVIEW_PASTE_LABEL = "Bring back suggested edits (paste)";
export const PORTABLE_REVIEW_PASTE_PLACEHOLDER =
  "Paste revised text or review notes here. Paste is supported today. File upload and OCR comparison are coming soon.";
export const PORTABLE_REVIEW_OCR_FOOTNOTE =
  "Paste revised text for now. File comparison and upload are coming soon.";

/** Owner workspace: same portable flow, but apply/discard is local. */
export const OWNER_PORTABLE_REVIEW_SUB =
  "Copy the current draft, revise in your preferred tool, then bring back suggested edits. LawDog will organize the differences. Your saved draft does not change until you preview and apply, or you discard the preview.";

/** Read-only: client-side two-paste diff; does not affect the live draft. */
export const DIRECT_COMPARE_MODE_INTRO =
  "Optionally compare two full-text versions side by side. LawDog highlights additions, deletions, and common themes to help you align. Use assisted preview if you want LawDog to merge into fields.";
export const DIRECT_COMPARE_DISCLAIMER = "Nothing changes until accepted. This panel is for review only.";
