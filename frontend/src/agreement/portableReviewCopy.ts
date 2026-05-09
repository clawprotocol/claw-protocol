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

/** When PDF text cannot be read (scanned/image-only, corrupt, or empty text layer) or extraction fails. */
export const RECIPIENT_DRAFT_IMPORT_PARSE_FALLBACK =
  "We couldn't extract readable text from this file. Try a selectable-text PDF, TXT, or Markdown file.";

/** After PDF extraction + sanitization, agreement body is too thin to compare (likely scanned PDF or noise). */
export const RECIPIENT_DRAFT_IMPORT_PDF_LOW_TEXT =
  "Could not confidently extract enough text from this PDF. Try a text-based PDF export, TXT, Markdown, or paste the agreement.";

/** Shown when a PDF had readable text but sanitizer stripped agreement-shaped body; we routed to notes/suggestions. */
export const RECIPIENT_PDF_IMPORT_ROUTED_TO_SUGGESTIONS =
  "This looks like review notes or clause suggestions, not a full revised agreement. You can send these as suggestions, apply them to the draft, or upload a full revised agreement.";

/** Shown while reading the file and building the preview (workspace upload / import). */
export const RECIPIENT_REVISED_IMPORT_PREPARING = "Preparing comparison…";

/** When `draft` is not yet available but the user already picked a file. */
export const RECIPIENT_DRAFT_IMPORT_AGREEMENT_NOT_READY =
  "The agreement is still loading. Wait a moment, then upload your revised draft again.";

/** Defensive: compare runner ref missing (should not happen in production). */
export const RECIPIENT_DRAFT_IMPORT_COMPARE_RUNNER_MISSING =
  "Could not start comparison. Refresh the page and try again, or paste your revised text instead.";

/** Extracted file had no usable agreement body after normalization. */
export const RECIPIENT_DRAFT_IMPORT_EMPTY_BODY =
  "That file had no usable agreement text to compare. Try a different file or paste the agreement.";

/** Trust line for previews / decision menus (compose surface avoids repeating it). */
export const RECIPIENT_WORKSPACE_TRUST_LINE = "Nothing changes until the sender accepts.";
export const RECIPIENT_SAFETY_SUGGESTIONS_NOT_SIGNATURES = "Suggestions are not signatures.";
export const RECIPIENT_WANT_COPY_HEADING = "Review somewhere else?";
export const RECIPIENT_WANT_COPY_BODY =
  "Download the draft, edit it with your lawyer or AI tool, then upload the revised version back here.";
/** Want-a-copy dropzone: warm tip about notes + compare-before-send (no legal advice). */
export const RECIPIENT_WANT_COPY_UPLOAD_TIP =
  'Tip: you can add a short "Why I changed this" note at the bottom of your revised draft. LawDog will compare the draft before anything is sent.';
/** @deprecated Use {@link RECIPIENT_WANT_COPY_UPLOAD_TIP} (same string; kept for tests / scan sets). */
export const RECIPIENT_WANT_COPY_COMPARE_HELPER = RECIPIENT_WANT_COPY_UPLOAD_TIP;
/** Safety line under the dropzone — nothing sends until they review the comparison. */
export const RECIPIENT_WANT_COPY_LOOPBACK_CUE = "Nothing sends until you review the comparison.";
/** Dropzone primary line (want-a-copy card). */
export const RECIPIENT_WANT_COPY_DROPZONE_PRIMARY = "Drag your revised draft here";
export const RECIPIENT_WANT_COPY_DROPZONE_SECONDARY = "PDF, TXT, or Markdown";
/** Compact line near paste/upload/edit in the revised-draft workspace. */
export const RECIPIENT_REVISED_WORKSPACE_NOTES_HINT =
  "Add notes at the bottom if you want to explain your changes.";
/** Primary upload on the want-a-copy card. */
export const RECIPIENT_WANT_COPY_UPLOAD_CTA = "Upload revised draft";
/** @deprecated Use {@link RECIPIENT_WANT_COPY_DROPZONE_SECONDARY}. */
export const RECIPIENT_WANT_COPY_UPLOAD_FORMAT_HELPER = RECIPIENT_WANT_COPY_DROPZONE_SECONDARY;
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

export const RECIPIENT_UPLOAD_REVISED_PRIMARY_LABEL = "Upload revised draft";
export const RECIPIENT_PASTE_REVISED_PRIMARY_LABEL = "Paste revised text";
export const RECIPIENT_EDIT_INSIDE_LAWDOG = "Edit inside LawDog";
export const RECIPIENT_BTN_DOWNLOAD_ORIGINAL_PDF = "Download original PDF";
export const RECIPIENT_BTN_DOWNLOAD_ORIGINAL_TEXT = "Download original text";

/** Preview / redline summary (true agreement compare). */
export const RECIPIENT_PREVIEW_SUMMARY_HEADLINE = "Review proposed agreement changes";
export const RECIPIENT_PREVIEW_TRUST_SUBCOPY = RECIPIENT_WORKSPACE_TRUST_LINE;
/** Shown under the compare headline — send vs accept clarity. */
export const RECIPIENT_PREVIEW_COMPARE_TRUST_SUBCOPY =
  "Nothing is sent until you click Send. The sender still accepts before the draft changes.";

