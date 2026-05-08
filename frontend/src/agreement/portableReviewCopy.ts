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
  "Preview before sending. Revisions do not change the original until accepted.";

export const RECIPIENT_DRAFT_IMPORT_READ_ERROR =
  "Couldn't read that file. Try plain text for now.";

/** Trust line for previews / decision menus (compose surface avoids repeating it). */
export const RECIPIENT_WORKSPACE_TRUST_LINE = "Nothing changes until the sender accepts.";
export const RECIPIENT_SAFETY_SUGGESTIONS_NOT_SIGNATURES = "Suggestions are not signatures.";
export const RECIPIENT_WANT_COPY_HEADING = "Want a copy?";
export const RECIPIENT_WANT_COPY_BODY =
  "Save the draft, review it elsewhere, or drop it into your own AI/lawyer workflow.";
export const RECIPIENT_COPY_ACK_COPIED = "Copied!";

/** Top compose workspace (recipient revise tab). */
export const RECIPIENT_WORKSPACE_HEADLINE = "Suggest changes before anything is signed.";
export const RECIPIENT_WORKSPACE_SUBCOPY = "Choose the easiest way to respond.";
export const RECIPIENT_CARD_SMALL_TWEAK_TITLE = "Small tweak";
export const RECIPIENT_CARD_SMALL_TWEAK_BODY = "Ask for a few edits without rewriting the document.";
export const RECIPIENT_CARD_SMALL_TWEAK_CTA = "Request small changes";
export const RECIPIENT_CARD_BIGGER_REWRITE_TITLE = "Revised draft";
export const RECIPIENT_CARD_BIGGER_REWRITE_BODY =
  "Upload or paste an edited version and LawDog will compare it.";
export const RECIPIENT_CARD_BIGGER_REWRITE_CTA = "Upload revised draft";

/** Primary workflow — full-document compare + redline (recipient review). */
export const RECIPIENT_SEND_BACK_REVISED_TITLE = "Send back a revised version";
export const RECIPIENT_SEND_BACK_REVISED_HELPER =
  "Upload or paste an edited draft. LawDog will compare it with what you received.";
/** Revised-draft workspace — intro under headline (pick method + editing). */
export const RECIPIENT_SEND_BACK_REVISED_WORKSPACE_SUBCOPY =
  "Upload, paste, or edit your version. LawDog will compare it with the original.";
/** @deprecated Recipient UI uses send-back headline + {@link RECIPIENT_SEND_BACK_REVISED_WORKSPACE_SUBCOPY}. */
export const RECIPIENT_REVISE_METHOD_HEADLINE = "How do you want to revise it?";
/** Panel subcopy after method chosen (often empty — progressive disclosure). */
export const RECIPIENT_REVISED_PANEL_SUB = "";

/** Small tweak — instruction-only pipeline (mirrors legacy universal intake labels). */
export const RECIPIENT_QUICK_CHANGE_SECTION_TITLE = RECIPIENT_CARD_SMALL_TWEAK_TITLE;
export const RECIPIENT_QUICK_CHANGE_SECTION_HELPER =
  "Best for payment timing, dates, wording, or scope edits.";
/** @deprecated Small-tweak panel uses RECIPIENT_SMALL_TWEAK_HELPER only. */
export const RECIPIENT_QUICK_PANEL_SUB = "";
export const RECIPIENT_SMALL_TWEAK_HELPER = RECIPIENT_QUICK_CHANGE_SECTION_HELPER;
export const RECIPIENT_QUICK_REQUEST_LABEL = "Your request";
export const RECIPIENT_QUICK_REQUEST_PLACEHOLDER =
  "Example: Change payment terms from Net 15 to Net 30.";
export const RECIPIENT_SWITCH_TO_REVISED_DRAFT_LINK = "Need to upload a rewritten draft instead?";

export const RECIPIENT_UPLOAD_REVISED_PRIMARY_LABEL = "Upload revised .txt / .md";
export const RECIPIENT_PASTE_REVISED_PRIMARY_LABEL = "Paste revised text";
export const RECIPIENT_EDIT_INSIDE_LAWDOG = "Edit inside LawDog";
export const RECIPIENT_BTN_DOWNLOAD_ORIGINAL_PDF = "Download original PDF";
export const RECIPIENT_BTN_DOWNLOAD_ORIGINAL_TEXT = "Download original text";

/** Preview / redline summary. */
export const RECIPIENT_PREVIEW_SUMMARY_HEADLINE = "Review suggested changes";
export const RECIPIENT_PREVIEW_TRUST_SUBCOPY = RECIPIENT_WORKSPACE_TRUST_LINE;

/** Assisted compose + preview toolbars. */
export const RECIPIENT_BTN_PREVIEW_CHANGES = "Preview changes";
/** Primary compare CTA in revised-draft flow (calls assisted redline). */
export const RECIPIENT_BTN_REVIEW_CHANGES = "Compare drafts";
/** @deprecated No longer shown as a tab; kept for tests referencing assisted label history. */
export const RECIPIENT_ASSISTED_COMPOSE_TAB_LABEL = "Suggest changes";
export const RECIPIENT_BTN_SEND_CHANGES = "Send changes";
export const RECIPIENT_BTN_CONTINUE_EDITING = "Continue editing";
export const RECIPIENT_BTN_DOWNLOAD_REDLINE_PDF = "Download redline PDF";

/** @deprecated Manual compare removed from recipient review UI (panel may still exist for tooling). */
export const RECIPIENT_DIRECT_COMPARE_LABEL = "Manual compare";

/** Visible “work elsewhere” card (download-first professional workflow). */
export const RECIPIENT_WORK_ELSEWHERE_TITLE = "Work somewhere else";
export const RECIPIENT_WORK_ELSEWHERE_BODY =
  "Download the original, edit it with your lawyer or AI tool, then upload the revised version.";
/** @deprecated Use RECIPIENT_WORK_ELSEWHERE_* */
export const RECIPIENT_REVIEW_ELSEWHERE_TITLE = RECIPIENT_WORK_ELSEWHERE_TITLE;
/** @deprecated Use RECIPIENT_WORK_ELSEWHERE_* */
export const RECIPIENT_REVIEW_ELSEWHERE_BODY = RECIPIENT_WORK_ELSEWHERE_BODY;
/** File import — plain text / Markdown. */
export const RECIPIENT_REVIEW_ELSEWHERE_IMPORT_LABEL = "Upload revised .txt / .md";

/** Owner workspace: same portable flow, but apply/discard is local. */
export const OWNER_PORTABLE_REVIEW_SUB =
  "Copy the current draft, revise in your preferred tool, then bring back suggested edits. LawDog will organize the differences. Your saved draft does not change until you preview and apply, or you discard the preview.";

/** Read-only: client-side two-paste diff; does not affect the live draft. */
export const DIRECT_COMPARE_MODE_INTRO =
  "Optionally compare two full-text versions side by side. LawDog highlights additions, deletions, and common themes to help you align. Use assisted preview if you want LawDog to merge into fields.";
export const DIRECT_COMPARE_DISCLAIMER = "Nothing changes until accepted. This panel is for review only.";
