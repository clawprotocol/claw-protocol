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
  "Copy the draft, edit elsewhere if you like, then paste or import back. Preview before sending — nothing changes until the sender accepts.";
/** Shown inside Request changes → Save or review elsewhere (outside-review workflow). */
export const RECIPIENT_OUTSIDE_REVIEW_WORKFLOW =
  "Copy or download, edit elsewhere, then paste or import a .txt / .md file back here.";
export const PORTABLE_REVIEW_PASTE_LABEL = "Paste or import";
export const PORTABLE_REVIEW_PASTE_PLACEHOLDER =
  "Paste the full agreement or the sections you changed. Or import a .txt / .md file.";
export const PORTABLE_REVIEW_OCR_FOOTNOTE =
  "Plain text and Markdown files import here. Other formats: copy text out and paste.";

/** Recipient “Request changes” panel — copy/export disclosure (agreement-focused, no share/marketing framing). */
export const RECIPIENT_COPY_EXPORT_SECTION_TITLE = "Save or review elsewhere";
export const RECIPIENT_COPY_EXPORT_SECTION_HELPER = RECIPIENT_OUTSIDE_REVIEW_WORKFLOW;
export const RECIPIENT_COPY_EXPORT_PREVIEW_LINE =
  "Preview before sending. Suggestions are not signatures.";

export const RECIPIENT_DRAFT_IMPORT_READ_ERROR =
  "Couldn't read that file. Try plain text for now.";

/** Visible “review elsewhere” card in Request changes (not only inside accordion). */
export const RECIPIENT_REVIEW_ELSEWHERE_TITLE = "Prefer another editor?";
export const RECIPIENT_REVIEW_ELSEWHERE_BODY =
  "Download or copy the draft, edit it with your lawyer or AI tool, then import or paste it back.";
export const RECIPIENT_REVIEW_ELSEWHERE_IMPORT_LABEL = "Import edited .txt / .md";

/** Owner workspace: same portable flow, but apply/discard is local. */
export const OWNER_PORTABLE_REVIEW_SUB =
  "Copy the current draft, revise in your preferred tool, then bring back suggested edits. LawDog will organize the differences. Your saved draft does not change until you preview and apply, or you discard the preview.";

/** Read-only: client-side two-paste diff; does not affect the live draft. */
export const DIRECT_COMPARE_MODE_INTRO =
  "Optionally compare two full-text versions side by side. LawDog highlights additions, deletions, and common themes to help you align. Use assisted preview if you want LawDog to merge into fields.";
export const DIRECT_COMPARE_DISCLAIMER = "Nothing changes until accepted. This panel is for review only.";