/** Transitional copy after choosing an uploaded revised draft (PDF / TXT / Markdown). */
export const RECIPIENT_REVISED_UPLOAD_ANALYZING_TITLE = "Analyzing revised draft…";
export const RECIPIENT_REVISED_UPLOAD_ANALYZING_SUB = "Preparing a compare with the agreement you received.";
export const RECIPIENT_REVISED_UPLOAD_ANALYZING_CHECKLIST = [
  "Reading your revised draft",
  "Finding proposed changes",
  "Preparing compare",
] as const;

/** When heuristic split found commentary meant for the sender (not part of the agreement body). */
export const RECIPIENT_REVIEWER_NOTES_INCLUDED_BADGE = "Reviewer notes included";
export const RECIPIENT_REVIEWER_NOTES_ACCORDION_LABEL = "Why these changes were suggested";

/** Upload looked like commentary, not a full edited agreement — no redline until they bring a draft. */
export const RECIPIENT_UPLOAD_NOTES_ONLY_CARD_TITLE = "Reviewer notes found";
export const RECIPIENT_UPLOAD_NOTES_ONLY_CARD_BODY =
  "This looks like review comments, not a rewritten agreement. LawDog kept it separate so your compare stays clean.";
/** Collapsed panel — full extracted text. */
export const RECIPIENT_UPLOAD_NOTES_ONLY_VIEW_FULL_NOTES = "View full notes";
export const RECIPIENT_UPLOAD_NOTES_ONLY_SUGGESTED_FOCUS_HEADING = "Suggested focus";
export const RECIPIENT_UPLOAD_NOTES_ONLY_SUGGESTED_FOCUS_BULLETS = [
  "Payment timing",
  "Scope boundaries",
  "Delivery delays",
  "Third-party services",
  "Ownership / reusable tools",
] as const;
export const RECIPIENT_UPLOAD_NOTES_ONLY_HELPER =
  "Upload or paste a full revised draft when you are ready to compare. Your notes stay separate until then.";
export const RECIPIENT_UPLOAD_NOTES_ONLY_CTA_SEND_NOTES = "Send notes to sender";
export const RECIPIENT_UPLOAD_NOTES_ONLY_CTA_TURN_SUGGESTIONS = "Turn into clause suggestions";
export const RECIPIENT_UPLOAD_NOTES_ONLY_CTA_UPLOAD = "Upload revised agreement";
export const RECIPIENT_UPLOAD_NOTES_ONLY_CTA_PASTE = "Paste revised agreement";
export const RECIPIENT_UPLOAD_NOTES_ONLY_CTA_QUICK = "Use these as a quick change request";
export const RECIPIENT_UPLOAD_NOTES_ONLY_DOWNLOAD_NOTES = "Download reviewer notes";

/** Compare panel — intent coverage (plain language). */
/** @deprecated Recipient UI uses {@link RECIPIENT_BUSINESS_REVIEW_INTENT_NOT_INLINE}. */
export const RECIPIENT_INTENT_NOT_AUTOMATICALLY_INSERTED = "Not automatically inserted";
/** Recipient Business Review — avoids “not inserted” machinery tone. */
export const RECIPIENT_BUSINESS_REVIEW_INTENT_NOT_INLINE = "Summarized for your message to the sender.";
/** User-safe — avoid “placement” jargon; paired with explain sentence in UI. */
export const RECIPIENT_INTENT_NEEDS_MANUAL_PLACEMENT = "We could not match this in the agreement text";
export const RECIPIENT_INTENT_REVIEW_BEFORE_SENDING = "Review before sending";
export const RECIPIENT_PREVIEW_EXPORT_DETAILS_SUMMARY = "Downloads";
export const RECIPIENT_PREVIEW_SUGGESTION_DETAILS_SUMMARY = "Suggestion details";
/** Business Review Mode: raw redline + counts live here (default closed). */
export const RECIPIENT_AUDIT_MODE_SUMMARY = "Audit mode";
/** @deprecated Use {@link RECIPIENT_AUDIT_MODE_SUMMARY}. */
export const RECIPIENT_PREVIEW_TECHNICAL_COMPARE_SUMMARY = RECIPIENT_AUDIT_MODE_SUMMARY;
export const RECIPIENT_AUDIT_MODE_SUBCOPY =
  "Full redline details are optional. Most reviewers decide from Business Review first.";
/** @deprecated User-facing gap chip uses {@link recipientPreviewGapChipLabel} instead. */
export const RECIPIENT_PREVIEW_ITEMS_TO_PLACE = "May need placement";

/** User-safe label for many instruction intents not shown inline in the compare. */
export function recipientPreviewGapChipLabel(count: number): string {
  if (count <= 0) return "";
  if (count >= 15) return "Complex revisions grouped by section";
  if (count === 1) return "1 proposed edit";
  return `${count} proposed edits`;
}

export const RECIPIENT_PREVIEW_IMPORT_FORMATTING_NOTE =
  "Some formatting from the uploaded file was cleaned before comparison.";
export const RECIPIENT_PREVIEW_NOTES_SEPARATE_FROM_AGREEMENT =
  "Reviewer notes are separate from the agreement.";

/** Human review card — nothing leaves the recipient until the sender accepts. */
export const RECIPIENT_PREVIEW_NOTHING_SENT_UNTIL_SENDER_ACCEPTS =
  "Nothing is sent until the sender accepts.";

/** Subheading inside Audit mode above the tracked redline. */
export const RECIPIENT_HUMAN_REVIEW_REDLINES_SUBHEAD = "Full agreement markup";

/** Primary CTA on Business Review cards and dense section shortcuts. */
export const RECIPIENT_BUSINESS_REVIEW_PREVIEW_WORDING = "Preview wording";
/** Secondary line under preview CTA (desktop + mobile). */
export const RECIPIENT_BUSINESS_REVIEW_PREVIEW_WORDING_HINT = "Opens exact before/after text.";
/** @deprecated Use {@link RECIPIENT_BUSINESS_REVIEW_PREVIEW_WORDING}. */
export const RECIPIENT_BUSINESS_REVIEW_VIEW_EXACT_WORDING = RECIPIENT_BUSINESS_REVIEW_PREVIEW_WORDING;
export const RECIPIENT_BUSINESS_REVIEW_EXACT_WORDING_TITLE = "Exact wording";

/** Redline PDF export: collapsed block when alignment is noisy (avoid duplicate body replay). */
export const RECIPIENT_EXPORT_SECTION_SUBSTANTIALLY_REVISED =
  "Section substantially revised — see the summary above and Audit details for full markup.";
export const RECIPIENT_BUSINESS_REVIEW_SUGGESTED_EDITS_HEADING = "Suggested edits";
export const RECIPIENT_BUSINESS_REVIEW_NO_CHANGES_SECTION = "No changes to";
export const RECIPIENT_BUSINESS_REVIEW_MOST_IMPORTANT_HEADING = "Most important changes";
export const RECIPIENT_BUSINESS_REVIEW_RECOMMENDED_FOCUS_HEADING = "Recommended review focus";
export const RECIPIENT_BUSINESS_REVIEW_OTHER_EDITS_LINE =
  "Most other edits appear clarifying or operational.";
export const RECIPIENT_BUSINESS_REVIEW_GROUPED_READABILITY =
  "Some revisions were grouped for readability.";
export const RECIPIENT_BUSINESS_REVIEW_SUBSTANTIAL_REWRITE_SUMMARY =
  "A few sections were substantially rewritten and are summarized above.";

/** Collapsed panel for reviewer-only commentary. */
export const RECIPIENT_REVIEWER_NOTES_PANEL_SUMMARY = "Reviewer notes — not part of agreement";

/** Shown when a noisy block is collapsed to avoid duplicate full-document inserts in the redline. */
export const RECIPIENT_REDLINE_SECTION_COLLAPSED_NOTE =
  "Section updated — download the proposed PDF for the full revised wording in this area.";

/** Clause-suggestions surface (structured list upload). */
export const RECIPIENT_CLAUSE_SUGGESTIONS_TITLE = "Suggested protections";
export const RECIPIENT_CLAUSE_SUGGESTIONS_SUB =
  "These read as clause-style suggestions, not a full rewritten agreement. Compare opens after you upload or paste a revised draft.";
export const RECIPIENT_CLAUSE_SUGGESTION_STATUS_READY = "Ready to send";
export const RECIPIENT_CLAUSE_SUGGESTION_STATUS_NEEDS_PLACEMENT = "Follow up with sender";
export const RECIPIENT_CLAUSE_SUGGESTIONS_CTA_SEND = "Send suggestions only";
export const RECIPIENT_CLAUSE_SUGGESTIONS_CTA_APPLY = "Apply suggestions to draft";
export const RECIPIENT_CLAUSE_SUGGESTIONS_CTA_UPLOAD = "Upload full revised draft";
export const RECIPIENT_CLAUSE_SUGGESTIONS_CTA_PASTE = "Paste revised agreement";
export const RECIPIENT_CLAUSE_SUGGESTIONS_DOWNLOAD = "Download suggestions";

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
export const RECIPIENT_REVIEW_ELSEWHERE_IMPORT_LABEL = RECIPIENT_WANT_COPY_UPLOAD_CTA;

/** Owner workspace: same portable flow, but apply/discard is local. */
export const OWNER_PORTABLE_REVIEW_SUB =
  "Copy the current draft, revise in your preferred tool, then bring back suggested edits. LawDog will organize the differences. Your saved draft does not change until you preview and apply, or you discard the preview.";

/** Read-only: client-side two-paste diff; does not affect the live draft. */
export const DIRECT_COMPARE_MODE_INTRO =
  "Optionally compare two full-text versions side by side. LawDog highlights additions, deletions, and common themes to help you align. Use assisted preview if you want LawDog to merge into fields.";
export const DIRECT_COMPARE_DISCLAIMER = "Nothing changes until accepted. This panel is for review only.";
